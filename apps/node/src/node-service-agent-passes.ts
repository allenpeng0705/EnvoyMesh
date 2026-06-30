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
import { recordConnectionSuggestion } from "./agent-activity-hooks.js";
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
  /** Emit an event on the class's event bus. */
  emit(event: string, data: unknown): void;
}

/**
 * Connection suggester pass.
 *
 * Mirrors the pre-extraction behaviour: hardcoded `ownerTopics` is
 * always empty, so the pass early-returns `[]`. The downstream body
 * (per-bond match + activity recording) is preserved for when a
 * caller decides to wire real interest topics through the context.
 */
export async function runConnectionSuggesterPassViaRuntime(
  ctx: AgentPassesContext,
): Promise<ConnectionSuggestionRow[]> {
  if (!ctx.hasTaskStore()) return [];

  // Loaded for parity with the pre-extraction code path; not consumed today.
  await ctx.loadConfig();
  const ownerTopics: string[] = [];
  if (ownerTopics.length === 0) return [];

  const bonds = await ctx.getBonds();
  const results: ConnectionSuggestionRow[] = [];

  for (const bond of bonds) {
    const peerTopics: string[] = [];
    const peerCaps: string[] = []; // Capabilities from manifest (wired separately)
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
 * Mesh awareness pass — surfaces insights the awareness worker
 * derives from owner + peer topic overlap. Emits each insight as an
 * `agent:awareness` event so the social UI can react in real time.
 */
export async function runMeshAwarenessPassViaRuntime(
  ctx: AgentPassesContext,
): Promise<MeshAwarenessRow[]> {
  const localOwnerId = ctx.getProfileOwnerId();
  const bonds = await ctx.getBonds();
  const insights = await generateMeshInsights({
    getOwnerInterestTopics: async () => ctx.getContactTopicsFromLibrary(localOwnerId),
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
    for (const insight of insights) {
      ctx.emit("agent:awareness", insight);
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