import { verifyInboundEnvelope } from "@envoymesh/identity";
import {
  EnvoyEnvelopeSchema,
  RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
  RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";

export type InboundGuardDecision =
  | { action: "allow"; envelope: EnvoyEnvelope }
  | { action: "reject"; reason: string; messageId?: string };

/** Options for {@link InboundMessageGuard.inspect}. */
export interface InboundGuardInspectOptions {
  /** libp2p remote peer that delivered this envelope (when known). */
  remotePeerId?: string;
  /**
   * Configured / preferred EnvoyMesh relay peer IDs. When provided (including
   * an empty array), placeholder relay-control responses are only accepted if
   * the claimant peer (`remotePeerId` ?? `envelope.senderPeerId`) is in this
   * set. Omit entirely only in unit tests that intentionally skip the trust gate.
   */
  trustedRelayPeerIds?: readonly string[];
}

export interface InboundMessageGuard {
  inspect(input: unknown, options?: InboundGuardInspectOptions): InboundGuardDecision;
}

export interface InboundMessageGuardOptions {
  maxEnvelopeBytes?: number;
  /** Max messageIds kept for replay suppression; oldest evicted first (long-running nodes / Windows). Default 100000. */
  maxReplayEntries?: number;
}

const defaultMaxEnvelopeBytes = 64 * 1024;
/** profile.sync may include inline thumbnail bytes (up to 512 KiB image + base64 overhead). */
const profileMaxEnvelopeBytes = 1024 * 1024;
const defaultMaxReplayEntries = 100_000;

const PROFILE_INTENTS = new Set(["profile.sync", "profile.request", "profile.response"]);

/**
 * Relay control responses are unsigned placeholder envelopes produced by
 * relay infrastructure. Relays can't sign with each client's key, and their
 * own peer key isn't pre-shared with every client in all topologies — so they
 * use a well-known placeholder public key + signature. Without this bypass,
 * every relay.lookup / hints reply is rejected as "invalid signature" and WAN
 * discovery never resolves peers (breaks cross-network auto-bonding).
 *
 * Bypass requires:
 * 1. intent in this set
 * 2. exact placeholder signature AND public key
 * 3. when `trustedRelayPeerIds` is provided — claimant peer must be listed
 *    (prevents any mesh peer from forging placeholder lookup responses)
 */
const RELAY_CONTROL_RESPONSE_INTENTS = new Set([
  "relay.lookup.response",
  "relay.hints.response",
  "rendezvous.response",
]);

function maxBytesForInboundIntent(intent: string | undefined, defaultLimit: number): number {
  if (intent && PROFILE_INTENTS.has(intent)) {
    return profileMaxEnvelopeBytes;
  }
  return defaultLimit;
}

function inboundIntentFromUnknown(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null || !("intent" in input)) {
    return undefined;
  }
  const intent = (input as { intent?: unknown }).intent;
  return typeof intent === "string" ? intent : undefined;
}

/**
 * Payload dominates envelope size; fixed overhead covers signatures, PEM keys, metadata.
 */
function estimateEnvelopeUtf8Bytes(input: unknown, abortAbove: number): number {
  if (input == null || typeof input !== "object") {
    return Buffer.byteLength(JSON.stringify(input), "utf8");
  }
  const obj = input as { payload?: unknown };
  const payloadBytes = Buffer.byteLength(JSON.stringify(obj.payload ?? null), "utf8");
  const byteLength = payloadBytes + 4096;
  return byteLength > abortAbove ? byteLength : byteLength;
}

function isPlaceholderRelayControl(envelope: EnvoyEnvelope): boolean {
  return (
    RELAY_CONTROL_RESPONSE_INTENTS.has(envelope.intent) &&
    envelope.signature === RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE &&
    envelope.senderPublicKey === RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY
  );
}

/** Extract `/p2p/<peerId>` tail from a multiaddr or return bare peer id. */
export function peerIdFromRelayTarget(target: string): string | undefined {
  const t = target.trim();
  if (!t) return undefined;
  if (!t.startsWith("/")) return t;
  const m = t.match(/\/p2p\/([^/]+)$/);
  return m?.[1];
}

export function createInboundMessageGuard(
  options: InboundMessageGuardOptions = {},
): InboundMessageGuard {
  const seenMessageIds = new Set<string>();
  const replayOrder: string[] = [];
  const maxEnvelopeBytes = options.maxEnvelopeBytes ?? defaultMaxEnvelopeBytes;
  const maxReplayEntries = options.maxReplayEntries ?? defaultMaxReplayEntries;

  return {
    inspect(input, inspectOptions) {
      const intentHint = inboundIntentFromUnknown(input);
      const sizeLimit = maxBytesForInboundIntent(intentHint, maxEnvelopeBytes);
      const byteLength = estimateEnvelopeUtf8Bytes(input, sizeLimit + 1);

      if (byteLength > sizeLimit) {
        return { action: "reject", reason: "envelope exceeds maximum size" };
      }

      const parsed = EnvoyEnvelopeSchema.safeParse(input);
      if (!parsed.success) {
        return { action: "reject", reason: "malformed or unsigned envelope" };
      }

      const envelope = parsed.data as EnvoyEnvelope;
      if (seenMessageIds.has(envelope.messageId)) {
        return {
          action: "reject",
          reason: "replayed message",
          messageId: envelope.messageId,
        };
      }

      let verified = false;
      if (isPlaceholderRelayControl(envelope)) {
        const trusted = inspectOptions?.trustedRelayPeerIds;
        if (trusted !== undefined) {
          const trustedSet = new Set(
            trusted.map((id) => id.trim()).filter(Boolean),
          );
          const claimant =
            inspectOptions?.remotePeerId?.trim() || envelope.senderPeerId.trim();
          if (!claimant || !trustedSet.has(claimant)) {
            return {
              action: "reject",
              reason: "untrusted relay control source",
              messageId: envelope.messageId,
            };
          }
        }
        verified = true;
      } else {
        verified = verifyInboundEnvelope(envelope);
      }

      if (!verified) {
        return {
          action: "reject",
          reason: envelope.senderRole === "agent" && envelope.agentCredential != null
            ? "invalid agent credential or signature"
            : "invalid signature",
          messageId: envelope.messageId,
        };
      }

      seenMessageIds.add(envelope.messageId);
      replayOrder.push(envelope.messageId);
      while (replayOrder.length > maxReplayEntries) {
        const old = replayOrder.shift();
        if (old !== undefined) {
          seenMessageIds.delete(old);
        }
      }
      return { action: "allow", envelope };
    },
  };
}
