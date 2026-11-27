/**
 * Agent passes runtime (Phases 23B / 25A / 23D).
 *
 * Extracted from `node-service-impl.ts`. Groups the three small
 * "periodic awareness" passes into a single module so the class
 * surface stays thin and the fan-out patterns are easy to compare
 * and extend.
 *
 * Each pass is a self-contained runtime function with its own tiny
 * context dependency, sharing the bigger `AgentPassesContext` bag
 * defined below.
 */
import { recordConnectionSuggestion, recordMeshAwarenessInsight } from "./agent-activity-hooks.js";
import type { LocalAgentActivityStore } from "@envoymesh/local-store";
import { matchPeerInterests } from "./connection-suggester.js";
import { generateMeshInsights } from "./mesh-awareness-worker.js";
import type { BondRecord } from "@envoymesh/api";

/** Result row for `runConnectionSuggesterPassViaRuntime`. */
export interface ConnectionSuggestionRow {
  remoteOwnerId: string;
  remoteDisplayName: string;
  reason: string;
  relevanceScore: number;
}

/** Result row for `runMeshAwarenessPassViaRuntime`. */
export interface MeshAwarenessRow {
  kind: string;
  summary: string;
  matchedTopic: string;
  peerCount: number;
  createdAt: string;
}

/** Result row for `chatRagSearchViaRuntime` (currently a stub). */
export interface ChatRagRow {
  messageId: string;
  contactName: string;
  snippet: string;
  timestamp: string;
}

export interface AgentPassesContext {
  /** Load all bonds. */
  getBonds(): Promise<BondRecord[]>;
  /** Resolve the local owner ID (or "local-owner" if profile not initialised). */
  getProfileOwnerId(): string;
  /** Whether the local task store is initialised. */
  hasTaskStore(): boolean;
  /** Load the node config (preserved for parity; current passes do not consume it). */
  loadConfig(): Promise<unknown>;
  /** Optional agent-activity recorder. */
  getAgentActivityStore(): LocalAgentActivityStore | null;
  /** Read a contact's published topics (used by mesh awareness). */
  getContactTopicsFromLibrary(ownerId: string): Promise<string[]>;
  /** Phase 69C — profile hobbies/knowledge + local library topics. */
  getOwnerInterestTopics(): Promise<string[]>;
  /** Emit an event on the class's event bus. */
  emit(event: string, data: unknown): void;
}

/**
 * Connection suggester pass — match owner interests to bonded peers' library topics.
 */
export async function runConnectionSuggesterPassViaRuntime(
  ctx: AgentPassesContext,
): Promise<ConnectionSuggestionRow[]> {
  if (!ctx.hasTaskStore()) return [];

  await ctx.loadConfig();
  const ownerTopics = await ctx.getOwnerInterestTopics();
  if (ownerTopics.length === 0) return [];

  const bonds = await ctx.getBonds();
  const results: ConnectionSuggestionRow[] = [];

  for (const bond of bonds) {
    const peerTopics = await ctx.getContactTopicsFromLibrary(bond.peerOwnerId);
    const peerCaps: string[] = [];
    const match = matchPeerInterests(ownerTopics, peerTopics, peerCaps);

    if (match.score > 0) {
      const suggestion: ConnectionSuggestionRow = {
        remoteOwnerId: bond.peerOwnerId,
        remoteDisplayName: bond.displayName ?? bond.peerOwnerId,
        reason: `Matching interests: ${match.matchedTopics.join(", ")}`,
        relevanceScore: match.score,
      };
      results.push(suggestion);

      const activityStore = ctx.getAgentActivityStore();
      if (activityStore) {
        await recordConnectionSuggestion(
          activityStore,
          suggestion,
          ctx.getProfileOwnerId(),
          (record) => ctx.emit("agent:activity", record),
        );
      }
    }
  }

  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Mesh awareness pass — topic overlap insights → Activity (+ legacy awareness event).
 */
export async function runMeshAwarenessPassViaRuntime(
  ctx: AgentPassesContext,
): Promise<MeshAwarenessRow[]> {
  const bonds = await ctx.getBonds();
  const insights = await generateMeshInsights({
    getOwnerInterestTopics: () => ctx.getOwnerInterestTopics(),
    getBondedPeerTopics: async () => {
      const out: Array<{ ownerId: string; topics: string[] }> = [];
      for (const b of bonds) {
        const topics = await ctx.getContactTopicsFromLibrary(b.peerOwnerId);
        if (topics.length > 0) out.push({ ownerId: b.peerOwnerId, topics });
      }
      return out;
    },
  });
  if (insights.length > 0) {
    const activityStore = ctx.getAgentActivityStore();
    for (const insight of insights) {
      ctx.emit("agent:awareness", insight);
      if (activityStore) {
        await recordMeshAwarenessInsight(
          activityStore,
          insight,
          ctx.getProfileOwnerId(),
          (record) => ctx.emit("agent:activity", record),
        );
      }
    }
  }
  return insights;
}

/**
 * Chat RAG search — currently a stub.
 *
 * The pre-extraction method imports the `chat-rag-service` module
 * but never wires its `getMessages` dep, so the result is always
 * `[]`. We preserve that behaviour: a future caller can wire a real
 * chat log store through a future `getMessages` field on
 * `AgentPassesContext`.
 */
export async function chatRagSearchViaRuntime(
  _ctx: AgentPassesContext,
  _query: string,
  _opts?: { ownerId?: string; maxResults?: number },
): Promise<ChatRagRow[]> {
  return [];
}