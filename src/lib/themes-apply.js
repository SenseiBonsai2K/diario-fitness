import { THEMES } from "./themes.js";

export const THEME_IDS = Object.keys(THEMES);
export const DEFAULT_THEME = "classic";

/** Set the colour pair on <html>, remember it for the next launch and tint the browser bar. */
export function applyTheme(id) {
  const theme = THEMES[id] ? id : DEFAULT_THEME;
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("diario-fitness:theme", theme); } catch { /* storage blocked */ }
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    const dark = (m.getAttribute("media") || "").includes("dark");
    m.setAttribute("content", dark ? THEMES[theme].dark : THEMES[theme].light);
  }
}
