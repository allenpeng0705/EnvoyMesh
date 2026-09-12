/**
 * Ext Agent (Coding Tier B) timeline chat ids on `eh:timeline`.
 *
 * Streaming harnesses (codex / claudecode) upsert assistant tokens under
 * `__ext__:${sessionId}` — same wire channel as Envoy Harness and Pi.
 */

/** Wire chatId for an Ext Agent coding session. */
export function extTimelineChatId(sessionId: string): string {
  return `__ext__:${sessionId.trim()}`
}

/** True when chatId is an Ext Agent timeline thread (`__ext__:<sessionId>`). */
export function isExtTimelineChatId(chatId: string): boolean {
  return chatId.startsWith("__ext__:")
}

/** Extract sessionId from an Ext timeline chatId; null if not an Ext id. */
export function sessionIdFromExtTimelineChatId(chatId: string): string | null {
  if (!isExtTimelineChatId(chatId)) return null
  const id = chatId.slice("__ext__:".length).trim()
  return id || null
}
