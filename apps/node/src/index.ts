import "./dom-event-polyfill.js";
import { evaluateCapability } from "@envoymesh/bonds";
import {
  auditEventForDispatcherDecision,
  buildRelayManagerSnapshot,
  createApprovalRequest,
  createAuditEvent,
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  createRelayStateStore,
  createTaskRuntimeStateStore,
  deriveCorrelationIdFromEnvelope,
  loadOrCreateNodeProfile,
  RELAY_MANAGER_SNAPSHOT_PROTOCOL,
  saveNodeProfile,
  serializeRelayManagerSnapshot,
  type PersistedRelayBookEntry,
  type PersistedRelaySummaryEntry,
  type RelayManagerRuntimeState,
} from "@envoymesh/local-store";
import {
  createSignedDataTransferVoucher,
  derivePeerId,
  signHumanProfile,
  signUnsignedEnvelope,
  verifyAuthorizedDeviceEnvelope,
  verifyDeviceCertificate,
  verifyHumanProfile,
} from "@envoymesh/identity";
import {
  DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME,
  ENVOY_CHAT_PROTOCOL,
  ENVOY_DATA_PROTOCOL,
  ENVOY_MESSAGE_PROTOCOL,
  EnvoyMesh,
  voucherJsonBytesFromObject,
  type P2pDebugEvent,
} from "@envoymesh/network";
import {
  createDiscoveryResponsePayload,
  createDevicePairApprovePayload,
  createDevicePairDeferredPayload,
  createRelayCheckinPayload,
  createRelayHintsResponsePayload,
  createRelayJoinResponsePayload,
  createRelayLookupPayload,
  createRelayLookupResponsePayload,
  createRelayRegisterResponsePayload,
  createRelaySummaryPayload,
  createTaskCancelPayload,
  createUnsignedDataTransferVoucher,
  parseDevicePairApprovePayload,
  parseDevicePairDeferredPayload,
  parseDevicePairRequestPayload,
  parseChatMessagePayload,
  parseRelayCheckinPayload,
  parseRelayHintsRequestPayload,
  parseRelayHintsResponsePayload,
  parseRelayJoinRequestPayload,
  parseRelayLookupPayload,
  parseRelayLookupResponsePayload,
  parseRelayPeersResponsePayload,
  parseRelayRegisterPayload,
  parseRelaySummaryPayload,
  createSystemPingPayload,
  createSystemSignalPayload,
  createUnsignedEnvelope,
  createHumanProfilePayload,
  humanProfileForSigning,
  parseSystemPingPayload,
  parseSystemSignalPayload,
  parseTaskCancelPayload,
  type EnvoyEnvelope,
  type RelayHint,
  type RelayLookupPayload,
  type RelayLookupResponsePayload,
  type RelayPeerCandidate,
  type HumanProfilePayload,
} from "@envoymesh/protocol";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseNodeArgs } from "./args.js";
import { buildOutboundCliEnvelopes } from "./cli-actions.js";
import { createInboundMessageGuard } from "./inbound-guard.js";
import { handleInboundBondIntent } from "./bond-inbound.js";
import { handleInboundDiscoveryIntent, handleInboundRelayPeersIntent, expandCircuitDialCandidates } from "./discovery-inbound.js";
import { handleInboundKnowledgeQuery } from "./knowledge-query-inbound.js";
import { resolveNodeArgsTargetsByOwnerId } from "./owner-targeting.js";
import { createTaskDispatcher, isA2ATaskIntent, type DispatcherDecision } from "./task-dispatcher.js";
import { applyTaskRuntimeAfterHandled, guardInboundTaskRuntime } from "./task-runtime-guard.js";
import { installEnvoyDataTransferReceiver } from "./data-transfer-inbound.js";
import { createNodeService } from "./node-service-impl.js";
import { WsServer } from "./ws-server.js";
import { evaluateInboundEnvelopeRolePolicy } from "./role-policy.js";
import { createDiscoverySeedStore } from "./discovery-seed-store.js";
import { resolveBootstrapAddresses } from "./bootstrap-resolver.js";
import {
  addRelayCandidates,
  createRelayClientState,
  createRelayRoster,
  noteRelayFailure,
  noteRelaySuccess,
} from "./relay-roster.js";
import { createRelayLookupRouter } from "./relay-lookup-router.js";
import { logRelayReachableAddrsForCheckin, logRelayServerCheckinAccepted, logRelayServerLookupResponse, logClientRelayLookupResponse, describeMultiaddrReachability } from "./relay-checkin-log.js";
import {
  createInitialRelayHealthState,
  evaluateRelayHealth,
  type RelayHealthSnapshot,
  type RelayHealthState,
} from "./relay-health.js";

const args = parseNodeArgs(process.argv.slice(2));
const profile = await loadOrCreateNodeProfile(args.profileDir);
const taskDispatcher = createTaskDispatcher();
const taskStore = createLocalTaskStore(args.profileDir);
const trustStore = createLocalTrustStore(args.profileDir);
const peerDirectoryStore = createLocalPeerDirectoryStore(args.profileDir);
const discoverySeedStore = createDiscoverySeedStore(args.profileDir);
const taskRuntimeStore = createTaskRuntimeStateStore(args.profileDir);
const resolvedArgs = await resolveNodeArgsTargetsByOwnerId(args, peerDirectoryStore);
const inboundGuard = createInboundMessageGuard();
const vaultDirForNode = process.env.ENVOYMESH_VAULT ?? join(process.cwd(), "shared_vault");

// WebSocket server reference for event emission
let wsServerForEvents: WsServer | null = null;
const peerDirectoryRecords = await peerDirectoryStore.listPeerRecords();
const peerDirectorySeedAddrs = peerDirectoryRecords.flatMap((record) => record.listenAddrs);
const persistedSeedAddrs = await discoverySeedStore.listSeedAddrs();

// Resolve domain-based bootstrap addresses to multiaddrs
const resolvedBootstrapResults = await resolveBootstrapAddresses(args.bootstrapPeers);
const resolvedBootstrapPeers = resolvedBootstrapResults.flatMap((r) => r.resolved);

const effectiveBootstrapPeers = dedupeAddrs([
  ...resolvedBootstrapPeers,
  ...peerDirectorySeedAddrs,
  ...persistedSeedAddrs,
]);
const libp2pPrivateKeyPath = join(args.profileDir, DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME);
const mesh = new EnvoyMesh({
  listen: args.listen,
  enableMdns: args.enableMdns,
  enableDht: true, // Always enable DHT for topic-based discovery (wan-default always uses DHT)
  dhtClientMode: args.dhtClientMode ?? true,
  bootstrapPeers: effectiveBootstrapPeers,
  enableRelay: args.enableRelay,
  enableRelayServer: args.enableRelayServer,
  enableAutoNat: args.enableAutoNat,
  enableDcutr: args.enableDcutr,
  enableQuic: args.enableQuic,
  enableP2pDebug: args.p2pDebug,
  enableRelayDebugSummary: args.relayDebugSummary,
  libp2pPrivateKeyPath,
  onP2pDebug: (event) => {
    void appendP2pTrace(event);
  },
});
if (args.p2pDebug) {
  console.log(
    `[p2p-debug] relay periodic SUMMARY logs: ${args.relayDebugSummary ? "on" : "off"} (enable with --relay-debug-summary or ENVOYMESH_RELAY_DEBUG_SUMMARY=1)`,
  );
}
const connectivityWarnings: string[] = [];
const bootstrapProbeResults: Array<{ peer: string; ok: boolean; latencyMs?: number; error?: string }> = [];
const MAX_BOOTSTRAP_PROBE_RESULTS = 512;
const BOOTSTRAP_REPROBE_INTERVAL_MS = 60_000;
const BOOTSTRAP_REPROBE_JITTER_MS = 15_000;
const CAPABILITY_DISCOVERY_INTERVAL_MS = 90_000;
const CAPABILITY_DISCOVERY_JITTER_MS = 20_000;
const CAPABILITY_DISCOVERY_QUERY_TIMEOUT_MS = 6_000;
const CAPABILITY_DISCOVERY_MAX_PROVIDERS = 32;
const RELAY_PEERS_QUERY_INTERVAL_MS = 30_000;
const RELAY_PEERS_QUERY_JITTER_MS = 7_500;
const RELAY_CHECKIN_INTERVAL_MS = 30_000;
const RELAY_LOOKUP_INTERVAL_MS = 30_000;
/** Client relay.lookup uses same-stream reply; allow slow paths. */
const RELAY_LOOKUP_REPLY_TIMEOUT_MS = 30_000;
const RELAY_SUMMARY_INTERVAL_MS = 60_000;
const RELAY_CONTROL_TTL_MS = 90_000;
/** Child relay relay.lookup forward: read reply on same stream (per-hop). */
const RELAY_FORWARD_LOOKUP_REPLY_MS = 12_000;
const RELAY_MANAGER_SNAPSHOT_INTERVAL_MS = 30_000;
const RELAY_HEALTH_INTERVAL_MS = 30_000;
let bootstrapReprobeTimer: ReturnType<typeof setTimeout> | undefined;
let bootstrapReprobeCursor = 0;
let capabilityDiscoveryTimer: ReturnType<typeof setTimeout> | undefined;
let relayPeersQueryTimer: ReturnType<typeof setTimeout> | undefined;
let relayCheckinTimer: ReturnType<typeof setTimeout> | undefined;
let relayLookupTimer: ReturnType<typeof setTimeout> | undefined;
let relaySummaryTimer: ReturnType<typeof setTimeout> | undefined;
let relayManagerSnapshotTimer: ReturnType<typeof setTimeout> | undefined;
let relayHealthTimer: ReturnType<typeof setTimeout> | undefined;
const processStartedAt = Date.now();

if (args.discoveryProfile === "wan-default" && effectiveBootstrapPeers.length === 0) {
  connectivityWarnings.push(
    "wan-default selected without bootstrap peers; DHT/relay are enabled but discovery may be limited. Configure --bootstrap or ENVOYMESH_BOOTSTRAP_PEERS.",
  );
}

const autoCapabilityTopics = buildAutoCapabilityTopics(profile.deviceCertificate.capabilities);
const observedRelayPeerIds = new Set<string>();
const relayStateStore = createRelayStateStore(args.profileDir);
const [persistedRelayBook, persistedSummaries] = await Promise.all([
  relayStateStore.loadRelayBook(),
  relayStateStore.loadRelaySummaries(),
]);
if (persistedRelayBook.length > 0 || persistedSummaries.length > 0) {
  console.log(
    `[relay-state] restored relay_book=${persistedRelayBook.length} summaries=${persistedSummaries.length}`,
  );
}
const relayRoster = createRelayRoster({
  persistedRelayBook,
  persistedSummaries: persistedSummaries.map((e) => ({
    relayId: e.relayId,
    summary: {
      relayId: e.relayId,
      level: e.level,
      region: e.region,
      childRelayCount: e.childRelayCount,
      livePeerCount: e.livePeerCount,
      topicBuckets: e.topicBuckets,
      expiresAt: new Date(e.expiresAt).toISOString(),
    },
    lastSeenAt: e.lastSeenAt,
    expiresAt: e.expiresAt,
  })),
});
const relayClientState = createRelayClientState(effectiveBootstrapPeers.map(relayHintFromAddr));
const relayLookupRouter = createRelayLookupRouter();
let relayHealthState: RelayHealthState = createInitialRelayHealthState();
let relayHealthSnapshot: RelayHealthSnapshot | undefined;

