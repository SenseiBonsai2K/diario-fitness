import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset path relative, so the build works from any
// GitHub Pages sub-path (https://<user>.github.io/<repo>/) without config.
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: { environment: "node" },
});
