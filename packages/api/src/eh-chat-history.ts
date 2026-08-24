/**
 * Envoy Harness chat history — UI turns restored from persisted harness sessions.
 *
 * Design: one harness JSONL session per project folder (cwd). The Social
 * "Envoy" sidebar thread swaps transcript when the project folder changes.
 */

export interface EhChatTurn {
  id: string
  role: "user" | "assistant" | "system"
  text: string
  /** ISO timestamp when known (from session metadata or message order). */
  createdAt?: string
}

export interface EhChatHistory {
  /** Sidebar chat workspace id (when using multi-thread mode). */
  chatId?: string
  /** Persisted harness session id for this workspace. */
  sessionId: string
  /** Normalized project folder path. */
  cwd: string
  /** User-visible turns (user + assistant; tool rows omitted). */
  turns: EhChatTurn[]
  /** Optional session title from harness metadata. */
  title?: string
}