mesh.onPeerDiscovered(async (peer) => {
  const source = peer.multiaddrs.some((addr) => addr.includes("/p2p-circuit")) ? "relay" : "unknown";
  if (args.peerDiscoveryLog) {
    console.log(`[peer-discovery] peer=${peer.peerId} source=${source} addrs=${peer.multiaddrs.length}`);
  }
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "p2p.trace",
      remotePeerId: peer.peerId,
      direction: "inbound",
      protocol: "peer.discovery",
      outcome: "record",
      summary: `discovery peer=${peer.peerId} source=${source} addrs=${peer.multiaddrs.length}`,
    }),
  );
  if (peer.multiaddrs.length > 0) {
    await discoverySeedStore.upsertMany(peer.multiaddrs, "peer.discovery");
  }
});

mesh.onMessage(async ({ envelope: inboundEnvelope, remotePeerId, replyWithEnvelope }) => {
  const receivedAt = Date.now();
  const guardDecision = inboundGuard.inspect(inboundEnvelope);

  if (guardDecision.action === "reject") {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.rejected",
        intent: inboundEnvelope.intent,
        messageId: guardDecision.messageId ?? inboundEnvelope.messageId,
        correlationId: inboundEnvelope.correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "rejected",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: `Rejected message: ${guardDecision.reason}.`,
        createdAt: inboundEnvelope.createdAt,
      }),
    );
    console.warn(
      `[rejected] ${inboundEnvelope.intent} from ${inboundEnvelope.senderPeerId} via libp2p peer ${remotePeerId}: ${guardDecision.reason}`,
    );
    return;
  }

  const envelope = guardDecision.envelope;
  const correlationId = deriveCorrelationIdFromEnvelope(envelope);
  const rolePolicyDecision = evaluateInboundEnvelopeRolePolicy(envelope);
  if (!rolePolicyDecision.ok) {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.rejected",
        intent: envelope.intent,
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "rejected",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: `Rejected by role policy: ${rolePolicyDecision.reason}.`,
        createdAt: envelope.createdAt,
      }),
    );
    console.warn(`[rejected role policy] ${envelope.intent}: ${rolePolicyDecision.reason}`);
    return;
  }

  if (envelope.intent === "system.signal") {
    const payload = parseSystemSignalPayload(envelope.payload);
    const authorized = verifyAuthorizedDeviceEnvelope(
      envelope,
      payload.deviceCertificate,
      payload.ownerPublicKeyPem,
    );
    const capabilityDecision = evaluateCapability(envelope.intent, payload.capabilities);

    if (!authorized) {
      console.warn(
        `[rejected signal] from ${payload.ownerId}/${payload.deviceId} via libp2p peer ${remotePeerId}: unauthorized device`,
      );
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: "Rejected signal: unauthorized device certificate.",
          createdAt: envelope.createdAt,
        }),
      );
      return;
    }

    if (capabilityDecision.action === "deny") {
      console.warn(
        `[rejected signal] from ${payload.ownerId}/${payload.deviceId}: ${capabilityDecision.reason}`,
      );
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: `Rejected signal: ${capabilityDecision.reason}`,
          createdAt: envelope.createdAt,
        }),
      );
      return;
    }

    console.log(
      `[verified signal] owner=${payload.ownerId} device=${payload.deviceId} profile=${payload.deviceProfile} capabilities=${payload.capabilities.join(",")}`,
    );
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
        summary: `Verified signal for owner ${payload.ownerId}.`,
        createdAt: envelope.createdAt,
      }),
    );
    await peerDirectoryStore.upsertPeerFromSignal({
      peerId: envelope.senderPeerId,
      payload,
      seenAt: envelope.createdAt,
    });
    return;
  }

  if (envelope.intent === "system.ping") {
    const payload = parseSystemPingPayload(envelope.payload);
    console.log(
      `[verified ping] from ${envelope.senderPeerId} via libp2p peer ${remotePeerId}: ${payload.message ?? payload.nonce}`,
    );
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
        summary: "Verified ping message.",
        createdAt: envelope.createdAt,
      }),
    );
    return;
  }

  if (envelope.intent === "knowledge.query") {
    const kq = await handleInboundKnowledgeQuery({
      envelope,
      remotePeerId,
      receivedAt,
      correlationId,
      taskStore,
    });
    if (!kq.ok) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: `Rejected knowledge.query: ${kq.reason}.`,
          createdAt: envelope.createdAt,
        }),
      );
      console.warn(`[rejected knowledge.query] ${kq.reason}`);
      return;
    }
    return;
  }

  if (envelope.intent === "discovery.request" || envelope.intent === "discovery.response") {
    const discovery = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId,
      receivedAt,
      correlationId,
      taskStore,
      trustStore,
    });
    if (!discovery.ok) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: `Rejected ${envelope.intent}: ${discovery.reason}.`,
          createdAt: envelope.createdAt,
        }),
      );
      console.warn(`[rejected discovery] ${envelope.intent}: ${discovery.reason}`);
      return;
    }

    if (envelope.intent === "discovery.request" && discovery.responsePayload) {
      const unsignedResponse = createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        recipientPeerId: envelope.senderPeerId,
        intent: "discovery.response",
        payload: createDiscoveryResponsePayload(discovery.responsePayload),
        correlationId,
      });
      const signedResponse = signUnsignedEnvelope(unsignedResponse, profile.device.privateKeyPem);
      const latencyMs = await mesh.send(remotePeerId, signedResponse);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.sent",
          intent: signedResponse.intent,
          messageId: signedResponse.messageId,
          correlationId: signedResponse.correlationId,
          remotePeerId,
          direction: "outbound",
          latencyMs,
          protocol: ENVOY_MESSAGE_PROTOCOL,
          outcome: "record",
          summary: `Sent discovery.response for ${envelope.messageId}.`,
          createdAt: signedResponse.createdAt,
        }),
      );
      await taskStore.appendDiscoveryEvent({
        version: "0.1",
        eventId: `discovery_${signedResponse.messageId}`,
        createdAt: signedResponse.createdAt,
        direction: "outbound",
        intent: "discovery.response",
        ownerId: profile.owner.ownerId,
        remotePeerId,
        correlationId: signedResponse.correlationId,
        requestMessageId: envelope.messageId,
        matchCount: discovery.responsePayload.matches.length,
        requestedTagHashes: [],
        requestedCapabilities: [],
        matchedTagHashes: discovery.responsePayload.matches.flatMap((match) => match.matchedTagHashes),
        matchedCapabilities: discovery.responsePayload.matches.flatMap(
          (match) => match.matchedCapabilities,
        ),
        outcome: "record",
        summary: `Sent discovery.response with ${discovery.responsePayload.matches.length} match(es).`,
      });
    }
    return;
  }

  if (
    envelope.intent === "relay.checkin" ||
    envelope.intent === "relay.lookup" ||
    envelope.intent === "relay.lookup.response" ||
    envelope.intent === "relay.hints.request" ||
    envelope.intent === "relay.hints.response" ||
    envelope.intent === "relay.join.request" ||
    envelope.intent === "relay.register" ||
    envelope.intent === "relay.summary"
  ) {
    await handleRelayControlEnvelope({
      envelope,
      remotePeerId,
      receivedAt,
      correlationId,
      replyWithEnvelope,
    });
    return;
  }

  if (envelope.intent === "relay.peers.request" || envelope.intent === "relay.peers.response") {
    if (envelope.intent === "relay.peers.request") {
      observedRelayPeerIds.add(remotePeerId);
    }
    const relayPeerIds = dedupeAddrs([...mesh.getConnectedRelayPeerIds(), ...observedRelayPeerIds]);
    console.log(
      `[mac-relay] received ${envelope.intent} from ${remotePeerId}, relayPeerIds=${JSON.stringify(relayPeerIds)}`,
    );
    const relayPeers = await handleInboundRelayPeersIntent({
      envelope,
      profile,
      remotePeerId,
      receivedAt,
      correlationId,
      taskStore,
      relayPeerIds,
      relayMultiaddrs: relayDialMultiaddrsForCircuitRelay(mesh, args.advertiseAddrs),
    });
    if (!relayPeers.ok) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: `Rejected ${envelope.intent}: ${relayPeers.reason}.`,
          createdAt: envelope.createdAt,
        }),
      );
      console.warn(`[rejected relay.peers] ${envelope.intent}: ${relayPeers.reason}`);
      return;
    }

    if (envelope.intent === "relay.peers.response") {
      const payload = parseRelayPeersResponsePayload(envelope.payload);
      const relayedAddrs = dedupeAddrs(payload.peers.flatMap((peer) => peer.multiaddrs));
      if (relayedAddrs.length > 0) {
        await discoverySeedStore.upsertMany(relayedAddrs, "relay-peers");
        for (const addr of relayedAddrs) {
          try {
            await mesh.dial(addr);
            await taskStore.appendAuditEvent(
              createAuditEvent({
                type: "p2p.trace",
                direction: "outbound",
                protocol: "relay.peers.dial.ok",
                remotePeerId: addr,
                outcome: "record",
                summary: `relay peer dial ok addr=${addr}`,
              }),
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await taskStore.appendAuditEvent(
              createAuditEvent({
                type: "p2p.trace",
                direction: "outbound",
                protocol: "relay.peers.dial.fail",
                remotePeerId: addr,
                outcome: "record",
                summary: `relay peer dial failed addr=${addr} error=${message}`,
              }),
            );
          }
        }
      }
    }

    if (envelope.intent === "relay.peers.request" && relayPeers.responsePayload) {
      const unsignedResponse = createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        recipientPeerId: envelope.senderPeerId,
        intent: "relay.peers.response",
        payload: relayPeers.responsePayload,
        correlationId,
      });
      const signedResponse = signUnsignedEnvelope(unsignedResponse, profile.device.privateKeyPem);
      const latencyMs = await mesh.send(remotePeerId, signedResponse);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.sent",
          intent: signedResponse.intent,
          messageId: signedResponse.messageId,
          correlationId: signedResponse.correlationId,
          remotePeerId,
          direction: "outbound",
          latencyMs,
          protocol: ENVOY_MESSAGE_PROTOCOL,
          outcome: "record",
          summary: `Sent relay.peers.response with ${relayPeers.responsePayload.peers.length} peer(s).`,
          createdAt: signedResponse.createdAt,
        }),
      );
    }
    return;
  }

  if (envelope.intent === "chat.message") {
    const payload = parseChatMessagePayload(envelope.payload);
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
        summary: `chat.message from ${payload.senderOwnerId}: ${payload.text.slice(0, 120)}`,
        createdAt: envelope.createdAt,
      }),
    );
    console.log(`[chat.message] ${payload.senderOwnerId}: ${payload.text}`);

    // Emit chat:message event to connected apps via WebSocket
    if (wsServerForEvents) {
      // Look up sender's displayName from peer directory
      const senderPeer = (await peerDirectoryStore.listPeerRecords()).find(
        (r) => r.ownerId === payload.senderOwnerId,
      );
      wsServerForEvents.emitEvent("chat:message", {
        messageId: envelope.messageId,
        sender: {
          nodeId: envelope.senderPeerId,
          displayName: senderPeer?.ownerId ?? payload.senderOwnerId,
        },
        recipient: {
          nodeId: mesh.peerId,
        },
        content: {
          text: payload.text,
        },
        metadata: {
          timestamp: envelope.createdAt,
          deliveryReceipt: "delivered" as const,
        },
        signature: envelope.signature,
      });
    }
    return;
  }

  if (envelope.intent === "device.pair.request") {
    const payload = parseDevicePairRequestPayload(envelope.payload);
    const expectedRequester = derivePeerId(payload.requesterDevicePublicKeyPem);
    if (expectedRequester !== envelope.senderPeerId) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: "device.pair.request",
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: "Rejected device.pair.request: sender does not match requester device key.",
          createdAt: envelope.createdAt,
        }),
      );
      return;
    }

    const context = Buffer.from(
      JSON.stringify({
        requestId: payload.requestId,
        requesterPeerId: envelope.senderPeerId,
        requesterOwnerId: payload.requesterOwnerId,
        requesterDeviceId: payload.requesterDeviceId,
        requesterDevicePublicKeyPem: payload.requesterDevicePublicKeyPem,
        requestedDeviceProfile: payload.requestedDeviceProfile,
        requestedCapabilities: payload.requestedCapabilities,
      }),
      "utf8",
    ).toString("base64url");

    await taskStore.appendApprovalRequest(
      createApprovalRequest({
        ownerId: profile.owner.ownerId,
        taskId: `pairing:${payload.requestId}`,
        requestedAction: "device.sync",
        reason: `Pairing request from ${payload.requesterOwnerId}/${payload.requesterDeviceId}. ${payload.note ?? ""}\nPAIRING_CONTEXT:${context}`,
        peerOwnerId: payload.requesterOwnerId,
        peerDeviceId: payload.requesterDeviceId,
      }),
    );
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: "device.pair.request",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "allow",
        summary: `Queued pairing approval for request ${payload.requestId}.`,
        createdAt: envelope.createdAt,
      }),
    );

    if (profile.deviceCertificate.deviceProfile !== "primary") {
      const deferredEnvelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          recipientPeerId: envelope.senderPeerId,
          intent: "device.pair.deferred",
          payload: createDevicePairDeferredPayload({
            requestId: payload.requestId,
            deferredByDeviceId: profile.device.deviceId,
            reason: "Primary device approval required; request deferred.",
          }),
          correlationId,
        }),
        profile.device.privateKeyPem,
      );
      const latencyMs = await mesh.send(remotePeerId, deferredEnvelope);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.sent",
          intent: "device.pair.deferred",
          messageId: deferredEnvelope.messageId,
          correlationId: deferredEnvelope.correlationId,
          remotePeerId,
          direction: "outbound",
          latencyMs,
          protocol: ENVOY_MESSAGE_PROTOCOL,
          outcome: "record",
          summary: `Sent pairing defer notice for ${payload.requestId}.`,
          createdAt: deferredEnvelope.createdAt,
        }),
      );
    }
    return;
  }

  if (envelope.intent === "device.pair.approve") {
    const payload = parseDevicePairApprovePayload(envelope.payload);
    const cert = payload.deviceCertificate;
    if (
      cert.deviceId !== profile.device.deviceId ||
      cert.ownerId !== profile.owner.ownerId ||
      !verifyDeviceCertificate(cert, profile.owner.publicKeyPem)
    ) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: "device.pair.approve",
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: "Rejected device.pair.approve: certificate mismatch or invalid signature.",
          createdAt: envelope.createdAt,
        }),
      );
      return;
    }

    await saveNodeProfile(args.profileDir, { ...profile, deviceCertificate: cert });
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: "device.pair.approve",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "allow",
        summary: `Applied paired device certificate for request ${payload.requestId}.`,
        createdAt: envelope.createdAt,
      }),
    );
    console.log(`[pairing approved] request=${payload.requestId}`);
    return;
  }

  if (envelope.intent === "device.pair.deferred") {
    const payload = parseDevicePairDeferredPayload(envelope.payload);
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: "device.pair.deferred",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "record",
        summary: `Pairing request ${payload.requestId} deferred: ${payload.reason}`,
        createdAt: envelope.createdAt,
      }),
    );
    return;
  }

  if (
    envelope.intent === "bond.request" ||
    envelope.intent === "bond.challenge" ||
    envelope.intent === "bond.challenge.response"
  ) {
    const bond = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId,
      receivedAt,
      correlationId,
      taskStore,
      trustStore,
    });
    if (!bond.ok) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: `Rejected bond message: ${bond.reason}.`,
          createdAt: envelope.createdAt,
        }),
      );
      console.warn(`[rejected bond] ${envelope.intent}: ${bond.reason}`);
      return;
    }
    return;
  }

  if (isA2ATaskIntent(envelope.intent)) {
    const runtimeGate = await guardInboundTaskRuntime({ envelope, store: taskRuntimeStore });
    if (!runtimeGate.ok) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: `Rejected task message: ${runtimeGate.reason}.`,
          createdAt: envelope.createdAt,
        }),
      );
      console.warn(`[rejected task runtime] ${envelope.intent}: ${runtimeGate.reason}`);
      return;
    }
  }

  const taskDecision = await taskDispatcher.dispatch(envelope);
  if (taskDecision.action === "handled") {
    await taskStore.appendTaskJournalEntry(taskDecision.journalEntry);
    await taskStore.appendAuditEvent(
      auditEventForDispatcherDecision(taskDecision, {
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        createdAt: envelope.createdAt,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
      }),
    );
    await applyTaskRuntimeAfterHandled({ decision: taskDecision, envelope, store: taskRuntimeStore });
    await relayTaskCancelIfNeeded({
      envelope,
      taskDecision,
      mesh,
      profile,
      taskStore,
    });
    console.log(
      `[task ${taskDecision.state}] ${taskDecision.intent} task=${taskDecision.taskId} event=${taskDecision.journalEntry.eventId}`,
    );
    return;
  }

  if (taskDecision.action === "rejected") {
    await taskStore.appendAuditEvent(
      auditEventForDispatcherDecision(taskDecision, {
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        createdAt: envelope.createdAt,
        direction: "inbound",
        verificationStatus: "rejected",
        latencyMs: Date.now() - receivedAt,
      }),
    );
    console.warn(`[rejected task] ${taskDecision.intent}: ${taskDecision.reason}`);
    return;
  }

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
      summary: "Verified message without a specialized handler.",
      createdAt: envelope.createdAt,
    }),
  );
  console.log(`[verified message] ${envelope.intent} from ${envelope.senderPeerId}`);
});

