import { derivePeerId } from "@envoymesh/identity";
import {
  createAuditEvent,
  type LocalTaskStore,
  type LocalTrustStore,
  type NodeProfile,
  sensitivityAllowed,
  keywordsMatch,
} from "@envoymesh/local-store";
import {
  parseBroadcastRequestPayload,
  parseBroadcastResponsePayload,
  createBroadcastResponsePayload,
  type BroadcastResponsePayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";

export type BroadcastInboundResult =
  | { ok: true; responsePayload: BroadcastResponsePayload }
  | { ok: false; reason: string };

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const broadcastRequestRate = new Map<string, number[]>();

export async function handleInboundBroadcastRequest(input: {
  envelope: EnvoyEnvelope;
  profile: NodeProfile;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: LocalTaskStore;
  trustStore: LocalTrustStore;
  capabilityManifest?: {
    visibility: string;
    sensitivityCeiling: "public" | "friends" | "private";
    keywords: string[];
    capabilities: string[];
  };
  anonymousDiscoveryMode?: "off" | "contacts-only" | "public-preview" | "public-auto-answer";
  anonymousSensitivityCeiling?: "public" | "friends";
}): Promise<BroadcastInboundResult> {
  const {
    envelope,
    profile,
    remotePeerId,
    receivedAt,
    correlationId,
    taskStore,
    trustStore,
    capabilityManifest,
    anonymousDiscoveryMode = "off",
    anonymousSensitivityCeiling = "public",
  } = input;

  try {
    if (envelope.intent !== "broadcast.request") {
      return { ok: false, reason: "not a broadcast.request" };
    }

    const payload = parseBroadcastRequestPayload(envelope.payload);
    const senderOwnerId = payload.senderOwnerId;
    const trustRecord = await trustStore.getTrustRecord(senderOwnerId);
    const trustLevel = trustRecord?.level ?? "public";

    // Rate limit per sender owner ID
    if (!allowBroadcastRequest(senderOwnerId, receivedAt)) {
      const denyReason = "broadcast.request rate limit exceeded";
      await auditBroadcastDeny({
        taskStore,
        envelope,
        remotePeerId,
        receivedAt,
        correlationId,
        trustLevel,
        reason: denyReason,
      });
      return { ok: false, reason: denyReason };
    }

    // Anonymous mode enforcement (mirrors discovery.inbound Phase 8I logic)
    if (trustLevel === "public") {
      // Mode "off" — silently drop
      if (anonymousDiscoveryMode === "off") {
        return { ok: false, reason: "anonymous broadcast is disabled" };
      }

      // Mode "contacts-only" — reject public callers
      if (anonymousDiscoveryMode === "contacts-only") {
        const denyReason = "anonymous broadcast mode is contacts-only; public callers are rejected";
        await auditBroadcastDeny({
          taskStore,
          envelope,
          remotePeerId,
          receivedAt,
          correlationId,
          trustLevel,
          reason: denyReason,
        });
        return { ok: false, reason: denyReason };
      }

      // Apply sensitivity ceiling for preview/auto-answer modes
      const effectiveCeiling = anonymousSensitivityCeiling;
      const requestedSensitivity = payload.requestedSensitivity;
      if (!sensitivityAllowed(requestedSensitivity, effectiveCeiling)) {
        const denyReason = `anonymous broadcast sensitivity=${requestedSensitivity} exceeds mode ceiling=${effectiveCeiling}`;
        await auditBroadcastDeny({
          taskStore,
          envelope,
          remotePeerId,
          receivedAt,
          correlationId,
          trustLevel,
          reason: denyReason,
        });
        return { ok: false, reason: denyReason };
      }
    }

    // Blocked senders are always rejected
    if (trustLevel === "blocked") {
      const denyReason = "sender is blocked";
      await auditBroadcastDeny({
        taskStore,
        envelope,
        remotePeerId,
        receivedAt,
        correlationId,
        trustLevel,
        reason: denyReason,
      });
      return { ok: false, reason: denyReason };
    }

    // Capability manifest matching (if present)
    let matches = false;
    let matchedCapabilities: string[] = [];

    if (capabilityManifest) {
      // Visibility gate
      if (capabilityManifest.visibility === "contacts-only" && trustLevel === "public") {
        const denyReason = "manifest visibility=contacts-only rejects public trust broadcaster";
        await auditBroadcastDeny({
          taskStore,
          envelope,
          remotePeerId,
          receivedAt,
          correlationId,
          trustLevel,
          reason: denyReason,
          hasManifest: true,
        });
        return { ok: false, reason: denyReason };
      }

      // Sensitivity ceiling check
      if (!sensitivityAllowed(payload.requestedSensitivity, capabilityManifest.sensitivityCeiling)) {
        const denyReason = `requested sensitivity=${payload.requestedSensitivity} exceeds manifest ceiling=${capabilityManifest.sensitivityCeiling}`;
        await auditBroadcastDeny({
          taskStore,
          envelope,
          remotePeerId,
          receivedAt,
          correlationId,
          trustLevel,
          reason: denyReason,
          hasManifest: true,
        });
        return { ok: false, reason: denyReason };
      }

      // Capability matching
      matchedCapabilities = payload.requestedCapabilities.filter((cap) =>
        capabilityManifest.capabilities.includes(cap),
      );

      // Keyword matching
      const hasKeywordMatch = keywordsMatch(
        capabilityManifest.keywords,
        payload.requestedTagHashes,
      );

      matches = hasKeywordMatch || matchedCapabilities.length > 0;
    } else {
      // Legacy matching: match if sender has referred/direct trust and any tags or caps match device cert
      if (trustLevel === "public") {
        const denyReason = "broadcast.request requires referred/direct trust (got public)";
        await auditBroadcastDeny({
          taskStore,
          envelope,
          remotePeerId,
          receivedAt,
          correlationId,
          trustLevel,
          reason: denyReason,
        });
        return { ok: false, reason: denyReason };
      }

      const localCapabilities = profile.deviceCertificate.capabilities;
      matchedCapabilities = payload.requestedCapabilities.filter((cap) =>
        localCapabilities.includes(cap as (typeof localCapabilities)[number]),
      );
      const hasTagMatch = payload.requestedTagHashes.length > 0;
      matches = hasTagMatch || matchedCapabilities.length > 0;
    }

    if (!matches) {
      await auditBroadcastDeny({
        taskStore,
        envelope,
        remotePeerId,
        receivedAt,
        correlationId,
        trustLevel,
        reason: "no capability or keyword match",
        hasManifest: !!capabilityManifest,
      });
      return { ok: false, reason: "no match" };
    }

    // Build response — dispatcher will send it
    const responsePayload = createBroadcastResponsePayload({
      queryId: payload.queryId,
      responderOwnerId: profile.owner.ownerId,
      responderPeerId: derivePeerId(profile.device.publicKeyPem),
      matchedTagHashes: payload.requestedTagHashes,
      matchedCapabilities,
      done: true, // single response; done immediately
    });

    // Audit match
    await auditBroadcastMatch({
      taskStore,
      envelope,
      remotePeerId,
      receivedAt,
      correlationId,
      trustLevel,
      tagCount: payload.requestedTagHashes.length,
      capCount: payload.requestedCapabilities.length,
      hasManifest: !!capabilityManifest,
    });

    return { ok: true, responsePayload };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `invalid broadcast payload: ${message}` };
  }
}

