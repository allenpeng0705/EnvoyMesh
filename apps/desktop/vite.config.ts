import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Electron loads renderer via file://, so assets must be relative.
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist/renderer",
    emptyOutDir: false,
  },
});