installEnvoyDataTransferReceiver({
  mesh,
  peerDirectoryStore,
  taskStore,
  vaultDir: vaultDirForNode,
});

await mesh.start();

if (args.bootstrapPeers.length > 0) {
  await discoverySeedStore.upsertMany(args.bootstrapPeers, "manual-bootstrap");
}

console.log("Envoy node started");
const nodeService = createNodeService(mesh, trustStore, peerDirectoryStore, args.profileDir, profile);

// Start WebSocket server for app connections
const wsServer = new WsServer(3030, "/ws");
wsServer.start(nodeService);
wsServerForEvents = wsServer;

// Wire NodeService events to WebSocket server
nodeService.on("hello:request", (data) => wsServer.emitEvent("hello:request", data));
nodeService.on("hello:response", (data) => wsServer.emitEvent("hello:response", data));
nodeService.on("chat:message", (data) => wsServer.emitEvent("chat:message", data));
nodeService.on("bond:established", (data) => wsServer.emitEvent("bond:established", data));
if (args.configPath) {
  console.log(`Config file: ${args.configPath}`);
}
console.log(`Owner ID: ${profile.owner.ownerId}`);
console.log(`Device ID: ${profile.device.deviceId}`);
console.log(`libp2p Peer ID: ${mesh.peerId}`);
console.log(`libp2p key file (stable Peer ID across restarts): ${libp2pPrivateKeyPath}`);
console.log(`Configured --listen: ${args.listen.join(", ")}`);
if (args.listen.some((addr) => addr.includes("/ip4/0.0.0.0/") || addr.includes("/ip6/::/"))) {
  console.log(
    "Note: libp2p reports concrete interface addresses below, not 0.0.0.0. WAN clients still dial your public IP/DNS on the same TCP port (cloud NAT maps it to this host).",
  );
}
console.log("Listening on (libp2p getMultiaddrs):");
for (const addr of mesh.multiaddrs) {
  console.log(`  ${addr}`);
}
if (args.enableRelayServer) {
  const circuitBases = relayDialMultiaddrsForCircuitRelay(mesh, args.advertiseAddrs);
  const advertiseSource =
    args.advertiseAddrs.length > 0
      ? `from ${args.advertiseAddrs.length} advertised base(s) (--advertise-addr, YAML discovery.advertiseAddrs, ENVOYMESH_ADVERTISE_ADDRS)`
      : "fallback: libp2p getMultiaddrs only (non-loopback); no --advertise-addr / advertiseAddrs / env";
  console.log(`Relay circuit bases for relay.lookup / relay.peers (${advertiseSource}):`);
  if (circuitBases.length === 0) {
    console.warn(
      "  (none usable after filtering loopback — set --advertise-addr / discovery.advertiseAddrs / ENVOYMESH_ADVERTISE_ADDRS with a reachable base)",
    );
  } else {
    for (const b of circuitBases) {
      console.log(`  ${b}`);
    }
  }
}
if (args.enableRelayServer && args.discoveryProfile === "wan-default" && args.advertiseAddrs.length === 0) {
  console.warn(
    "[connectivity warning] relay-server on wan-default without advertised bases: relay.lookup /p2p-circuit/ paths use getMultiaddrs only. Clients outside this machine's subnets (e.g. home Windows → cloud VM private 172.x) may not dial those addresses. Set --advertise-addr, YAML discovery.advertiseAddrs, or ENVOYMESH_ADVERTISE_ADDRS (comma-separated). Port must match what clients use; open the security group / firewall.",
  );
}

