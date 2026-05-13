/**
 * Context Injector — Phase 9C
 *
 * Gathers conversation, relationship, and profile context for a given peer
 * and returns formatted text to prepend to model prompts. Uses the existing
 * context-manager tool builders from context-manager.ts.
 */

import type { LocalChatLogStore, LocalTrustStore, HumanProfileStore } from "@envoymesh/local-store";
import {
  buildConversationContextTool,
  buildRelationshipContextTool,
  buildProfileContextTool,
  type ConversationContext,
  type RelationshipContext,
  type ProfileContext,
} from "./context-manager.js";

/**
 * Build a context injection string for model prompts.
 *
 * Gathers:
 * - Conversation context: last 5 messages with the sender
 * - Relationship context: bond level, display name, established time
 * - Profile context: owner's display name, bio, interests, knowledge
 *
 * Returns an empty string if no context is available (all stores missing or empty).
 */
export async function buildContextInjection(
  senderOwnerId: string,
  chatLogStore: LocalChatLogStore | null,
  trustStore: LocalTrustStore,
  humanProfileStore: HumanProfileStore,
): Promise<string> {
  const sections: string[] = [];

  // Conversation context — last 5 messages
  const conversationFn = buildConversationContextTool(chatLogStore);
  const convResult = await conversationFn({ ownerId: senderOwnerId, limit: 5 });
  if (isConversationContext(convResult) && convResult.recentMessages.length > 0) {
    const msgs = convResult.recentMessages.map((m) => {
      const text = m.text.length > 300 ? m.text.slice(0, 297) + "..." : m.text;
      return `[${m.sender}]: ${text}`;
    }).join("\n");
    sections.push(`## Recent conversation with ${convResult.contactDisplayName}\n${msgs}`);
  }

  // Relationship context — bond level, display name
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

  // Profile context — owner's own profile
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

  return "\n" + sections.join("\n\n") + "\n";
}

function isConversationContext(r: unknown): r is ConversationContext {
  return typeof r === "object" && r !== null && "recentMessages" in r && Array.isArray((r as any).recentMessages);
}

function isRelationshipContext(r: unknown): r is RelationshipContext {
  return typeof r === "object" && r !== null && "bondLevel" in r;
}

function isProfileContext(r: unknown): r is ProfileContext {
  return typeof r === "object" && r !== null && "displayName" in r && !("error" in r);
}
