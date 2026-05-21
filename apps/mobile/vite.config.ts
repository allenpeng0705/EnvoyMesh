import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const socialSrc = resolve(repoRoot, "apps/social/src");

function readHeliaVersionForDefine(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, "node_modules/helia/package.json"), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

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
  define: {
    __ENVOYMESH_HELIA_VERSION__: JSON.stringify(readHeliaVersionForDefine()),
  },
  build: {
    outDir: "dist",
  },
  resolve: {
    alias: {
      // Shared packages (same as social vite config)
      "@envoymesh/api": resolve(repoRoot, "packages/api/src/index.ts"),
      "@envoymesh/protocol": resolve(repoRoot, "packages/protocol/src/index.ts"),

      "@envoymesh/models": resolve(repoRoot, "packages/models/src/index.ts"),

      // Mobile packages (pure TS, no native deps)
      "@envoymesh/mobile-identity": resolve(repoRoot, "packages/mobile-identity/src/index.ts"),
      "@envoymesh/mobile-node": resolve(repoRoot, "packages/mobile-node/src/index.ts"),
      "@envoymesh/mobile-storage": resolve(repoRoot, "packages/mobile-storage/src/index.ts"),
      "@envoymesh/mobile-vault": resolve(repoRoot, "packages/mobile-vault/src/index.ts"),

      "@envoymesh/ipfs-helia/browser": resolve(repoRoot, "packages/ipfs-helia/src/browser.ts"),
      // Browser-safe @envoymesh/network subpaths only — never alias the main package
      // (it pulls node:crypto via capability-topic signing).
      "#network/data-framing": resolve(repoRoot, "packages/network/src/data-framing.ts"),
      "#network/protocols": resolve(repoRoot, "packages/network/src/protocols.ts"),
      "#network/capability-topic-cid": resolve(repoRoot, "packages/network/src/capability-topic-cid.ts"),
      "@envoymesh/network/capability-topic-cid": resolve(repoRoot, "packages/network/src/capability-topic-cid.ts"),
      "@envoymesh/network/protocols": resolve(repoRoot, "packages/network/src/protocols.ts"),
      "@envoymesh/network/data-framing": resolve(repoRoot, "packages/network/src/data-framing.ts"),

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
