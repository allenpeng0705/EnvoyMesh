/**
 * Phase 67A — persisted chain goal recipes store.
 *
 * Imports go through `@envoymesh/local-store` (the package public
 * surface) rather than `../src/chain-recipes-store.js`. The package
 * must re-export `createLocalChainRecipesStore` and
 * `LocalChainRecipesStore` — without those, downstream consumers
 * (e.g. `apps/node/src/node-service-impl.ts` chains module) fail at
 * runtime with `createLocalChainRecipesStore is not a function`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createLocalChainRecipesStore,
  type LocalChainRecipesStore,
} from "@envoymesh/local-store";

describe("createLocalChainRecipesStore", () => {
  let profileDir: string;
  let store: LocalChainRecipesStore;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "chain-recipes-"));
    store = createLocalChainRecipesStore(profileDir);
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("returns empty when file is missing", async () => {
    expect(await store.listRecipes()).toEqual([]);
  });

  it("round-trips save → list → delete", async () => {
    const saved = await store.saveRecipe({
      id: "recipe_1",
      label: "Brief",
      goal: "Write a short brief with sources.",
      maxChainCostUsd: 12,
    });
    expect(saved.id).toBe("recipe_1");
    expect(saved.createdAt).toBeTruthy();
    expect(saved.updatedAt).toBeTruthy();

    const list = await store.listRecipes();
    expect(list).toHaveLength(1);
    expect(list[0]?.goal).toContain("brief");

    expect(await store.deleteRecipe("recipe_1")).toBe(true);
    expect(await store.listRecipes()).toEqual([]);
    expect(await store.deleteRecipe("missing")).toBe(false);
  });

  it("upserts by id and preserves createdAt", async () => {
    const first = await store.saveRecipe({
      id: "recipe_x",
      label: "A",
      goal: "Goal A that is long enough.",
    });
    await new Promise((r) => setTimeout(r, 5));
    const second = await store.saveRecipe({
      id: "recipe_x",
      label: "B",
      goal: "Goal B that is long enough.",
    });
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.label).toBe("B");
    expect(second.updatedAt >= first.updatedAt).toBe(true);
    expect(await store.listRecipes()).toHaveLength(1);
  });
});
