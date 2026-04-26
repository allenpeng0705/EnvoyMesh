import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@envoymesh/protocol": resolve(rootDir, "packages/protocol/src/index.ts"),
      "@envoymesh/identity": resolve(rootDir, "packages/identity/src/index.ts"),
      "@envoymesh/bonds": resolve(rootDir, "packages/bonds/src/index.ts"),
      "@envoymesh/network": resolve(rootDir, "packages/network/src/index.ts"),
      "@envoymesh/vault": resolve(rootDir, "packages/vault/src/index.ts"),
      "@envoymesh/models": resolve(rootDir, "packages/models/src/index.ts"),
      "@envoymesh/local-store": resolve(rootDir, "packages/local-store/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
  },
});