await taskStore.appendAuditEvent(
  createAuditEvent({
    type: "p2p.trace",
    direction: "outbound",
    protocol: "connectivity.profile",
    outcome: "record",
    summary: `connectivity profile=${args.discoveryProfile} mdns=${args.enableMdns} dht=${args.enableDht} relay=${args.enableRelay} autonat=${args.enableAutoNat} dcutr=${args.enableDcutr} bootstrap=${effectiveBootstrapPeers.length} seeds(peer-dir=${peerDirectorySeedAddrs.length}, persisted=${persistedSeedAddrs.length})`,
  }),
);
for (const warning of connectivityWarnings) {
  console.warn(`[connectivity warning] ${warning}`);
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "p2p.trace",
      direction: "outbound",
      protocol: "connectivity.warning",
      outcome: "record",
      summary: warning,
    }),
  );
}
if (args.discoveryProfile === "wan-default" && effectiveBootstrapPeers.length > 0) {
  console.log(
    `[connectivity] probing ${effectiveBootstrapPeers.length} bootstrap peer(s) for wan-default (may take a while if peers are unreachable)…`,
  );
  const orderedBootstrapPeers = rotatePeers(effectiveBootstrapPeers);
  for (const peer of orderedBootstrapPeers) {
    try {
      const latencyMs = await mesh.probePeer(peer);
      pushBootstrapProbeResult({ peer, ok: true, latencyMs });
      await discoverySeedStore.upsertSuccess(peer, "bootstrap-probe");
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          direction: "outbound",
          protocol: "connectivity.bootstrap.ok",
          remotePeerId: peer,
          latencyMs,
          outcome: "record",
          summary: `bootstrap probe ok peer=${peer} latencyMs=${latencyMs}`,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushBootstrapProbeResult({ peer, ok: false, error: message });
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          direction: "outbound",
          protocol: "connectivity.bootstrap.fail",
          remotePeerId: peer,
          outcome: "record",
          summary: `bootstrap probe failed peer=${peer} error=${message}`,
        }),
      );
    }
  }
  const succeeded = bootstrapProbeResults.some((item) => item.ok);
  if (!succeeded && args.connectivityStrict) {
    throw new Error(
      "connectivity-strict enabled: all bootstrap probes failed in wan-default profile.",
    );
  }
  scheduleBootstrapReprobe(effectiveBootstrapPeers);
}
if (args.enableDht && autoCapabilityTopics.length > 0) {
  await runCapabilityDiscoveryCycle("startup");
  scheduleCapabilityDiscovery();
}
if (args.enableRelay && effectiveBootstrapPeers.length > 0) {
  try {
    await runRelayCheckinCycle("startup");
  } catch (error) {
    reportRelayBackgroundError("relay.checkin.startup", error);
  }
  scheduleRelayCheckin();
  try {
    await runRelayLookupCycle("startup");
  } catch (error) {
    reportRelayBackgroundError("relay.lookup.startup", error);
  }
  scheduleRelayLookup();
}
if (args.enableRelayServer && effectiveBootstrapPeers.length > 0) {
  try {
    await runRelaySummaryCycle("startup");
  } catch (error) {
    reportRelayBackgroundError("relay.summary.startup", error);
  }
  scheduleRelaySummary();
}
if (args.autoRelayPeersQuery && args.enableRelay && effectiveBootstrapPeers.length > 0) {
  try {
    await runRelayPeersQueryCycle("startup");
  } catch (error) {
    reportRelayBackgroundError("relay.peers.query.startup", error);
  }
  scheduleRelayPeersQuery(effectiveBootstrapPeers);
}
if (args.enableRelay || args.enableRelayServer) {
  try {
    await runRelayHealthCycle("startup");
  } catch (error) {
    reportRelayBackgroundError("relay.health.startup", error);
  }
  scheduleRelayHealth();
  try {
    await runRelayManagerSnapshotCycle("startup");
  } catch (error) {
    reportRelayBackgroundError("relay.manager.snapshot.startup", error);
  }
  scheduleRelayManagerSnapshot();
}
setTimeout(() => {
  void taskStore.appendAuditEvent(
    createAuditEvent({
      type: "p2p.trace",
      direction: "outbound",
      protocol: "connectivity.health",
      outcome: "record",
      summary: "connectivity health checkpoint: if no peers discovered yet, verify bootstrap peers/firewall/subnet and retry signal.",
    }),
  );
}, 15_000);

if (resolvedArgs.pingTarget) {
  const unsignedEnvelope = createUnsignedEnvelope({
    senderPeerId: derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    senderRole: "system",
    recipientPeerId: resolvedArgs.pingTarget,
    intent: "system.ping",
    payload: createSystemPingPayload(args.pingMessage ?? "hello from EnvoyMesh"),
    correlationId: resolvedArgs.correlationId,
  });
  const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, profile.device.privateKeyPem);

  const latencyMs = await mesh.send(resolvedArgs.pingTarget, signedEnvelope);
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: signedEnvelope.intent,
      messageId: signedEnvelope.messageId,
      correlationId: signedEnvelope.correlationId,
      remotePeerId: resolvedArgs.pingTarget,
      direction: "outbound",
      latencyMs,
      protocol: ENVOY_MESSAGE_PROTOCOL,
      outcome: "record",
      summary: "Sent system.ping.",
      createdAt: signedEnvelope.createdAt,
    }),
  );
  console.log(`[sent ping] target ${resolvedArgs.pingTarget}`);
}

if (resolvedArgs.signalTarget) {
  const unsignedEnvelope = createUnsignedEnvelope({
    senderPeerId: derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    senderRole: "system",
    recipientPeerId: resolvedArgs.signalTarget,
    intent: "system.signal",
    payload: createSystemSignalPayload({
      deviceCertificate: profile.deviceCertificate,
      ownerPublicKeyPem: profile.owner.publicKeyPem,
      listenAddrs: mesh.multiaddrs,
    }),
    correlationId: resolvedArgs.correlationId,
  });
  const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, profile.device.privateKeyPem);

  const latencyMs = await mesh.send(resolvedArgs.signalTarget, signedEnvelope);
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: signedEnvelope.intent,
      messageId: signedEnvelope.messageId,
      correlationId: signedEnvelope.correlationId,
      remotePeerId: resolvedArgs.signalTarget,
      direction: "outbound",
      latencyMs,
      protocol: ENVOY_MESSAGE_PROTOCOL,
      outcome: "record",
      summary: "Sent system.signal.",
      createdAt: signedEnvelope.createdAt,
    }),
  );
  console.log(`[sent signal] target ${resolvedArgs.signalTarget}`);
}

if (resolvedArgs.relayPeersQueryTarget) {
  const unsignedEnvelope = createUnsignedEnvelope({
    senderPeerId: derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    senderRole: "system",
    recipientPeerId: resolvedArgs.relayPeersQueryTarget,
    intent: "relay.peers.request",
    payload: {},
    correlationId: resolvedArgs.correlationId,
  });
  const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, profile.device.privateKeyPem);

  const latencyMs = await mesh.send(resolvedArgs.relayPeersQueryTarget, signedEnvelope);
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: signedEnvelope.intent,
      messageId: signedEnvelope.messageId,
      correlationId: signedEnvelope.correlationId,
      remotePeerId: resolvedArgs.relayPeersQueryTarget,
      direction: "outbound",
      latencyMs,
      protocol: ENVOY_MESSAGE_PROTOCOL,
      outcome: "record",
      summary: "Sent relay.peers.request.",
      createdAt: signedEnvelope.createdAt,
    }),
  );
  console.log(`[sent relay.peers.request] target ${resolvedArgs.relayPeersQueryTarget}`);
}

for (const outbound of buildOutboundCliEnvelopes(resolvedArgs, profile)) {
  const isChat = outbound.envelope.intent === "chat.message";
  const latencyMs = isChat
    ? await mesh.sendChat(outbound.target, outbound.envelope)
    : await mesh.send(outbound.target, outbound.envelope);
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: outbound.envelope.intent,
      messageId: outbound.envelope.messageId,
      correlationId: outbound.envelope.correlationId,
      remotePeerId: outbound.target,
      direction: "outbound",
      latencyMs,
      protocol: isChat ? ENVOY_CHAT_PROTOCOL : ENVOY_MESSAGE_PROTOCOL,
      outcome: "record",
      summary: `Sent ${outbound.label}.`,
      createdAt: outbound.envelope.createdAt,
    }),
  );
  console.log(`[sent ${outbound.label}] target ${outbound.target}`);
}

if (resolvedArgs.dataSendTarget && resolvedArgs.dataRelativePath) {
  const relativePath = resolvedArgs.dataRelativePath.replace(/\\/g, "/");
  const filePath = join(vaultDirForNode, relativePath);
  const content = await readFile(filePath);
  const hash = createHash("sha256").update(content).digest("base64url");
  const unsignedVoucher = createUnsignedDataTransferVoucher({
    issuerPeerId: mesh.peerId,
    issuerOwnerId: profile.owner.ownerId,
    issuerDeviceId: profile.device.deviceId,
    relativePath,
    totalBytes: content.byteLength,
    contentHash: hash,
  });
  const voucher = createSignedDataTransferVoucher({
    unsigned: unsignedVoucher,
    devicePrivateKeyPem: profile.device.privateKeyPem,
  });
  const voucherUtf8 = voucherJsonBytesFromObject(voucher);
  const chunkSize = 64 * 1024;
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < content.length; offset += chunkSize) {
    chunks.push(content.subarray(offset, Math.min(offset + chunkSize, content.length)));
  }
  const latencyMs = await mesh.sendDataTransfer(resolvedArgs.dataSendTarget, voucherUtf8, chunks);
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: "sync.state",
      remotePeerId: resolvedArgs.dataSendTarget,
      direction: "outbound",
      latencyMs,
      protocol: ENVOY_DATA_PROTOCOL,
      outcome: "record",
      summary: `Sent data transfer ${relativePath} (${content.byteLength} bytes).`,
      createdAt: new Date().toISOString(),
    }),
  );
  console.log(`[sent data transfer] target ${resolvedArgs.dataSendTarget} path ${relativePath}`);
}

