import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

/** Monorepo packages ship `exports` → `dist/`, which does not exist until `tsc -b`. Dev resolves source like Vitest. */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  root: "src",
  /** loro-crdt WASM bundler uses top-level await (Phase 15E contact notes). */
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      "@envoymesh/api": resolve(repoRoot, "packages/api/src/index.ts"),
      "@envoymesh/protocol": resolve(repoRoot, "packages/protocol/src/index.ts"),
      "@envoymesh/identity": resolve(repoRoot, "packages/identity/src/index.ts"),
    },
  },
});