/**
 * Phase 60A — append-only active Team-job orchestration journal.
 *
 * Checkpoints remain the fast materialized view. This journal preserves the
 * ordered semantic transitions needed for provenance and exact crash recovery.
 */
import { appendFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export interface ChainJournalEvent {
  version: 1;
  eventId: string;
  chainId: string;
  seq: number;
  at: string;
  type: string;
  data: Record<string, unknown>;
}

export interface ChainAttemptProjection {
  attemptId: string;
  chainId: string;
  subtaskId: string;
  workerPeerId: string;
  role: "primary" | "speculative" | "replacement";
  state: "awarded" | "running" | "final_received" | "selected" | "rejected" | "cancelled" | "lost";
  attemptNumber: number;
  acceptedCostUsd: number;
  createdAt: string;
  updatedAt: string;
  lastPartialSeq?: number;
  lastConfidence?: number;
  lastReason?: string;
}

export interface ChainJournalProjection {
  attempts: Record<string, ChainAttemptProjection>;
  selectedAttemptBySubtask: Record<string, string>;
}

export interface ChainJournalCheckpoint {
  version: 1;
  chainId: string;
  lastSeq: number;
  updatedAt: string;
  projection: ChainJournalProjection;
  /** Complete active runtime materialization; optional for pre-60A checkpoints. */
  runtimeSnapshot?: {
    state: Record<string, unknown>;
    bidStrategy: {
      baseCostUsd: number;
      capabilityLocalEtaMs: number;
      reputationDiscount: number;
      etaSlackMs: number;
    };
  };
}

export function emptyChainJournalProjection(): ChainJournalProjection {
  return { attempts: {}, selectedAttemptBySubtask: {} };
}

/** Pure reducer: replaying the same ordered event prefix yields the same view. */
export function reduceChainJournalEvent(
  current: ChainJournalProjection,
  event: ChainJournalEvent,
): ChainJournalProjection {
  const projection: ChainJournalProjection = {
    attempts: { ...current.attempts },
    selectedAttemptBySubtask: { ...current.selectedAttemptBySubtask },
  };
  if (event.type === "attempt.awarded") {
    const attempt = event.data as unknown as ChainAttemptProjection;
    if (
      typeof attempt.attemptId === "string" &&
      attempt.chainId === event.chainId &&
      typeof attempt.subtaskId === "string" &&
      typeof attempt.workerPeerId === "string"
    ) {
      projection.attempts[attempt.attemptId] = { ...attempt };
      // Speculative awards must not overwrite the selected primary until selection.
      if (attempt.role !== "speculative") {
        projection.selectedAttemptBySubtask[attempt.subtaskId] = attempt.attemptId;
      }
    }
    return projection;
  }
  if (event.type === "attempt.state_changed" || event.type === "attempt.partial_received") {
    const attemptId = typeof event.data.attemptId === "string" ? event.data.attemptId : undefined;
    const previous = attemptId ? projection.attempts[attemptId] : undefined;
    if (!attemptId || !previous) return projection;
    const next = { ...previous, updatedAt: event.at };
    if (event.type === "attempt.state_changed") {
      const state = event.data.state;
      if (
        state === "awarded" || state === "running" || state === "final_received" ||
        state === "selected" || state === "rejected" || state === "cancelled" || state === "lost"
      ) next.state = state;
      if (typeof event.data.reason === "string") next.lastReason = event.data.reason;
      if (state === "selected") {
        projection.selectedAttemptBySubtask[previous.subtaskId] = attemptId;
      }
    } else {
      next.state = event.data.isFinal === true ? "final_received" : "running";
      if (typeof event.data.seq === "number") next.lastPartialSeq = event.data.seq;
      if (typeof event.data.confidence === "number") next.lastConfidence = event.data.confidence;
    }
    projection.attempts[attemptId] = next;
  }
  return projection;
}

export function replayChainJournal(
  events: readonly ChainJournalEvent[],
  initial = emptyChainJournalProjection(),
): ChainJournalProjection {
  return events.reduce(reduceChainJournalEvent, initial);
}

export class ChainActiveJournal {
  private readonly nextSeq = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly initializers = new Map<string, Promise<ChainJournalEvent[]>>();

  constructor(private readonly profileDir: string) {}

  filePath(chainId: string): string {
    return join(this.profileDir, "team-jobs", "active", chainId, "events.jsonl");
  }

  checkpointPath(chainId: string): string {
    return join(this.profileDir, "team-jobs", "active", chainId, "checkpoint.json");
  }

  async listCheckpointChainIds(): Promise<string[]> {
    const root = join(this.profileDir, "team-jobs", "active");
    try {
      const entries = await readdir(root, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    } catch {
      return [];
    }
  }

  async initChain(chainId: string): Promise<ChainJournalEvent[]> {
    const existing = this.initializers.get(chainId);
    if (existing) return existing;
    const initializer = this.read(chainId).then((events) => {
      this.nextSeq.set(chainId, (events.at(-1)?.seq ?? 0) + 1);
      return events;
    });
    this.initializers.set(chainId, initializer);
    return initializer;
  }

  append(
    chainId: string,
    type: string,
    data: Record<string, unknown> = {},
    at = new Date(),
  ): Promise<ChainJournalEvent> {
    let resolveEvent!: (event: ChainJournalEvent) => void;
    let rejectEvent!: (error: unknown) => void;
    const result = new Promise<ChainJournalEvent>((resolve, reject) => {
      resolveEvent = resolve;
      rejectEvent = reject;
    });
    const previous = this.queues.get(chainId) ?? this.initChain(chainId).then(() => undefined);
    const queued = previous.then(async () => {
      const seq = this.nextSeq.get(chainId) ?? 1;
      const event: ChainJournalEvent = {
        version: 1,
        eventId: `chain_event_${randomUUID()}`,
        chainId,
        seq,
        at: at.toISOString(),
        type,
        data,
      };
      const path = this.filePath(chainId);
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, `${JSON.stringify(event)}\n`, { mode: 0o600 });
      this.nextSeq.set(chainId, seq + 1);
      resolveEvent(event);
    }).catch((error: unknown) => {
      rejectEvent(error);
    });
    this.queues.set(chainId, queued);
    void queued.finally(() => {
      if (this.queues.get(chainId) === queued) this.queues.delete(chainId);
    });
    return result;
  }

  async read(chainId: string): Promise<ChainJournalEvent[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath(chainId), "utf8");
    } catch {
      return [];
    }
    const events: ChainJournalEvent[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as ChainJournalEvent;
        if (
          event.version !== 1 ||
          event.chainId !== chainId ||
          event.seq !== events.length + 1 ||
          typeof event.type !== "string"
        ) break;
        events.push(event);
      } catch {
        // A crash may leave a partial final line. Keep the valid prefix only.
        break;
      }
    }
    return events;
  }

  async recover(chainId: string): Promise<{
    checkpoint?: ChainJournalCheckpoint;
    events: ChainJournalEvent[];
    tail: ChainJournalEvent[];
    projection: ChainJournalProjection;
    lastSeq: number;
  }> {
    const [checkpoint, events] = await Promise.all([
      this.readCheckpoint(chainId),
      this.read(chainId),
    ]);
    const checkpointSeq = checkpoint?.lastSeq ?? 0;
    const tail = events.filter((event) => event.seq > checkpointSeq);
    return {
      checkpoint,
      events,
      tail,
      projection: replayChainJournal(
        tail,
        checkpoint?.projection ?? emptyChainJournalProjection(),
      ),
      lastSeq: events.at(-1)?.seq ?? checkpointSeq,
    };
  }

  async writeCheckpoint(
    chainId: string,
    projection: ChainJournalProjection,
    lastSeq: number,
    at = new Date(),
    runtimeSnapshot?: ChainJournalCheckpoint["runtimeSnapshot"],
  ): Promise<ChainJournalCheckpoint> {
    await this.flush(chainId);
    const checkpoint: ChainJournalCheckpoint = {
      version: 1,
      chainId,
      lastSeq,
      updatedAt: at.toISOString(),
      projection,
      ...(runtimeSnapshot ? { runtimeSnapshot } : {}),
    };
    const path = this.checkpointPath(chainId);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(checkpoint, null, 2), { mode: 0o600 });
    await rename(tmp, path);
    return checkpoint;
  }

  private async readCheckpoint(chainId: string): Promise<ChainJournalCheckpoint | undefined> {
    try {
      const parsed = JSON.parse(await readFile(this.checkpointPath(chainId), "utf8")) as ChainJournalCheckpoint;
      if (
        parsed.version !== 1 || parsed.chainId !== chainId ||
        !Number.isInteger(parsed.lastSeq) || parsed.lastSeq < 0 ||
        !parsed.projection || typeof parsed.projection.attempts !== "object"
      ) return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  }

  async flush(chainId?: string): Promise<void> {
    if (chainId) {
      await (this.queues.get(chainId) ?? Promise.resolve());
      return;
    }
    await Promise.all(this.queues.values());
  }
}