if (resolvedArgs.humanProfileUpdate) {
  const humanProfileStore = createHumanProfileStore(args.profileDir);
  const existingProfile = await humanProfileStore.loadHumanProfile();
  const hasUpdates =
    resolvedArgs.humanProfileDisplayName !== undefined ||
    resolvedArgs.humanProfileBio !== undefined ||
    resolvedArgs.humanProfileGender !== undefined ||
    resolvedArgs.humanProfileHobbies.length > 0 ||
    resolvedArgs.humanProfileKnowledge.length > 0;

  if (!hasUpdates) {
    console.log("[human-profile] --human-profile-update requires at least one --human-profile-* flag");
  } else {
    const unsignedPayload = createHumanProfilePayload({
      ownerId: profile.owner.ownerId,
      displayName: resolvedArgs.humanProfileDisplayName ?? existingProfile?.displayName,
      bio: resolvedArgs.humanProfileBio ?? existingProfile?.bio,
      gender: resolvedArgs.humanProfileGender ?? existingProfile?.gender,
      hobbies: resolvedArgs.humanProfileHobbies.length > 0 ? resolvedArgs.humanProfileHobbies : existingProfile?.hobbies,
      knowledge: resolvedArgs.humanProfileKnowledge.length > 0 ? resolvedArgs.humanProfileKnowledge : existingProfile?.knowledge,
      ownerPrivateKeyPem: profile.owner.privateKeyPem,
    });

    const signedProfile = signHumanProfile(
      humanProfileForSigning(unsignedPayload),
      profile.owner.privateKeyPem,
    );

    await humanProfileStore.saveHumanProfile(signedProfile);
    console.log(`[human-profile] updated and saved to ${args.profileDir}/human-profile.json`);
  }
}

console.log("Press Ctrl+C to stop.");

async function shutdown(): Promise<void> {
  wsServer.stop();
  if (bootstrapReprobeTimer) {
    clearTimeout(bootstrapReprobeTimer);
    bootstrapReprobeTimer = undefined;
  }
  if (capabilityDiscoveryTimer) {
    clearTimeout(capabilityDiscoveryTimer);
    capabilityDiscoveryTimer = undefined;
  }
  if (relayPeersQueryTimer) {
    clearTimeout(relayPeersQueryTimer);
    relayPeersQueryTimer = undefined;
  }
  if (relayCheckinTimer) {
    clearTimeout(relayCheckinTimer);
    relayCheckinTimer = undefined;
  }
  if (relayLookupTimer) {
    clearTimeout(relayLookupTimer);
    relayLookupTimer = undefined;
  }
  if (relaySummaryTimer) {
    clearTimeout(relaySummaryTimer);
    relaySummaryTimer = undefined;
  }
  if (relayManagerSnapshotTimer) {
    clearTimeout(relayManagerSnapshotTimer);
    relayManagerSnapshotTimer = undefined;
  }
  if (relayHealthTimer) {
    clearTimeout(relayHealthTimer);
    relayHealthTimer = undefined;
  }
  await mesh.stop();
  process.exit(0);
}

function buildAutoCapabilityTopics(capabilities: readonly string[]): string[] {
  const normalized = capabilities
    .map((capability) => capability.trim())
    .filter(Boolean)
    .map((capability) => `capability:${capability}`);
  return [...new Set(normalized)];
}

function scheduleCapabilityDiscovery(): void {
  if (!args.enableDht || autoCapabilityTopics.length === 0) {
    return;
  }
  const jitter = Math.floor(Math.random() * CAPABILITY_DISCOVERY_JITTER_MS);
  capabilityDiscoveryTimer = setTimeout(() => {
    void runCapabilityDiscoveryCycle("periodic")
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        await taskStore.appendAuditEvent(
          createAuditEvent({
            type: "p2p.trace",
            direction: "outbound",
            protocol: "discovery.capability.cycle.fail",
            outcome: "record",
            summary: `capability discovery cycle failed: ${message}`,
          }),
        );
      })
      .finally(() => {
        scheduleCapabilityDiscovery();
      });
  }, CAPABILITY_DISCOVERY_INTERVAL_MS + jitter);
}

async function runCapabilityDiscoveryCycle(source: "startup" | "periodic"): Promise<void> {
  if (!args.enableDht || autoCapabilityTopics.length === 0) {
    return;
  }

  for (const topic of autoCapabilityTopics) {
    try {
      await mesh.provideCapabilityTopic(topic);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          direction: "outbound",
          protocol: "discovery.capability.provide.ok",
          outcome: "record",
          summary: `capability provide ok topic=${topic} source=${source}`,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          direction: "outbound",
          protocol: "discovery.capability.provide.fail",
          outcome: "record",
          summary: `capability provide failed topic=${topic} source=${source} error=${message}`,
        }),
      );
      continue;
    }

    let providers:
      | Array<{
          peerId: string;
          multiaddrs: string[];
        }>
      | undefined;
    try {
      providers = await mesh.findCapabilityTopicProviders(topic, {
        queryTimeoutMs: CAPABILITY_DISCOVERY_QUERY_TIMEOUT_MS,
        limit: CAPABILITY_DISCOVERY_MAX_PROVIDERS,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          direction: "outbound",
          protocol: "discovery.capability.find.fail",
          outcome: "record",
          summary: `capability find failed topic=${topic} source=${source} error=${message}`,
        }),
      );
      continue;
    }

    const remoteProviders = providers.filter((provider) => provider.peerId !== mesh.peerId);
    const discoveredAddrs = dedupeAddrs(remoteProviders.flatMap((provider) => provider.multiaddrs));
    if (discoveredAddrs.length > 0) {
      await discoverySeedStore.upsertMany(discoveredAddrs, "capability-topic");
    }
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        direction: "outbound",
        protocol: "discovery.capability.find.ok",
        outcome: "record",
        summary: `capability find ok topic=${topic} source=${source} providers=${providers.length} remote=${remoteProviders.length} addrs=${discoveredAddrs.length}`,
      }),
    );
  }
}

function scheduleRelayPeersQuery(peers: string[]): void {
  if (!args.autoRelayPeersQuery || !args.enableRelay || peers.length === 0) {
    return;
  }
  const jitter = Math.floor(Math.random() * RELAY_PEERS_QUERY_JITTER_MS);
  relayPeersQueryTimer = setTimeout(() => {
    void runRelayPeersQueryCycle("periodic")
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        await taskStore.appendAuditEvent(
          createAuditEvent({
            type: "p2p.trace",
            direction: "outbound",
            protocol: "relay.peers.query.fail",
            outcome: "record",
            summary: `relay peers query cycle failed error=${message}`,
          }),
        );
      })
      .finally(() => scheduleRelayPeersQuery(peers));
  }, RELAY_PEERS_QUERY_INTERVAL_MS + jitter);
}

async function runRelayPeersQueryCycle(source: "startup" | "periodic"): Promise<void> {
  const targets = dedupeAddrs(effectiveBootstrapPeers);
  for (const target of targets) {
    const signedEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "system",
        recipientPeerId: target.startsWith("/") ? undefined : target,
        intent: "relay.peers.request",
        payload: {},
      }),
      profile.device.privateKeyPem,
    );

    try {
      const latencyMs = await mesh.send(target, signedEnvelope);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          direction: "outbound",
          protocol: "relay.peers.query.ok",
          remotePeerId: target,
          latencyMs,
          outcome: "record",
          summary: `relay peers query ok source=${source} target=${target}`,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          direction: "outbound",
          protocol: "relay.peers.query.fail",
          remotePeerId: target,
          outcome: "record",
          summary: `relay peers query failed source=${source} target=${target} error=${message}`,
        }),
      );
    }
  }
}

function scheduleRelayCheckin(): void {
  if (!args.enableRelay || effectiveBootstrapPeers.length === 0) {
    return;
  }
  relayCheckinTimer = setTimeout(() => {
    void runRelayCheckinCycle("periodic")
      .catch((error) => {
        reportRelayBackgroundError("relay.checkin.periodic", error);
      })
      .finally(() => scheduleRelayCheckin());
  }, RELAY_CHECKIN_INTERVAL_MS);
}

async function runRelayCheckinCycle(source: "startup" | "periodic"): Promise<void> {
  const targets = relayControlTargets();
  const expiresAt = expiresAtFromNow(RELAY_CONTROL_TTL_MS);
  const capabilities = relayCheckinCapabilities(profile.deviceCertificate.capabilities);
  if (targets.length > 0) {
    logRelayReachableAddrsForCheckin({
      prefix: "[relay-checkin]",
      source,
      peerId: mesh.peerId,
      ownerId: profile.owner.ownerId,
      addrs: mesh.multiaddrs,
    });
  }
  for (const target of targets) {
    const payload = createRelayCheckinPayload({
      peerId: mesh.peerId,
      ownerId: profile.owner.ownerId,
      relayReachableAddrs: mesh.multiaddrs,
      capabilities,
      advertisements: capabilities.map((capability) => ({
        capability,
        visibility: capability === "mesh.discovery" ? "public" : "bonded",
        expiresAt,
      })),
      relayHints: relayClientState.activeRelays,
      expiresAt,
    });
    const signedEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "system",
        recipientPeerId: target.startsWith("/") ? undefined : target,
        intent: "relay.checkin",
        payload,
      }),
      profile.device.privateKeyPem,
    );
    try {
      const latencyMs = await mesh.send(target, signedEnvelope);
      noteRelaySuccess(relayClientState, relayHintFromAddr(target));
      await appendRelayTrace("relay.checkin.ok", target, `relay checkin ok source=${source} target=${target}`, latencyMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      noteRelayFailure(relayClientState, relayHintFromAddr(target));
      await appendRelayTrace("relay.checkin.fail", target, `relay checkin failed source=${source} target=${target} error=${message}`);
    }
  }
}

function relayCheckinCapabilities(capabilities: readonly string[]): string[] {
  return [...new Set(["mesh.discovery", ...capabilities])];
}

function scheduleRelayLookup(): void {
  if (!args.enableRelay || effectiveBootstrapPeers.length === 0) {
    return;
  }
  relayLookupTimer = setTimeout(() => {
    void runRelayLookupCycle("periodic")
      .catch((error) => {
        reportRelayBackgroundError("relay.lookup.periodic", error);
      })
      .finally(() => scheduleRelayLookup());
  }, RELAY_LOOKUP_INTERVAL_MS);
}

function scheduleRelaySummary(): void {
  if (!args.enableRelayServer || effectiveBootstrapPeers.length === 0) {
    return;
  }
  relaySummaryTimer = setTimeout(() => {
    void runRelaySummaryCycle("periodic")
      .catch((error) => {
        reportRelayBackgroundError("relay.summary.periodic", error);
      })
      .finally(() => scheduleRelaySummary());
  }, RELAY_SUMMARY_INTERVAL_MS);
}

function scheduleRelayManagerSnapshot(): void {
  if (!args.enableRelay && !args.enableRelayServer) {
    return;
  }
  relayManagerSnapshotTimer = setTimeout(() => {
    void runRelayManagerSnapshotCycle("periodic")
      .catch((error) => {
        reportRelayBackgroundError("relay.manager.snapshot.periodic", error);
      })
      .finally(() => scheduleRelayManagerSnapshot());
  }, RELAY_MANAGER_SNAPSHOT_INTERVAL_MS);
}

