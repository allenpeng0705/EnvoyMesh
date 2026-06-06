import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

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
    wasm(),
    topLevelAwait(),
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
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
    exclude: [
      "@capacitor-community/sqlite",
      "@capacitor/filesystem",
      "capacitor-secure-storage-plugin",
    ],
  },
  resolve: {
    alias: {
      // Shared packages (same as social vite config) — subpath aliases before package root
      "@envoymesh/api/chat-delivered": resolve(repoRoot, "packages/api/src/chat-delivered.ts"),
      "@envoymesh/api/did-import": resolve(repoRoot, "packages/api/src/did-import.ts"),
      "@envoymesh/api/discovery-privacy": resolve(repoRoot, "packages/api/src/discovery-privacy.ts"),
      "@envoymesh/api/discovery-referral-attestation": resolve(
        repoRoot,
        "packages/api/src/discovery-referral-attestation.ts",
      ),
      "@envoymesh/api/group-chat-delivery": resolve(repoRoot, "packages/api/src/group-chat-delivery.ts"),
      "@envoymesh/api/chat-room-thread": resolve(repoRoot, "packages/api/src/chat-room-thread.ts"),
      "@envoymesh/api/chat-room-service": resolve(repoRoot, "packages/api/src/chat-room-service.ts"),
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
      // Dynamic `import("@envoymesh/network")` in mobile-node — must not load node index
      "@envoymesh/network": resolve(repoRoot, "packages/network/src/browser.ts"),

      // Desktop identity types only where needed; mobile runtime uses mobile-identity
      "@envoymesh/identity": resolve(repoRoot, "packages/mobile-identity/src/index.ts"),

      // Social UI source (shared between desktop and mobile)
      "@envoymesh/social": socialSrc,
    },
  },
});
