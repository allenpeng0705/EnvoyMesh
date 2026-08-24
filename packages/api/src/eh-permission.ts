/**
 * Envoy Harness tool permission prompts (`session/request_permission`).
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
