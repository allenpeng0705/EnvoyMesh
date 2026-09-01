import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMarketSearchHistoryStore } from "../src/market-search-history-store.js";

describe("createMarketSearchHistoryStore", () => {
  it("records newest-first and dedupes case-insensitively", async () => {
    const dir = await mkdtemp(join(tmpdir(), "market-hist-"));
    try {
      const store = createMarketSearchHistoryStore(dir);
      await store.record("books");
      await store.record("electronics");
      await store.record("Books");
      const list = await store.list(10);
      expect(list.map((e) => e.query)).toEqual(["Books", "electronics"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
