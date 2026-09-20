/**
 * Tool permission prompts (`session/request_permission`).
 *
 * Two surfaces ask the same question and share one shape and one dock:
 *
 *   * **Envoy Harness** chat / terminal — `eh:permission`, answered by
 *     `ehRespondToPermission`;
 *   * a **Coding** session on a catalog ACP agent — `coding:permission`,
 *     answered by `codingRespondToPermission`.
 *
 * They are two names rather than one because the *producers* and their id spaces
 * differ: an EH prompt belongs to a sidebar chat thread and can carry a `turnId`,
 * while a coding prompt belongs to the Coding session that asked. The payload
 * itself is identical on purpose — a second shape would mean a second dock.
 */

export interface EhPermissionEvent {
  requestId: string;
  sessionId: string;
  toolName: string;
  description: string;
  args: unknown;
  /** Unified diff-style preview for edit/write when available. */
  preview?: string;
  timeoutMs: number;
  /** Sidebar chat thread that owns this permission prompt. */
  chatId?: string;
  turnId?: string;
}

/** A Coding session's tool prompt. Same shape as {@link EhPermissionEvent}, by design. */
export type CodingPermissionEvent = EhPermissionEvent;

export interface CodingRespondToPermissionParams {
  requestId: string;
  /** true = allow, false = deny */
  allowed: boolean;
}

export interface CodingRespondToPermissionResult {
  requestId: string;
  delivered: boolean;
}

export interface EhRespondToPermissionParams {
  requestId: string;
  /** true = allow, false = deny */
  allowed: boolean;
}

export interface EhRespondToPermissionResult {
  requestId: string;
  delivered: boolean;
}
