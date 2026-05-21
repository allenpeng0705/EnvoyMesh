import type { TransferPhase, TransferStatus } from "@envoymesh/api";

const TERMINAL_PHASES: TransferPhase[] = ["verified", "failed"];
const DEFAULT_MAX_TERMINAL_ENTRIES = 500;
const DEFAULT_TERMINAL_TTL_MS = 24 * 60 * 60 * 1000;

export interface TransferTrackerOptions {
  maxTerminalEntries?: number;
  terminalTtlMs?: number;
}

export class TransferTracker {
  private readonly transfers = new Map<string, TransferStatus>();
  private readonly maxTerminalEntries: number;
  private readonly terminalTtlMs: number;

  constructor(options: TransferTrackerOptions = {}) {
    this.maxTerminalEntries = options.maxTerminalEntries ?? DEFAULT_MAX_TERMINAL_ENTRIES;
    this.terminalTtlMs = options.terminalTtlMs ?? DEFAULT_TERMINAL_TTL_MS;
  }

  upsert(partial: TransferStatus): TransferStatus {
    const existing = this.transfers.get(partial.correlationId);
    const next: TransferStatus = {
      ...(existing ?? {}),
      ...partial,
      correlationId: partial.correlationId,
      phase: partial.phase,
      updatedAt: partial.updatedAt,
    };
    this.transfers.set(partial.correlationId, next);
    if (TERMINAL_PHASES.includes(next.phase)) {
      this.pruneTerminalEntries();
    }
    return next;
  }

  get(correlationId: string): TransferStatus | undefined {
    return this.transfers.get(correlationId);
  }

  listActive(): TransferStatus[] {
    return [...this.transfers.values()].filter(
      (t) => t.phase === "negotiating" || t.phase === "transferring",
    );
  }

  listAll(): TransferStatus[] {
    return [...this.transfers.values()];
  }

  patch(correlationId: string, patch: Partial<Omit<TransferStatus, "correlationId">>): TransferStatus | undefined {
    const existing = this.transfers.get(correlationId);
    if (!existing) return undefined;
    return this.upsert({
      ...existing,
      ...patch,
      correlationId,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    });
  }

  markPhase(correlationId: string, phase: TransferPhase, extra?: Partial<TransferStatus>): TransferStatus | undefined {
    return this.patch(correlationId, { phase, ...extra });
  }

  private pruneTerminalEntries(now = Date.now()): void {
    const cutoff = now - this.terminalTtlMs;
    for (const [id, transfer] of this.transfers.entries()) {
      if (!TERMINAL_PHASES.includes(transfer.phase)) continue;
      const updatedAtMs = Date.parse(transfer.updatedAt);
      if (Number.isFinite(updatedAtMs) && updatedAtMs < cutoff) {
        this.transfers.delete(id);
      }
    }

    const terminal = [...this.transfers.entries()]
      .filter(([, transfer]) => TERMINAL_PHASES.includes(transfer.phase))
      .sort((a, b) => Date.parse(a[1].updatedAt) - Date.parse(b[1].updatedAt));

    while (terminal.length > this.maxTerminalEntries) {
      const [oldestId] = terminal.shift()!;
      this.transfers.delete(oldestId);
    }
  }
}
