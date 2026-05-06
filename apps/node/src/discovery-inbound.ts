import { derivePeerId } from "@envoymesh/identity";
import {
  createDiscoveryEvent,
  createAuditEvent,
  type LocalTaskStore,
  type LocalTrustStore,
  type NodeProfile,
  type CapabilityManifest,
  sensitivityAllowed,
  keywordsMatch,
} from "@envoymesh/local-store";
import {
  createDiscoveryResponsePayload,
  createUnsignedEnvelope,
  parseDiscoveryRequestPayload,
  parseDiscoveryResponsePayload,
  type DiscoveryResponsePayload,
  type EnvoyEnvelope,
  type RelayPeerInfo,
} from "@envoymesh/protocol";

export type DiscoveryInboundResult =
  | { ok: true; responsePayload?: DiscoveryResponsePayload }
  | { ok: false; reason: string }
  | { ok: false; reason: "queued"; queuedAt: number; queuePosition?: number }
  | { ok: false; reason: "queue_processing" };

export type RelayPeersInboundResult =
  | { ok: true; responsePayload?: import("@envoymesh/protocol").RelayPeersResponsePayload }
  | { ok: false; reason: string };

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const discoveryRequestRate = new Map<string, number[]>();

// Per-remotePeerId rate limit for anonymous callers (public trust)
const ANON_RATE_LIMIT_WINDOW_MS = 60_000;
const ANON_RATE_LIMIT_MAX_REQUESTS = 5;
const anonDiscoveryRate = new Map<string, number[]>();

// ─── Phase 8I: Low-priority queue for anonymous discovery ───────────────────────

export interface QueuedDiscoveryRequest {
  envelope: EnvoyEnvelope;
  profile: NodeProfile;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: LocalTaskStore;
  trustStore: LocalTrustStore;
  capabilityManifest?: CapabilityManifest;
  anonymousDiscoveryMode: "off" | "contacts-only" | "public-preview" | "public-auto-answer";
  anonymousIntentAllowlist?: readonly string[];
  anonymousSensitivityCeiling?: "public" | "friends";
  queuedAt: number;
}

// Per-remotePeerId FIFO queue for anonymous discovery requests that exceed rate limit
const anonymousDiscoveryQueue = new Map<string, QueuedDiscoveryRequest[]>();

// Max queue size per peer (prevent memory exhaustion)
const MAX_QUEUE_SIZE_PER_PEER = 20;

// Max time a request stays in queue before expiring (5 minutes)
const QUEUE_ENTRY_TTL_MS = 5 * 60 * 1000;

function getQueuePosition(peerId: string): number | undefined {
  const queue = anonymousDiscoveryQueue.get(peerId);
  return queue && queue.length > 0 ? queue.length : undefined;
}

function enqueueDiscoveryRequest(request: QueuedDiscoveryRequest): boolean {
  const { remotePeerId } = request;
  let queue = anonymousDiscoveryQueue.get(remotePeerId);

  if (!queue) {
    queue = [];
    anonymousDiscoveryQueue.set(remotePeerId, queue);
  }

  // Prevent memory exhaustion - reject if queue is too large
  if (queue.length >= MAX_QUEUE_SIZE_PER_PEER) {
    return false;
  }

  // Filter out expired entries
  const now = Date.now();
  const active = queue.filter((r) => now - r.queuedAt < QUEUE_ENTRY_TTL_MS);
  anonymousDiscoveryQueue.set(remotePeerId, active);

  // Check again after filtering
  if (active.length >= MAX_QUEUE_SIZE_PER_PEER) {
    return false;
  }

  active.push(request);
  return true;
}

function dequeueDiscoveryRequest(peerId: string): QueuedDiscoveryRequest | undefined {
  const queue = anonymousDiscoveryQueue.get(peerId);
  if (!queue || queue.length === 0) {
    return undefined;
  }

  // Remove expired entries from front
  const now = Date.now();
  while (queue.length > 0 && now - queue[0]!.queuedAt >= QUEUE_ENTRY_TTL_MS) {
    queue.shift();
  }

  if (queue.length === 0) {
    return undefined;
  }

  return queue.shift();
}

