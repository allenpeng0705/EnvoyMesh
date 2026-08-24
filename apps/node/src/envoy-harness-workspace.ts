/**
 * Per-project Envoy Harness workspace sessions (cwd → persisted session id).
 *
 * Mirrors Cursor / Codex / Claude Code: each project folder gets its own
 * harness transcript (JSONL under `{profile}/envoy-harness/sessions`).
 */

import { resolve } from "node:path";

import { stripModelThinking } from "@envoymesh/api";
import type { EhChatHistory, EhChatTurn } from "@envoymesh/api";
import {
  SessionStore,
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
  return {
    sessionId: persisted.id,
    cwd: normalizeEhWorkspaceCwd(opts.cwd),
    title: persisted.metadata.title,
    turns: ehMessagesToChatTurns(persisted.messages),
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