function scheduleRelayHealth(): void {
  if (!args.enableRelay && !args.enableRelayServer) {
    return;
  }
  relayHealthTimer = setTimeout(() => {
    void runRelayHealthCycle("periodic")
      .catch((error) => {
        reportRelayBackgroundError("relay.health.periodic", error);
      })
      .finally(() => scheduleRelayHealth());
  }, RELAY_HEALTH_INTERVAL_MS);
}

async function runRelayHealthCycle(source: "startup" | "periodic"): Promise<void> {
  const result = evaluateRelayHealth({
    relayEnabled: args.enableRelay,
    relayServerEnabled: args.enableRelayServer,
    listenAddrs: mesh.multiaddrs,
    bootstrapProbeResults,
    relayBook: relayRoster.relayBook(),
    rosterEntries: relayRoster.entries(),
    summaries: relayRoster.summaries(),
    routing: relayLookupRouter.metrics(),
    previous: relayHealthState,
    rssBytes: process.memoryUsage().rss,
  });
  relayHealthState = result.state;
  relayHealthSnapshot = result.snapshot;

  const protocol = relayHealthProtocol(result.snapshot.status);
  await appendRelayTrace(
    protocol,
    mesh.peerId,
    `relay health ${result.snapshot.status} source=${source} actions=${result.snapshot.actions.join(",")} reasons=${result.snapshot.reasons.join(";") || "-"}`,
  );

  if (result.snapshot.actions.includes("reprobe-neighbors")) {
    await runRelayHealthReprobe();
  }
  if (result.snapshot.actions.includes("refresh-relay-summary")) {
    await runRelaySummaryCycle("periodic");
  }
  if (result.snapshot.actions.includes("restart-libp2p")) {
    await appendRelayTrace(
      "relay.health.repair",
      mesh.peerId,
      "relay health requested libp2p restart; current runtime records repair request for supervisor-aware follow-up",
    );
  }
  if (result.snapshot.actions.includes("exit-for-supervisor")) {
    await appendRelayTrace("relay.health.critical", mesh.peerId, "relay health critical; exiting for external supervisor restart");
    await mesh.stop();
    process.exit(2);
  }
}

async function runRelayHealthReprobe(): Promise<void> {
  const targets = [...new Set([...effectiveBootstrapPeers, ...relayControlTargets()])].slice(0, 8);
  for (const target of targets) {
    try {
      const latencyMs = await mesh.probePeer(target);
      pushBootstrapProbeResult({ peer: target, ok: true, latencyMs });
      await appendRelayTrace("relay.health.repair", target, `relay health reprobe ok target=${target}`, latencyMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushBootstrapProbeResult({ peer: target, ok: false, error: message });
      await appendRelayTrace("relay.health.repair", target, `relay health reprobe failed target=${target} error=${message}`);
    }
  }
}

function relayHealthProtocol(status: RelayHealthSnapshot["status"]): string {
  switch (status) {
    case "healthy":
      return "relay.health.ok";
    case "degraded":
      return "relay.health.warn";
    case "unhealthy":
      return "relay.health.fail";
    case "critical":
      return "relay.health.critical";
  }
}

async function runRelayManagerSnapshotCycle(source: "startup" | "periodic"): Promise<void> {
  const auditEvents = await taskStore.readAuditEvents();
  const snapshot = buildRelayManagerSnapshot({
    auditEvents,
    runtime: buildRelayManagerRuntimeState(),
  });
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "p2p.trace",
      direction: "outbound",
      protocol: RELAY_MANAGER_SNAPSHOT_PROTOCOL,
      outcome: "record",
      summary: serializeRelayManagerSnapshot(snapshot),
    }),
  );
  // Persist relay book and summaries so they survive restarts
  const currentRelayBook = relayRoster.relayBook();
  const currentSummaries = relayRoster.summaries();
  if (currentRelayBook.length > 0 || currentSummaries.length > 0) {
    await Promise.all([
      relayStateStore.saveRelayBook(currentRelayBook),
      relayStateStore.saveRelaySummaries(currentSummaries.map((e) => ({
        relayId: e.relayId,
        level: e.summary.level,
        region: e.summary.region,
        livePeerCount: e.summary.livePeerCount,
        childRelayCount: e.summary.childRelayCount,
        topicBuckets: e.summary.topicBuckets,
        lastSeenAt: e.lastSeenAt,
        expiresAt: e.expiresAt,
      }))),
    ]);
    await appendRelayTrace(
      "relay.state.persist.ok",
      mesh.peerId,
      `persisted relay_book=${currentRelayBook.length} summaries=${currentSummaries.length}`,
    );
  }
  await appendRelayTrace(
    "relay.manager.snapshot.ok",
    mesh.peerId,
    `relay manager snapshot ok source=${source} roster=${snapshot.roster.total} relays=${snapshot.relayBook.total} summaries=${snapshot.summaries.total}`,
  );
}

async function runRelaySummaryCycle(source: "startup" | "periodic"): Promise<void> {
  const targets = relayControlTargets();
  const payload = createRelaySummaryPayload(
    relayRoster.summary({
      relayId: mesh.peerId,
      level: args.enableRelayServer ? 2 : 3,
      expiresAt: expiresAtFromNow(RELAY_CONTROL_TTL_MS),
    }),
  );
  for (const target of targets) {
    const signedEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "system",
        recipientPeerId: target.startsWith("/") ? undefined : target,
        intent: "relay.summary",
        payload,
      }),
      profile.device.privateKeyPem,
    );
    try {
      const latencyMs = await mesh.send(target, signedEnvelope);
      await appendRelayTrace("relay.summary.ok", target, `relay summary ok source=${source} target=${target}`, latencyMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await appendRelayTrace("relay.summary.fail", target, `relay summary failed source=${source} target=${target} error=${message}`);
    }
  }
}

async function runRelayLookupCycle(source: "startup" | "periodic"): Promise<void> {
  const targets = relayControlTargets();
  for (const target of targets) {
    const payload = createRelayLookupPayload({
      queryId: `relay_lookup_${randomUUID()}`,
      capability: "mesh.discovery",
      maxResults: 32,
      maxHops: 0,
      maxFanout: 2,
      visibilityScope: "public",
      expiresAt: expiresAtFromNow(RELAY_CONTROL_TTL_MS),
    });
    const signedEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "system",
        recipientPeerId: target.startsWith("/") ? undefined : target,
        intent: "relay.lookup",
        payload,
      }),
      profile.device.privateKeyPem,
    );
    try {
      const startedAt = Date.now();
      const reply = await mesh.sendExpectReply(target, signedEnvelope, { timeoutMs: RELAY_LOOKUP_REPLY_TIMEOUT_MS });
      const latencyMs = Date.now() - startedAt;
      const guardDecision = inboundGuard.inspect(reply);
      if (guardDecision.action === "reject") {
        noteRelayFailure(relayClientState, relayHintFromAddr(target));
        await appendRelayTrace(
          "relay.lookup.fail",
          target,
          `relay lookup reply rejected source=${source} target=${target} reason=${guardDecision.reason}`,
        );
        continue;
      }
      const env = guardDecision.envelope;
      if (env.intent !== "relay.lookup.response") {
        noteRelayFailure(relayClientState, relayHintFromAddr(target));
        await appendRelayTrace(
          "relay.lookup.fail",
          target,
          `relay lookup unexpected intent source=${source} target=${target} intent=${env.intent}`,
        );
        continue;
      }
      const responsePayload = parseRelayLookupResponsePayload(env.payload);
      await processRelayLookupResponse(responsePayload);
      noteRelaySuccess(relayClientState, relayHintFromAddr(target));
      await appendRelayTrace("relay.lookup.ok", target, `relay lookup ok source=${source} target=${target}`, latencyMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        const latencyMs = await mesh.send(target, signedEnvelope);
        noteRelaySuccess(relayClientState, relayHintFromAddr(target));
        await appendRelayTrace(
          "relay.lookup.ok",
          target,
          `relay lookup ok (legacy send after expectReply: ${message}) source=${source} target=${target}`,
          latencyMs,
        );
      } catch (fallbackError) {
        const fb = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        noteRelayFailure(relayClientState, relayHintFromAddr(target));
        await appendRelayTrace(
          "relay.lookup.fail",
          target,
          `relay lookup failed source=${source} target=${target} expectReply=${message} legacySend=${fb}`,
        );
      }
    }
  }
}