export function getQueuedDiscoveryCount(): number {
  let total = 0;
  for (const queue of anonymousDiscoveryQueue.values()) {
    const now = Date.now();
    total += queue.filter((r) => now - r.queuedAt < QUEUE_ENTRY_TTL_MS).length;
  }
  return total;
}

export function clearExpiredQueueEntries(): number {
  let cleared = 0;
  const now = Date.now();

  for (const [peerId, queue] of anonymousDiscoveryQueue.entries()) {
    const active = queue.filter((r) => now - r.queuedAt < QUEUE_ENTRY_TTL_MS);
    if (active.length === 0) {
      anonymousDiscoveryQueue.delete(peerId);
      cleared += queue.length;
    } else if (active.length < queue.length) {
      anonymousDiscoveryQueue.set(peerId, active);
      cleared += queue.length - active.length;
    }
  }

  return cleared;
}

export async function handleInboundDiscoveryIntent(input: {
  envelope: EnvoyEnvelope;
  profile: NodeProfile;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: LocalTaskStore;
  trustStore: LocalTrustStore;
  capabilityManifest?: CapabilityManifest;
  anonymousDiscoveryMode?: "off" | "contacts-only" | "public-preview" | "public-auto-answer";
  anonymousIntentAllowlist?: readonly string[];
  anonymousSensitivityCeiling?: "public" | "friends";
  /** If true, this request came from the queue - bypass rate limit check */
  fromQueue?: boolean;
}): Promise<DiscoveryInboundResult> {
  const { envelope, profile, remotePeerId, receivedAt, correlationId, taskStore, trustStore, capabilityManifest, anonymousDiscoveryMode = "off", anonymousIntentAllowlist, anonymousSensitivityCeiling, fromQueue = false } = input;

  try {
    if (envelope.intent === "discovery.request") {
      const payload = parseDiscoveryRequestPayload(envelope.payload);
      const trustRecord = await trustStore.getTrustRecord(payload.requesterOwnerId);
      const trustLevel = trustRecord?.level ?? "public";

      // ─── Phase 8I: Anonymous discovery mode enforcement ────────────────────
      // Apply per-anonymous-peer rate limit for public callers
      if (trustLevel === "public") {
        // If fromQueue is true, this request was queued and is being processed - bypass rate limit
        // to allow the queue to drain even if the peer just made requests
        if (!fromQueue && !allowAnonRequest(remotePeerId, receivedAt)) {
          // Enqueue the request instead of denying - it's low priority but valid
          const queuedAt = Date.now();
          const queued: QueuedDiscoveryRequest = {
            envelope,
            profile,
            remotePeerId,
            receivedAt,
            correlationId,
            taskStore,
            trustStore,
            capabilityManifest,
            anonymousDiscoveryMode,
            anonymousIntentAllowlist,
            anonymousSensitivityCeiling,
            queuedAt,
          };

          const enqueued = enqueueDiscoveryRequest(queued);
          if (!enqueued) {
            const denyReason = "anonymous discovery queue is full for this peer";
            await auditDiscoveryDeny({ taskStore, envelope, remotePeerId, receivedAt, correlationId, trustLevel, reason: denyReason });
            return { ok: false, reason: denyReason };
          }

          const position = getQueuePosition(remotePeerId);
          return { ok: false, reason: "queued", queuedAt, queuePosition: position };
        }

        // Intent allowlist check — if set, only allow listed intents
        if (anonymousIntentAllowlist && anonymousIntentAllowlist.length > 0) {
          if (!anonymousIntentAllowlist.includes("discovery.request")) {
            // Silently drop — don't even audit
            return { ok: false, reason: "anonymous intent not allowed" };
          }
        }

        // Mode "off" — drop unknown/public callers silently
        if (anonymousDiscoveryMode === "off") {
          // Silently drop without audit to avoid information leakage
          return { ok: false, reason: "anonymous discovery is disabled" };
        }

        // Mode "contacts-only" — reject public callers
        if (anonymousDiscoveryMode === "contacts-only") {
          const denyReason = "anonymous discovery mode is contacts-only; public callers are rejected";
          await auditDiscoveryDeny({ taskStore, envelope, remotePeerId, receivedAt, correlationId, trustLevel, reason: denyReason });
          return { ok: false, reason: denyReason };
        }

        // For public-preview and public-auto-answer: apply anonymous sensitivity ceiling
        const effectiveCeiling = anonymousSensitivityCeiling ?? "public";
        const requestedSensitivity = payload.requestedSensitivity ?? "public";
        if (!sensitivityAllowed(requestedSensitivity, effectiveCeiling)) {
          const denyReason = `anonymous request sensitivity=${requestedSensitivity} exceeds mode ceiling=${effectiveCeiling}`;
          await auditDiscoveryDeny({ taskStore, envelope, remotePeerId, receivedAt, correlationId, trustLevel, reason: denyReason });
          return { ok: false, reason: denyReason };
        }
      }
      // ─── End Phase 8I ────────────────────────────────────────────────────

      if (trustLevel === "blocked") {
        const denyReason = "sender is blocked";
        await auditDiscoveryDeny({ taskStore, envelope, remotePeerId, receivedAt, correlationId, trustLevel, reason: denyReason });
        return { ok: false, reason: denyReason };
      }

      if (!allowRequest(payload.requesterOwnerId, receivedAt)) {
        const denyReason = "discovery.request rate limit exceeded for requesterOwnerId";
        await auditDiscoveryDeny({ taskStore, envelope, remotePeerId, receivedAt, correlationId, trustLevel, reason: denyReason });
        return { ok: false, reason: denyReason };
      }

      // If no manifest exists, fall back to legacy behavior (trust-level gate only)
      if (!capabilityManifest) {
        if (trustLevel === "public") {
          const denyReason = `discovery.request requires referred/direct trust (got ${trustLevel})`;
          await auditDiscoveryDeny({ taskStore, envelope, remotePeerId, receivedAt, correlationId, trustLevel, reason: denyReason });
          return { ok: false, reason: denyReason };
        }

        // Legacy capability matching against device certificate
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

        await auditDiscoveryMatch({
          taskStore,
          envelope,
          remotePeerId,
          receivedAt,
          correlationId,
          trustLevel,
          tagCount: payload.requestedTagHashes.length,
          capCount: payload.requestedCapabilities.length,
          matchCount: matches.length,
          hasManifest: false,
        });

        const responsePayload = createDiscoveryResponsePayload({
          requestMessageId: envelope.messageId,
          responderOwnerId: profile.owner.ownerId,
          matches: matches.slice(0, payload.maxResults),
          truncated: matches.length > payload.maxResults,
        });

        return { ok: true, responsePayload };
      }

      // --- Manifest-aware matching ---

      // 1. Visibility gate
      if (capabilityManifest.visibility === "contacts-only" && trustLevel === "public") {
        const denyReason = `manifest visibility=contacts-only rejects public trust requester`;
        await auditDiscoveryDeny({ taskStore, envelope, remotePeerId, receivedAt, correlationId, trustLevel, reason: denyReason, hasManifest: true });
        return { ok: false, reason: denyReason };
      }

      // 2. Sensitivity ceiling check (requests above ceiling are not answered)
      const requestedSensitivity = payload.requestedSensitivity ?? "public";
      if (!sensitivityAllowed(requestedSensitivity, capabilityManifest.sensitivityCeiling)) {
        const denyReason = `requested sensitivity=${requestedSensitivity} exceeds manifest ceiling=${capabilityManifest.sensitivityCeiling}`;
        await auditDiscoveryDeny({ taskStore, envelope, remotePeerId, receivedAt, correlationId, trustLevel, reason: denyReason, hasManifest: true });
        return { ok: false, reason: denyReason };
      }

      // 3. Capability matching against manifest
      const manifestCapabilities = capabilityManifest.capabilities;
      const matchedCapabilities = payload.requestedCapabilities.filter((capability) =>
        manifestCapabilities.includes(capability),
      );

      // 4. Keyword matching against manifest keywords
      const hasKeywordMatch = keywordsMatch(
        capabilityManifest.keywords,
        payload.requestedTagHashes,
      );

      const hasCapabilityMatch = matchedCapabilities.length > 0;
      const hasTagMatch = payload.requestedTagHashes.length > 0;

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

      await auditDiscoveryMatch({
        taskStore,
        envelope,
        remotePeerId,
        receivedAt,
        correlationId,
        trustLevel,
        tagCount: payload.requestedTagHashes.length,
        capCount: payload.requestedCapabilities.length,
        matchCount: matches.length,
        hasManifest: true,
        manifestVisibility: capabilityManifest.visibility,
        sensitivityCeiling: capabilityManifest.sensitivityCeiling,
      });

      const responsePayload = createDiscoveryResponsePayload({
        requestMessageId: envelope.messageId,
        responderOwnerId: profile.owner.ownerId,
        matches: matches.slice(0, payload.maxResults),
        truncated: matches.length > payload.maxResults,
      });

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
      await taskStore.appendDiscoveryEvent(
        createDiscoveryEvent({
          direction: "inbound",
          intent: "discovery.response",
          ownerId: payload.responderOwnerId,
          remotePeerId,
          correlationId,
          requestMessageId: payload.requestMessageId,
          matchedTagHashes: payload.matches.flatMap((match) => match.matchedTagHashes),
          matchedCapabilities: payload.matches.flatMap((match) => match.matchedCapabilities),
          matchCount: payload.matches.length,
          outcome: "record",
          summary: `discovery.response received with ${payload.matches.length} match(es)`,
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

export async function handleInboundRelayPeersIntent(input: {
  envelope: EnvoyEnvelope;
  profile: NodeProfile;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: LocalTaskStore;
  relayPeerIds: string[];
  relayMultiaddrs: string[];
}): Promise<RelayPeersInboundResult> {
  const { envelope, profile, remotePeerId, receivedAt, correlationId, taskStore, relayPeerIds, relayMultiaddrs } =
    input;

  try {
    if (envelope.intent === "relay.peers.request") {
      // Build list of other peers connected via this relay (exclude the requester)
      const otherPeers = relayPeerIds
        .filter((pid) => pid !== remotePeerId)
        .map<RelayPeerInfo>((peerId) => ({
          peerId,
          ownerId: "unknown", // Relay doesn't track ownerId; requester should query DHT or send signal
          multiaddrs: buildRelayCircuitMultiaddrs(relayMultiaddrs, peerId),
        }));

      console.log(`[relay-tracked] relay.peers.request from ${remotePeerId}, returning ${otherPeers.length} peers: ${otherPeers.map(p => p.peerId).join(", ")}`);

      const { createRelayPeersResponsePayload } = await import("@envoymesh/protocol");
      const responsePayload = createRelayPeersResponsePayload({
        requestMessageId: envelope.messageId,
        peers: otherPeers,
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
          summary: `relay.peers.request: returning ${otherPeers.length} relay-connected peer(s)`,
          createdAt: envelope.createdAt,
        }),
      );

      return { ok: true, responsePayload };
    }

    if (envelope.intent === "relay.peers.response") {
      const { parseRelayPeersResponsePayload } = await import("@envoymesh/protocol");
      const payload = parseRelayPeersResponsePayload(envelope.payload);
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
          summary: `relay.peers.response: received ${payload.peers.length} relay peer(s)`,
          createdAt: envelope.createdAt,
        }),
      );
      return { ok: true };
    }

    return { ok: false, reason: "not a relay.peers intent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `invalid relay.peers payload: ${message}` };
  }
}

export function buildRelayCircuitMultiaddrs(relayMultiaddrs: string[], targetPeerId: string): string[] {
  const circuitAddrs = relayMultiaddrs
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0 && !addr.includes("/p2p-circuit"))
    .filter((addr) => addr.includes("/p2p/"))
    .map((addr) => `${addr}/p2p-circuit/p2p/${targetPeerId}`);

  return [...new Set(circuitAddrs)];
}

/**
 * Relay lookup returns `/p2p-circuit/` multiaddrs built from the relay's advertised/listen bases.
 * Those may be private (VPC) or loopback while clients actually reach the relay via a **public**
 * bootstrap multiaddr. Produce dial candidates: for each known seed that targets the same relay
 * id, `seed + /p2p-circuit/p2p/<target>`, then the original addr (deduped). Prefer trying seeds first.
 */
export function expandCircuitDialCandidates(circuitAddr: string, relaySeedMultiaddrs: string[]): string[] {
  const trimmed = circuitAddr.trim();
  if (!trimmed || relaySeedMultiaddrs.length === 0 || !trimmed.includes("/p2p-circuit/p2p/")) {
    return dedupeCircuitAddrs([trimmed].filter(Boolean));
  }

  const parts = trimmed.split("/p2p-circuit/p2p/");
  if (parts.length < 2 || !parts[1]) {
    return dedupeCircuitAddrs([trimmed]);
  }

  const relayBase = parts[0]!;
  const targetPeerId = parts[1]!.split("/")[0]!.trim();
  if (!targetPeerId) {
    return dedupeCircuitAddrs([trimmed]);
  }

  const relayIdMatch = relayBase.match(/\/p2p\/([^/]+)$/);
  const relayId = relayIdMatch?.[1];
  if (!relayId) {
    return dedupeCircuitAddrs([trimmed]);
  }

  const alternates: string[] = [];
  for (const raw of relaySeedMultiaddrs) {
    const seed = raw.trim().replace(/\/$/, "");
    if (!seed || seed.includes("/p2p-circuit")) {
      continue;
    }
    if (!seed.includes(`/p2p/${relayId}`)) {
      continue;
    }
    alternates.push(`${seed}/p2p-circuit/p2p/${targetPeerId}`);
  }

  return dedupeCircuitAddrs([...alternates, trimmed]);
}

function dedupeCircuitAddrs(addrs: string[]): string[] {
  return [...new Set(addrs.map((a) => a.trim()).filter(Boolean))];
}

async function auditDiscoveryDeny(input: {
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
      summary: `discovery.request denied: ${reason}${hasManifest ? " [manifest]" : " [legacy]"}`,
      createdAt: envelope.createdAt,
    }),
  );
}

