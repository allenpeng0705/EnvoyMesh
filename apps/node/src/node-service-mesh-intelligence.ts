/**
 * Mesh Intelligence Report runtime (Phase 28).
 *
 * Extracted from `node-service-impl.ts`. Generates a markdown narrative
 * about the local owner's mesh state by orchestrating several subsystem
 * scans (bonded peers, unbonded discovery, dormant bonds, etc.) and
 * asking the configured LLM to write a coherent report.
 *
 * The runtime takes a small `MeshIntelligenceContext` so it can be
 * exercised in isolation: tests inject a mock `getBonds` /
 * `generateNarrative` and never touch the live NodeServiceImpl.
 */
import { findDormantBonds } from "./bond-steward.js";
import { generateDiscoveryClusters } from "./discovery-clusterer.js";
import {
  generateMeshIntelligenceReport,
  type MeshDiscoveryPeer,
  type MeshIntelligenceDeps,
  type MeshIntelligenceReport,
  type MeshIntelligenceSection,
} from "./mesh-intelligence.js";
import type { BondRecord } from "@envoymesh/api";

export interface MeshIntelligenceContext {
  /** Load all bonds the local owner currently holds. */
  getBonds(): Promise<BondRecord[]>;
  /**
   * Raw narrative generator — may throw if the model is unavailable.
   * The runtime wraps this in a try/catch and falls back to a static
   * placeholder so the report is always renderable.
   */
  generateNarrative(prompt: string): Promise<string>;
}

const DISCOVERY_MIN_CLUSTER = 2;
const DISCOVERY_MAX_CLUSTERS = 3;
const DISCOVERY_MAX_HOPS = 1;

const NARRATIVE_FALLBACK = "Unable to generate narrative — model not available.";

async function scanBondedPeersImpl(
  getBonds: () => Promise<BondRecord[]>,
): Promise<MeshDiscoveryPeer[]> {
  const bonds = await getBonds();
  return bonds.map((b) => ({
    ownerId: b.peerOwnerId,
    displayName: b.displayName ?? b.peerOwnerId,
    topics: [] as string[],
    capabilities: [],
    bondLevel: b.level,
  }));
}

async function scanDiscoveryImpl(
  topics: string[],
  caps: string[],
  getBonds: () => Promise<BondRecord[]>,
): Promise<MeshDiscoveryPeer[]> {
  try {
    const bonds = await getBonds();
    const clusters = await generateDiscoveryClusters(
      {
        // The clusterer expects real mesh-backed broadcast hooks; for the
        // intelligence report we only need the clusterer to do its
        // bookkeeping, so stub the broadcasts. Returning [] mirrors the
        // pre-extraction behaviour.
        broadcastDocumentDiscovery: async () => [],
        broadcastCapabilityDiscovery: async () => [],
        getBondedOwnerIds: async () => new Set(bonds.map((b) => b.peerOwnerId)),
      },
      {
        seedTopics: topics,
        seedCapabilities: caps,
        minClusterSize: DISCOVERY_MIN_CLUSTER,
        maxClusters: DISCOVERY_MAX_CLUSTERS,
        maxHops: DISCOVERY_MAX_HOPS,
      },
    );
    const peers: MeshDiscoveryPeer[] = [];
    for (const cluster of clusters) {
      for (const peer of cluster.peers) {
        peers.push({
          ownerId: peer.ownerId,
          displayName: peer.displayName,
          topics: peer.topics,
          capabilities: peer.capabilities,
          bondLevel: "public",
        });
      }
    }
    return peers;
  } catch {
    return [];
  }
}

async function findDormantBondsImpl(
  thresholdDays: number,
  getBonds: () => Promise<BondRecord[]>,
): Promise<MeshDiscoveryPeer[]> {
  const bonds = await getBonds();
  const result = await findDormantBonds(
    {
      getBonds: async () => bonds,
      // The steward expects a way to read last-interaction timestamps;
      // for the intelligence report we treat that as "not implemented"
      // and let the steward surface whatever it can without it. This
      // matches the pre-extraction behaviour.
      getLastInteractionAt: async () => {
        throw new Error("not implemented");
      },
    },
    thresholdDays,
  );
  return result.dormantBonds.map((b) => ({
    ownerId: b.peerOwnerId,
    displayName: b.displayName,
    topics: [],
    capabilities: [],
  }));
}

function buildDeps(ctx: MeshIntelligenceContext): MeshIntelligenceDeps {
  return {
    scanBondedPeers: () => scanBondedPeersImpl(ctx.getBonds),
    scanDiscovery: (topics, caps) => scanDiscoveryImpl(topics, caps, ctx.getBonds),
    getReputationScores: async () => new Map(),
    findDormantBonds: (thresholdDays: number) =>
      findDormantBondsImpl(thresholdDays, ctx.getBonds),
    findSecondDegreeConnections: async () => [],
    generateNarrative: async (prompt: string) => {
      try {
        return await ctx.generateNarrative(prompt);
      } catch {
        return NARRATIVE_FALLBACK;
      }
    },
  };
}

/**
 * Run the mesh intelligence report. Returns the structured
 * `MeshIntelligenceReport`; callers can render it themselves (the
 * class method renders it as markdown).
 */
export async function meshIntelligenceReportViaRuntime(
  ctx: MeshIntelligenceContext,
  opts: { ownerTopics?: string[]; ownerCapabilities?: string[] } = {},
): Promise<MeshIntelligenceReport> {
  return generateMeshIntelligenceReport(buildDeps(ctx), {
    ownerTopics: opts.ownerTopics ?? [],
    ownerCapabilities: opts.ownerCapabilities ?? [],
  });
}

/**
 * Render a `MeshIntelligenceReport` as a single markdown string.
 * Kept alongside the runtime so the formatting lives with the feature.
 */
export function formatMeshIntelligenceReport(report: MeshIntelligenceReport): string {
  return [
    `## ${report.title}`,
    `Generated: ${report.generatedAt}`,
    `Analyzed: ${report.peersAnalyzed} peers`,
    "",
    ...report.sections.map((s: MeshIntelligenceSection) => `### ${s.heading}\n${s.content}`),
  ].join("\n");
}