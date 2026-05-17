import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const socialSrc = resolve(repoRoot, "apps/social/src");

export default defineConfig({
  plugins: [
    react(),
    // Strip crossorigin attributes for Capacitor WebView compatibility.
    // WKWebView can be strict about CORS on file:///capacitor:// schemes.
    {
      name: "strip-crossorigin",
      transformIndexHtml(html) {
        return html.replace(/\s+crossorigin(?:="[^"]*")?/g, "");
      },
    },
  ],
  root: __dirname,
  base: "./",
  build: {
    outDir: "dist",
  },
  resolve: {
    alias: {
      // Shared packages (same as social vite config)
      "@envoymesh/api": resolve(repoRoot, "packages/api/src/index.ts"),
      "@envoymesh/protocol": resolve(repoRoot, "packages/protocol/src/index.ts"),

      // Mobile packages (pure TS, no native deps)
      "@envoymesh/mobile-identity": resolve(repoRoot, "packages/mobile-identity/src/index.ts"),
      "@envoymesh/mobile-node": resolve(repoRoot, "packages/mobile-node/src/index.ts"),
      "@envoymesh/mobile-storage": resolve(repoRoot, "packages/mobile-storage/src/index.ts"),
      "@envoymesh/mobile-vault": resolve(repoRoot, "packages/mobile-vault/src/index.ts"),

      // Desktop identity (social UI uses it for type imports)
      "@envoymesh/identity": resolve(repoRoot, "packages/identity/src/index.ts"),

      // Social UI source (shared between desktop and mobile)
      "@envoymesh/social": socialSrc,
    },
  },
  // Capacitor native plugins are only available on-device via dynamic await import()
  optimizeDeps: {
    exclude: [
      "@capacitor-community/sqlite",
      "@capacitor/filesystem",
      "capacitor-secure-storage-plugin",
    ],
  },
});
