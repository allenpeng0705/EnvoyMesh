/**
 * Phase 67A review — guard that `chain-recipes-store` is properly
 * re-exported from the `@envoymesh/local-store` package surface.
 *
 * Background: the function `createLocalChainRecipesStore` was imported
 * in `packages/local-store/src/index.ts` (line 75) but never re-exported
 * (no `export * from "./chain-recipes-store.js"` in the bottom block).
 * The unit test happened to import directly from
 * `../src/chain-recipes-store.js`, so the bug was invisible. The runtime
 * surface exposed the function to the package, so any consumer going
 * through `@envoymesh/local-store` (e.g. `apps/node/src/node-service-impl.ts`
 * chains module in a follow-up) would get `TypeError:
 * createLocalChainRecipesStore is not a function`.
 *
 * This guard reads the package's public barrel and asserts both the
 * value and the type are re-exported, so a future refactor that drops
 * the `export *` line will fail the test instead of silently breaking
 * downstream consumers.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const INDEX_PATH = resolve(__dirname, "../src/index.ts");
const RECIPES_PATH = resolve(__dirname, "../src/chain-recipes-store.ts");

describe("Phase 67A — chain-recipes-store public surface", () => {
  it("src/chain-recipes-store.ts exports both function and type", () => {
    const src = readFileSync(RECIPES_PATH, "utf8");
    expect(src).toContain(
      "export function createLocalChainRecipesStore(",
      "recipes store must export the factory function by name so it can be re-exported",
    );
    expect(src).toMatch(
      /export\s+(interface|type)\s+LocalChainRecipesStore\b/,
      "recipes store must export the type so consumers can type-annotate",
    );
  });

  it("src/index.ts re-exports the chain-recipes-store module", () => {
    const src = readFileSync(INDEX_PATH, "utf8");
    expect(src).toMatch(
      /export\s*\*\s*from\s*["']\.\/chain-recipes-store\.js["']/,
      "package barrel must re-export chain-recipes-store so the public " +
        "API includes createLocalChainRecipesStore; otherwise consumers " +
        "using `@envoymesh/local-store` get a TypeError at runtime",
    );
  });
});
