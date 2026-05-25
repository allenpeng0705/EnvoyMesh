/**
 * Context Injector — Phase 9C
 *
 * Gathers conversation, relationship, and profile context for a given peer
 * and returns formatted text to prepend to model prompts.
 */

import type { AiKnowledgeBaseSettings } from "@envoymesh/api";
import { resolveAiKnowledgeBaseSettings } from "@envoymesh/api";
import type { LocalChatLogStore, LocalTrustStore, HumanProfileStore } from "@envoymesh/local-store";
import {
  formatThreadMessagesSection,
  loadThreadMessages,
  searchChatHistoryRag,
  selectRecentThreadMessages,
} from "./ai-context.js";
import type { RagService } from "./rag-service.js";
import {
  buildRelationshipContextTool,
  buildProfileContextTool,
  type RelationshipContext,
  type ProfileContext,
} from "./context-manager.js";

export interface BuildContextInjectionOptions {
  knowledgeBase?: AiKnowledgeBaseSettings | null;
  /** Query for retrieving additional relevant messages from older thread history. */
  ragQuery?: string;
  ragService?: RagService | null;
}

/**
 * Build a context injection string for model prompts.
 *
 * Gathers:
 * - Recent conversation (default 20 messages)
 * - RAG-retrieved older messages (default 5, query-matched)
 * - Relationship context: bond level, display name, established time
 * - Profile context: owner's display name, bio, interests, knowledge tags
 */
export async function buildContextInjection(
  senderOwnerId: string,
  chatLogStore: LocalChatLogStore | null,
  trustStore: LocalTrustStore,
  humanProfileStore: HumanProfileStore,
  options?: BuildContextInjectionOptions,
): Promise<string> {
  const kb = resolveAiKnowledgeBaseSettings(options?.knowledgeBase);
  const sections: string[] = [];

  if (chatLogStore) {
    const thread = await loadThreadMessages(chatLogStore, senderOwnerId);
    const recent = selectRecentThreadMessages(thread, kb.recentMessageLimit);
    const contactName =
      (await trustStore.getTrustRecord(senderOwnerId))?.displayName ?? senderOwnerId;
    const recentSection = formatThreadMessagesSection(
      `Recent conversation with ${contactName} (latest ${recent.length})`,
      recent,
    );
    if (recentSection) sections.push(recentSection);

    const ragQuery = options?.ragQuery?.trim() ?? "";
    if (ragQuery && kb.ragMessageLimit > 0) {
      const ragHits = options?.ragService
        ? await options.ragService.searchChatHistoryRag({
            threadOwnerId: senderOwnerId,
            query: ragQuery,
            messages: thread,
            knowledgeBase: options.knowledgeBase,
            recentLimit: kb.recentMessageLimit,
            ragLimit: kb.ragMessageLimit,
          })
        : searchChatHistoryRag(thread, ragQuery, {
            recentLimit: kb.recentMessageLimit,
            ragLimit: kb.ragMessageLimit,
          });
      const ragSection = formatThreadMessagesSection(
        "Related earlier messages (retrieved from history)",
        ragHits,
      );
      if (ragSection) sections.push(ragSection);
    }
  }

  const relFn = buildRelationshipContextTool(trustStore);
  const relResult = await relFn({ ownerId: senderOwnerId });
  if (isRelationshipContext(relResult)) {
    const parts: string[] = [
      `- Contact: ${relResult.displayName ?? senderOwnerId}`,
      `- Bond level: ${relResult.bondLevel}`,
    ];
    if (relResult.establishedAt) {
      parts.push(`- Connected since: ${new Date(relResult.establishedAt).toLocaleDateString()}`);
    }
    if (relResult.note) {
      parts.push(`- Note: ${relResult.note}`);
    }
    sections.push(`## Relationship\n${parts.join("\n")}`);
  }

  const profileFn = buildProfileContextTool(humanProfileStore);
  const profileResult = await profileFn({});
  if (isProfileContext(profileResult)) {
    const parts: string[] = [];
    if (profileResult.displayName && profileResult.displayName !== "Unknown") {
      parts.push(`- You are: ${profileResult.displayName}`);
    }
    if (profileResult.bio) {
      const bio = profileResult.bio.length > 200 ? profileResult.bio.slice(0, 197) + "..." : profileResult.bio;
      parts.push(`- Your bio: ${bio}`);
    }
    if (profileResult.hobbies && profileResult.hobbies.length > 0) {
      parts.push(`- Your interests: ${profileResult.hobbies.join(", ")}`);
    }
    if (profileResult.knowledge && profileResult.knowledge.length > 0) {
      parts.push(`- Your knowledge areas: ${profileResult.knowledge.join(", ")}`);
    }
    if (parts.length > 0) {
      sections.push(`## Your Profile\n${parts.join("\n")}`);
    }
  }

  if (sections.length === 0) return "";

  return `\n${sections.join("\n\n")}\n`;
}

function isRelationshipContext(r: unknown): r is RelationshipContext {
  return typeof r === "object" && r !== null && "bondLevel" in r;
}

function isProfileContext(r: unknown): r is ProfileContext {
  return typeof r === "object" && r !== null && "displayName" in r && !("error" in r);
}
