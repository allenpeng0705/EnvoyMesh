/**
 * Context Manager for AI Agent
 *
 * Provides tools for the agent to gather context from various sources:
 * - conversation-context: recent chat history with a contact
 * - relationship-context: trust/bond level and relationship info
 * - profile-context: owner's human profile (interests, bio, knowledge)
 * - vault-context: relevant documents from vault search
 * - graph-context: knowledge graph relationships (stubbed)
 *
 * Context is injected into model prompts to enable informed responses.
 */

import type { LocalTrustStore, LocalPeerDirectoryStore, LocalChatLogStore, HumanProfileStore } from "@envoymesh/local-store";
import type { VaultIndex } from "@envoymesh/vault";
import { searchVault } from "@envoymesh/vault";
import type { HumanProfilePayload } from "@envoymesh/protocol";
import type { ToolImplementation } from "@envoymesh/models";

/**
 * Context for a chat conversation with a specific contact.
 */
export interface ConversationContext {
  contactOwnerId: string;
  contactDisplayName: string;
  recentMessages: Array<{
    sender: string;
    text: string;
    timestamp: string;
  }>;
  messageCount: number;
}

/**
 * Context about a relationship with a peer.
 */
export interface RelationshipContext {
  ownerId: string;
  displayName: string;
  bondLevel: "self" | "direct" | "referred" | "public" | "blocked";
  establishedAt?: string;
  updatedAt?: string;
  note?: string;
}

/**
 * Context about the owner's profile.
 */
export interface ProfileContext {
  ownerId: string;
  displayName: string;
  username?: string;
  bio?: string;
  gender?: string;
  hobbies: string[];
  knowledge: string[];
  profileVisibility: "public" | "private";
}

/**
 * Context from vault search results.
 */
export interface VaultContext {
  query: string;
  results: Array<{
    title: string;
    snippet: string;
    path: string;
    score: number;
  }>;
  resultCount: number;
}

/**
 * Context from knowledge graph (stubbed for now).
 */
export interface GraphContext {
  message: string;
  note: string;
}

/**
 * Build the conversation-context tool.
 * Reads recent chat history with a given contact.
 */
export function buildConversationContextTool(
  chatLogStore: LocalChatLogStore | null,
): ToolImplementation {
  return async (params) => {
    const ownerId = typeof params.ownerId === "string" ? params.ownerId : undefined;
    if (!ownerId) {
      return { error: "ownerId parameter is required" };
    }

    if (!chatLogStore) {
      return { error: "chat log store not available" };
    }

    const limit = typeof params.limit === "number" ? Math.min(params.limit, 50) : 10;
    const messages = await chatLogStore.listThread(ownerId, limit);

    const recentMessages = messages.slice(-limit).map((msg: any) => ({
      sender: msg.sender?.displayName ?? msg.sender?.ownerId ?? "unknown",
      text: msg.content?.text ?? "",
      timestamp: msg.metadata?.timestamp ?? msg.createdAt ?? new Date().toISOString(),
    }));

    return {
      contactOwnerId: ownerId,
      recentMessages,
      messageCount: messages.length,
    } as ConversationContext;
  };
}

/**
 * Build the relationship-context tool.
 * Reads trust store to understand owner's relationship with a peer.
 */
export function buildRelationshipContextTool(
  trustStore: LocalTrustStore,
): ToolImplementation {
  return async (params) => {
    const ownerId = typeof params.ownerId === "string" ? params.ownerId : undefined;
    if (!ownerId) {
      return { error: "ownerId parameter is required" };
    }

    const trustRecord = await trustStore.getTrustRecord(ownerId);

    if (!trustRecord) {
      return {
        ownerId,
        bondLevel: "public",
        note: "No relationship established",
      };
    }

    return {
      ownerId: trustRecord.peerOwnerId,
      displayName: trustRecord.displayName ?? trustRecord.peerOwnerId,
      bondLevel: trustRecord.level,
      establishedAt: trustRecord.createdAt,
      updatedAt: trustRecord.updatedAt,
      note: trustRecord.note,
    } as RelationshipContext;
  };
}

