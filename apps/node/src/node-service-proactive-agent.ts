/**
 * Proactive agent pass runtime (Phase 27).
 *
 * Extracted from `node-service-impl.ts`. Aggregates insights from
 * three sub-passes — mesh awareness, connection suggester, and
 * dormant-bond check — into a single ordered list. Each sub-pass is
 * isolated by a try/catch so a single failure does not block the
 * rest of the report.
 */
import { findDormantBonds } from "./bond-steward.js";
import type { BondRecord } from "@envoymesh/api";

export interface ProactiveInsight {
  kind: string;
  summary: string;
  matchedTopic: string;
  peerCount: number;
}

/** A single mesh-awareness insight (a subset of the class's return type). */
export interface MeshAwarenessRow {
  kind?: string;
  summary: string;
  matchedTopic: string;
  peerCount: number;
  createdAt?: string;
}

/** A single connection-suggester suggestion (a subset of the class's return type). */
export interface ConnectionSuggestionRow {
  remoteOwnerId: string;
  remoteDisplayName: string;
  reason: string;
  relevanceScore: number;
}

export interface ProactiveAgentContext {
  /** Run the mesh-awareness pass and return its insights. */
  runMeshAwareness(): Promise<MeshAwarenessRow[]>;
  /** Run the connection-suggester pass and return its suggestions. */
  runConnectionSuggester(): Promise<ConnectionSuggestionRow[]>;
  /** Load all bonds (used by the dormant-bond check). */
  getBonds(): Promise<BondRecord[]>;
  /** Load the dormant-bond threshold in days (resolved by the caller). */
  getDormantThresholdDays(): Promise<number>;
}

export async function runProactiveAgentPassViaRuntime(
  ctx: ProactiveAgentContext,
): Promise<ProactiveInsight[]> {
  const insights: ProactiveInsight[] = [];

  // Mesh awareness — surface any insights the awareness pass produced.
  try {
    const awareness = await ctx.runMeshAwareness();
    for (const insight of awareness) {
      insights.push({
        kind: "mesh_activity",
        summary: insight.summary,
        matchedTopic: insight.matchedTopic,
        peerCount: insight.peerCount,
      });
    }
  } catch {
    /* mesh awareness optional */
  }

  // Connection suggestions — one insight per suggested contact.
  try {
    const suggestions = await ctx.runConnectionSuggester();
    for (const s of suggestions) {
      insights.push({
        kind: "connection_suggested",
        summary: `Suggested connection: ${s.remoteDisplayName} — ${s.reason}`,
        matchedTopic: s.reason,
        peerCount: 1,
      });
    }
  } catch {
    /* connection suggestions optional */
  }

  // Dormant bonds — one insight per scan if any dormant bonds exist.
  try {
    const threshold = await ctx.getDormantThresholdDays();
    const bonds = await ctx.getBonds();
    const dormantResult = await findDormantBonds(
      {
        getBonds: async () => bonds,
        // The steward expects a way to read last-interaction timestamps;
        // for the proactive pass we treat that as "not implemented" and
        // let the steward surface whatever it can without it. This
        // matches the pre-extraction behaviour.
        getLastInteractionAt: async () => {
          throw new Error("not implemented");
        },
      },
      threshold,
    );
    if (dormantResult.dormantBonds.length > 0) {
      insights.push({
        kind: "dormant_bonds",
        summary: dormantResult.summary,
        matchedTopic: "social_graph_health",
        peerCount: dormantResult.dormantBonds.length,
      });
    }
  } catch {
    /* dormant bond check optional */
  }

  return insights;
}