async function handleRelayControlEnvelope(input: {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>;
}): Promise<void> {
  const { envelope, remotePeerId, receivedAt, correlationId, replyWithEnvelope } = input;
  try {
    if (envelope.intent === "relay.checkin") {
      const payload = parseRelayCheckinPayload(envelope.payload);
      const { entry, addrChanged, reconnect } = relayRoster.checkin(payload, remotePeerId);
      const checkinNote =
        addrChanged && reconnect
          ? `relay.checkin accepted peer=${payload.peerId} addr_changed reconnect`
          : addrChanged
            ? `relay.checkin accepted peer=${payload.peerId} addr_changed`
            : reconnect
              ? `relay.checkin accepted peer=${payload.peerId} reconnect`
              : `relay.checkin accepted peer=${payload.peerId}`;
      await appendRelayInboundAudit(envelope, remotePeerId, receivedAt, correlationId, checkinNote);
      if (addrChanged) {
        await appendRelayTrace(
          "relay.checkin.addr_changed",
          payload.peerId,
          `peer=${payload.peerId} new_addrs=${entry.relayReachableAddrs.length}`,
        );
      }
      if (reconnect) {
        await appendRelayTrace(
          "relay.checkin.reconnect",
          payload.peerId,
          `peer=${payload.peerId} returned_after_offline`,
        );
      }
      if (args.enableRelayServer) {
        logRelayServerCheckinAccepted({
          remoteLibp2pPeerId: remotePeerId,
          payload,
          rosterSize: relayRoster.entries().length,
          addrChanged,
          reconnect,
        });
      }
      return;
    }

    if (envelope.intent === "relay.lookup") {
      const payload = parseRelayLookupPayload(envelope.payload);
      if (!relayLookupRouter.markSeen(payload.queryId)) {
        await appendRelayInboundAudit(envelope, remotePeerId, receivedAt, correlationId, `relay.lookup duplicate dropped query=${payload.queryId}`);
        await sendRelayControlResponse(
          envelope,
          remotePeerId,
          "relay.lookup.response",
          createRelayLookupResponsePayload({
            queryId: payload.queryId,
            peers: [],
            relayHints: [],
            truncated: false,
            expiresAt: payload.expiresAt,
          }),
          correlationId,
          replyWithEnvelope,
        );
        return;
      }
      const circuitBases = relayDialMultiaddrsForCircuitRelay(mesh, args.advertiseAddrs);
      const localResponse = relayRoster.lookup({
        payload,
        requesterPeerId: remotePeerId,
        relayMultiaddrs: circuitBases,
        relayPeerId: mesh.peerId,
      });
      const routeDecision = relayLookupRouter.selectForwardTargets({
        payload,
        relayBook: relayRoster.relayBook(),
        summaries: relayRoster.summaries(),
        selfRelayId: mesh.peerId,
      });
      const forwardedResponses =
        localResponse.peers.length < payload.maxResults
          ? await forwardRelayLookup({
              request: envelope,
              payload,
              targets: routeDecision.forwardTargets,
              correlationId,
            })
          : [];
      const responsePayload = createRelayLookupResponsePayload(
        mergeRelayLookupResponses(payload, [localResponse, ...forwardedResponses.map((item) => item.payload)]),
      );
      await sendRelayControlResponse(
        envelope,
        remotePeerId,
        "relay.lookup.response",
        responsePayload,
        correlationId,
        replyWithEnvelope,
      );
      if (args.enableRelayServer && localResponse.peers.length === 0) {
        const others = relayRoster.entries().filter((e) => e.peerId !== remotePeerId);
        if (others.length > 0) {
          console.warn(
            `[relay-server] relay.lookup query=${payload.queryId} returned 0 local peers but roster has ${others.length} other entr(y/ies); requester=${remotePeerId}. Check lookup visibility, capability filter, or relay.lookup stream errors on clients.`,
          );
        }
      }
      if (args.enableRelayServer) {
        logRelayServerLookupResponse({
          requesterLibp2pPeerId: remotePeerId,
          queryId: responsePayload.queryId,
          peersReturned: responsePayload.peers.length,
          circuitBases,
          peerMultiaddrs: responsePayload.peers.flatMap((p) => p.multiaddrs),
        });
      }
      await appendRelayInboundAudit(
        envelope,
        remotePeerId,
        receivedAt,
        correlationId,
        `relay.lookup returned peers=${responsePayload.peers.length} hints=${responsePayload.relayHints.length} forwards=${routeDecision.forwardTargets.length}`,
      );
      return;
    }

    if (envelope.intent === "relay.lookup.response") {
      const payload = parseRelayLookupResponsePayload(envelope.payload);
      await processRelayLookupResponse(payload);
      await appendRelayInboundAudit(
        envelope,
        remotePeerId,
        receivedAt,
        correlationId,
        `relay.lookup.response peers=${payload.peers.length}`,
      );
      return;
    }

    if (envelope.intent === "relay.hints.request") {
      const payload = parseRelayHintsRequestPayload(envelope.payload);
      const responsePayload = createRelayHintsResponsePayload({
        relayHints: relayRoster.relayHints(payload.maxResults),
        truncated: false,
        expiresAt: expiresAtFromNow(RELAY_CONTROL_TTL_MS),
      });
      await sendRelayControlResponse(
        envelope,
        remotePeerId,
        "relay.hints.response",
        responsePayload,
        correlationId,
        replyWithEnvelope,
      );
      await appendRelayInboundAudit(envelope, remotePeerId, receivedAt, correlationId, `relay.hints.request reason=${payload.reason}`);
      return;
    }

    if (envelope.intent === "relay.hints.response") {
      const payload = parseRelayHintsResponsePayload(envelope.payload);
      addRelayCandidates(relayClientState, payload.relayHints);
      await appendRelayInboundAudit(envelope, remotePeerId, receivedAt, correlationId, `relay.hints.response hints=${payload.relayHints.length}`);
      return;
    }

    if (envelope.intent === "relay.join.request") {
      const payload = parseRelayJoinRequestPayload(envelope.payload);
      relayRoster.registerRelay({
        relayId: payload.relay.relayId,
        addrs: payload.relay.publicAddrs,
        relation: "candidate",
        state: "verified",
        level: payload.relay.level,
        region: payload.relay.region,
        expiresAt: payload.relay.expiresAt,
      });
      const responsePayload = createRelayJoinResponsePayload({
        accepted: true,
        acceptedLevel: payload.desiredLevel ?? payload.relay.level,
        parents: relayRoster.relayHints(2),
        siblings: relayRoster.relayHints(4),
        childLimit: 20,
        expiresAt: expiresAtFromNow(RELAY_CONTROL_TTL_MS),
      });
      await sendRelayControlResponse(
        envelope,
        remotePeerId,
        "relay.join.response",
        responsePayload,
        correlationId,
        replyWithEnvelope,
      );
      await appendRelayInboundAudit(envelope, remotePeerId, receivedAt, correlationId, `relay.join.request accepted relay=${payload.relay.relayId}`);
      return;
    }

    if (envelope.intent === "relay.register") {
      const payload = parseRelayRegisterPayload(envelope.payload);
      relayRoster.registerRelay({
        relayId: payload.relay.relayId,
        addrs: payload.relay.publicAddrs,
        relation: payload.requestedRelation,
        state: "verified",
        level: payload.relay.level,
        region: payload.relay.region,
        expiresAt: payload.relay.expiresAt,
      });
      const responsePayload = createRelayRegisterResponsePayload({
        accepted: true,
        relation: payload.requestedRelation,
        state: "verified",
        expiresAt: expiresAtFromNow(RELAY_CONTROL_TTL_MS),
      });
      await sendRelayControlResponse(
        envelope,
        remotePeerId,
        "relay.register.response",
        responsePayload,
        correlationId,
        replyWithEnvelope,
      );
      await appendRelayInboundAudit(envelope, remotePeerId, receivedAt, correlationId, `relay.register accepted relay=${payload.relay.relayId}`);
      return;
    }

    if (envelope.intent === "relay.summary") {
      const payload = parseRelaySummaryPayload(envelope.payload);
      relayRoster.registerSummary(payload);
      relayRoster.registerRelay({
        relayId: payload.relayId,
        addrs: [],
        relation: "sibling",
        state: "verified",
        level: payload.level,
        region: payload.region,
        expiresAt: payload.expiresAt,
      });
      await appendRelayInboundAudit(envelope, remotePeerId, receivedAt, correlationId, `relay.summary relay=${payload.relayId} peers=${payload.livePeerCount}`);
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.rejected",
        intent: envelope.intent,
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "rejected",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: `Rejected ${envelope.intent}: ${message}`,
        createdAt: envelope.createdAt,
      }),
    );
  }
}

async function forwardRelayLookup(input: {
  request: EnvoyEnvelope;
  payload: RelayLookupPayload;
  targets: RelayHint[];
  correlationId: string | undefined;
}): Promise<Array<{ payload: RelayLookupResponsePayload; remotePeerId: string }>> {
  const { payload, targets, correlationId } = input;
  if (payload.maxHops <= 0 || targets.length === 0) {
    return [];
  }

  const out: Array<{ payload: RelayLookupResponsePayload; remotePeerId: string }> = [];
  for (const target of targets) {
    const targetAddress = relayTargetAddress(target);
    if (!targetAddress) {
      continue;
    }
    const forwardedPayload = createRelayLookupPayload({
      ...payload,
      maxHops: payload.maxHops - 1,
    });
    const signedEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "system",
        recipientPeerId: targetAddress.startsWith("/") ? undefined : target.relayId,
        intent: "relay.lookup",
        payload: forwardedPayload,
        correlationId,
      }),
      profile.device.privateKeyPem,
    );
    const remote = target.relayId || targetAddress;
    try {
      relayLookupRouter.recordForwardedLookup();
      const startedAt = Date.now();
      const reply = await mesh.sendExpectReply(targetAddress, signedEnvelope, {
        timeoutMs: RELAY_FORWARD_LOOKUP_REPLY_MS,
      });
      const latencyMs = Date.now() - startedAt;
      const guardDecision = inboundGuard.inspect(reply);
      if (guardDecision.action === "reject") {
        relayLookupRouter.recordFailedForward();
        if (target.relayId) {
          relayLookupRouter.recordNegative(payload, target.relayId);
        }
        await appendRelayTrace(
          "relay.lookup.forward.fail",
          remote,
          `relay lookup forward rejected reply: ${guardDecision.reason}`,
        );
        continue;
      }
      const env = guardDecision.envelope;
      if (env.intent !== "relay.lookup.response") {
        relayLookupRouter.recordFailedForward();
        await appendRelayTrace(
          "relay.lookup.forward.fail",
          remote,
          `relay lookup forward unexpected intent ${env.intent}`,
        );
        continue;
      }
      const responsePayload = parseRelayLookupResponsePayload(env.payload);
      out.push({ payload: responsePayload, remotePeerId: remote });
      await appendRelayTrace(
        "relay.lookup.forward.ok",
        remote,
        `relay lookup forward ok target=${remote} nextHops=${forwardedPayload.maxHops}`,
        latencyMs,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      relayLookupRouter.recordFailedForward();
      if (target.relayId) {
        relayLookupRouter.recordNegative(payload, target.relayId);
      }
      await appendRelayTrace(
        "relay.lookup.forward.fail",
        remote,
        `relay lookup forward failed target=${remote} error=${message}`,
      );
    }
  }
  relayLookupRouter.recordCollectedForwardResponse(out.length);
  for (const response of out) {
    if (response.payload.peers.length === 0) {
      relayLookupRouter.recordNegative(payload, response.remotePeerId);
    }
  }
  return out;
}

function mergeRelayLookupResponses(payload: RelayLookupPayload, responses: RelayLookupResponsePayload[]): RelayLookupResponsePayload {
  const peers = new Map<string, RelayPeerCandidate>();
  const hints = new Map<string, RelayHint>();
  let truncated = false;
  for (const response of responses) {
    truncated = truncated || response.truncated;
    for (const peer of response.peers) {
      const key = peer.peerId || peer.multiaddrs.join(",");
      if (!peers.has(key)) {
        peers.set(key, peer);
      }
    }
    for (const hint of response.relayHints) {
      const key = hint.relayId || hint.multiaddrs.join(",");
      if (key && !hints.has(key)) {
        hints.set(key, {
          ...hint,
          multiaddrs: dedupeAddrs(hint.multiaddrs),
        });
      }
    }
  }
  const cappedPeers = [...peers.values()].slice(0, payload.maxResults);
  return {
    queryId: payload.queryId,
    peers: cappedPeers,
    relayHints: [...hints.values()].slice(0, payload.maxResults),
    truncated: truncated || peers.size > cappedPeers.length,
    expiresAt: payload.expiresAt,
  };
}

