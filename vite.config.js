import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset path relative, so the build works from any
// GitHub Pages sub-path (https://<user>.github.io/<repo>/) without config.
// Two pages: the diary (index.html) and the plan editor (compositore.html).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: "index.html", compositore: "compositore.html" },
    },
  },
  test: { environment: "node" },
});
