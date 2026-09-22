/**
 * Envoy Harness chat task registry (sidebar threads ↔ project folders).
 */

import { basename } from "node:path";

import type {
  EhAgentStateName,
  EhChatTask,
  EhChatTaskSummary,
} from "@envoymesh/api/core";
import {
  defaultEhChatTitle,
  deriveCodingUiBucket,
  normalizeEhChatModel,
  resolveEhChatDisplayTitle,
  MAX_ENVOY_HARNESS_CHATS,
} from "@envoymesh/api/core";
import type { SessionStore } from "@envoymesh/envoy-harness";

import {
  loadEhChatHistoryFromStore,
  normalizeEhTaskCwd,
  resolveEhSessionIdForCwd,
} from "./envoy-harness-task.js";

export function sortEhChats(chats: EhChatTask[]): EhChatTask[] {
  return [...chats].sort(
    (a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt),
  );
}

export function findEhChatByCwd(
  chats: readonly EhChatTask[],
  cwd: string,
): EhChatTask | undefined {
  const key = normalizeEhTaskCwd(cwd);
  return chats.find((c) => normalizeEhTaskCwd(c.cwd) === key);
}

export function findEhChatById(
  chats: readonly EhChatTask[],
  chatId: string,
): EhChatTask | undefined {
  return chats.find((c) => c.id === chatId);
}

/** Migrate legacy single `envoyHarnessCwd` + session map into one chat row. */
export function migrateLegacyEhChats(opts: {
  chats: EhChatTask[] | undefined;
  legacyCwd: string | undefined;
  sessionByCwd: Record<string, string> | undefined;
}): EhChatTask[] {
  // Explicit array (including []) means the multi-chat registry is authoritative.
  // Only `undefined` means “never migrated” — re-seeding from legacy cwd when the
  // user cleared all chats made Remove look like a no-op (new UUID each time).
  if (opts.chats !== undefined) return opts.chats;
  const cwd = opts.legacyCwd?.trim();
  if (!cwd) return [];
  const normalized = normalizeEhTaskCwd(cwd);
  const sessionId = opts.sessionByCwd?.[normalized];
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      cwd: normalized,
      title: defaultEhChatTitle(normalized),
      ...(sessionId ? { sessionId } : {}),
      createdAt: now,
      lastUsedAt: now,
    },
  ];
}

export async function summarizeEhChats(opts: {
  chats: readonly EhChatTask[];
  sessionStore: SessionStore;
  sessionByCwd?: Record<string, string>;
  /** Live EH agent state per chat (from node runtime). */
  agentStateByChatId?: Record<string, EhAgentStateName>;
  /** Pending permission / user-question per chat. */
  pendingByChatId?: Record<string, boolean>;
}): Promise<EhChatTaskSummary[]> {
  const summaries: EhChatTaskSummary[] = [];
  for (const chat of sortEhChats([...opts.chats])) {
    let messageCount: number | undefined;
    const sessionId =
      chat.sessionId ??
      (
        await resolveEhSessionIdForCwd({
          cwd: chat.cwd,
          sessionByCwd: opts.sessionByCwd,
          sessionStore: opts.sessionStore,
        })
      ).sessionId;
    if (sessionId) {
      try {
        const history = await loadEhChatHistoryFromStore({
          sessionStore: opts.sessionStore,
          sessionId,
          cwd: chat.cwd,
        });
        messageCount = history.turns.length;
      } catch {
        messageCount = undefined;
      }
    }
    const agentState = opts.agentStateByChatId?.[chat.id];
    const pending = opts.pendingByChatId?.[chat.id] === true;
    const uiBucket = deriveCodingUiBucket({
      state: agentState ?? "ready",
      hasPendingPermissionOrQuestion: pending,
    });
    summaries.push({
      id: chat.id,
      cwd: chat.cwd,
      title: resolveEhChatDisplayTitle(chat.title, chat.cwd),
      lastUsedAt: chat.lastUsedAt,
      ...(messageCount !== undefined ? { messageCount } : {}),
      ...(chat.model?.trim() ? { model: chat.model.trim() } : {}),
      ...(chat.endpoint?.trim() ? { endpoint: chat.endpoint.trim() } : {}),
      ...(chat.apiKey?.trim() ? { hasApiKey: true } : {}),
      harness: "envoy-harness",
      uiBucket,
      ...(agentState ? { agentState } : {}),
    });
  }
  return summaries;
}

export function touchEhChat(
  chats: EhChatTask[],
  chatId: string,
): EhChatTask[] {
  const now = new Date().toISOString();
  return chats.map((c) =>
    c.id === chatId ? { ...c, lastUsedAt: now } : c,
  );
}

export function upsertEhChatSessionId(
  chats: EhChatTask[],
  chatId: string,
  sessionId: string,
): EhChatTask[] {
  return chats.map((c) =>
    c.id === chatId ? { ...c, sessionId } : c,
  );
}

export function updateEhChatCwd(
  chats: EhChatTask[],
  chatId: string,
  cwd: string,
): EhChatTask[] {
  const normalized = normalizeEhTaskCwd(cwd);
  return chats.map((c) =>
    c.id === chatId
      ? {
          ...c,
          cwd: normalized,
          // Reset to placeholder until the next first prompt.
          title: undefined,
          sessionId: undefined,
        }
      : c,
  );
}

export function updateEhChatTitle(
  chats: EhChatTask[],
  chatId: string,
  title: string,
): EhChatTask[] {
  const next = title.trim();
  if (!next) return chats;
  return chats.map((c) => (c.id === chatId ? { ...c, title: next } : c));
}

/**
 * Update the model locked on one task. Empty / null clears that field.
 * Does not change cwd, title, or any other chat.
 */
export function updateEhChatRuntime(
  chats: EhChatTask[],
  chatId: string,
  patch: {
    model?: string | null;
    endpoint?: string | null;
    apiKey?: string | null;
  },
): EhChatTask[] {
  return chats.map((c) => {
    if (c.id !== chatId) return c;
    const next: EhChatTask = { ...c };
    const apply = (
      key: "model" | "endpoint" | "apiKey",
      value: string | null | undefined,
    ) => {
      if (value === undefined) return;
      const normalized = normalizeEhChatModel(value);
      if (normalized) next[key] = normalized;
      else delete next[key];
    };
    apply("model", patch.model);
    apply("endpoint", patch.endpoint);
    apply("apiKey", patch.apiKey);
    return next;
  });
}

export function removeEhChat(
  chats: EhChatTask[],
  chatId: string,
): EhChatTask[] {
  return chats.filter((c) => c.id !== chatId);
}

export function assertEhChatCapacity(chats: readonly EhChatTask[]): void {
  if (chats.length >= MAX_ENVOY_HARNESS_CHATS) {
    throw new Error(
      `envoy_harness_chat_limit: at most ${MAX_ENVOY_HARNESS_CHATS} Envoy chats — close one first`,
    );
  }
}

export function envoyChatTitleForPath(projectPath: string): string {
  const name = basename(projectPath.replace(/[/\\]+$/, "")) || "project";
  return `Envoy · ${name}`;
}
