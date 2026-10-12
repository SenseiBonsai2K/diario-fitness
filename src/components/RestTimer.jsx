import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./ui.jsx";

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
  const [timer, setTimerState] = useState(readSaved);
  const setTimer = useCallback((t) => {
    setTimerState(t);
    try { t ? localStorage.setItem(KEY, JSON.stringify(t)) : localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  }, []);
  const start = useCallback((seconds, label) => {
    if (!seconds || seconds <= 0) return;
    unlockAudio();
    setTimer({ end: Date.now() + seconds * 1000, total: seconds, label, at: Date.now() });
  }, [setTimer]);
  return (
    <TimerContext.Provider value={{ timer, start, setTimer }}>
      {children}
      {timer && <RestTimer timer={timer} setTimer={setTimer} />}
    </TimerContext.Provider>
  );
}

export function useRestTimer() {
  return useContext(TimerContext);
}

// A short beep through Web Audio. The context must be created on a tap
// (browsers block audio otherwise), so it is unlocked when a timer starts.
let audio = null;
function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch { /* no audio */ }
}
function beep() {
  try {
    if (!audio) return;
    [0, 0.28, 0.56].forEach((d, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = i === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, audio.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.35, audio.currentTime + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + d + 0.22);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + d);
      o.stop(audio.currentTime + d + 0.25);
    });
  } catch { /* no audio */ }
}

function RestTimer({ timer, setTimer }) {
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
      beep();
    }
  }, [left, timer.at, timer.end]);

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
