/**
 * Phase 41B — Capability Index for worker auto-discovery.
 *
 * When a bond is established with a peer, this index is updated with
 * the peer's agent card capabilities. The orchestrator's `findWorkers`
 * callback reads from this index, making worker discovery dynamic.
 *
 * Persistence: `<profileDir>/capability-index.json` — survives restarts.
 *
 * @see docs/agent_network.md §13.2 (41B)
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkerEntry {
  peerId: string;
  ownerId: string;
  capabilities: string[];
  lastSeenAt: string;
  /** Optional display info from the agent card. */
  displayName?: string;
  agentCardId?: string;
}

// ---------------------------------------------------------------------------
// CapabilityIndex
// ---------------------------------------------------------------------------

export class CapabilityIndex {
  /** Map from capability tag → list of worker peerIds. */
  private byCapability = new Map<string, string[]>();

  /** Map from peerId → full worker entry. */
  private workers = new Map<string, WorkerEntry>();

  private filePath: string | null = null;

  /** Load the index from disk. Safe to call multiple times (idempotent). */
  async init(profileDir: string): Promise<void> {
    this.filePath = join(profileDir, "capability-index.json");
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const entries: WorkerEntry[] = JSON.parse(raw);
      for (const entry of entries) {
        this.indexWorker(entry);
      }
    } catch {
      // File doesn't exist yet — normal on first boot
    }
  }

  /**
   * Add or update a worker's capabilities. Automatically deduplicates
   * capability entries and triggers a debounced persist.
   */
  indexWorker(entry: WorkerEntry): void {
    const existing = this.workers.get(entry.peerId);
    // Replace capabilities from the latest agent card — do not merge forever.
    // Opt-out of Agent Network (dropping `capability-provider`) must take effect.
    const nextCaps = [...new Set(entry.capabilities)];
    if (existing) {
      for (const cap of existing.capabilities) {
        const peers = this.byCapability.get(cap);
        if (!peers) continue;
        const idx = peers.indexOf(entry.peerId);
        if (idx >= 0) peers.splice(idx, 1);
        if (peers.length === 0) this.byCapability.delete(cap);
      }
      existing.capabilities = nextCaps;
      existing.lastSeenAt = entry.lastSeenAt;
      existing.ownerId = entry.ownerId;
      if (entry.displayName) existing.displayName = entry.displayName;
      if (entry.agentCardId) existing.agentCardId = entry.agentCardId;
    } else {
      this.workers.set(entry.peerId, { ...entry, capabilities: nextCaps });
    }
    for (const cap of nextCaps) {
      const peers = this.byCapability.get(cap) ?? [];
      if (!peers.includes(entry.peerId)) peers.push(entry.peerId);
      this.byCapability.set(cap, peers);
    }
    void this.persist();
  }

  /**
   * Remove a worker from the index (called on bond revoked or peer offline).
   */
  removeWorker(peerId: string): void {
    const entry = this.workers.get(peerId);
    if (!entry) return;

    this.workers.delete(peerId);
    for (const cap of entry.capabilities) {
      const peers = this.byCapability.get(cap);
      if (peers) {
        const idx = peers.indexOf(peerId);
        if (idx >= 0) peers.splice(idx, 1);
        if (peers.length === 0) this.byCapability.delete(cap);
      }
    }
    void this.persist();
  }

  /**
   * Find workers capable of performing a given capability.
   * Returns peerIds sorted by last seen (most recent first).
   */
  findWorkers(capability: string): string[] {
    const peers = this.byCapability.get(capability);
    if (!peers || peers.length === 0) return [];

    return [...peers].sort((a, b) => {
      const wA = this.workers.get(a);
      const wB = this.workers.get(b);
      if (!wA || !wB) return 0;
      return wB.lastSeenAt.localeCompare(wA.lastSeenAt);
    });
  }

  /** Get a worker's full entry. */
  getWorker(peerId: string): WorkerEntry | undefined {
    return this.workers.get(peerId);
  }

  /** All workers in the index. */
  listWorkers(): WorkerEntry[] {
    return [...this.workers.values()];
  }

  /** Number of workers indexed. */
  get workerCount(): number {
    return this.workers.size;
  }

  /** Number of distinct capabilities indexed. */
  get capabilityCount(): number {
    return this.byCapability.size;
  }

  /** Snapshot for persistence or UI display. */
  snapshot(): { workers: WorkerEntry[]; capabilities: Record<string, string[]> } {
    return {
      workers: [...this.workers.values()],
      capabilities: Object.fromEntries(this.byCapability),
    };
  }

  // --------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------

  private persistDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private persistPending = false;

  private async persist(): Promise<void> {
    if (!this.filePath) return;
    // Debounce: batch rapid updates into a single write
    this.persistPending = true;
    if (this.persistDebounceTimer) return;

    // Re-check after a short delay to batch writes
    await sleep(500);

    this.persistDebounceTimer = undefined;
    if (!this.persistPending) return;
    this.persistPending = false;

    const entries = [...this.workers.values()];
    try {
      await writeFile(this.filePath, JSON.stringify(entries, null, 2), { mode: 0o600 });
    } catch {
      // Best-effort — don't crash on write failure
    }
  }
}