async function auditDiscoveryMatch(input: {
  taskStore: LocalTaskStore;
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  trustLevel: string;
  tagCount: number;
  capCount: number;
  matchCount: number;
  hasManifest: boolean;
  manifestVisibility?: string;
  sensitivityCeiling?: string;
}): Promise<void> {
  const { taskStore, envelope, remotePeerId, receivedAt, correlationId, trustLevel, tagCount, capCount, matchCount, hasManifest, manifestVisibility, sensitivityCeiling } = input;
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
      summary: `discovery.request matched=${matchCount} trust=${trustLevel}${hasManifest ? ` visibility=${manifestVisibility ?? "?"} ceiling=${sensitivityCeiling ?? "?"}` : " [legacy]"} tags=${tagCount} caps=${capCount}`,
      createdAt: envelope.createdAt,
    }),
  );
  await taskStore.appendDiscoveryEvent(
    createDiscoveryEvent({
      direction: "inbound",
      intent: "discovery.request",
      ownerId: parseDiscoveryRequestPayload(envelope.payload).requesterOwnerId,
      remotePeerId,
      correlationId,
      requestMessageId: envelope.messageId,
      requestedTagHashes: [],
      requestedCapabilities: [],
      matchedTagHashes: [],
      matchedCapabilities: [],
      matchCount,
      trustLevel: trustLevel as "direct" | "referred" | "public" | "blocked",
      outcome: "allow",
      summary: `discovery.request matched=${matchCount}`,
      createdAt: envelope.createdAt,
    }),
  );
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

