/**
 * AI prompt context: chat history windows, chat RAG, and vault knowledge base.
 */

import type { AiKnowledgeBaseScope, AiKnowledgeBaseSettings, AiVaultQuery } from "@envoymesh/api";
import { resolveAiKnowledgeBaseSettings, resolveKnowledgeBaseVaultPaths } from "@envoymesh/api";
import type { LocalChatLogStore } from "@envoymesh/local-store";
import type { ChatLogEnvelope } from "@envoymesh/local-store";
import { searchVault, type VaultIndex, type VaultSearchResult } from "@envoymesh/vault";

// ---------------------------------------------------------------------------
// Sensitivity levels (3-tier for knowledge base)
// ---------------------------------------------------------------------------

/**
 * Knowledge-base sensitivity levels. Three tiers: `public`, `friends`, `private`.
 *
 * The protocol defines a fourth level `trusted` which maps to `friends` for KB
 * purposes. The historical internal names `professional` and `personal` are
 * normalized to `friends` and `private` respectively (Phase 44A1).
 */
export type KnowledgeAccessLevel = "public" | "friends" | "private";

/** Ordered from most open (0) to most restrictive (2). */
const SENSITIVITY_ORDER: readonly KnowledgeAccessLevel[] = ["public", "friends", "private"] as const;

/**
 * Map legacy sensitivity names to the 3-tier KB levels.
 * - `professional` was between friends and private → maps to `friends`
 * - `personal` was the most restrictive → maps to `private`
 */
function normalizeLegacySensitivity(
  s: string,
): KnowledgeAccessLevel {
  if (s === "personal" || s === "private") return "private";
  if (s === "professional" || s === "friends" || s === "trusted") return "friends";
  return "public";
}

/**
 * Resolve the effective sensitivity for a vault document.
 *
 * Resolution chain (first match wins):
 * 1. Per-item override from `.envoy/sensitivity.json` (if provided)
 * 2. Path heuristic from `inferDocumentSensitivity()`
 *
 * @param relativePath  Document path relative to vault root
 * @param overrides     Per-item sensitivity overrides (from SensitivityOverrideStore), optional
 */
export function resolveDocumentSensitivity(
  relativePath: string,
  overrides?: Map<string, KnowledgeAccessLevel> | undefined,
): KnowledgeAccessLevel {
  // Per-item override would need documentId, not relativePath.
  // Callers that have overrides should use the documentId-keyed version below.
  // This signature is for callers that only have the path.
  void overrides;
  return inferDocumentSensitivity(relativePath);
}

/**
 * Resolve effective sensitivity using documentId for override lookup.
 *
 * Resolution chain (first match wins):
 * 1. Per-item override from `.envoy/sensitivity.json`
 * 2. Path heuristic from `inferDocumentSensitivity()`
 */
export function resolveDocumentSensitivityById(
  documentId: string,
  relativePath: string,
  overrides?: Map<string, KnowledgeAccessLevel> | undefined,
): KnowledgeAccessLevel {
  if (overrides) {
    const override = overrides.get(documentId);
    if (override) return override;
  }
  return inferDocumentSensitivity(relativePath);
}

// ---------------------------------------------------------------------------
// Path-heuristic sensitivity (fallback when no override exists)
// ---------------------------------------------------------------------------

/**
 * Infer document sensitivity from its relative path.
 *
 * This is the **fallback** when no per-item override exists in
 * `.envoy/sensitivity.json`. Keywords in the path hint at the intended
 * sensitivity level.
 *
 * Three tiers: `public`, `friends`, `private`.
 */
export function inferDocumentSensitivity(
  relativePath: string,
): KnowledgeAccessLevel {
  const path = relativePath.toLowerCase();
  if (path.includes("personal") || path.includes("private")) return "private";
  if (path.includes("work") || path.includes("professional") || path.includes("office")) {
    return "friends";
  }
  if (path.includes("friends") || path.includes("shared")) return "friends";
  return "public";
}

// ---------------------------------------------------------------------------
// Sensitivity filtering
// ---------------------------------------------------------------------------

