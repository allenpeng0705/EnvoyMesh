/**
 * Phase 41B — AgentNetworkMembershipIndex tests.
 *
 * Tests auto-discovery worker index: add, update, remove, find,
 * persistence, dedup, sort-by-last-seen.
 *
 * Run: npx vitest run apps/node/test/capability-index.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentNetworkMembershipIndex, type WorkerEntry } from "../src/capability-index.js";

function worker(
  peerId: string,
  membership: string[],
  opts: { ownerId?: string; displayName?: string; lastSeenAt?: string } = {},
): WorkerEntry {
  return {
    peerId,
    ownerId: opts.ownerId ?? `envoy:owner:${peerId}`,
    membership,
    lastSeenAt: opts.lastSeenAt ?? new Date().toISOString(),
    displayName: opts.displayName,
  };
}

describe("AgentNetworkMembershipIndex — 41B", () => {
  let profileDir: string;
  let index: AgentNetworkMembershipIndex;

  beforeAll(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "cap-idx-"));
    index = new AgentNetworkMembershipIndex();
    await index.init(profileDir);
  });

  afterAll(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("starts empty", () => {
    expect(index.workerCount).toBe(0);
    expect(index.capabilityCount).toBe(0);
    expect(index.findWorkers("translation")).toEqual([]);
  });

  it("indexes a worker and finds by capability", () => {
    index.indexWorker(worker("peer_a", ["translation", "review"]));
    expect(index.workerCount).toBe(1);
    expect(index.capabilityCount).toBe(2);

    const found = index.findWorkers("translation");
    expect(found).toEqual(["peer_a"]);
  });

  it("handles multiple workers with same capability", () => {
    index.indexWorker(worker("peer_b", ["translation", "search"]));
    index.indexWorker(worker("peer_c", ["review", "search"]));

    const translators = index.findWorkers("translation");
    expect(translators).toContain("peer_a");
    expect(translators).toContain("peer_b");
    expect(translators.length).toBe(2);

    const searchers = index.findWorkers("search");
    expect(searchers).toContain("peer_b");
    expect(searchers).toContain("peer_c");
    expect(searchers.length).toBe(2);
  });

  it("returns empty for unknown capability", () => {
    expect(index.findWorkers("unknown")).toEqual([]);
  });

  it("replaces capabilities when updating a worker (opt-out takes effect)", () => {
    // peer_a already has ["translation", "review"]
    index.indexWorker(worker("peer_a", ["translation", "summarize"]));

    const peers = index.findWorkers("translation");
    expect(peers).toContain("peer_a");
    expect(peers.filter((p) => p === "peer_a").length).toBe(1);

    const reviewer = index.getWorker("peer_a");
    expect(reviewer?.membership).toEqual(["translation", "summarize"]);
    expect(index.findWorkers("review")).not.toContain("peer_a");
  });

  it("sorts workers by lastSeenAt (most recent first)", () => {
    index.indexWorker(worker("peer_x", ["rank"], { lastSeenAt: "2026-01-01T00:00:00.000Z" }));
    index.indexWorker(worker("peer_y", ["rank"], { lastSeenAt: "2026-06-15T00:00:00.000Z" }));
    index.indexWorker(worker("peer_z", ["rank"], { lastSeenAt: "2026-03-01T00:00:00.000Z" }));

    const ranked = index.findWorkers("rank");
    expect(ranked[0]).toBe("peer_y"); // most recent
    expect(ranked[1]).toBe("peer_z");
    expect(ranked[2]).toBe("peer_x"); // oldest
  });

  it("removes a worker from all capability indexes", () => {
    index.indexWorker(worker("peer_rm", ["translation", "search", "analyze"]));
    expect(index.findWorkers("translation")).toContain("peer_rm");
    expect(index.findWorkers("search")).toContain("peer_rm");

    index.removeWorker("peer_rm");
    expect(index.findWorkers("translation")).not.toContain("peer_rm");
    expect(index.findWorkers("search")).not.toContain("peer_rm");
    expect(index.getWorker("peer_rm")).toBeUndefined();
  });

  it("removeWorker is a no-op for unknown peer", () => {
    const count = index.workerCount;
    index.removeWorker("nonexistent");
    expect(index.workerCount).toBe(count);
  });

  it("getWorker returns full entry", () => {
    index.indexWorker(worker("peer_full", ["translation"], {
      ownerId: "envoy:owner:test",
      displayName: "Test Bot",
    }));

    const entry = index.getWorker("peer_full");
    expect(entry).toBeTruthy();
    expect(entry?.ownerId).toBe("envoy:owner:test");
    expect(entry?.displayName).toBe("Test Bot");
    expect(entry?.membership).toEqual(["translation"]);
  });

  it("listWorkers returns all entries", () => {
    const all = index.listWorkers();
    expect(all.length).toBe(index.workerCount);
    const peerIds = all.map((w) => w.peerId);
    expect(peerIds).toContain("peer_a");
    expect(peerIds).toContain("peer_b");
  });

  it("snapshot returns structured data", () => {
    const snap = index.snapshot();
    expect(Array.isArray(snap.workers)).toBe(true);
    expect(typeof snap.capabilities).toBe("object");
    expect(snap.workers.length).toBe(index.workerCount);
  });

  it("persists to disk and survives reload", async () => {
    // Create a fresh index, add a worker, let it persist
    const dir = await mkdtemp(join(tmpdir(), "cap-idx-persist-"));
    try {
      const idx1 = new AgentNetworkMembershipIndex();
      await idx1.init(dir);
      idx1.indexWorker(worker("persist_a", ["translation"]));
      // Wait for debounced persist
      await new Promise((r) => setTimeout(r, 600));

      // Reload from disk
      const idx2 = new AgentNetworkMembershipIndex();
      await idx2.init(dir);
      expect(idx2.workerCount).toBe(1);
      expect(idx2.findWorkers("translation")).toEqual(["persist_a"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("re-index replaces the capability set from the latest card", () => {
    index.indexWorker(worker("peer_merge", ["search"]));
    index.indexWorker(worker("peer_merge", ["review"]));

    const entry = index.getWorker("peer_merge");
    expect(entry?.membership).toEqual(["review"]);
    expect(index.findWorkers("search")).not.toContain("peer_merge");
    expect(index.findWorkers("review")).toContain("peer_merge");
  });
});
