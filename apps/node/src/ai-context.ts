/**
 * AI prompt context: chat history windows, chat RAG, and vault knowledge base.
 */

import type { AiKnowledgeBaseScope, AiKnowledgeBaseSettings, AiVaultQuery } from "@envoymesh/api";
import { resolveAiKnowledgeBaseSettings, resolveKnowledgeBaseVaultPaths } from "@envoymesh/api";
import type { ChatLogEnvelope, LocalChatLogStore } from "@envoymesh/local-store";
import { searchVault, type VaultIndex, type VaultSearchResult } from "@envoymesh/vault";

export type KnowledgeAccessLevel = "public" | "professional" | "personal";

export interface ThreadMessageView {
  messageId: string;
  sender: string;
  text: string;
  timestamp: string;
}

const SENSITIVITY_ORDER = ["public", "friends", "professional", "personal"] as const;

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

export function inferDocumentSensitivity(
  relativePath: string,
): "public" | "friends" | "professional" | "personal" {
  const path = relativePath.toLowerCase();
  if (path.includes("personal") || path.includes("private")) return "personal";
  if (path.includes("work") || path.includes("professional") || path.includes("office")) {
    return "professional";
  }
  if (path.includes("friends") || path.includes("shared")) return "friends";
  return "public";
}

export function filterVaultResultsBySensitivity(
  results: VaultSearchResult[],
  knowledgeAccess: KnowledgeAccessLevel,
  maxSensitivity?: AiVaultQuery["maxSensitivity"],
): VaultSearchResult[] {
  const userIdx = SENSITIVITY_ORDER.indexOf(knowledgeAccess);
  const ruleIdx = maxSensitivity ? SENSITIVITY_ORDER.indexOf(maxSensitivity) : userIdx;
  const ceiling = Math.min(userIdx, ruleIdx);
  return results.filter((result) => {
    const docIdx = SENSITIVITY_ORDER.indexOf(inferDocumentSensitivity(result.document.relativePath));
    return docIdx <= ceiling;
  });
}

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

  const filtered = filterVaultResultsBySensitivity(
    merged,
    input.knowledgeAccess,
    input.ruleVaultQuery?.maxSensitivity,
  );
  return filtered.slice(0, kb.vaultSnippetLimit);
}

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
