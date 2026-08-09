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
import { CHAIN_MESH_SEND_TIMEOUT_MS } from "./chain-defaults.js";
import { sendEnvelopeWithRetry, type OutboundDeliverMesh } from "./chat-outbound-deliver.js";
import { chainLog, chainWarn, shortPeerId } from "./chain-debug.js";

async function withChainSendTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          try {
            onTimeout();
          } catch {
            /* best-effort unblock */
          }
          reject(new Error(`chain_send_timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export interface ChainTransportResolver {
  mesh: OutboundDeliverMesh & Pick<EnvoyMesh, "peerId">;
  peerDirectoryStore: LocalPeerDirectoryStore;
  /** Local device public key PEM — used for self-send. */
  localDevicePublicKeyPem?: string;
  /** Local agent peer id — used for self-send. */
  localAgentPeerId?: string;
  /** Cached agent cards: sourceAgentPeerId → ownerId. */
  agentPeerToOwner?: Map<string, string>;
  /**
   * Same-node delivery for Team jobs when the recipient is the local agent.
   * Mesh self-dial is skipped by chat-outbound-deliver; without this, local
   * "You" workers never receive mandate/propose.
   */
  deliverLocally?: (envelope: EnvoyEnvelope) => Promise<void>;
  /** Optional LAN/listen dial hints for the resolved libp2p transport peer. */
  resolveDialHints?: (transportPeerId: string) => Promise<string[]>;
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
  if (!transportPeerId) {
    chainWarn("send", "no transport peer", {
      intent: envelope.intent,
      recipient: shortPeerId(recipientPeerId),
      correlationId: envelope.correlationId,
    });
    return false;
  }

  const localDevicePeerId = resolver.localDevicePublicKeyPem
    ? derivePeerId(resolver.localDevicePublicKeyPem)
    : undefined;
  const isLocal =
    recipientPeerId === resolver.localAgentPeerId ||
    recipientPeerId === localDevicePeerId ||
    recipientPeerId === resolver.mesh.peerId ||
    transportPeerId === resolver.mesh.peerId;

  if (isLocal) {
    if (!resolver.deliverLocally) {
      chainWarn("send", "local recipient but deliverLocally missing", {
        intent: envelope.intent,
        recipient: shortPeerId(recipientPeerId),
        correlationId: envelope.correlationId,
      });
      return false;
    }
    try {
      chainLog("send", "local loopback", {
        intent: envelope.intent,
        recipient: shortPeerId(recipientPeerId),
        correlationId: envelope.correlationId,
      });
      await withChainSendTimeout(
        resolver.deliverLocally(envelope),
        CHAIN_MESH_SEND_TIMEOUT_MS,
        () => {
          /* local loopback has no mesh conn to close */
        },
      );
      return true;
    } catch (err) {
      chainWarn("send", "local loopback failed", {
        intent: envelope.intent,
        recipient: shortPeerId(recipientPeerId),
        correlationId: envelope.correlationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  try {
    chainLog("send", "mesh deliver", {
      intent: envelope.intent,
      recipient: shortPeerId(recipientPeerId),
      transport: shortPeerId(transportPeerId),
      correlationId: envelope.correlationId,
    });
    let dialHints = [`/p2p/${transportPeerId}`];
    if (resolver.resolveDialHints) {
      try {
        const extra = await resolver.resolveDialHints(transportPeerId);
        if (extra.length > 0) {
          dialHints = [...new Set([...extra, ...dialHints])];
        }
      } catch {
        /* best-effort */
      }
    }
    const result = await withChainSendTimeout(
      sendEnvelopeWithRetry({
        mesh: resolver.mesh,
        transportPeerId,
        envelope,
        dialHints,
        // One prepare+send cycle; outer timeout covers hang. Retries on a
        // half-dead peer just multiply lock hold time.
        maxAttempts: 1,
      }),
      CHAIN_MESH_SEND_TIMEOUT_MS,
      () => {
        // Unblock a hung mesh.send holding the per-peer outbound lock.
        void resolver.mesh.closeConnectionsToPeer?.(transportPeerId);
      },
    );
    if (!result.delivered) {
      chainWarn("send", "mesh deliver returned not delivered", {
        intent: envelope.intent,
        recipient: shortPeerId(recipientPeerId),
        transport: shortPeerId(transportPeerId),
        correlationId: envelope.correlationId,
      });
    }
    return result.delivered === true;
  } catch (err) {
    chainWarn("send", "mesh deliver threw", {
      intent: envelope.intent,
      recipient: shortPeerId(recipientPeerId),
      transport: shortPeerId(transportPeerId),
      correlationId: envelope.correlationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