/**
 * Build the profile-context tool.
 * Reads owner's human profile.
 */
export function buildProfileContextTool(
  humanProfileStore: HumanProfileStore,
): ToolImplementation {
  return async () => {
    const profile = await humanProfileStore.loadHumanProfile();

    if (!profile) {
      return { error: "Human profile not found" };
    }

    return {
      ownerId: profile.ownerId,
      displayName: profile.displayName,
      username: profile.username,
      bio: profile.bio,
      gender: profile.gender,
      hobbies: profile.hobbies ?? [],
      knowledge: profile.knowledge ?? [],
      profileVisibility: profile.profileVisibility,
    } as ProfileContext;
  };
}

/**
 * Build the vault-context tool.
 * Searches vault for relevant documents.
 */
export function buildVaultContextTool(
  vaultIndex: VaultIndex | null,
): ToolImplementation {
  return async (params) => {
    if (!vaultIndex) {
      return { error: "vault index not available" };
    }

    const query = typeof params.query === "string" ? params.query : undefined;
    if (!query) {
      return { error: "query parameter is required" };
    }

    const limit = typeof params.limit === "number" ? Math.min(params.limit, 20) : 10;
    const results = searchVault(vaultIndex, query, { limit });

    const mapped = results.map((r) => ({
      title: r.document?.title ?? r.chunk.relativePath,
      snippet: r.chunk.text.slice(0, 200),
      path: r.chunk.relativePath,
      score: r.score,
    }));

    return {
      query,
      results: mapped,
      resultCount: results.length,
    } as VaultContext;
  };
}

/**
 * Build the graph-context tool (stubbed).
 * Queries knowledge graph for relationship paths.
 */
export function buildGraphContextTool(): ToolImplementation {
  return async (params) => {
    const query = typeof params.query === "string" ? params.query : "unknown";

    // Graph context is stubbed - future implementation will query a knowledge graph
    return {
      message: `Graph query "${query}" is not yet implemented`,
      note: "Knowledge graph relationships will be available in a future release",
    } as GraphContext;
  };
}

/**
 * Context manager that aggregates all context tools.
 */
export interface ContextManagerDeps {
  chatLogStore: LocalChatLogStore | null;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  humanProfileStore: HumanProfileStore;
  vaultIndex: VaultIndex | null;
}

export interface ContextToolDescriptor {
  name: string;
  description: string;
  parameters: Array<{ name: string; type: string; description: string; required: boolean }>;
}

/**
 * Returns descriptors for all context tools.
 */
export function listContextTools(): ContextToolDescriptor[] {
  return [
    {
      name: "conversation-context",
      description: "Read recent chat history with a specific contact",
      parameters: [
        { name: "ownerId", type: "string", description: "The owner's ID of the contact", required: true },
        { name: "limit", type: "number", description: "Maximum number of messages to return (default: 10, max: 50)", required: false },
      ],
    },
    {
      name: "relationship-context",
      description: "Read the trust/bond level and relationship info with a peer",
      parameters: [
        { name: "ownerId", type: "string", description: "The owner's ID of the peer", required: true },
      ],
    },
    {
      name: "profile-context",
      description: "Read the owner's human profile (interests, bio, knowledge)",
      parameters: [],
    },
    {
      name: "vault-context",
      description: "Search vault for relevant documents",
      parameters: [
        { name: "query", type: "string", description: "Search query", required: true },
        { name: "limit", type: "number", description: "Maximum results to return (default: 10, max: 20)", required: false },
      ],
    },
    {
      name: "graph-context",
      description: "Query knowledge graph for relationship paths (stubbed)",
      parameters: [
        { name: "query", type: "string", description: "Graph query", required: true },
      ],
    },
  ];
}
