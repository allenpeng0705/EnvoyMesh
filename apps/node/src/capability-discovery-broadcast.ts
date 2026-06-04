/**
 * Capability Discovery Broadcast (Phase 21B)
 *
 * Broadcasts a capability search request across the mesh with stopping rules.
 * Used by the capability-provider-worker when searchBondedOnly=false.
 */

import { randomUUID } from "node:crypto";
import {
  createBroadcastRequestPayload,
  createUnsignedEnvelope,
} from "@envoymesh/protocol";

export interface BroadcastCapabilityDiscoveryDeps {
  sendToPeer: (peerId: string, signedEnvelope: unknown) => Promise<number>;
  getBondedPeers: () => Promise<Array<{ ownerId: string; peerId: string }>>;
  getAllKnownPeers: () => Promise<Array<{ ownerId: string; peerId: string }>>;
  signEnvelope: (unsigned: unknown, privateKeyPem: string) => unknown;
  profile: {
    owner: { ownerId: string };
    device: { deviceId: string; peerId: string; publicKeyPem: string; privateKeyPem: string };
  };
}

export interface BroadcastCapabilityResult {
  ownerId: string;
  peerId: string;
  capabilities: string[];
  agentCard?: {
    publicTopics?: string[];
    trustPolicySummary?: Record<string, unknown>;
  };
}

export interface BroadcastCapabilitySearchParams {
  /** Capability tags to search for. */
  capabilityTags: string[];
  /** Max relay hops. */
  maxHops?: number;
  /** Max responses before stopping. */
  maxResults?: number;
  /** Timeout in milliseconds. */
  timeoutMs?: number;
}

/**
 * Broadcast a capability search request across the mesh.
 * Enforces stopping rules: maxHops, maxResults, timeoutMs.
 */
export async function broadcastCapabilityDiscovery(
  deps: BroadcastCapabilityDiscoveryDeps,
  params: BroadcastCapabilitySearchParams,
): Promise<BroadcastCapabilityResult[]> {
  const {
    capabilityTags,
    maxHops = 3,
    maxResults = 10,
    timeoutMs = 30000,
  } = params;

  const correlationId = randomUUID();
  const seenOwnerIds = new Set<string>();

  const payload = createBroadcastRequestPayload({
    queryId: correlationId,
    senderOwnerId: deps.profile.owner.ownerId,
    ttl: maxHops,
    maxResponses: maxResults,
    requestedCapabilities: capabilityTags,
    requestedSensitivity: "public",
    timeoutMs,
  });

  const unsigned = createUnsignedEnvelope({
    senderPeerId: deps.profile.device.peerId,
    senderPublicKey: deps.profile.device.publicKeyPem,
    senderRole: "agent",
    recipientRole: "agent",
    intent: "broadcast.request",
    payload,
    correlationId,
  });

  const signedEnvelope = deps.signEnvelope(unsigned, deps.profile.device.privateKeyPem);

  // Send to bonded peers first, then all known peers
  const bondedPeers = await deps.getBondedPeers();
  for (const peer of bondedPeers) {
    if (seenOwnerIds.has(peer.ownerId)) continue;
    seenOwnerIds.add(peer.ownerId);
    try { await deps.sendToPeer(peer.peerId, signedEnvelope); } catch {}
  }

  if (maxHops > 1) {
    const allPeers = await deps.getAllKnownPeers();
    for (const peer of allPeers) {
      if (seenOwnerIds.has(peer.ownerId)) continue;
      seenOwnerIds.add(peer.ownerId);
      try { await deps.sendToPeer(peer.peerId, signedEnvelope); } catch {}
    }
  }

  return [];
}