/**
 * Filter vault search results to only include documents whose sensitivity
 * does not exceed the access ceiling.
 *
 * @param results        Vault search results to filter
 * @param knowledgeAccess  Maximum sensitivity the caller can access
 * @param maxSensitivity   Optional rule-level ceiling (from AiVaultQuery)
 */
export function filterVaultResultsBySensitivity(
  results: VaultSearchResult[],
  knowledgeAccess: KnowledgeAccessLevel,
  maxSensitivity?: string,
): VaultSearchResult[] {
  const accessIdx = SENSITIVITY_ORDER.indexOf(knowledgeAccess);
  // Normalize legacy sensitivity names from AiVaultQuery.maxSensitivity
  const ruleLevel = maxSensitivity
    ? normalizeLegacySensitivity(maxSensitivity)
    : knowledgeAccess;
  const ruleIdx = SENSITIVITY_ORDER.indexOf(ruleLevel);
  const ceiling = Math.min(accessIdx, ruleIdx);
  return results.filter((result) => {
    const docIdx = SENSITIVITY_ORDER.indexOf(
      inferDocumentSensitivity(result.document.relativePath),
    );
    return docIdx <= ceiling;
  });
}

// ---------------------------------------------------------------------------
// Chat history
// ---------------------------------------------------------------------------

export interface ThreadMessageView {
  messageId: string;
  sender: string;
  text: string;
  timestamp: string;
}

function tokenizeQuery(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])];
}

function scoreText(text: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (lower.includes(term)) score++;
  }
  return score;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function chatLogRowsToViews(rows: ChatLogEnvelope[]): ThreadMessageView[] {
  return rows.map((row) => ({
    messageId: row.messageId,
    sender: row.sender?.displayName ?? row.sender?.ownerId ?? "unknown",
    text: row.content?.text ?? "",
    timestamp: row.metadata?.timestamp ?? new Date().toISOString(),
  }));
}

/** Latest N messages from the thread (chronological). */
export function selectRecentThreadMessages(
  messages: ThreadMessageView[],
  recentLimit: number,
): ThreadMessageView[] {
  const cap = Math.max(1, recentLimit);
  return messages.length > cap ? messages.slice(messages.length - cap) : messages;
}

/**
 * Lexical RAG over older thread messages: score by overlap with `query`, exclude recent window.
 */
export function searchChatHistoryRag(
  messages: ThreadMessageView[],
  query: string,
  options: { recentLimit: number; ragLimit: number; excludeMessageIds?: Set<string> },
): ThreadMessageView[] {
  if (options.ragLimit <= 0 || messages.length <= options.recentLimit) {
    return [];
  }
  const terms = tokenizeQuery(query);
  if (terms.length === 0) {
    return [];
  }
  const recentIds = new Set(
    selectRecentThreadMessages(messages, options.recentLimit).map((m) => m.messageId),
  );
  const pool = messages.filter(
    (m) => !recentIds.has(m.messageId) && !(options.excludeMessageIds?.has(m.messageId)),
  );
  return pool
    .map((m) => ({ message: m, score: scoreText(m.text, terms) }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.message.timestamp).getTime() - new Date(a.message.timestamp).getTime(),
    )
    .slice(0, options.ragLimit)
    .map((row) => row.message);
}

// ---------------------------------------------------------------------------
// Vault knowledge search
// ---------------------------------------------------------------------------

function vaultPathMatches(relativePath: string, vaultPaths: string[]): boolean {
  if (vaultPaths.length === 0) return true;
  const normalized = relativePath.replace(/\\/g, "/");
  return vaultPaths.some((prefix) => {
    const p = prefix.replace(/\\/g, "/").replace(/\/$/, "");
    return normalized === p || normalized.startsWith(`${p}/`);
  });
}