async function processRelayLookupResponse(payload: RelayLookupResponsePayload): Promise<void> {
  const flat = dedupeAddrs(payload.peers.flatMap((peer) => peer.multiaddrs));
  logClientRelayLookupResponse({
    queryId: payload.queryId,
    peerCount: payload.peers.length,
    multiaddrs: flat,
  });
  addRelayCandidates(relayClientState, payload.relayHints);
  const relayedAddrs = flat;
  if (relayedAddrs.length > 0) {
    await discoverySeedStore.upsertMany(relayedAddrs, "relay-peers");
  }
  for (const addr of relayedAddrs) {
    const candidates = expandCircuitDialCandidates(addr, effectiveBootstrapPeers);
    let dialOk = false;
    for (const cand of candidates) {
      try {
        console.log(`[relay-discovery] probe [${describeMultiaddrReachability(cand)}] ${cand}`);
        const latencyMs = await mesh.probePeer(cand);
        await appendRelayTrace("relay.lookup.dial.ok", cand, `relay lookup candidate dial ok addr=${cand}`, latencyMs);
        dialOk = true;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await appendRelayTrace(
          "relay.lookup.dial.fail",
          cand,
          `relay lookup candidate dial failed addr=${cand} error=${message}`,
        );
      }
    }
  }
}

async function sendRelayControlResponse(
  request: EnvoyEnvelope,
  libp2pRecipientPeerId: string,
  intent: "relay.lookup.response" | "relay.hints.response" | "relay.join.response" | "relay.register.response",
  payload: unknown,
  correlationId: string | undefined,
  replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>,
): Promise<void> {
  const signedEnvelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "system",
      recipientPeerId: request.senderPeerId,
      intent,
      payload,
      correlationId,
    }),
    profile.device.privateKeyPem,
  );
  if (replyWithEnvelope) {
    try {
      await replyWithEnvelope(signedEnvelope);
      return;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(
        `[relay-server] same-stream control reply failed (${detail}); falling back to mesh.send to requester`,
      );
    }
  }
  await mesh.send(libp2pRecipientPeerId, signedEnvelope);
}

async function appendRelayInboundAudit(
  envelope: EnvoyEnvelope,
  remotePeerId: string,
  receivedAt: number,
  correlationId: string | undefined,
  summary: string,
): Promise<void> {
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
      summary,
      createdAt: envelope.createdAt,
    }),
  );
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

async function relayTaskCancelIfNeeded(input: {
  envelope: EnvoyEnvelope;
  taskDecision: DispatcherDecision;
  mesh: EnvoyMesh;
  profile: Awaited<ReturnType<typeof loadOrCreateNodeProfile>>;
  taskStore: ReturnType<typeof createLocalTaskStore>;
}): Promise<void> {
  const { envelope, taskDecision, mesh, profile, taskStore } = input;
  if (taskDecision.intent !== "task.cancel") {
    return;
  }

  try {
    const cancelPayload = parseTaskCancelPayload(envelope.payload);
    const hops = cancelPayload.relayRemainingHops ?? 0;
    const forwards = cancelPayload.forwardToPeerIds ?? [];
    if (forwards.length === 0 || hops <= 0) {
      return;
    }

    const nextHops = hops - 1;
    const nextPayload = createTaskCancelPayload({
      taskId: cancelPayload.taskId,
      mandateId: cancelPayload.mandateId,
      reason: cancelPayload.reason,
      cancelledBy: cancelPayload.cancelledBy,
      forwardToPeerIds: nextHops > 0 ? forwards : undefined,
      relayRemainingHops: nextHops > 0 ? nextHops : undefined,
    });

    for (const targetPeer of forwards) {
      const signed = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          recipientPeerId: targetPeer,
          intent: "task.cancel",
          payload: nextPayload,
          correlationId: envelope.correlationId,
        }),
        profile.device.privateKeyPem,
      );
      const latencyMs = await mesh.send(targetPeer, signed);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.sent",
          intent: "task.cancel",
          messageId: signed.messageId,
          correlationId: signed.correlationId,
          remotePeerId: targetPeer,
          direction: "outbound",
          latencyMs,
          protocol: ENVOY_MESSAGE_PROTOCOL,
          outcome: "record",
          summary: `Relayed task.cancel (hops remaining after send: ${nextHops}).`,
          createdAt: signed.createdAt,
        }),
      );
    }
  } catch {
    // ignore malformed cancel relay metadata
  }
}

async function appendP2pTrace(event: P2pDebugEvent): Promise<void> {
  const summaryParts = [`p2p ${event.kind}`];
  if ("protocol" in event && event.protocol) {
    summaryParts.push(`protocol=${event.protocol}`);
  }
  if ("direction" in event && event.direction) {
    summaryParts.push(`direction=${event.direction}`);
  }

  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "p2p.trace",
      remotePeerId: "remotePeerId" in event ? event.remotePeerId : undefined,
      protocol: "protocol" in event ? event.protocol : undefined,
      direction: "direction" in event ? event.direction : undefined,
      outcome: "record",
      summary: summaryParts.join(" "),
    }),
  );
}

function rotatePeers(peers: string[]): string[] {
  if (peers.length <= 1) {
    return peers;
  }
  const offset = Date.now() % peers.length;
  return peers.slice(offset).concat(peers.slice(0, offset));
}

function dedupeAddrs(addrs: string[]): string[] {
  return [...new Set(addrs.map((addr) => addr.trim()).filter(Boolean))];
}

function appendRelayP2pComponentIfMissing(addr: string, relayPeerId: string): string {
  const a = addr.trim();
  if (!a) return "";
  if (/\/p2p\/[^/]+$/.test(a)) return a;
  const base = a.replace(/\/$/, "");
  return `${base}/p2p/${relayPeerId}`;
}

function isLoopbackListenMultiaddr(addr: string): boolean {
  return (
    addr.includes("/ip4/127.0.0.1/") ||
    addr.includes("/ip6/::1/") ||
    addr.includes("/ip4/0.0.0.0/")
  );
}

/** Base multiaddrs relay clients must dial for /p2p-circuit/... paths in relay.lookup / relay.peers (public or same-LAN). */
function relayDialMultiaddrsForCircuitRelay(mesh: EnvoyMesh, advertiseAddrs: string[]): string[] {
  const relayPeerId = mesh.peerId;
  const rawBases = advertiseAddrs.length > 0 ? advertiseAddrs : mesh.multiaddrs;
  return dedupeAddrs(
    rawBases
      .map((base) => appendRelayP2pComponentIfMissing(base, relayPeerId))
      .filter((addr) => addr.length > 0 && !isLoopbackListenMultiaddr(addr)),
  );
}

function relayControlTargets(): string[] {
  return dedupeAddrs([
    ...relayClientState.activeRelays.flatMap((relay) => relay.multiaddrs),
    ...effectiveBootstrapPeers,
  ]);
}

function buildRelayManagerRuntimeState(): RelayManagerRuntimeState {
  return {
    enabled: args.enableRelay,
    relayServerEnabled: args.enableRelayServer,
    peerId: mesh.peerId,
    listenAddrs: mesh.multiaddrs,
    uptimeMs: Date.now() - processStartedAt,
    rosterEntries: relayRoster.entries().map((entry) => ({
      peerId: entry.peerId,
      ownerId: entry.ownerId,
      capabilities: entry.capabilities,
      advertisements: entry.advertisements,
      lastSeenAt: entry.lastSeenAt,
      expiresAt: entry.expiresAt,
      reservationFreshUntil: entry.reservationFreshUntil,
    })),
    relayBook: relayRoster.relayBook(),
    summaries: relayRoster.summaries().map((entry) => ({
      relayId: entry.relayId,
      level: entry.summary.level,
      region: entry.summary.region,
      livePeerCount: entry.summary.livePeerCount,
      childRelayCount: entry.summary.childRelayCount,
      topicBuckets: entry.summary.topicBuckets,
      lastSeenAt: entry.lastSeenAt,
      expiresAt: entry.expiresAt,
    })),
    routing: relayLookupRouter.metrics(),
    health: relayHealthSnapshot,
  };
}

function relayHintFromAddr(addr: string): RelayHint {
  return {
    relayId: relayIdFromAddr(addr),
    multiaddrs: [addr],
  };
}

function relayTargetAddress(hint: RelayHint): string | undefined {
  return hint.multiaddrs[0] ?? hint.relayId;
}

function relayIdFromAddr(addr: string): string {
  const match = addr.match(/\/p2p\/([^/]+)$/);
  return match?.[1] ?? addr;
}

function expiresAtFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

/** Log and audit background relay failures without throwing (keeps timers alive; avoids unhandledRejection). */
function reportRelayBackgroundError(cycle: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[relay-cycle] ${cycle} failed: ${message}`);
  void taskStore
    .appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        direction: "outbound",
        protocol: "relay.cycle.fail",
        outcome: "record",
        summary: `cycle=${cycle} error=${message}`,
      }),
    )
    .catch((auditError) => {
      console.error(`[relay-cycle] could not append relay.cycle.fail audit: ${auditError}`);
    });
}

async function appendRelayTrace(
  protocol: string,
  remotePeerId: string,
  summary: string,
  latencyMs?: number,
): Promise<void> {
  try {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        direction: "outbound",
        protocol,
        remotePeerId,
        latencyMs,
        outcome: "record",
        summary,
      }),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[relay-trace] append failed protocol=${protocol} remotePeerId=${remotePeerId} error=${detail}`);
  }
}

function pushBootstrapProbeResult(entry: {
  peer: string;
  ok: boolean;
  latencyMs?: number;
  error?: string;
}): void {
  bootstrapProbeResults.push(entry);
  if (bootstrapProbeResults.length > MAX_BOOTSTRAP_PROBE_RESULTS) {
    bootstrapProbeResults.splice(0, bootstrapProbeResults.length - MAX_BOOTSTRAP_PROBE_RESULTS);
  }
}

function scheduleBootstrapReprobe(peers: string[]): void {
  if (peers.length === 0) {
    return;
  }
  const jitterMs = Math.floor(Math.random() * BOOTSTRAP_REPROBE_JITTER_MS);
  bootstrapReprobeTimer = setTimeout(() => {
    void runBootstrapReprobe(peers);
  }, BOOTSTRAP_REPROBE_INTERVAL_MS + jitterMs);
}

async function runBootstrapReprobe(peers: string[]): Promise<void> {
  if (peers.length === 0) {
    return;
  }

  const peer = peers[bootstrapReprobeCursor % peers.length];
  bootstrapReprobeCursor = (bootstrapReprobeCursor + 1) % peers.length;

  try {
    const latencyMs = await mesh.probePeer(peer);
    pushBootstrapProbeResult({ peer, ok: true, latencyMs });
    await discoverySeedStore.upsertSuccess(peer, "bootstrap-probe");
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        direction: "outbound",
        protocol: "connectivity.reprobe.ok",
        remotePeerId: peer,
        latencyMs,
        outcome: "record",
        summary: `bootstrap reprobe ok peer=${peer} latencyMs=${latencyMs}`,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushBootstrapProbeResult({ peer, ok: false, error: message });
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        direction: "outbound",
        protocol: "connectivity.reprobe.fail",
        remotePeerId: peer,
        outcome: "record",
        summary: `bootstrap reprobe failed peer=${peer} error=${message}`,
      }),
    );
  } finally {
    scheduleBootstrapReprobe(peers);
  }
}
