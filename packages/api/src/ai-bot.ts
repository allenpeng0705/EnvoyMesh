/**
 * Dynamic AI character bot definition.
 *
 * Users create bots on the home node (via config or Settings UI). Each bot
 * has a personality (system prompt), display name, and optional avatar
 * color. Bots are stored in node-config.json under `aiBots` and sync to
 * all connected clients (EnvoyGo, Social UI) via the existing config
 * broadcast (`home:config-updated`).
 *
 * On save, `normalizeAiBotDefinition` reshapes free-form user input into a
 * stable first-person character prompt + short list blurb. At chat time,
 * `buildAiBotPrompt` adds hard roleplay framing around those notes.
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

/** Max length for the optional chat-list short description. */
export const AI_BOT_DESCRIPTION_MAX_LEN = 80

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Collapse runs of blank lines and trim edges. */
function tidyMultiline(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Strip common "helpful AI assistant" openers that fight character roleplay.
 * Leaves role/job phrasing like "You are a helpful librarian" alone.
 */
function stripAssistantOpeners(text: string): string {
  let out = text
  const patterns = [
    /^you are (?:an? )?(?:helpful )?(?:ai|artificial intelligence|assistant|chatbot|language model)\b[^\n.!?]*[.!?]?\s*/i,
    /^as an? (?:ai|artificial intelligence|assistant|chatbot|language model)\b[^\n.!?]*[.!?]?\s*/i,
    /^i(?:'m| am) (?:an? )?(?:ai|artificial intelligence|assistant|chatbot|language model)\b[^\n.!?]*[.!?]?\s*/i,
    /^i(?:'ll| will) help (?:the )?user\b[^\n.!?]*[.!?]?\s*/i,
  ]
  for (const re of patterns) {
    out = out.replace(re, "")
  }
  return out.trim()
}

/**
 * Light third-person → second-person rewrite for the bot's display name.
 * Deterministic heuristics only — does not invent personality.
 */
function rewriteThirdPersonToSecond(name: string, text: string): string {
  if (!name) return text
  const n = escapeRegExp(name)
  let out = text
  out = out.replace(new RegExp(`\\b${n}\\s+is\\b`, "gi"), "You are")
  out = out.replace(new RegExp(`\\b${n}\\s+was\\b`, "gi"), "You were")
  out = out.replace(new RegExp(`\\b${n}\\s+has\\b`, "gi"), "You have")
  out = out.replace(new RegExp(`\\b${n}\\s+loves\\b`, "gi"), "You love")
  out = out.replace(new RegExp(`\\b${n}\\s+likes\\b`, "gi"), "You like")
  out = out.replace(new RegExp(`\\b${n}'s\\b`, "gi"), "Your")
  // Common bio continuations after "{Name} is …" — verb phrases only (not bare pronouns).
  out = out.replace(/\bShe loves\b/gi, "You love")
  out = out.replace(/\bHe loves\b/gi, "You love")
  out = out.replace(/\bShe likes\b/gi, "You like")
  out = out.replace(/\bHe likes\b/gi, "You like")
  out = out.replace(/\bShe has\b/gi, "You have")
  out = out.replace(/\bHe has\b/gi, "You have")
  out = out.replace(/\bShe enjoys\b/gi, "You enjoy")
  out = out.replace(/\bHe enjoys\b/gi, "You enjoy")
  out = out.replace(/\bShe speaks\b/gi, "You speak")
  out = out.replace(/\bHe speaks\b/gi, "You speak")
  out = out.replace(/\bShe works\b/gi, "You work")
  out = out.replace(/\bHe works\b/gi, "You work")
  return out
}

function ensureYouAreName(name: string, text: string): string {
  const opener = `You are ${name}.`
  if (!name) return text
  const already = new RegExp(`^you\\s+are\\s+${escapeRegExp(name)}\\b`, "i")
  if (already.test(text)) {
    return text.replace(already, opener.replace(/\.$/, ""))
  }
  if (!text) return opener
  return `${opener}\n${text}`
}

/**
 * Normalize free-form personality text into a first-person character prompt.
 */
export function normalizeAiBotPersonality(name: string, systemPrompt: string): string {
  const trimmedName = name.trim() || "Character"
  let body = tidyMultiline(systemPrompt)
  body = stripAssistantOpeners(body)
  body = rewriteThirdPersonToSecond(trimmedName, body)
  body = tidyMultiline(body)
  body = body.replace(new RegExp(`^(You are ${escapeRegExp(trimmedName)}\\.\\s*)+`, "i"), "")
  body = tidyMultiline(body)
  return ensureYouAreName(trimmedName, body)
}

/**
 * Normalize the optional chat-list blurb to one short line.
 * If empty, derives a one-liner from the (already normalized) personality.
 */
export function normalizeAiBotDescription(
  name: string,
  description: string | undefined,
  personality?: string,
): string | undefined {
  const trimmedName = name.trim()
  let line = (description ?? "").replace(/\s+/g, " ").trim()

  if (!line && personality) {
    let seed = personality
      .replace(new RegExp(`^You are ${escapeRegExp(trimmedName || "Character")}\\.\\s*`, "i"), "")
      .replace(/\s+/g, " ")
      .trim()
    const sentence = seed.split(/(?<=[.!?])\s+/)[0]?.trim() ?? seed
    line = sentence
  }

  if (!line) return undefined

  if (new RegExp(`^you are ${escapeRegExp(trimmedName)}$`, "i").test(line.replace(/\.$/, ""))) {
    return undefined
  }

  if (line.length > AI_BOT_DESCRIPTION_MAX_LEN) {
    const cut = line.slice(0, AI_BOT_DESCRIPTION_MAX_LEN - 1)
    const lastSpace = cut.lastIndexOf(" ")
    line = `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
  }
  return line
}

/**
 * Normalize name / personality / description on save.
 * Does not invent a new personality — only reshapes user input.
 */
export function normalizeAiBotDefinition(bot: AiBotDefinition): AiBotDefinition {
  const name = bot.name.trim()
  const systemPrompt = normalizeAiBotPersonality(name, bot.systemPrompt)
  const description = normalizeAiBotDescription(name, bot.description, systemPrompt)
  const next: AiBotDefinition = {
    ...bot,
    name,
    systemPrompt,
  }
  if (description) next.description = description
  else delete next.description
  return next
}

/** Normalize every bot in a config list (used by home node on save). */
export function normalizeAiBotsList(bots: readonly AiBotDefinition[]): AiBotDefinition[] {
  return bots.map((b) => normalizeAiBotDefinition(b))
}

export interface BuildAiBotPromptParams {
  botName: string
  /** User-authored character notes / personality. */
  systemPrompt: string
  /** Prior turns already formatted as `Human: …` / `{botName}: …` lines. */
  conversationHistory?: string
  userText: string
}

/**
 * Build the full LLM prompt for a character bot turn.
 *
 * Wraps the user's personality notes with hard roleplay framing so the model
 * speaks *as* the character (first person), not as a generic assistant
 * talking *about* them.
 */
export function buildAiBotPrompt(params: BuildAiBotPromptParams): string {
  const name = params.botName.trim() || "Character"
  const notes = params.systemPrompt.trim()
  const userText = params.userText.trim()
  const history = params.conversationHistory?.trim() ?? ""

  const framing = [
    `You are ${name}.`,
    `Stay fully in character at all times.`,
    `Speak in the first person as ${name} — never as an AI assistant, chatbot, or advisor talking about ${name} in the third person.`,
    `Do not break character. Do not offer help menus, gift/travel/movie recommendation lists, or "how can I help you today" unless ${name} would naturally say that in this conversation.`,
    `Do not narrate that you are roleplaying or an AI. Just be ${name}.`,
    "",
    "Character notes from the user (treat these as facts about who you are):",
    notes || `(No extra notes — improvise a warm, natural personality as ${name}.)`,
  ].join("\n")

  const turnCue = [
    "---",
    `Continue the chat in character. Reply only as ${name} (one message, no speaker label prefix).`,
    `Human: ${userText}`,
    `${name}:`,
  ].join("\n")

  if (history) {
    return `${framing}\n\n--- Conversation so far ---\n${history}\n\n${turnCue}`
  }
  return `${framing}\n\n${turnCue}`
}
