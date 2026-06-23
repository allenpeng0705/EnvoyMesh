import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getCachedVaultIndex,
  resetVaultIndexCacheForTests,
  VAULT_INDEX_CACHE_TTL_MS,
} from "../src/vault-index-cache.js";

describe("getCachedVaultIndex", () => {
  afterEach(() => {
    resetVaultIndexCacheForTests();
    vi.useRealTimers();
  });

  it("returns null for empty vault dir", async () => {
    expect(await getCachedVaultIndex("")).toBeNull();
  });

  it("reuses index within TTL", async () => {
    const vaultDir = await mkdtemp(join(tmpdir(), "envoy-vault-cache-"));
    try {
      await mkdir(vaultDir, { recursive: true });
      await writeFile(join(vaultDir, "note.txt"), "hello vault", "utf8");

      const first = await getCachedVaultIndex(vaultDir);
      await writeFile(join(vaultDir, "note2.txt"), "changed on disk", "utf8");
      const second = await getCachedVaultIndex(vaultDir);

      expect(first).not.toBeNull();
      expect(second).toBe(first);
    } finally {
      await rm(vaultDir, { recursive: true, force: true });
    }
  });

  it("rebuilds after TTL expires", async () => {
    vi.useFakeTimers();
    const vaultDir = await mkdtemp(join(tmpdir(), "envoy-vault-cache-"));
    try {
      await mkdir(vaultDir, { recursive: true });
      await writeFile(join(vaultDir, "note.txt"), "hello vault", "utf8");

      const first = await getCachedVaultIndex(vaultDir);
      vi.advanceTimersByTime(VAULT_INDEX_CACHE_TTL_MS + 1);
      const second = await getCachedVaultIndex(vaultDir);

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(second).not.toBe(first);
    } finally {
      await rm(vaultDir, { recursive: true, force: true });
    }
  });
});
