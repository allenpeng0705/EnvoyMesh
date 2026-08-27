/**
 * Phase G / 12b — ACP host ↔ Social UI event + RPC types.
 *
 * Mirrors the Pi tool-approval bridge (`pi:proposal` /
 * `piRespondToProposal`): the node blocks on permission until
 * Social answers, and pushes committed transcript updates live.
 */

/** WebSocket push: ACP wants host approval for a tool/action. */
export interface AcpPermissionEvent {
  requestId: string;
  sessionId: string;
  toolName: string;
  description: string;
  args: unknown;
  /** Wall-clock ms; Social should respond before this or node auto-denies. */
  timeoutMs: number;
}

/** WebSocket push: committed ACP transcript update (`session/update`). */
export interface AcpTranscriptEvent {
  dialect: "acp" | "sdk";
  params: unknown;
  /** Optional correlation for UI filtering. */
  sessionId?: string;
  at: number;
}

/** Params for `acpRespondToPermission` JSON-RPC. */
export interface AcpRespondToPermissionParams {
  requestId: string;
  decision: "allow" | "deny";
}

export interface AcpRespondToPermissionResult {
  requestId: string;
  delivered: boolean;
}
