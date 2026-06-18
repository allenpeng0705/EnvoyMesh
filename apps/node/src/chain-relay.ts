/**
 * Phase 40E — Cross-home chain transport via relay.
 *
 * When a chain needs to send a `task.chain.*` envelope to a peer on
 * another home node, we wrap the inner envelope in a `task.chain.relay`
 * envelope. The relay nodes route the wrapper using `viaRelays`
 * hints; they do NOT inspect the inner payload (the inner is
 * pre-serialized, the relay is content-agnostic).
 *
 * This module is purely the routing + wrapping layer. Sending the
 * actual envelope still goes through `mesh.sendEnvelope` — we just
 * choose a wrapper intent + payload based on whether the recipient
 * is on the same home (direct) or another home (relay-wrapped).
 *
 * Cost: a relay-wrapped envelope counts as 1 outbound envelope for
 * rate-limiting purposes (not 2). The `viaRelays` array is the
 * set of relay nodes the orchestrator has observed; we don't add to
 * the chain budget because relay traversal is free for chains.
 *
 * @see docs/agent_network.md §8.2 (Cross-home transport)
 */

import {
  ChainRelayRouteSchema,
  type ChainRelayRoute,
  type EnvoyIntent,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";

/** Where the envelope should be routed. */
export type ChainRouteTarget =
  | { kind: "direct"; recipientPeerId: string }
  | { kind: "relay"; recipientPeerId: string; viaRelays: string[] };

/**
 * Selects between direct and relay routing. Heuristic:
 *   - if `viaRelays` is empty AND we have a direct connection, use direct
 *   - if `viaRelays` is non-empty, use relay (the orchestrator already
 *     knows it's going through relays)
 *   - if `forceRelay` is true (e.g. the recipient is on a mobile node
 *     that only supports relay), always use relay
 */
export function selectChainRoute(
  recipientPeerId: string,
  viaRelays: string[],
  forceRelay = false,
): ChainRouteTarget {
  if (forceRelay || viaRelays.length > 0) {
    return { kind: "relay", recipientPeerId, viaRelays: [...viaRelays] };
  }
  return { kind: "direct", recipientPeerId };
}

/**
 * Build the inner envelope that the orchestrator wants to send. The
 * returned `innerPayload` is the raw `payload` object (caller
 * serializes it via `chain-orchestrator.ts`). The wrapper envelope
 * here is for transport.
 */
export interface WrapChainEnvelopeInput {
  innerIntent: EnvoyIntent;
  recipientPeerId: string;
  viaRelays: string[];
  innerPayload: unknown;
  /** TTL in ms for the relay-wrapped envelope. Default 60_000. */
  ttlMs?: number;
  now?: Date;
}

export interface WrappedChainEnvelope {
  /** True when the envelope is wrapped in `task.chain.relay`. */
  isRelayed: boolean;
  /** The intent the orchestrator should put on the outbound envelope. */
  outboundIntent: EnvoyIntent;
  /** The payload to attach to the outbound envelope. */
  outboundPayload: ChainRelayRoute | unknown;
}

export function wrapChainEnvelope(input: WrapChainEnvelopeInput): WrappedChainEnvelope {
  const ttl = input.ttlMs ?? 60_000;
  const createdAt = (input.now ?? new Date()).toISOString();
  // The "relay" intent + payload combo is used iff there are viaRelays.
  if (input.viaRelays.length === 0) {
    return {
      isRelayed: false,
      outboundIntent: input.innerIntent,
      outboundPayload: input.innerPayload,
    };
  }
  const route: ChainRelayRoute = ChainRelayRouteSchema.parse({
    chainId: extractChainId(input.innerPayload) ?? "unknown",
    innerIntent: input.innerIntent,
    recipientPeerId: input.recipientPeerId,
    viaRelays: input.viaRelays,
    ttlMs: ttl,
    innerPayload: input.innerPayload,
    createdAt,
  });
  return {
    isRelayed: true,
    outboundIntent: "task.chain.relay",
    outboundPayload: route,
  };
}

/**
 * Strips the relay wrapper. Returns the inner intent + payload, or
 * `null` if the envelope is not a relay wrapper.
 */
export function unwrapChainRelay(envelope: EnvoyEnvelope): {
  innerIntent: EnvoyIntent;
  innerPayload: unknown;
} | null {
  if (envelope.intent !== "task.chain.relay") return null;
  const parsed = ChainRelayRouteSchema.safeParse(envelope.payload);
  if (!parsed.success) return null;
  return {
    innerIntent: parsed.data.innerIntent as EnvoyIntent,
    innerPayload: parsed.data.innerPayload,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort extraction of a `chainId` from an inner payload. We
 * accept the well-known payload shapes (handoff, delegate, etc.)
 * without doing a full Zod parse — the receiver does the parse.
 *
 * Returns `null` if the payload isn't a recognized chain payload.
 */
function extractChainId(innerPayload: unknown): string | null {
  if (typeof innerPayload !== "object" || innerPayload === null) return null;
  const obj = innerPayload as Record<string, unknown>;
  if (typeof obj.chainId === "string") return obj.chainId;
  // ChainRelayRoute / ChainArbitrationEntry wrap payloads.
  if (typeof obj.entry === "object" && obj.entry !== null) {
    const entry = obj.entry as Record<string, unknown>;
    if (typeof entry.chainId === "string") return entry.chainId;
  }
  return null;
}

/**
 * Computes the next `viaRelays` hint set as the envelope traverses a
 * relay node. The new array contains the current set MINUS the relay
 * we just passed through (so we don't loop). If `nextHop` is not in
 * the set, we just keep the set as-is.
 */
export function advanceViaRelays(viaRelays: string[], nextHop: string): string[] {
  return viaRelays.filter((r) => r !== nextHop);
}
