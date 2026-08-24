/**
 * Envoy Harness chat workspaces — one sidebar thread per project folder.
 *
 * Thread keys: `__envoy_harness__:<chatId>` (legacy bare `__envoy_harness__` → active chat).
 */

import { ENVOY_HARNESS_THREAD_KEY } from "./envoy-ai-thread.js";

/** Max open Envoy chat threads (matches Envoy Terminal PTY cap). */
export const MAX_ENVOY_HARNESS_CHATS = 5;

export interface EhChatWorkspace {
  id: string;
  /** Normalized absolute project folder. */
  cwd: string;
  /** Display title; defaults to folder basename. */
  title?: string;
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

export function defaultEhChatTitle(cwd: string): string {
  const norm = cwd.replace(/[/\\]+$/, "");
  const base = norm.split(/[/\\]/).pop();
  return base && base.length > 0 ? base : "project";
}
