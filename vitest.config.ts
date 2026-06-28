import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

const resolveAliases = {
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
  "@envoymesh/mobile-storage": resolve(rootDir, "packages/mobile-storage/src/index.ts"),
  "@envoymesh/mobile-vault": resolve(rootDir, "packages/mobile-vault/src/index.ts"),
  "@envoymesh/mobile-node": resolve(rootDir, "packages/mobile-node/src/index.ts"),
  "@envoymesh/rag": resolve(rootDir, "packages/rag/src/index.ts"),
};

/** Playwright/Chromium suites — run one file at a time to avoid port/browser contention. */
const BROWSER_E2E_TESTS = [
  "apps/node/test/webrtc-call-e2e.test.ts",
  "apps/node/test/social-ui-e2e.test.ts",
  "apps/node/test/terminal-playwright-browser.test.ts",
  "apps/node/test/two-node-playwright-e2e.test.ts",
  "apps/node/test/chain-playwright-e2e.test.ts",
];

const sharedTestOptions = {
  setupFiles: ["./vitest.setup.ts"],
  hookTimeout: 60_000,
};

export default defineConfig({
  resolve: {
    alias: resolveAliases,
  },
  test: {
    projects: [
      {
        resolve: { alias: resolveAliases },
        test: {
          ...sharedTestOptions,
          name: "unit",
          include: ["packages/*/test/**/*.test.{ts,tsx}", "apps/*/test/**/*.test.{ts,tsx}"],
          exclude: ["**/node_modules/**", "packages/openclaw/test/**", ...BROWSER_E2E_TESTS],
          testTimeout: 60_000,
        },
      },
      {
        resolve: { alias: resolveAliases },
        test: {
          ...sharedTestOptions,
          name: "browser-e2e",
          include: BROWSER_E2E_TESTS,
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 120_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
