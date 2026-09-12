/**
 * Envoy Harness chat workspaces — one sidebar thread per project folder.
 *
 * Thread keys: `__envoy_harness__:<chatId>` (legacy bare `__envoy_harness__` → active chat).
 */

import { ENVOY_HARNESS_THREAD_KEY } from "./envoy-ai-thread.js";

/** Max open Envoy chat threads (matches Envoy Terminal PTY cap). */
export const MAX_ENVOY_HARNESS_CHATS = 5;

/** Placeholder until the first user prompt becomes the workspace title (Paseo). */
export const EH_CHAT_PLACEHOLDER_TITLE = "New workspace";

/** Max chars for prompt-derived workspace titles (first line). */
export const EH_CHAT_TITLE_FROM_PROMPT_MAX = 60;

export interface EhChatWorkspace {
  id: string;
  /** Normalized absolute project folder. */
  cwd: string;
  /**
   * Display title. Prefer first user prompt; until then
   * {@link EH_CHAT_PLACEHOLDER_TITLE}. Folder basename is project label only.
   */
  title?: string;
  /**
   * Create-time locked LLM (`provider:model` or bare name).
   * When set, EH uses this instead of the global Settings → AI model.
   */
  model?: string;
  /** Create-time locked OpenAI/Anthropic-compatible endpoint. */
  endpoint?: string;
  /** Create-time locked API key (credentials for this workspace). */
  apiKey?: string;
  /** Persisted harness JSONL session id when known. */
  sessionId?: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface EhChatWorkspaceSummary {
  id: string;
  cwd: string;
  title: string;
  lastUsedAt: string;
  messageCount?: number;
  /** Locked workspace model when set at create. */
  model?: string;
  /** True when workspace locked its own API key (key itself is not listed). */
  hasApiKey?: boolean;
  /** Locked endpoint when set at create. */
  endpoint?: string;
  /** Harness that owns this workspace (EH list is always envoy-harness). */
  harness?: "envoy-harness" | "pi";
  /** Sidebar status bucket derived from live agent state (+ pending). */
  uiBucket?: import("./coding-ui-bucket.js").CodingUiBucket;
  /** Last known EH agent state name when available. */
  agentState?: import("./eh-timeline.js").EhAgentStateName;
}

/** Normalize create-time model/endpoint/key (empty → undefined). */
export function normalizeEhChatModel(
  raw: string | null | undefined,
): string | undefined {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Prefer the workspace-locked model; else the global host model from Settings.
 */
export function resolveEhChatHostModel(
  chatModel: string | null | undefined,
  globalHostModel: string | null | undefined,
): string | undefined {
  return normalizeEhChatModel(chatModel) ?? normalizeEhChatModel(globalHostModel);
}

/** Prefer workspace-locked endpoint/apiKey; else global host creds. */
export function resolveEhChatHostCreds(opts: {
  chatEndpoint?: string | null;
  chatApiKey?: string | null;
  globalEndpoint?: string | null;
  globalApiKey?: string | null;
}): { endpoint: string | undefined; apiKey: string | undefined } {
  return {
    endpoint:
      normalizeEhChatModel(opts.chatEndpoint) ??
      normalizeEhChatModel(opts.globalEndpoint),
    apiKey:
      normalizeEhChatModel(opts.chatApiKey) ??
      normalizeEhChatModel(opts.globalApiKey),
  };
}

const THREAD_PREFIX = `${ENVOY_HARNESS_THREAD_KEY}:`;

export function envoyHarnessThreadKey(chatId: string): string {
  const id = chatId.trim();
  if (!id) return ENVOY_HARNESS_THREAD_KEY;
  return `${THREAD_PREFIX}${id}`;
}

export function isEnvoyHarnessThreadKey(
  threadKey: string | null | undefined,
): boolean {
  const key = threadKey?.trim();
  if (!key) return false;
  return key === ENVOY_HARNESS_THREAD_KEY || key.startsWith(THREAD_PREFIX);
}

/** Returns chat id, or `null` for legacy bare thread key (active chat). */
export function parseEnvoyHarnessChatId(threadKey: string): string | null {
  const key = threadKey.trim();
  if (key === ENVOY_HARNESS_THREAD_KEY) return null;
  if (!key.startsWith(THREAD_PREFIX)) return null;
  const id = key.slice(THREAD_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

/** Folder basename — project label / legacy default, not preferred workspace title. */
export function defaultEhChatTitle(cwd: string): string {
  const norm = cwd.replace(/[/\\]+$/, "");
  const base = norm.split(/[/\\]/).pop();
  return base && base.length > 0 ? base : "project";
}

/** Sidebar/header title when none is stored yet. */
export function resolveEhChatDisplayTitle(
  title: string | undefined,
  _cwd?: string,
): string {
  const trimmed = title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : EH_CHAT_PLACEHOLDER_TITLE;
}

/**
 * Derive a workspace title from the first user prompt (Paseo-aligned):
 * first non-empty line, trimmed, capped at {@link EH_CHAT_TITLE_FROM_PROMPT_MAX}.
 */
export function ehChatTitleFromUserPrompt(
  prompt: string,
  maxLen: number = EH_CHAT_TITLE_FROM_PROMPT_MAX,
): string {
  const firstLine =
    prompt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  if (!firstLine) return EH_CHAT_PLACEHOLDER_TITLE;
  const limit = Math.max(1, Math.floor(maxLen));
  if (firstLine.length <= limit) return firstLine;
  return `${firstLine.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

/**
 * Whether the node may replace `title` with a prompt-derived name.
 * Empty / placeholder always; legacy folder-basename only when no prior turns.
 */
export function shouldAutoSetEhChatTitle(
  title: string | undefined,
  cwd: string,
  opts?: { messageCount?: number },
): boolean {
  const trimmed = title?.trim() ?? "";
  if (!trimmed || trimmed === EH_CHAT_PLACEHOLDER_TITLE) return true;
  if (trimmed === defaultEhChatTitle(cwd)) {
    return (opts?.messageCount ?? 0) === 0;
  }
  return false;
}
