import { DEFAULT_STYLE, STYLES } from "./game.js";
import { storeKey } from "./ns.js";
import { APPEARANCE } from "./appearance.js";

// Appearance = the game style (fantasy, system, cyber: it repaints the dark
// neutrals, see src/game-styles.css) and an accent colour. The app is always
// dark since v2; the old background choice is ignored.
export const BG_IDS = ["auto", ...Object.keys(APPEARANCE.backgrounds)];
export const ACCENT_IDS = Object.keys(APPEARANCE.accents);
export const DEFAULT_ACCENT = "blue";
/** The accent each game style looks best with, used while the user hasn't chosen one. */
export const STYLE_ACCENT = { fantasy: "amber", system: "electric", cyber: "fuchsia" };
const STORE_KEY = storeKey("appearance");

// Accent picked by the short-lived colour pairs (prefs.theme), kept so nobody loses their choice.
const FROM_PAIR = { classic: "blue", sand: "orange", sage: "teal", lavender: "violet", blush: "raspberry", graphite: "orange", forest: "lime", ocean: "blue" };

export function prefersDark() {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
}

/** The background and accent actually in use for these preferences. */
export function resolveAppearance(prefs = {}) {
  const bg = "dark";
  const style = STYLES.includes(prefs.style) ? prefs.style : DEFAULT_STYLE;
  // Until a colour is picked, each style uses the one it was designed around.
  const accent = APPEARANCE.accents[prefs.accent] ? prefs.accent : FROM_PAIR[prefs.theme] || STYLE_ACCENT[style] || DEFAULT_ACCENT;
  return { bgPref: bg, bg, accent, style, mode: APPEARANCE.backgrounds[bg].mode };
}

/** Background colour of each style, for the browser bar. */
const STYLE_BG = { fantasy: "#14110E", system: "#060A16", cyber: "#09070E" };

/** Put the appearance on <html>, remember it for the next launch, tint the browser bar. */
export function applyAppearance(prefs) {
  const a = resolveAppearance(prefs);
  const root = document.documentElement;
  root.setAttribute("data-bg", a.bg);
  root.setAttribute("data-mode", a.mode);
  root.setAttribute("data-accent", a.accent);
  root.setAttribute("data-style", a.style);
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ accent: a.accent, style: a.style })); } catch { /* storage blocked */ }
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", STYLE_BG[a.style]);
  return a;
}