/**
 * Per-remotePeerId rate limit for anonymous/public discovery requests.
 * Anonymous callers get a tighter budget (ANON_RATE_LIMIT_MAX_REQUESTS per window).
 */
function allowAnonRequest(remotePeerId: string, receivedAt: number): boolean {
  const windowStart = receivedAt - ANON_RATE_LIMIT_WINDOW_MS;
  const history = anonDiscoveryRate.get(remotePeerId) ?? [];
  const active = history.filter((timestamp) => timestamp >= windowStart);
  if (active.length >= ANON_RATE_LIMIT_MAX_REQUESTS) {
    anonDiscoveryRate.set(remotePeerId, active);
    return false;
  }
  active.push(receivedAt);
  anonDiscoveryRate.set(remotePeerId, active);
  return true;
}

/**
 * Process queued anonymous discovery requests.
 *
 * Each call drains up to one request per peer (FIFO), processing them with
 * `fromQueue=true` to bypass the rate limit check. This allows the queue to
 * drain gradually without starving the peer's new requests.
 *
 * Returns an array of processed requests with their results. The caller (index.ts)
 * is responsible for sending discovery.response for successful results.
 */
export async function processDiscoveryQueue(
  // Mesh interface needed to send responses back to peers
  meshInterface: {
    send: (peerId: string, envelope: EnvoyEnvelope) => Promise<number>;
  },
): Promise<Array<{
  request: QueuedDiscoveryRequest;
  result: DiscoveryInboundResult;
}>> {
  const processed: Array<{
    request: QueuedDiscoveryRequest;
    result: DiscoveryInboundResult;
  }> = [];

  // Get all peers with queued requests
  const peerIds = Array.from(anonymousDiscoveryQueue.keys());

  for (const remotePeerId of peerIds) {
    const queued = dequeueDiscoveryRequest(remotePeerId);
    if (!queued) {
      continue;
    }

    // Process the queued request with fromQueue=true to bypass rate limit
    const result = await handleInboundDiscoveryIntent({
      envelope: queued.envelope,
      profile: queued.profile,
      remotePeerId: queued.remotePeerId,
      receivedAt: queued.receivedAt,
      correlationId: queued.correlationId,
      taskStore: queued.taskStore,
      trustStore: queued.trustStore,
      capabilityManifest: queued.capabilityManifest,
      anonymousDiscoveryMode: queued.anonymousDiscoveryMode,
      anonymousIntentAllowlist: queued.anonymousIntentAllowlist,
      anonymousSensitivityCeiling: queued.anonymousSensitivityCeiling,
      fromQueue: true,
    });

    // If successful, send the discovery.response back to the peer
    if (result.ok && result.responsePayload) {
      const unsignedResponse = createUnsignedEnvelope({
        senderPeerId: derivePeerId(queued.profile.device.publicKeyPem),
        senderPublicKey: queued.profile.device.publicKeyPem,
        recipientPeerId: queued.envelope.senderPeerId,
        intent: "discovery.response",
        payload: createDiscoveryResponsePayload(result.responsePayload),
        correlationId: queued.correlationId,
      });

      // Import signUnsignedEnvelope dynamically to avoid circular deps
      const { signUnsignedEnvelope } = await import("@envoymesh/identity");
      const signedResponse = signUnsignedEnvelope(unsignedResponse, queued.profile.device.privateKeyPem);

      try {
        await meshInterface.send(queued.remotePeerId, signedResponse);
      } catch (err) {
        console.warn(`[discovery-queue] failed to send response to ${queued.remotePeerId}:`, err);
      }
    }

    processed.push({ request: queued, result });

    // Only process one per peer per call to avoid monopolizing
    // The caller should call this periodically to drain the queue
  }

  return processed;
}
