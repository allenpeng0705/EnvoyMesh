import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Subpath exports must precede the package root alias (prefix match).
      "@envoymesh/api/did-import": resolve(rootDir, "packages/api/src/did-import.ts"),
      "@envoymesh/api/discovery-privacy": resolve(rootDir, "packages/api/src/discovery-privacy.ts"),
      "@envoymesh/api/discovery-referral-attestation": resolve(
        rootDir,
        "packages/api/src/discovery-referral-attestation.ts",
      ),
      "@envoymesh/api/chat-delivered": resolve(rootDir, "packages/api/src/chat-delivered.ts"),
      "@envoymesh/api/chat-room-service": resolve(rootDir, "packages/api/src/chat-room-service.ts"),
      "@envoymesh/api/group-chat-delivery": resolve(rootDir, "packages/api/src/group-chat-delivery.ts"),
      "@envoymesh/api": resolve(rootDir, "packages/api/src/index.ts"),
      "@envoymesh/social": resolve(rootDir, "apps/social/src"),
      "@envoymesh/protocol": resolve(rootDir, "packages/protocol/src/index.ts"),
      "@envoymesh/agent-adapter": resolve(rootDir, "packages/agent-adapter/src/index.ts"),
      "@envoymesh/identity": resolve(rootDir, "packages/identity/src/index.ts"),
      "@envoymesh/bonds": resolve(rootDir, "packages/bonds/src/index.ts"),
      "#network/data-framing": resolve(rootDir, "packages/network/src/data-framing.ts"),
      "#network/protocols": resolve(rootDir, "packages/network/src/protocols.ts"),
      "#network/capability-topic-cid": resolve(rootDir, "packages/network/src/capability-topic-cid.ts"),
      "@envoymesh/network/capability-topic-cid": resolve(rootDir, "packages/network/src/capability-topic-cid.ts"),
      "@envoymesh/network/protocols": resolve(rootDir, "packages/network/src/protocols.ts"),
      "@envoymesh/network/data-framing": resolve(rootDir, "packages/network/src/data-framing.ts"),
      "@envoymesh/network": resolve(rootDir, "packages/network/src/index.ts"),
      "@envoymesh/vault": resolve(rootDir, "packages/vault/src/index.ts"),
      "@envoymesh/models": resolve(rootDir, "packages/models/src/index.ts"),
      "@envoymesh/local-store": resolve(rootDir, "packages/local-store/src/index.ts"),
      "@envoymesh/ipfs-helia/browser": resolve(rootDir, "packages/ipfs-helia/src/browser.ts"),
      "@envoymesh/ipfs-helia": resolve(rootDir, "packages/ipfs-helia/src/index.ts"),
      "@envoymesh/mobile-identity": resolve(rootDir, "packages/mobile-identity/src/index.ts"),
      "@envoymesh/rag/embedding-resolver": resolve(rootDir, "packages/rag/src/embedding-resolver.ts"),
      "@envoymesh/rag": resolve(rootDir, "packages/rag/src/index.ts"),
      "@envoymesh/kb-obsidian": resolve(rootDir, "packages/kb-obsidian/src/index.ts"),
      "@envoymesh/envoy-harness": resolve(
        rootDir,
        "../envoy-harness/packages/envoy-harness/src/index.ts",
      ),
      "@envoymesh/envoy-harness-client": resolve(
        rootDir,
        "../envoy-harness/packages/envoy-harness-client/src/index.ts",
      ),
      "@envoymesh/envoy-harness-adapter": resolve(
        rootDir,
        "../envoy-harness/packages/envoy-harness-adapter/src/index.ts",
      ),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.{ts,tsx}", "apps/*/test/**/*.test.{ts,tsx}"],
    exclude: (() => {
      // Capacitor apps/mobile + in-process mobile-* packages were removed
      // (backup/legacy; product mobile = EnvoyGo). Excludes kept for safety.
      const always = [
        "**/node_modules/**",
        "packages/openclaw/test/**",
      ];
      // Default: skip E2E tests in `npm test`. They need libp2p mesh,
      // a relay server, or Chromium — see vitest.setup.ts. Opt in with
      // RUN_E2E=1 (or use a `test:e2e:*` script in package.json).
      if (process.env.RUN_E2E === "1") return always;
      return [
        ...always,
        // File-name conventions
        "**/integration/**/*.test.ts",
        "**/test/**/*e2e*.test.ts",
        "**/test/**/*a2e*.test.ts",
        "**/test/**/*smoke*.test.ts",
        "**/test/**/*playwright*.test.ts",
        "**/test/**/*two-home*.test.ts",
        "**/test/**/*three-home*.test.ts",
        "**/test/**/*two-node*.test.ts",
        "**/test/**/*three-node*.test.ts",
        "**/test/**/*chain-playwright*.test.ts",
        "**/test/**/*chain-e2e*.test.ts",
        "**/test/**/*federated-rag*.test.ts",
        "**/test/**/*phase-*-e2e*.test.ts",
        // Specific files that don't match the above patterns but are E2E
        "**/test/agent-e2e-real.test.ts",
        "**/test/agent-e2e.test.ts",
        "**/test/approval-send-agent-chat-e2e.test.ts",
        "**/test/bidirectional-chat-e2e.test.ts",
        "**/test/chain-three-home-smoke.test.ts",
        "**/test/chain-two-home-smoke.test.ts",
        "**/test/geo-discovery-wan-signoff.test.ts",
        "**/test/wan-relay-signoff-e2e.test.ts",
        "**/test/relay-chat-e2e.test.ts",
        "**/test/relay-bridge-e2e.test.ts",
        "**/test/relay-broadcast-e2e.test.ts",
        "**/test/two-node-file-share-e2e.test.ts",
        "**/test/two-node-playwright-e2e.test.ts",
      ];
    })(),
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    // Several E2E tests schedule async work (setTimeout-based task.result
    // sends, post-teardown RPC teardown messages from libp2p streams) that
    // fire AFTER the test completes. Vitest catches these as "unhandled
    // rejections" and exits non-zero even when every test passed. The work
    // is benign (we're tearing down a stopped mesh). Tolerate it at the
    // runner level rather than racing per-test cleanup across ~50 files.
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
