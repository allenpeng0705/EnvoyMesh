/**
 * Per-project Envoy Harness workspace sessions (cwd → persisted session id).
 *
 * Mirrors Cursor / Codex / Claude Code: each project folder gets its own
 * harness transcript (JSONL under `{profile}/envoy-harness/sessions`).
 */

import { resolve } from "node:path";

import { ehHistoryToTimelineItems, stripModelThinking } from "@envoymesh/api";
import type { EhChatHistory, EhChatTurn } from "@envoymesh/api";
import {
  SessionStore,
  isEphemeralUserMessage,
  type Message,
} from "@envoymesh/envoy-harness";

/** Normalize cwd for stable config keys (absolute, no trailing slash). */
export function normalizeEhWorkspaceCwd(cwd: string): string {
  const abs = resolve(cwd);
  return abs.replace(/[/\\]+$/, "") || abs;
}

export function envoyHarnessSessionStoreDir(profileDir: string): string {
  return `${profileDir}/envoy-harness/sessions`.replace(/\\/g, "/");
}

export function createEnvoyHarnessSessionStore(profileDir: string): SessionStore {
  return new SessionStore({ dir: envoyHarnessSessionStoreDir(profileDir) });
}

/** Resolve session id for a project folder (config map → disk scan fallback). */
export async function resolveEhSessionIdForCwd(opts: {
  cwd: string;
  sessionByCwd: Record<string, string> | undefined;
  sessionStore: SessionStore;
}): Promise<{ sessionId: string | undefined; migratedFromDisk: boolean }> {
  const key = normalizeEhWorkspaceCwd(opts.cwd);
  const mapped = opts.sessionByCwd?.[key]?.trim();
  if (mapped && mapped.length > 0 && (await opts.sessionStore.exists(mapped))) {
    return { sessionId: mapped, migratedFromDisk: false };
  }

  const summaries = await opts.sessionStore.listSummaries();
  const matches = summaries.filter(
    (s) =>
      s.cwd !== undefined && normalizeEhWorkspaceCwd(s.cwd) === key,
  );
  if (matches.length > 0) {
    matches.sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0));
    return { sessionId: matches[0]!.id, migratedFromDisk: true };
  }

  return { sessionId: undefined, migratedFromDisk: false };
}

export function ehMessagesToChatTurns(messages: readonly Message[]): EhChatTurn[] {
  const turns: EhChatTurn[] = [];
  let index = 0;
  for (const msg of messages) {
    if (msg.role === "user" && isEphemeralUserMessage(msg)) continue;
    const raw = messageDisplayText(msg);
    if (raw.trim().length === 0) continue;
    if (msg.role !== "user" && msg.role !== "assistant" && msg.role !== "system") {
      continue;
    }
    const text =
      msg.role === "assistant" ? stripModelThinking(raw).trim() : raw.trim();
    if (text.length === 0) continue;
    turns.push({
      id: `eh-msg-${index}`,
      role: msg.role,
      text,
    });
    index += 1;
  }
  return turns;
}

export async function loadEhChatHistoryFromStore(opts: {
  sessionStore: SessionStore;
  sessionId: string;
  cwd: string;
}): Promise<EhChatHistory> {
  const persisted = await opts.sessionStore.load(opts.sessionId);
  return withEhTimeline({
    sessionId: persisted.id,
    cwd: normalizeEhWorkspaceCwd(opts.cwd),
    title: persisted.metadata.title,
    turns: ehMessagesToChatTurns(persisted.messages),
  });
}

export function withEhTimeline(history: EhChatHistory): EhChatHistory {
  return { ...history, timeline: ehHistoryToTimelineItems(history) };
}

/**
 * Map UI turn id (`eh-msg-N`) to the underlying session message index.
 * Display turns skip empty / tool / non-text rows (same rules as
 * {@link ehMessagesToChatTurns}).
 */
export function findEhDisplayMessageIndex(
  messages: readonly Message[],
  turnId: string,
): number | undefined {
  const match = /^eh-msg-(\d+)$/.exec(turnId.trim());
  if (!match) return undefined;
  const target = Number(match[1]);
  if (!Number.isFinite(target) || target < 0) return undefined;
  let display = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    if (msg.role === "user" && isEphemeralUserMessage(msg)) continue;
    const raw = messageDisplayText(msg);
    if (raw.trim().length === 0) continue;
    if (msg.role !== "user" && msg.role !== "assistant" && msg.role !== "system") {
      continue;
    }
    const text =
      msg.role === "assistant" ? stripModelThinking(raw).trim() : raw.trim();
    if (text.length === 0) continue;
    if (display === target) return i;
    display += 1;
  }
  return undefined;
}

/**
 * Remove one UI turn from the persisted harness session and rewrite JSONL.
 * Returns the updated history (or `deleted: false` when turnId is unknown).
 */
export async function deleteEhChatTurnFromStore(opts: {
  sessionStore: SessionStore;
  sessionId: string;
  cwd: string;
  turnId: string;
}): Promise<{ deleted: boolean; history: EhChatHistory }> {
  const persisted = await opts.sessionStore.load(opts.sessionId);
  const msgIndex = findEhDisplayMessageIndex(persisted.messages, opts.turnId);
  if (msgIndex === undefined) {
    return {
      deleted: false,
      history: withEhTimeline({
        sessionId: persisted.id,
        cwd: normalizeEhWorkspaceCwd(opts.cwd),
        title: persisted.metadata.title,
        turns: ehMessagesToChatTurns(persisted.messages),
      }),
    };
  }

  const selected = persisted.messages[msgIndex]!;
  let deleteEnd = msgIndex + 1;
  if (selected.role === "user") {
    // A user prompt owns the assistant/tool exchange that follows it. Keeping
    // that tail after deleting the prompt produces misleading context and can
    // leave provider-invalid tool messages behind.
    while (
      deleteEnd < persisted.messages.length &&
      persisted.messages[deleteEnd]!.role !== "user" &&
      persisted.messages[deleteEnd]!.role !== "system"
    ) {
      deleteEnd += 1;
    }
  } else if (selected.role === "assistant") {
    // Tool results immediately following an assistant tool call belong to the
    // assistant message and must be removed with it.
    while (
      deleteEnd < persisted.messages.length &&
      persisted.messages[deleteEnd]!.role === "tool"
    ) {
      deleteEnd += 1;
    }
  }
  const remaining = persisted.messages.filter(
    (_, i) => i < msgIndex || i >= deleteEnd,
  );
  persisted.clear();
  for (const msg of remaining) {
    persisted.appendMessage(msg.role, msg.content);
  }
  await persisted.flush();

  return {
    deleted: true,
    history: withEhTimeline({
      sessionId: persisted.id,
      cwd: normalizeEhWorkspaceCwd(opts.cwd),
      title: persisted.metadata.title,
      turns: ehMessagesToChatTurns(persisted.messages),
    }),
  };
}

export function mergeSessionMapping(
  existing: Record<string, string> | undefined,
  cwd: string,
  sessionId: string,
): Record<string, string> {
  const key = normalizeEhWorkspaceCwd(cwd);
  return { ...(existing ?? {}), [key]: sessionId };
}

function messageDisplayText(msg: Message): string {
  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text" && block.text.length > 0) {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}
