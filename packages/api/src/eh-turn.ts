/**
 * Codex-shaped non-blocking Envoy Harness turn lifecycle.
 *
 * UI calls `startEnvoyHarnessTurn` (returns immediately), then listens for
 * `eh:turn_token` / `eh:activity` / `eh:turn_complete` notifications.
 */

import type { EhTurnHintsEvent } from "./eh-turn-hints.js";

export interface EhTurnStartedEvent {
  turnId: string;
  userPrompt: string;
  startedAt: string;
}

export interface EhTurnTokenEvent {
  turnId: string;
  delta: string;
  /** Accumulated assistant text (reconnect-friendly). */
  streamingText: string;
}

export interface EhTurnCompleteEvent {
  turnId: string;
  ok: boolean;
  text?: string;
  stopReason?: string;
  turnHints?: EhTurnHintsEvent;
  error?: string;
  cancelled?: boolean;
  /** Paths touched during the turn (write/edit). */
  changedFiles?: string[];
}

export interface StartEnvoyHarnessTurnParams {
  text: string;
  attachments?: import("./ext-agent.js").AgentAttachmentRef[];
}

/** Snapshot for reconnect — in-flight turn survives WS drops. */
export interface EhTurnStatus {
  busy: boolean;
  turnId?: string;
  userPrompt?: string;
  streamingText?: string;
  startedAt?: string;
}

export interface StartEnvoyHarnessTurnResult {
  turnId: string;
}
