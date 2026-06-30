/**
 * Discovery clusterer runtime (Phase 23A+).
 *
 * Extracted from `node-service-impl.ts` to make the discovery-and-cluster
 * workflow independently testable. The class method now delegates to
 * `discoverAndClusterViaRuntime` with a typed context.
 */
import { signUnsignedEnvelope } from "@envoymesh/identity";
import type { BondRecord, NodeProfile } from "@envoymesh/api";
import { broadcastDocumentDiscovery } from "./document-discovery-broadcast.js";
import { broadcastCapabilityDiscovery } from "./capability-discovery-broadcast.js";
import {
  formatDiscoverySuggestions,
  generateDiscoveryClusters,
  type DiscoveryClustererDeps,
} from "./discovery-clusterer.js";

export interface DiscoveryClustererContext {
  /** Local node profile (owner + device). */
  profile: NodeProfile;
  /** All bonds the local owner currently holds. */
  bonds: BondRecord[];
}

const DEFAULT_MAX_HOPS = 2;
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_TIMEOUT_MS = 15_000;

const EMPTY_SUGGESTION =
  "No seed topics or capabilities provided. Tell me what you're interested in discovering.";

/**
 * Build the `DiscoveryClustererDeps` expected by the inner clusterer
 * module, by adapting the higher-level context. Bonded peers are flattened
 * and the local profile is reshaped into the broadcast module's shape.
 */
function buildClustererDeps(ctx: DiscoveryClustererContext): DiscoveryClustererDeps {
  const bondedPeers = ctx.bonds.map((b) => ({
    ownerId: b.peerOwnerId,
    peerId: b.peerOwnerId,
  }));
  const bondedIds = new Set(ctx.bonds.map((b) => b.peerOwnerId));
  const profile = ctx.profile;
  const signEnvelope = signUnsignedEnvelope as unknown as (
    unsigned: unknown,
    privateKeyPem: string,
  ) => unknown;

  const broadcastProfile = {
    owner: { ownerId: profile.owner.ownerId },
    device: {
      deviceId: profile.device.deviceId,
      peerId:
        (profile.device as unknown as { peerId?: string }).peerId ??
        profile.device.deviceId,
      publicKeyPem: profile.device.publicKeyPem,
      privateKeyPem: profile.device.privateKeyPem,
    },
  };

  return {
    broadcastDocumentDiscovery: async (query: string, _maxHops?: number) => {
      const results = await broadcastDocumentDiscovery(
        {
          // Stub — the clusterer only inspects return shape; real mesh
          // delivery happens at a higher layer. Returning `0` mirrors the
          // pre-extraction behaviour.
          sendToPeer: async () => 0,
          getBondedPeers: async () => bondedPeers,
          getAllKnownPeers: async () => bondedPeers,
          signEnvelope,
          profile: broadcastProfile,
        },
        {
          query,
          maxHops: _maxHops ?? DEFAULT_MAX_HOPS,
          maxResults: DEFAULT_MAX_RESULTS,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        },
      );
      return results.map((r: { ownerId: string; metadata?: { title?: string; topics?: string[] } }) => ({
        ownerId: r.ownerId,
        displayName: r.metadata?.title,
        topics: r.metadata?.topics ?? [],
        capabilities: [],
        isBonded: bondedIds.has(r.ownerId),
      }));
    },
    broadcastCapabilityDiscovery: async (caps: string[], _maxHops?: number) => {
      const results = await broadcastCapabilityDiscovery(
        {
          sendToPeer: async () => 0,
          getBondedPeers: async () => bondedPeers,
          getAllKnownPeers: async () => bondedPeers,
          signEnvelope,
          profile: broadcastProfile,
        },
        {
          capabilityTags: caps,
          maxHops: _maxHops ?? DEFAULT_MAX_HOPS,
          maxResults: DEFAULT_MAX_RESULTS,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        },
      );
      return results.map((r: { ownerId: string }) => ({
        ownerId: r.ownerId,
        topics: [],
        capabilities: caps,
        isBonded: bondedIds.has(r.ownerId),
      }));
    },
    getBondedOwnerIds: async () => bondedIds,
  };
}

/**
 * Run a discovery-and-cluster pass.
 *
 * Returns a human-readable suggestion string. If neither seed topics nor
 * seed capabilities are supplied, returns a guidance message without
 * hitting the network.
 */
export async function discoverAndClusterViaRuntime(
  ctx: DiscoveryClustererContext,
  params: { seedTopics?: string[]; seedCapabilities?: string[] },
): Promise<string> {
  const ownerTopics: string[] = params.seedTopics ?? [];
  if (ownerTopics.length === 0 && !(params.seedCapabilities?.length)) {
    return EMPTY_SUGGESTION;
  }
  const deps = buildClustererDeps(ctx);
  const clusters = await generateDiscoveryClusters(deps, {
    seedTopics: ownerTopics,
    seedCapabilities: params.seedCapabilities ?? [],
  });
  return formatDiscoverySuggestions(clusters);
}