export function searchVaultKnowledgeBase(input: {
  vaultIndex: VaultIndex;
  query: string;
  knowledgeAccess: KnowledgeAccessLevel;
  knowledgeBase?: AiKnowledgeBaseSettings | null;
  /** public = auto-reply / contact-facing; owner = Envoy AI + local self-query */
  knowledgeScope?: AiKnowledgeBaseScope;
  ruleVaultQuery?: AiVaultQuery;
  /** Per-item sensitivity overrides from SensitivityOverrideStore (Phase 44A1). */
  sensitivityOverrides?: Map<string, KnowledgeAccessLevel>;
}): VaultSearchResult[] {
  const kb = resolveAiKnowledgeBaseSettings(input.knowledgeBase);
  const scope = input.knowledgeScope ?? "public";
  const vaultPaths = resolveKnowledgeBaseVaultPaths(kb, scope);
  if (!kb.enabled && !input.ruleVaultQuery) {
    return [];
  }

  const queries: string[] = [];
  if (input.ruleVaultQuery?.path?.trim()) {
    queries.push(input.ruleVaultQuery.path.trim());
  }
  if (kb.enabled && input.query.trim()) {
    queries.push(input.query.trim());
  }
  if (queries.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const merged: VaultSearchResult[] = [];
  for (const q of queries) {
    const batch = searchVault(input.vaultIndex, q, { limit: kb.vaultSnippetLimit * 2 });
    for (const result of batch) {
      const key = `${result.document.documentId}:${result.chunk.index}`;
      if (seen.has(key)) continue;
      if (!vaultPathMatches(result.document.relativePath, vaultPaths)) continue;
      seen.add(key);
      merged.push(result);
    }
  }

  // Phase 44A1: if overrides are provided, use resolveDocumentSensitivityById
  // instead of path-heuristic-only filtering
  const filtered = input.sensitivityOverrides
    ? filterVaultResultsBySensitivityWithOverrides(
        merged,
        input.knowledgeAccess,
        input.ruleVaultQuery?.maxSensitivity,
        input.sensitivityOverrides,
      )
    : filterVaultResultsBySensitivity(
        merged,
        input.knowledgeAccess,
        input.ruleVaultQuery?.maxSensitivity,
      );
  return filtered.slice(0, kb.vaultSnippetLimit);
}

/**
 * Like `filterVaultResultsBySensitivity` but checks per-item overrides
 * from `.envoy/sensitivity.json` before falling back to path heuristic.
 */
function filterVaultResultsBySensitivityWithOverrides(
  results: VaultSearchResult[],
  knowledgeAccess: KnowledgeAccessLevel,
  maxSensitivity: string | undefined,
  overrides: Map<string, KnowledgeAccessLevel>,
): VaultSearchResult[] {
  const accessIdx = SENSITIVITY_ORDER.indexOf(knowledgeAccess);
  const ruleLevel = maxSensitivity
    ? normalizeLegacySensitivity(maxSensitivity)
    : knowledgeAccess;
  const ruleIdx = SENSITIVITY_ORDER.indexOf(ruleLevel);
  const ceiling = Math.min(accessIdx, ruleIdx);
  return results.filter((result) => {
    const sensitivity = resolveDocumentSensitivityById(
      result.document.documentId,
      result.document.relativePath,
      overrides,
    );
    const docIdx = SENSITIVITY_ORDER.indexOf(sensitivity);
    return docIdx <= ceiling;
  });
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatThreadMessagesSection(
  title: string,
  messages: ThreadMessageView[],
  maxTextChars = 300,
): string {
  if (messages.length === 0) return "";
  const lines = messages.map((m) => `[${m.sender}]: ${truncate(m.text, maxTextChars)}`).join("\n");
  return `## ${title}\n${lines}`;
}

export function formatVaultKnowledgeSection(results: VaultSearchResult[], maxSnippetChars = 200): string {
  if (results.length === 0) return "";
  const lines = results.map(
    (r) =>
      `- ${r.document.title} (${r.document.relativePath}): "${truncate(r.chunk.text, maxSnippetChars)}"`,
  );
  return `## Knowledge base\n${lines.join("\n")}`;
}

export async function loadThreadMessages(
  chatLogStore: LocalChatLogStore | null,
  threadOwnerId: string,
  loadLimit = 500,
): Promise<ThreadMessageView[]> {
  if (!chatLogStore) return [];
  const rows = await chatLogStore.listThread(threadOwnerId, loadLimit);
  return chatLogRowsToViews(rows);
}
