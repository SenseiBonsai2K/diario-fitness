// Game sounds and vibration, one set per style. Synthesised with Web Audio
// (no files to download) and mixed over whatever is playing, like the rest
// timer: the user's music keeps going. Phones only allow audio after a tap,
// so the context is unlocked on the first touch anywhere in the app.

let ctx = null;

function audio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

if (typeof window !== "undefined") {
  const unlock = () => { audio(); window.removeEventListener("pointerdown", unlock); };
  window.addEventListener("pointerdown", unlock);
}

// A note: [start s, frequency Hz, length s, wave, volume, glide-to Hz?]
const N = (t, f, len, wave, vol, to) => [t, f, len, wave, vol, to];
const arp = (freqs, step, len, wave, vol) => freqs.map((f, i) => N(i * step, f, len, wave, vol));

/** Sound per style and event. Short: at most ~1.6 s. */
export const SFX = {
  fantasy: {
    quest: arp([784, 988, 1175], 0.07, 0.5, "triangle", 0.28),
    perfect: arp([523, 659, 784, 1047, 1319], 0.09, 0.9, "triangle", 0.26),
    levelUp: [...arp([392, 523, 659, 784], 0.12, 0.9, "triangle", 0.28), N(0.5, 1047, 1.1, "sine", 0.22), N(0.5, 1319, 1.1, "sine", 0.12)],
    levelDown: arp([659, 523, 440, 330], 0.14, 0.7, "triangle", 0.24),
    pr: [N(0, 196, 0.5, "sawtooth", 0.08), ...arp([523, 784, 1047], 0.1, 0.8, "triangle", 0.26)],
  },
  system: {
    quest: [N(0, 1568, 0.25, "sine", 0.22), N(0.08, 2093, 0.35, "sine", 0.16)],
    perfect: arp([1047, 1319, 1568, 2093], 0.08, 0.6, "sine", 0.2),
    levelUp: [N(0, 523, 0.9, "sine", 0.2, 1047), N(0.35, 1568, 0.9, "sine", 0.2), N(0.45, 2093, 1.0, "sine", 0.14), N(0.55, 2637, 1.0, "sine", 0.08)],
    levelDown: [N(0, 880, 0.9, "sine", 0.2, 330)],
    pr: [N(0, 1047, 0.2, "square", 0.08), N(0.12, 1568, 0.6, "sine", 0.22), N(0.2, 2093, 0.7, "sine", 0.14)],
  },
  cyber: {
    quest: [N(0, 660, 0.08, "square", 0.1), N(0.09, 1320, 0.12, "square", 0.1)],
    perfect: [0, 0.07, 0.14, 0.21, 0.28].map((t, i) => N(t, 440 * 2 ** (i / 4), 0.09, "square", 0.1)),
    levelUp: [N(0, 220, 0.6, "sawtooth", 0.1, 1760), N(0.6, 1760, 0.12, "square", 0.1), N(0.75, 2349, 0.4, "square", 0.08)],
    levelDown: [N(0, 1200, 0.7, "sawtooth", 0.1, 110)],
    pr: [N(0, 110, 0.3, "sawtooth", 0.14, 880), N(0.3, 1760, 0.1, "square", 0.1), N(0.42, 1760, 0.3, "square", 0.1)],
  },
};

/** Vibration pattern per event (ms on/off). Android only; iPhone ignores it. */
const BUZZ = { quest: [40], perfect: [60, 60, 60, 60, 120], levelUp: [80, 60, 80, 60, 240], levelDown: [300], pr: [50, 40, 50, 40, 160] };

export function playSfx(event, style = "fantasy") {
  const notes = SFX[style]?.[event] || SFX.fantasy[event];
  const c = audio();
  if (!c || !notes) return;
  const now = c.currentTime + 0.02;
  for (const [t, f, len, wave, vol, to] of notes) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(f, now + t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, now + t + len);
    g.gain.setValueAtTime(0.0001, now + t);
    g.gain.exponentialRampToValueAtTime(vol, now + t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t + len);
    o.connect(g).connect(c.destination);
    o.start(now + t);
    o.stop(now + t + len + 0.05);
  }
}

export function vibrate(event) {
  try { navigator.vibrate?.(BUZZ[event] || BUZZ.quest); } catch { /* not supported */ }
}

/** Sound and vibration for a game event, following the user's switches. */
export function feedback(event, prefs = {}) {
  const style = prefs.style || "fantasy";
  if (prefs.gameSound !== false) playSfx(event, style);
  if (prefs.vibration !== false) vibrate(event);
}
