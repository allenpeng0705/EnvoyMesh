/**
 * Phase 40F — Production wiring helpers for the agent-network chain layer.
 *
 * Resolves logical envelope peer ids (agent peer ids, device peer ids) to
 * libp2p transport peer ids for `mesh.send`, and extracts chain ids from
 * inbound envelopes for runtime lookup.
 */

import { derivePeerId } from "@envoymesh/identity";
import type { LocalPeerDirectoryStore } from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import type { EnvoyEnvelope } from "@envoymesh/protocol";

export interface ChainTransportResolver {
  mesh: EnvoyMesh;
  peerDirectoryStore: LocalPeerDirectoryStore;
  /** Local device public key PEM — used for self-send. */
  localDevicePublicKeyPem?: string;
  /** Local agent peer id — used for self-send. */
  localAgentPeerId?: string;
  /** Cached agent cards: sourceAgentPeerId → ownerId. */
  agentPeerToOwner?: Map<string, string>;
}

/**
 * Resolve a logical envelope recipient peer id to the libp2p transport peer
 * id used by `mesh.send`.
 */
export async function resolveChainTransportPeerId(
  resolver: ChainTransportResolver,
  recipientPeerId: string,
): Promise<string | null> {
  const localDevicePeerId = resolver.localDevicePublicKeyPem
    ? derivePeerId(resolver.localDevicePublicKeyPem)
    : undefined;
  if (
    recipientPeerId === resolver.localAgentPeerId ||
    recipientPeerId === localDevicePeerId ||
    recipientPeerId === resolver.mesh.peerId
  ) {
    return resolver.mesh.peerId;
  }

  const ownerFromAgent = resolver.agentPeerToOwner?.get(recipientPeerId);
  if (ownerFromAgent) {
    return resolveTransportForOwner(resolver, ownerFromAgent);
  }

  const records = await resolver.peerDirectoryStore.listPeerRecords();
  for (const rec of records) {
    if (rec.devicePublicKeyPem && derivePeerId(rec.devicePublicKeyPem) === recipientPeerId) {
      return rec.peerId;
    }
  }

  const byPeerId = records.find((r) => r.peerId === recipientPeerId);
  if (byPeerId) return byPeerId.peerId;

  // Last resort: the envelope peer id may already be a libp2p peer id.
  if (recipientPeerId.startsWith("12D3")) {
    return recipientPeerId;
  }

  return null;
}

async function resolveTransportForOwner(
  resolver: ChainTransportResolver,
  ownerId: string,
): Promise<string | null> {
  const record = await resolver.peerDirectoryStore.getPeerByOwnerId(ownerId);
  if (record?.peerId) return record.peerId;
  const records = await resolver.peerDirectoryStore.listPeerRecords();
  return records.find((r) => r.ownerId === ownerId)?.peerId ?? null;
}

/** Extract the chain id from a chain envelope payload or correlation id. */
export function extractChainIdFromEnvelope(envelope: EnvoyEnvelope): string | undefined {
  const payload = envelope.payload;
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (typeof p.chainId === "string" && p.chainId.length > 0) return p.chainId;
    if (p.chainMandate && typeof p.chainMandate === "object") {
      const mandate = p.chainMandate as Record<string, unknown>;
      if (typeof mandate.chainId === "string" && mandate.chainId.length > 0) {
        return mandate.chainId;
      }
    }
    if (p.subtask && typeof p.subtask === "object") {
      const subtask = p.subtask as Record<string, unknown>;
      if (typeof subtask.chainId === "string" && subtask.chainId.length > 0) {
        return subtask.chainId;
      }
    }
    if (p.bid && typeof p.bid === "object") {
      const bid = p.bid as Record<string, unknown>;
      if (typeof bid.chainId === "string" && bid.chainId.length > 0) {
        return bid.chainId;
      }
    }
    if (p.award && typeof p.award === "object") {
      const award = p.award as Record<string, unknown>;
      if (typeof award.chainId === "string" && award.chainId.length > 0) {
        return award.chainId;
      }
    }
    if (p.partial && typeof p.partial === "object") {
      const partial = p.partial as Record<string, unknown>;
      if (typeof partial.chainId === "string" && partial.chainId.length > 0) {
        return partial.chainId;
      }
    }
    if (p.report && typeof p.report === "object") {
      const report = p.report as Record<string, unknown>;
      if (typeof report.chainId === "string" && report.chainId.length > 0) {
        return report.chainId;
      }
    }
  }
  if (envelope.correlationId?.startsWith("chain_")) {
    return envelope.correlationId;
  }
  return undefined;
}

/** Send a signed chain envelope over the mesh. Returns false on routing failure. */
export async function sendChainEnvelopeOverMesh(
  resolver: ChainTransportResolver,
  recipientPeerId: string,
  envelope: EnvoyEnvelope,
): Promise<boolean> {
  const transportPeerId = await resolveChainTransportPeerId(resolver, recipientPeerId);
  if (!transportPeerId) return false;
  try {
    await resolver.mesh.send(transportPeerId, envelope);
    return true;
  } catch {
    return false;
  }
}
