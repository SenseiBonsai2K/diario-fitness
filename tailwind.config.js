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
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', "sans-serif"],
        body: ["system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
        mono: ["ui-monospace", '"Roboto Mono"', "Menlo", "monospace"],
      },
      borderRadius: { card: "10px", field: "8px" },
    },
  },
  plugins: [],
};
