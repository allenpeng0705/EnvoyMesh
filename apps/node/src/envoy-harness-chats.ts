/**
 * Envoy Harness chat workspace registry (sidebar threads ↔ project folders).
 */

import { basename } from "node:path";

import type { EhChatWorkspace, EhChatWorkspaceSummary } from "@envoymesh/api";
import { defaultEhChatTitle, MAX_ENVOY_HARNESS_CHATS } from "@envoymesh/api";
import type { SessionStore } from "@envoymesh/envoy-harness";

import {
  loadEhChatHistoryFromStore,
  normalizeEhWorkspaceCwd,
  resolveEhSessionIdForCwd,
} from "./envoy-harness-workspace.js";

export function sortEhChats(chats: EhChatWorkspace[]): EhChatWorkspace[] {
  return [...chats].sort(
    (a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt),
  );
}

export function findEhChatByCwd(
  chats: readonly EhChatWorkspace[],
  cwd: string,
): EhChatWorkspace | undefined {
  const key = normalizeEhWorkspaceCwd(cwd);
  return chats.find((c) => normalizeEhWorkspaceCwd(c.cwd) === key);
}

export function findEhChatById(
  chats: readonly EhChatWorkspace[],
  chatId: string,
): EhChatWorkspace | undefined {
  return chats.find((c) => c.id === chatId);
}

/** Migrate legacy single `envoyHarnessCwd` + session map into one chat row. */
export function migrateLegacyEhChats(opts: {
  chats: EhChatWorkspace[] | undefined;
  legacyCwd: string | undefined;
  sessionByCwd: Record<string, string> | undefined;
}): EhChatWorkspace[] {
  const existing = opts.chats ?? [];
  if (existing.length > 0) return existing;
  const cwd = opts.legacyCwd?.trim();
  if (!cwd) return [];
  const normalized = normalizeEhWorkspaceCwd(cwd);
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
  chats: readonly EhChatWorkspace[];
  sessionStore: SessionStore;
  sessionByCwd?: Record<string, string>;
}): Promise<EhChatWorkspaceSummary[]> {
  const summaries: EhChatWorkspaceSummary[] = [];
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
    summaries.push({
      id: chat.id,
      cwd: chat.cwd,
      title: chat.title?.trim() || defaultEhChatTitle(chat.cwd),
      lastUsedAt: chat.lastUsedAt,
      ...(messageCount !== undefined ? { messageCount } : {}),
    });
  }
  return summaries;
}

export function touchEhChat(
  chats: EhChatWorkspace[],
  chatId: string,
): EhChatWorkspace[] {
  const now = new Date().toISOString();
  return chats.map((c) =>
    c.id === chatId ? { ...c, lastUsedAt: now } : c,
  );
}

export function upsertEhChatSessionId(
  chats: EhChatWorkspace[],
  chatId: string,
  sessionId: string,
): EhChatWorkspace[] {
  return chats.map((c) =>
    c.id === chatId ? { ...c, sessionId } : c,
  );
}

export function updateEhChatCwd(
  chats: EhChatWorkspace[],
  chatId: string,
  cwd: string,
): EhChatWorkspace[] {
  const normalized = normalizeEhWorkspaceCwd(cwd);
  return chats.map((c) =>
    c.id === chatId
      ? {
          ...c,
          cwd: normalized,
          title: defaultEhChatTitle(normalized),
          sessionId: undefined,
        }
      : c,
  );
}

export function removeEhChat(
  chats: EhChatWorkspace[],
  chatId: string,
): EhChatWorkspace[] {
  return chats.filter((c) => c.id !== chatId);
}

export function assertEhChatCapacity(chats: readonly EhChatWorkspace[]): void {
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
