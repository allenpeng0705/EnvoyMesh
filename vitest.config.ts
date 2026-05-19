import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@envoymesh/api": resolve(rootDir, "packages/api/src/index.ts"),
      "@envoymesh/protocol": resolve(rootDir, "packages/protocol/src/index.ts"),
      "@envoymesh/identity": resolve(rootDir, "packages/identity/src/index.ts"),
      "@envoymesh/bonds": resolve(rootDir, "packages/bonds/src/index.ts"),
      "@envoymesh/network": resolve(rootDir, "packages/network/src/index.ts"),
      "@envoymesh/vault": resolve(rootDir, "packages/vault/src/index.ts"),
      "@envoymesh/models": resolve(rootDir, "packages/models/src/index.ts"),
      "@envoymesh/local-store": resolve(rootDir, "packages/local-store/src/index.ts"),
      "@envoymesh/mobile-identity": resolve(rootDir, "packages/mobile-identity/src/index.ts"),
      "@envoymesh/mobile-storage": resolve(rootDir, "packages/mobile-storage/src/index.ts"),
      "@envoymesh/mobile-vault": resolve(rootDir, "packages/mobile-vault/src/index.ts"),
      "@envoymesh/mobile-node": resolve(rootDir, "packages/mobile-node/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.{ts,tsx}", "apps/*/test/**/*.test.{ts,tsx}"],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
