import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Monorepo packages ship `exports` → `dist/`, which does not exist until `tsc -b`. Dev resolves source like Vitest. */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [react()],
  root: "src",
  resolve: {
    alias: {
      "@envoymesh/api": resolve(repoRoot, "packages/api/src/index.ts"),
      "@envoymesh/protocol": resolve(repoRoot, "packages/protocol/src/index.ts"),
      "@envoymesh/identity": resolve(repoRoot, "packages/identity/src/index.ts"),
    },
  },
});