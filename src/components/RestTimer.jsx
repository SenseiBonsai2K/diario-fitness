import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./ui.jsx";
import { useStore } from "../lib/store.jsx";

// One rest timer for the whole app. It lives above the screens, so it keeps
// running when you switch tab, and its end time is saved, so it survives the
// app being closed or the phone locking: on return it shows the right time.

const KEY = "diario-fitness:timer";
const TimerContext = createContext({ start: () => {}, timer: null });

function readSaved() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || "null");
    // Forget timers that ended more than 10 minutes ago.
    return t && typeof t.end === "number" && t.end > Date.now() - 600000 ? t : null;
  } catch {
    return null;
  }
}

export function TimerProvider({ children }) {
  const { data } = useStore();
  const soundOn = data.prefs.timerSound !== false;
  const sound = useRef(soundOn);
  sound.current = soundOn;
  const [timer, setTimerState] = useState(readSaved);
  // Every change comes from a tap, so the alarm can be scheduled right here.
  const setTimer = useCallback((t) => {
    setTimerState(t);
    try { t ? localStorage.setItem(KEY, JSON.stringify(t)) : localStorage.removeItem(KEY); } catch { /* storage blocked */ }
    schedule(t && sound.current ? t : null);
  }, []);
  const start = useCallback((seconds, label) => {
    if (!seconds || seconds <= 0) return;
    unlockAudio();
    setTimer({ end: Date.now() + seconds * 1000, total: seconds, label, at: Date.now() });
  }, [setTimer]);
  return (
    <TimerContext.Provider value={{ timer, start, setTimer }}>
      {children}
      {timer && <RestTimer timer={timer} setTimer={setTimer} soundOn={soundOn} />}
    </TimerContext.Provider>
  );
}

export function useRestTimer() {
  return useContext(TimerContext);
}

// The alarm uses Web Audio, scheduled in advance on the audio clock for the
// moment the rest ends. Web Audio mixes with other apps instead of taking
// over the audio: the user's music keeps playing (no "media" notification,
// no pause), the beeps just play on top, at the media volume.
let ctx = null;
let pending = null; // { gain, when }

function unlockAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch { /* no audio */ }
}

const PATTERN = [[0, 880, 0.18], [0.28, 880, 0.18], [0.56, 1175, 0.4], [1.3, 880, 0.18], [1.58, 880, 0.18], [1.86, 1175, 0.4]];

function playAt(when) {
  const out = ctx.createGain();
  out.connect(ctx.destination);
  for (const [d, f, len] of PATTERN) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "square";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, when + d);
    g.gain.exponentialRampToValueAtTime(0.18, when + d + 0.015);
    g.gain.setValueAtTime(0.18, when + d + len - 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, when + d + len);
    o.connect(g).connect(out);
    o.start(when + d);
    o.stop(when + d + len + 0.02);
  }
  return out;
}

/** Cancel any scheduled alarm and, if a timer is given, schedule its beeps. */
function schedule(t) {
  if (pending) { try { pending.gain.disconnect(); } catch { /* already gone */ } pending = null; }
  if (!t || !ctx) return;
  const left = (t.end - Date.now()) / 1000;
  if (left <= 0.2) return;
  try {
    const when = ctx.currentTime + left;
    pending = { gain: playAt(when), when, at: t.at };
  } catch { /* no audio */ }
}

/** Called when the countdown hits zero on screen: beep now if the audio clock was paused meanwhile. */
function ringIfMissed(at) {
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") ctx.resume();
    if (pending && pending.at === at && ctx.currentTime >= pending.when - 0.3) return; // played on time
    if (pending) { try { pending.gain.disconnect(); } catch { /* ignore */ } pending = null; }
    playAt(ctx.currentTime + 0.05);
  } catch { /* no audio */ }
}

function RestTimer({ timer, setTimer, soundOn }) {
  const { t } = useTranslation("workout");
  const [now, setNow] = useState(Date.now());
  const left = Math.max(0, Math.ceil((timer.end - now) / 1000));
  const alerted = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    const wake = () => setNow(Date.now());
    document.addEventListener("visibilitychange", wake);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", wake); };
  }, []);

  // Keep the screen on while resting, so the alarm is seen and heard.
  useEffect(() => {
    if (left === 0 || !("wakeLock" in navigator)) return;
    let lock = null, alive = true;
    const get = () => navigator.wakeLock.request("screen").then((l) => { if (alive) lock = l; else l.release(); }).catch(() => {});
    get();
    const again = () => { if (document.visibilityState === "visible" && alive) get(); };
    document.addEventListener("visibilitychange", again);
    return () => { alive = false; lock?.release?.().catch(() => {}); document.removeEventListener("visibilitychange", again); };
  }, [left === 0, timer.at]); // eslint-disable-line react-hooks/exhaustive-deps

  // Alarm once per timer, only if it ended while we were watching (not hours ago).
  useEffect(() => {
    if (left === 0 && alerted.current !== timer.at && Date.now() - timer.end < 5000) {
      alerted.current = timer.at;
      try { navigator.vibrate?.([300, 120, 300, 120, 500]); } catch { /* not supported */ }
      if (soundOn) ringIfMissed(timer.at);
    }
  }, [left, timer.at, timer.end, soundOn]);

  const pct = Math.min(100, (1 - left / timer.total) * 100);
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, "0");

  return (
    <div role="timer" aria-live="polite" className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 px-4">
      <div className={`max-w-xl mx-auto rounded-card border shadow-float overflow-hidden ${left === 0 ? "bg-good border-good text-surface" : "bg-surface border-line"}`}>
        <div className="h-1 bg-raised"><div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} /></div>
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Icon name="timer" />
          <div className="min-w-0 flex-1">
            <div className="text-xs opacity-80 truncate">{left === 0 ? t("restOver") : t("resting", { name: timer.label })}</div>
            <div className="font-display text-2xl font-semibold num leading-none">{mm}:{ss}</div>
          </div>
          {left > 0 && (
            <>
              <button type="button" className="px-3 py-2 rounded-field border border-line text-sm font-semibold num" onClick={() => setTimer({ ...timer, end: timer.end - 15000 })}>−15"</button>
              <button type="button" className="px-3 py-2 rounded-field border border-line text-sm font-semibold num" onClick={() => setTimer({ ...timer, end: timer.end + 15000, total: timer.total + 15 })}>+15"</button>
            </>
          )}
          <button type="button" aria-label={t("closeTimer")} className="w-10 h-10 grid place-items-center rounded-field" onClick={() => setTimer(null)}>
            <Icon name="close" />
          </button>
        </div>
      </div>
    </div>
  );
}
