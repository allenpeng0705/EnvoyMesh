/**
 * Phase 60F — journal/event predicates for the Agent Network lab (no sleeps).
 */
import type { ChainJournalEvent } from "../../src/chain-active-journal.js";

export type LabEventPredicate = (event: ChainJournalEvent) => boolean;

export function journalType(type: string): LabEventPredicate {
  return (event) => event.type === type;
}

export function journalTypeAnd(
  type: string,
  match: (data: Record<string, unknown>) => boolean,
): LabEventPredicate {
  return (event) => event.type === type && match(event.data);
}

export function recoveryStarted(): LabEventPredicate {
  return journalType("recovery.started");
}

export function recoveryPeerReconciled(): LabEventPredicate {
  return journalType("recovery.peer_reconciled");
}

export function attemptAwarded(subtaskId?: string): LabEventPredicate {
  return journalTypeAnd("attempt.awarded", (data) =>
    subtaskId ? data.subtaskId === subtaskId : true,
  );
}

export function attemptSelected(subtaskId?: string): LabEventPredicate {
  return journalTypeAnd("attempt.state_changed", (data) =>
    data.state === "selected" && (subtaskId ? data.subtaskId === subtaskId : true),
  );
}

/**
 * Await until `predicate` matches any event in `events`, polling via `flush`.
 * Uses a bounded real timeout only as a deadlock detector — never sleeps for
 * protocol timing (use LabClock for that).
 */
export async function awaitJournalPredicate(input: {
  events: () => readonly ChainJournalEvent[];
  predicate: LabEventPredicate;
  flush?: () => Promise<void> | void;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<ChainJournalEvent> {
  const timeoutMs = input.timeoutMs ?? 5_000;
  const pollMs = input.pollMs ?? 10;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await input.flush?.();
    const hit = input.events().find(input.predicate);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`lab-events: predicate not satisfied within ${timeoutMs}ms`);
}
