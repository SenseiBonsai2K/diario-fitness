/** Design tokens live as CSS variables in src/index.css (light + dark);
 *  Tailwind only maps names to them, so components never use raw hex values. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        raised: v("raised"),
        ink: v("ink"),
        muted: v("muted"),
        line: v("line"),
        accent: v("accent"),
        "accent-ink": v("accent-ink"),
        "accent-soft": v("accent-soft"),
        good: v("good"),
        warn: v("warn"),
        bad: v("bad"),
        hero: v("hero"),
        "hero-ink": v("hero-ink"),
        "hero-muted": v("hero-muted"),
        "hero-accent": v("hero-accent"),
      },
      boxShadow: {
        card: "0 1px 2px rgb(var(--shadow) / 0.05), 0 2px 10px -4px rgb(var(--shadow) / 0.08)",
        float: "0 10px 30px -8px rgb(var(--shadow) / 0.35)",
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', "sans-serif"],
        body: ["system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
        mono: ["ui-monospace", '"Roboto Mono"', "Menlo", "monospace"],
      },
      borderRadius: { card: "16px", field: "12px" },
    },
  },
  plugins: [],
};