export async function handleInboundBroadcastResponse(input: {
  envelope: EnvoyEnvelope;
  taskStore: LocalTaskStore;
}): Promise<{ ok: true; responsePayload: BroadcastResponsePayload } | { ok: false; reason: string }> {
  const { envelope, taskStore } = input;

  try {
    const payload = parseBroadcastResponsePayload(envelope.payload);

    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: envelope.intent,
        messageId: envelope.messageId,
        correlationId: undefined,
        remotePeerId: envelope.senderPeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: 0,
        outcome: "record",
        summary: `broadcast.response queryId=${payload.queryId} responder=${payload.responderOwnerId} matchedCaps=${payload.matchedCapabilities.length} done=${payload.done}`,
        createdAt: envelope.createdAt,
      }),
    );

    return { ok: true, responsePayload: payload };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `invalid broadcast.response payload: ${message}` };
  }
}

function allowBroadcastRequest(senderOwnerId: string, receivedAt: number): boolean {
  const windowStart = receivedAt - RATE_LIMIT_WINDOW_MS;
  const history = broadcastRequestRate.get(senderOwnerId) ?? [];
  const active = history.filter((ts) => ts >= windowStart);
  if (active.length >= RATE_LIMIT_MAX_REQUESTS) {
    broadcastRequestRate.set(senderOwnerId, active);
    return false;
  }
  active.push(receivedAt);
  broadcastRequestRate.set(senderOwnerId, active);
  return true;
}

async function auditBroadcastDeny(input: {
  taskStore: LocalTaskStore;
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  trustLevel: string;
  reason: string;
  hasManifest?: boolean;
}): Promise<void> {
  const { taskStore, envelope, remotePeerId, receivedAt, correlationId, trustLevel, reason, hasManifest } = input;
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
      outcome: "deny",
      summary: `broadcast.request denied: ${reason}${hasManifest ? " [manifest]" : " [legacy]"}`,
      createdAt: envelope.createdAt,
    }),
  );
}

async function auditBroadcastMatch(input: {
  taskStore: LocalTaskStore;
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  trustLevel: string;
  tagCount: number;
  capCount: number;
  hasManifest: boolean;
}): Promise<void> {
  const { taskStore, envelope, remotePeerId, receivedAt, correlationId, trustLevel, tagCount, capCount, hasManifest } = input;
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
      summary: `broadcast.request matched trust=${trustLevel}${hasManifest ? " [manifest]" : ""} tags=${tagCount} caps=${capCount}`,
      createdAt: envelope.createdAt,
    }),
  );
}
