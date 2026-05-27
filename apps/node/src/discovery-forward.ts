import {
  createDiscoveryRequestPayload,
  parseDiscoveryRequestPayload,
  type DiscoveryRequestPayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import {
  anonymizeDiscoveryRequesterOwnerId,
  canForwardDiscoveryHop,
  nextDiscoveryHop,
} from "@envoymesh/api";
import type { ApprovalQueue } from "@envoymesh/api";
import { createApprovalItem } from "@envoymesh/api";

export interface DiscoveryForwardContext {
  envelope: EnvoyEnvelope;
  requesterOwnerId: string;
  trustLevel: string;
  correlationId: string | undefined;
  excludeOwnerIds: string[];
}

export function shouldQueueDiscoveryForward(
  payload: DiscoveryRequestPayload,
  trustLevel: string,
): boolean {
  if (trustLevel === "blocked" || trustLevel === "public") {
    return false;
  }
  return canForwardDiscoveryHop(payload);
}

export function queueDiscoveryForwardApproval(
  queue: ApprovalQueue,
  input: DiscoveryForwardContext,
): string | undefined {
  const payload = parseDiscoveryRequestPayload(input.envelope.payload);
  if (!shouldQueueDiscoveryForward(payload, input.trustLevel)) {
    return undefined;
  }
  const nextHop = nextDiscoveryHop(payload);
  const item = createApprovalItem(
    "discovery_forward",
    "Forward discovery request",
    `Forward capability search to your other bonds (hop ${nextHop} of ${payload.maxHops ?? 1}). Requester: ${input.requesterOwnerId.slice(0, 24)}…`,
    JSON.stringify({
      requestMessageId: input.envelope.messageId,
      requesterOwnerId: input.requesterOwnerId,
      correlationId: input.correlationId,
      excludeOwnerIds: input.excludeOwnerIds,
      requestedCapabilities: payload.requestedCapabilities,
      requestedTagHashes: payload.requestedTagHashes,
      maxHops: payload.maxHops ?? 1,
      currentHop: payload.currentHop ?? 0,
    }),
    {
      metadata: {
        requestMessageId: input.envelope.messageId,
        correlationId: input.correlationId,
        hopIndex: nextHop,
      },
    },
    "normal",
  );
  queue.add(item);
  return item.id;
}

export function buildForwardedDiscoveryPayload(
  payload: DiscoveryRequestPayload,
  originalRequesterOwnerId: string,
  referralOwnerId: string,
  correlationId: string | undefined,
): DiscoveryRequestPayload {
  const anonId = anonymizeDiscoveryRequesterOwnerId(originalRequesterOwnerId, correlationId);
  return createDiscoveryRequestPayload({
    requesterOwnerId: anonId,
    requestedTagHashes: payload.requestedTagHashes,
    requestedCapabilities: payload.requestedCapabilities,
    maxResults: payload.maxResults,
    requestedSensitivity: payload.requestedSensitivity,
    fileTitleQuery: payload.fileTitleQuery,
    requestedContentHashPrefixes: payload.requestedContentHashPrefixes,
    maxHops: payload.maxHops ?? 1,
    currentHop: nextDiscoveryHop(payload),
    forwardPrivacy: "anonymous",
    referralOwnerId: referralOwnerId.trim(),
  });
}
