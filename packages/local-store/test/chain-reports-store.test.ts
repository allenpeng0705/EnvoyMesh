/**
 * Phase 40 — Chain reports store tests.
 *
 * Verifies:
 * - Empty file → empty list
 * - Round-trip: recordChainReport → getChainReport / listChainReports
 * - Upsert: second recordChainReport for the same chainId overwrites; original
 *   `storedAt` is preserved so GC age is anchored to first-write
 * - Filter semantics: sinceMs, limit, pinnedOnly
 * - pinChainReport toggles the flag and is idempotent
 * - pruneExpiredReports drops unpinned records older than the retention window
 *   but preserves pinned records regardless of age
 * - Persistence across store instances (atomic write, no orphans)
 * - Concurrent writers are serialized (enqueueWrite) — both records survive
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createLocalChainReportsStore,
  type ChainReportRecord,
  type LocalChainReportsStore,
} from "@envoymesh/local-store";
import type { ChainReport } from "@envoymesh/protocol";

const NOW = "2026-06-18T00:00:00.000Z";
const NOW_MS = Date.parse(NOW);

function report(overrides: Partial<ChainReport> = {}): ChainReport {
  return {
    version: "0.1",
    chainId: "chain_test-1",
    chainMandateId: "chainmandate_test-1",
    orchestratorOwnerId: "envoy:owner:abc",
    orchestratorPeerId: "12D3KooW-orchestrator",
    pinned: false,
    chainSummary: {
      durationMs: 60_000,
      subtaskCount: 2,
      workerCount: 2,
      workerAllocations: [
        { subtaskId: "subtask_a", workerPeerId: "12D3KooW-w1", committedUsd: 1 },
        { subtaskId: "subtask_b", workerPeerId: "12D3KooW-w2", committedUsd: 1 },
      ],
      synthesisCostUsd: 0.5,
    },
    executiveSummary: "# Summary\n\nThree findings.",
    sections: [],
    recipientRoles: ["human"],
    createdAt: NOW,
    ...overrides,
  };
}

describe("createLocalChainReportsStore", () => {
  let profileDir: string;
  let store: LocalChainReportsStore;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "chain-reports-store-"));
    store = createLocalChainReportsStore(profileDir);
  });
  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("returns an empty list when the file does not exist", async () => {
    expect(await store.listChainReports()).toEqual([]);
  });

  it("round-trips a report", async () => {
    const r = report();
    await store.recordChainReport(r);
    const got = await store.getChainReport(r.chainId);
    expect(got?.report).toEqual(r);
    const list = await store.listChainReports();
    expect(list).toHaveLength(1);
    expect(list[0].report.chainId).toBe(r.chainId);
  });

  it("upserts by chainId and preserves the original storedAt", async () => {
    const r1 = report({ executiveSummary: "v1" });
    const first = await store.recordChainReport(r1);
    expect(first.storedAt).toBe(first.updatedAt);

    // Second write: small delay so updatedAt would differ if a fresh timestamp
    // were stamped on the second call.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const r2 = report({ executiveSummary: "v2" });
    const second = await store.recordChainReport(r2);

    expect(second.report.executiveSummary).toBe("v2");
    // storedAt must be preserved from the first write.
    expect(second.storedAt).toBe(first.storedAt);
    // updatedAt must be strictly later (or equal to first.updatedAt if the
    // clock didn't advance; we only assert non-strict ordering here).
    expect(Date.parse(second.updatedAt) >= Date.parse(first.updatedAt)).toBe(true);

    const list = await store.listChainReports();
    expect(list).toHaveLength(1);
    expect(list[0].report.executiveSummary).toBe("v2");
  });

  it("returns null on getChainReport for a missing chainId", async () => {
    expect(await store.getChainReport("chain_missing")).toBeNull();
  });

  it("listChainReports returns newest first", async () => {
    await store.recordChainReport(report({ chainId: "chain_old", createdAt: "2026-06-01T00:00:00.000Z" }));
    await store.recordChainReport(report({ chainId: "chain_new", createdAt: "2026-06-18T00:00:00.000Z" }));
    const list = await store.listChainReports();
    expect(list.map((r) => r.report.chainId)).toEqual(["chain_new", "chain_old"]);
  });

  it("listChainReports respects limit", async () => {
    for (let i = 0; i < 5; i += 1) {
      await store.recordChainReport(
        report({ chainId: `chain_${i}`, createdAt: new Date(NOW_MS + i * 1000).toISOString() }),
      );
    }
    const list = await store.listChainReports({ limit: 3 });
    expect(list).toHaveLength(3);
  });

  it("listChainReports respects sinceMs filter", async () => {
    await store.recordChainReport(report({ chainId: "chain_old", createdAt: "2026-01-01T00:00:00.000Z" }));
    await store.recordChainReport(report({ chainId: "chain_new", createdAt: "2026-06-18T00:00:00.000Z" }));
    const list = await store.listChainReports({ sinceMs: Date.parse("2026-06-01T00:00:00.000Z") });
    expect(list.map((r) => r.report.chainId)).toEqual(["chain_new"]);
  });

  it("listChainReports respects pinnedOnly filter", async () => {
    await store.recordChainReport(report({ chainId: "chain_unpinned" }));
    await store.recordChainReport(report({ chainId: "chain_pinned", pinned: true }));
    const unpinned = await store.listChainReports({ pinnedOnly: false });
    expect(unpinned).toHaveLength(2);
    const pinned = await store.listChainReports({ pinnedOnly: true });
    expect(pinned).toHaveLength(1);
    expect(pinned[0].report.chainId).toBe("chain_pinned");
  });

  it("pinChainReport toggles the flag", async () => {
    await store.recordChainReport(report({ chainId: "chain_x" }));
    const pinned = await store.pinChainReport("chain_x", true);
    expect(pinned?.report.pinned).toBe(true);
    const list = await store.listChainReports({ pinnedOnly: true });
    expect(list).toHaveLength(1);

    const unpinned = await store.pinChainReport("chain_x", false);
    expect(unpinned?.report.pinned).toBe(false);
    const list2 = await store.listChainReports({ pinnedOnly: true });
    expect(list2).toHaveLength(0);
  });

  it("pinChainReport is idempotent (same value is a no-op)", async () => {
    await store.recordChainReport(report({ chainId: "chain_y", pinned: true }));
    const first = await store.pinChainReport("chain_y", true);
    await new Promise((r) => setTimeout(r, 5));
    const second = await store.pinChainReport("chain_y", true);
    expect(first?.updatedAt).toBe(second?.updatedAt);
  });

  it("pinChainReport returns null for a missing chainId", async () => {
    expect(await store.pinChainReport("chain_missing", true)).toBeNull();
  });

  it("pruneExpiredReports drops old unpinned but preserves pinned", async () => {
    const veryOld = "2020-01-01T00:00:00.000Z";
    const recent = "2026-06-17T00:00:00.000Z";
    await store.recordChainReport(report({ chainId: "chain_old_unpinned", createdAt: veryOld }));
    await store.recordChainReport(report({ chainId: "chain_old_pinned", createdAt: veryOld, pinned: true }));
    await store.recordChainReport(report({ chainId: "chain_recent", createdAt: recent }));

    const removed = await store.pruneExpiredReports(NOW_MS, 90 * 24 * 60 * 60 * 1000);
    expect(removed).toBe(1);

    const survivors = await store.listChainReports();
    const survivorIds = survivors.map((r) => r.report.chainId).sort();
    expect(survivorIds).toEqual(["chain_old_pinned", "chain_recent"]);
  });

  it("pruneExpiredReports returns 0 when nothing is expired", async () => {
    await store.recordChainReport(report({ chainId: "chain_recent" }));
    const removed = await store.pruneExpiredReports(NOW_MS, 90 * 24 * 60 * 60 * 1000);
    expect(removed).toBe(0);
  });

  it("pruneExpiredReports is idempotent (safe to call twice)", async () => {
    await store.recordChainReport(report({ chainId: "chain_old", createdAt: "2020-01-01T00:00:00.000Z" }));
    expect(await store.pruneExpiredReports(NOW_MS, 90 * 24 * 60 * 60 * 1000)).toBe(1);
    expect(await store.pruneExpiredReports(NOW_MS, 90 * 24 * 60 * 60 * 1000)).toBe(0);
  });

  it("pruneExpiredReports respects a custom retention window", async () => {
    await store.recordChainReport(report({ chainId: "chain_30d", createdAt: "2026-05-01T00:00:00.000Z" }));
    await store.recordChainReport(report({ chainId: "chain_1d", createdAt: "2026-06-17T00:00:00.000Z" }));
    // 7-day retention window: chain_30d is pruned, chain_1d survives.
    const removed = await store.pruneExpiredReports(NOW_MS, 7 * 24 * 60 * 60 * 1000);
    expect(removed).toBe(1);
    const survivors = await store.listChainReports();
    expect(survivors.map((r) => r.report.chainId)).toEqual(["chain_1d"]);
  });

  it("persists across store instances (atomic write, no orphans)", async () => {
    await store.recordChainReport(report({ chainId: "chain_a" }));
    await store.recordChainReport(report({ chainId: "chain_b" }));

    const storeB = createLocalChainReportsStore(profileDir);
    const list = await storeB.listChainReports();
    expect(list.map((r) => r.report.chainId).sort()).toEqual(["chain_a", "chain_b"]);
  });

  it("serializes concurrent writers (both records survive)", async () => {
    const writes: Promise<ChainReportRecord>[] = [];
    for (let i = 0; i < 10; i += 1) {
      writes.push(store.recordChainReport(report({ chainId: `chain_${i}` })));
    }
    await Promise.all(writes);
    const list = await store.listChainReports();
    expect(list).toHaveLength(10);
    expect(new Set(list.map((r) => r.report.chainId)).size).toBe(10);
  });
});