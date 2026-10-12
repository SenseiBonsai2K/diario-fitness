import { APPEARANCE } from "./appearance.js";

// Appearance = a neutral background and an accent colour, chosen separately.
// "auto" follows the phone's light/dark setting.
export const BG_IDS = ["auto", ...Object.keys(APPEARANCE.backgrounds)];
export const ACCENT_IDS = Object.keys(APPEARANCE.accents);
export const DEFAULT_ACCENT = "blue";
const STORE_KEY = "diario-fitness:appearance";

// Accent picked by the short-lived colour pairs (prefs.theme), kept so nobody loses their choice.
const FROM_PAIR = { classic: "blue", sand: "orange", sage: "teal", lavender: "violet", blush: "raspberry", graphite: "orange", forest: "lime", ocean: "blue" };

export function prefersDark() {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
}

/** The background and accent actually in use for these preferences. */
export function resolveAppearance(prefs = {}) {
  const bgPref = BG_IDS.includes(prefs.bg) ? prefs.bg : "auto";
  const bg = bgPref === "auto" ? (prefersDark() ? "dark" : "light") : bgPref;
  const accent = APPEARANCE.accents[prefs.accent] ? prefs.accent : FROM_PAIR[prefs.theme] || DEFAULT_ACCENT;
  return { bgPref, bg, accent, mode: APPEARANCE.backgrounds[bg].mode };
}

/** Put the appearance on <html>, remember it for the next launch, tint the browser bar. */
export function applyAppearance(prefs) {
  const a = resolveAppearance(prefs);
  const root = document.documentElement;
  root.setAttribute("data-bg", a.bg);
  root.setAttribute("data-mode", a.mode);
  root.setAttribute("data-accent", a.accent);
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ bg: a.bgPref, accent: a.accent })); } catch { /* storage blocked */ }
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", APPEARANCE.backgrounds[a.bg].bg);
  return a;
}
