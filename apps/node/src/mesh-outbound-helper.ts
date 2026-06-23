import type { EnvoyEnvelope } from "@envoymesh/protocol";
import {
  sendEnvelopeWithRetry,
  sendExpectReplyWithRetry,
  type OutboundDeliverMesh,
  type OutboundExpectReplyMesh,
} from "./chat-outbound-deliver.js";

/** Dial hints for a libp2p peer id or full multiaddr transport target. */
export function dialHintsForTransportTarget(target: string): string[] {
  return [target.startsWith("/") ? target : `/p2p/${target}`];
}

export async function deliverOutboundEnvelope(
  mesh: OutboundDeliverMesh,
  transportPeerId: string,
  envelope: EnvoyEnvelope,
  opts?: {
    dialHints?: string[];
    peerListenAddrs?: string[];
    rebuildDialHints?: () => Promise<string[]>;
  },
): Promise<void> {
  await sendEnvelopeWithRetry({
    mesh,
    transportPeerId,
    envelope,
    dialHints: opts?.dialHints ?? dialHintsForTransportTarget(transportPeerId),
    peerListenAddrs: opts?.peerListenAddrs,
    rebuildDialHints: opts?.rebuildDialHints,
  });
}

export async function deliverOutboundExpectReply(
  mesh: OutboundExpectReplyMesh,
  transportPeerId: string,
  envelope: EnvoyEnvelope,
  opts?: {
    dialHints?: string[];
    peerListenAddrs?: string[];
    timeoutMs?: number;
    rebuildDialHints?: () => Promise<string[]>;
  },
): Promise<EnvoyEnvelope> {
  return sendExpectReplyWithRetry({
    mesh,
    transportPeerId,
    envelope,
    dialHints: opts?.dialHints ?? dialHintsForTransportTarget(transportPeerId),
    peerListenAddrs: opts?.peerListenAddrs,
    timeoutMs: opts?.timeoutMs,
    rebuildDialHints: opts?.rebuildDialHints,
  });
}
