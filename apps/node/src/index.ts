import { evaluateCapability } from "@envoymesh/bonds";
import {
  auditEventForDispatcherDecision,
  createAuditEvent,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  createTaskRuntimeStateStore,
  deriveCorrelationIdFromEnvelope,
  loadOrCreateNodeProfile,
} from "@envoymesh/local-store";
import {
  derivePeerId,
  signUnsignedEnvelope,
  verifyAuthorizedDeviceEnvelope,
} from "@envoymesh/identity";
import { ENVOY_MESSAGE_PROTOCOL, EnvoyMesh, type P2pDebugEvent } from "@envoymesh/network";
import {
  createDiscoveryResponsePayload,
  createSystemPingPayload,
  createSystemSignalPayload,
  createUnsignedEnvelope,
  parseSystemPingPayload,
  parseSystemSignalPayload,
} from "@envoymesh/protocol";
import { parseNodeArgs } from "./args.js";
import { buildOutboundCliEnvelopes } from "./cli-actions.js";
import { createInboundMessageGuard } from "./inbound-guard.js";
import { handleInboundBondIntent } from "./bond-inbound.js";
import { handleInboundDiscoveryIntent } from "./discovery-inbound.js";
import { handleInboundKnowledgeQuery } from "./knowledge-query-inbound.js";
import { resolveNodeArgsTargetsByOwnerId } from "./owner-targeting.js";
import { createTaskDispatcher, isA2ATaskIntent } from "./task-dispatcher.js";
import { applyTaskRuntimeAfterHandled, guardInboundTaskRuntime } from "./task-runtime-guard.js";

const args = parseNodeArgs(process.argv.slice(2));
const profile = await loadOrCreateNodeProfile(args.profileDir);
const taskDispatcher = createTaskDispatcher();
const taskStore = createLocalTaskStore(args.profileDir);
const trustStore = createLocalTrustStore(args.profileDir);
const peerDirectoryStore = createLocalPeerDirectoryStore(args.profileDir);
const taskRuntimeStore = createTaskRuntimeStateStore(args.profileDir);
const resolvedArgs = await resolveNodeArgsTargetsByOwnerId(args, peerDirectoryStore);
const inboundGuard = createInboundMessageGuard();
const mesh = new EnvoyMesh({
  listen: args.listen,
  enableMdns: args.enableMdns,
  enableDht: args.enableDht,
  dhtClientMode: args.dhtClientMode,
  bootstrapPeers: args.bootstrapPeers,
  enableRelay: args.enableRelay,
  enableRelayServer: args.enableRelayServer,
  enableAutoNat: args.enableAutoNat,
  enableDcutr: args.enableDcutr,
  enableP2pDebug: args.p2pDebug,
  onP2pDebug: (event) => {
    void appendP2pTrace(event);
  },
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
    }
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

await mesh.start();

console.log("Envoy node started");
console.log(`Owner ID: ${profile.owner.ownerId}`);
console.log(`Device ID: ${profile.device.deviceId}`);
console.log(`libp2p Peer ID: ${mesh.peerId}`);
console.log("Listening on:");

for (const addr of mesh.multiaddrs) {
  console.log(`  ${addr}`);
}

if (resolvedArgs.pingTarget) {
  const unsignedEnvelope = createUnsignedEnvelope({
    senderPeerId: derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
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

for (const outbound of buildOutboundCliEnvelopes(resolvedArgs, profile)) {
  const latencyMs = await mesh.send(outbound.target, outbound.envelope);
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: outbound.envelope.intent,
      messageId: outbound.envelope.messageId,
      correlationId: outbound.envelope.correlationId,
      remotePeerId: outbound.target,
      direction: "outbound",
      latencyMs,
      protocol: ENVOY_MESSAGE_PROTOCOL,
      outcome: "record",
      summary: `Sent ${outbound.label}.`,
      createdAt: outbound.envelope.createdAt,
    }),
  );
  console.log(`[sent ${outbound.label}] target ${outbound.target}`);
}

console.log("Press Ctrl+C to stop.");

async function shutdown(): Promise<void> {
  await mesh.stop();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

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
