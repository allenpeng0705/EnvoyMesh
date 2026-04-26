import { derivePeerId } from "@envoymesh/identity";
import {
  createAuditEvent,
  type LocalTaskStore,
  type LocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import {
  createDiscoveryResponsePayload,
  parseDiscoveryRequestPayload,
  parseDiscoveryResponsePayload,
  type DiscoveryResponsePayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";

export type DiscoveryInboundResult =
  | { ok: true; responsePayload?: DiscoveryResponsePayload }
  | { ok: false; reason: string };

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const discoveryRequestRate = new Map<string, number[]>();

export async function handleInboundDiscoveryIntent(input: {
  envelope: EnvoyEnvelope;
  profile: NodeProfile;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: LocalTaskStore;
  trustStore: LocalTrustStore;
}): Promise<DiscoveryInboundResult> {
  const { envelope, profile, remotePeerId, receivedAt, correlationId, taskStore, trustStore } = input;

  try {
    if (envelope.intent === "discovery.request") {
      const payload = parseDiscoveryRequestPayload(envelope.payload);
      const trustRecord = await trustStore.getTrustRecord(payload.requesterOwnerId);
      const trustLevel = trustRecord?.level ?? "public";

      if (trustLevel === "blocked" || trustLevel === "public") {
        return { ok: false, reason: `discovery.request requires referred/direct trust (got ${trustLevel})` };
      }

      if (!allowRequest(payload.requesterOwnerId, receivedAt)) {
        return { ok: false, reason: "discovery.request rate limit exceeded for requesterOwnerId" };
      }

      const localCapabilities = profile.deviceCertificate.capabilities;
      const matchedCapabilities = payload.requestedCapabilities.filter((capability) =>
        localCapabilities.includes(capability as (typeof localCapabilities)[number]),
      );
      const hasTagMatch = payload.requestedTagHashes.length > 0;
      const hasCapabilityMatch = matchedCapabilities.length > 0;
      const matches =
        hasTagMatch || hasCapabilityMatch
          ? [
              {
                ownerId: profile.owner.ownerId,
                peerId: derivePeerId(profile.device.publicKeyPem),
                matchedTagHashes: hasTagMatch ? payload.requestedTagHashes : [],
                matchedCapabilities,
              },
            ]
          : [];

      const responsePayload = createDiscoveryResponsePayload({
        requestMessageId: envelope.messageId,
        responderOwnerId: profile.owner.ownerId,
        matches: matches.slice(0, payload.maxResults),
        truncated: matches.length > payload.maxResults,
      });

      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.verified",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "verified",
          latencyMs: Date.now() - receivedAt,
          outcome: "allow",
          summary: `discovery.request accepted trust=${trustLevel} tags=${payload.requestedTagHashes.length} capabilities=${payload.requestedCapabilities.length}`,
          createdAt: envelope.createdAt,
        }),
      );

      return { ok: true, responsePayload };
    }

    if (envelope.intent === "discovery.response") {
      const payload = parseDiscoveryResponsePayload(envelope.payload);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.verified",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "verified",
          latencyMs: Date.now() - receivedAt,
          outcome: "record",
          summary: `discovery.response for request=${payload.requestMessageId} matches=${payload.matches.length} truncated=${payload.truncated}`,
          createdAt: envelope.createdAt,
        }),
      );
      return { ok: true };
    }

    return { ok: false, reason: "not a discovery intent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `invalid discovery payload: ${message}` };
  }
}

function allowRequest(requesterOwnerId: string, receivedAt: number): boolean {
  const windowStart = receivedAt - RATE_LIMIT_WINDOW_MS;
  const history = discoveryRequestRate.get(requesterOwnerId) ?? [];
  const active = history.filter((timestamp) => timestamp >= windowStart);
  if (active.length >= RATE_LIMIT_MAX_REQUESTS) {
    discoveryRequestRate.set(requesterOwnerId, active);
    return false;
  }
  active.push(receivedAt);
  discoveryRequestRate.set(requesterOwnerId, active);
  return true;
}
