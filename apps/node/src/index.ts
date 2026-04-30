import { evaluateCapability } from "@envoymesh/bonds";
import {
  auditEventForDispatcherDecision,
  createApprovalRequest,
  createAuditEvent,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  createTaskRuntimeStateStore,
  deriveCorrelationIdFromEnvelope,
  loadOrCreateNodeProfile,
  saveNodeProfile,
} from "@envoymesh/local-store";
import {
  createSignedDataTransferVoucher,
  derivePeerId,
  signUnsignedEnvelope,
  verifyAuthorizedDeviceEnvelope,
  verifyDeviceCertificate,
} from "@envoymesh/identity";
import {
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
  createTaskCancelPayload,
  createUnsignedDataTransferVoucher,
  parseDevicePairApprovePayload,
  parseDevicePairDeferredPayload,
  parseDevicePairRequestPayload,
  parseChatMessagePayload,
  parseRelayPeersResponsePayload,
  createSystemPingPayload,
  createSystemSignalPayload,
  createUnsignedEnvelope,
  parseSystemPingPayload,
  parseSystemSignalPayload,
  parseTaskCancelPayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseNodeArgs } from "./args.js";
import { buildOutboundCliEnvelopes } from "./cli-actions.js";
import { createInboundMessageGuard } from "./inbound-guard.js";
import { handleInboundBondIntent } from "./bond-inbound.js";
import { handleInboundDiscoveryIntent, handleInboundRelayPeersIntent } from "./discovery-inbound.js";
import { handleInboundKnowledgeQuery } from "./knowledge-query-inbound.js";
import { resolveNodeArgsTargetsByOwnerId } from "./owner-targeting.js";
import { createTaskDispatcher, isA2ATaskIntent, type DispatcherDecision } from "./task-dispatcher.js";
import { applyTaskRuntimeAfterHandled, guardInboundTaskRuntime } from "./task-runtime-guard.js";
import { installEnvoyDataTransferReceiver } from "./data-transfer-inbound.js";
import { evaluateInboundEnvelopeRolePolicy } from "./role-policy.js";
import { createDiscoverySeedStore } from "./discovery-seed-store.js";

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
const peerDirectoryRecords = await peerDirectoryStore.listPeerRecords();
const peerDirectorySeedAddrs = peerDirectoryRecords.flatMap((record) => record.listenAddrs);
const persistedSeedAddrs = await discoverySeedStore.listSeedAddrs();
const effectiveBootstrapPeers = dedupeAddrs([
  ...args.bootstrapPeers,
  ...peerDirectorySeedAddrs,
  ...persistedSeedAddrs,
]);
const mesh = new EnvoyMesh({
  listen: args.listen,
  enableMdns: args.enableMdns,
  enableDht: args.enableDht,
  dhtClientMode: args.dhtClientMode,
  bootstrapPeers: effectiveBootstrapPeers,
  enableRelay: args.enableRelay,
  enableRelayServer: args.enableRelayServer,
  enableAutoNat: args.enableAutoNat,
  enableDcutr: args.enableDcutr,
  enableQuic: args.enableQuic,
  enableP2pDebug: args.p2pDebug,
  onP2pDebug: (event) => {
    void appendP2pTrace(event);
  },
});
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
let bootstrapReprobeTimer: ReturnType<typeof setTimeout> | undefined;
let bootstrapReprobeCursor = 0;
let capabilityDiscoveryTimer: ReturnType<typeof setTimeout> | undefined;
let relayPeersQueryTimer: ReturnType<typeof setTimeout> | undefined;

if (args.discoveryProfile === "wan-default" && effectiveBootstrapPeers.length === 0) {
  connectivityWarnings.push(
    "wan-default selected without bootstrap peers; DHT/relay are enabled but discovery may be limited. Configure --bootstrap or ENVOYMESH_BOOTSTRAP_PEERS.",
  );
}

const autoCapabilityTopics = buildAutoCapabilityTopics(profile.deviceCertificate.capabilities);

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

mesh.onMessage(async ({ envelope: inboundEnvelope, remotePeerId }) => {
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
      const latencyMs = await mesh.send(envelope.senderPeerId, signedResponse);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.sent",
          intent: signedResponse.intent,
          messageId: signedResponse.messageId,
          correlationId: signedResponse.correlationId,
          remotePeerId: envelope.senderPeerId,
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
        remotePeerId: envelope.senderPeerId,
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

  if (envelope.intent === "relay.peers.request" || envelope.intent === "relay.peers.response") {
    const relayPeerIds = mesh.getConnectedRelayPeerIds();
    console.log(`[mac-relay] received ${envelope.intent} from ${remotePeerId}, relayPeerIds=${JSON.stringify(relayPeerIds)}`);
    const relayPeers = await handleInboundRelayPeersIntent({
      envelope,
      profile,
      remotePeerId,
      receivedAt,
      correlationId,
      taskStore,
      relayPeerIds,
      relayMultiaddrs: mesh.multiaddrs,
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
      const latencyMs = await mesh.send(envelope.senderPeerId, signedResponse);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.sent",
          intent: signedResponse.intent,
          messageId: signedResponse.messageId,
          correlationId: signedResponse.correlationId,
          remotePeerId: envelope.senderPeerId,
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
      const latencyMs = await mesh.send(envelope.senderPeerId, deferredEnvelope);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.sent",
          intent: "device.pair.deferred",
          messageId: deferredEnvelope.messageId,
          correlationId: deferredEnvelope.correlationId,
          remotePeerId: envelope.senderPeerId,
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
if (args.configPath) {
  console.log(`Config file: ${args.configPath}`);
}
console.log(`Owner ID: ${profile.owner.ownerId}`);
console.log(`Device ID: ${profile.device.deviceId}`);
console.log(`libp2p Peer ID: ${mesh.peerId}`);
console.log("Listening on:");
for (const addr of mesh.multiaddrs) {
  console.log(`  ${addr}`);
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
if (args.autoRelayPeersQuery && args.enableRelay && effectiveBootstrapPeers.length > 0) {
  await runRelayPeersQueryCycle("startup");
  scheduleRelayPeersQuery(effectiveBootstrapPeers);
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

console.log("Press Ctrl+C to stop.");

async function shutdown(): Promise<void> {
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
