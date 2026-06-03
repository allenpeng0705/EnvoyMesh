/**
 * Chat RAG Service (Phase 23D)
 *
 * Provides local retrieval-augmented generation over the owner's chat history.
 * Indexes chat messages by contact and topic, enabling the agent to surface
 * relevant past conversations when the owner asks.
 */

export interface ChatRagEntry {
  messageId: string;
  contactOwnerId: string;
  contactDisplayName?: string;
  text: string;
  timestamp: string;
}

export interface ChatRagDeps {
  /** List all chat messages (across all contacts). */
  listChatMessages: () => Promise<ChatRagEntry[]>;
}

export interface ChatRagSearchResult {
  entry: ChatRagEntry;
  score: number;
}

/**
 * Simple keyword-based search over chat history.
 * For production use, this would be replaced with a vector embedding index.
 */
export function searchChatHistory(
  messages: ChatRagEntry[],
  query: string,
  opts?: { maxResults?: number; minScore?: number },
): ChatRagSearchResult[] {
  const maxResults = opts?.maxResults ?? 5;
  const minScore = opts?.minScore ?? 0.1;

  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (queryWords.length === 0) return [];

  const results: ChatRagSearchResult[] = [];

  for (const msg of messages) {
    const textLower = msg.text.toLowerCase();
    let score = 0;

    for (const word of queryWords) {
      if (textLower.includes(word)) {
        score += 1;
      }
    }

    // Normalize by text length (favor shorter, more focused messages)
    const normalizedScore = textLower.length > 0
      ? score / Math.max(1, Math.log(textLower.length))
      : 0;

    if (normalizedScore > 0) {
      results.push({ entry: msg, score: normalizedScore });
    }
  }

  return results
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

/**
 * Search chat history for messages related to a query,
 * optionally scoped to a specific contact.
 */
export async function queryChatRag(
  deps: ChatRagDeps,
  query: string,
  contactOwnerId?: string,
  opts?: { maxResults?: number },
): Promise<ChatRagSearchResult[]> {
  let messages = await deps.listChatMessages();

  if (contactOwnerId) {
    messages = messages.filter((m) => m.contactOwnerId === contactOwnerId);
  }

  return searchChatHistory(messages, query, opts);
}

/**
 * Format chat RAG results for display.
 */
export function formatChatRagResults(
  results: ChatRagSearchResult[],
): string {
  if (results.length === 0) return "No relevant past conversations found.";

  const lines = results.map((r) => {
    const name = r.entry.contactDisplayName ?? r.entry.contactOwnerId;
    const date = r.entry.timestamp.slice(0, 10);
    const preview = r.entry.text.slice(0, 120);
    return `[${date}] ${name}: "${preview}${r.entry.text.length > 120 ? "..." : ""}"`;
  });

  return `Found ${results.length} relevant conversation${results.length === 1 ? "" : "s"}:\n${lines.join("\n")}`;
}
