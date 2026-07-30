/**
 * Dynamic AI character bot definition.
 *
 * Users create bots on the home node (via config or Settings UI). Each bot
 * has a personality (system prompt), display name, and optional avatar
 * color. Bots are stored in node-config.json under `aiBots` and sync to
 * all connected clients (EnvoyGo, Social UI) via the existing config
 * broadcast (`home:config-updated`).
 *
 * After the initial app update that adds the multi-bot framework, bots
 * can be added/removed/edited purely through server-side config — no
 * further app updates needed.
 *
 * Messages are processed in-process via the native LLM router
 * (`routeModelRequest`) with the bot's systemPrompt prepended to the
 * user's text. History is stored under thread key `bot:<id>`.
 */

export interface AiBotDefinition {
  /** Unique slug identifier, e.g. "librarian", "chef". */
  id: string
  /** Display name shown in the chat list, e.g. "Luna the Librarian". */
  name: string
  /** Personality instructions prepended to the user's message. */
  systemPrompt: string
  /** Hex color for the avatar background, e.g. "#6366f1". */
  avatarColor?: string
  /** One-line bio shown under the name in the chat list. */
  description?: string
  /** routeModelRequest task type. Default: "ai_bot.chat". */
  taskType?: string
  /** Override model name. If unset, inherits EnvoyMesh's configured model. */
  model?: string
  /** Whether this bot is enabled (disabled bots don't appear in the chat list). */
  enabled?: boolean
}

/** Thread key prefix for bot chat history. The full key is `bot:<id>`. */
export const AI_BOT_THREAD_PREFIX = "bot:"

/** Build the thread key for a bot. */
export function aiBotThreadKey(botId: string): string {
  return `${AI_BOT_THREAD_PREFIX}${botId}`
}

/** Extract the bot ID from a thread key (returns null if not a bot key). */
export function parseBotIdFromThreadKey(threadKey: string): string | null {
  if (!threadKey.startsWith(AI_BOT_THREAD_PREFIX)) return null
  return threadKey.slice(AI_BOT_THREAD_PREFIX.length)
}

/** Check if a thread key / agentType is a bot thread. */
export function isAiBotThread(key: string): boolean {
  return key.startsWith(AI_BOT_THREAD_PREFIX)
}
