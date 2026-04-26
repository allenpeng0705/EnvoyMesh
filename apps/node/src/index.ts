import { evaluateCapability } from "@envoymesh/bonds";
import {
  auditEventForDispatcherDecision,
  createAuditEvent,
  createLocalTaskStore,
  loadOrCreateNodeProfile,
} from "@envoymesh/local-store";
import {
  derivePeerId,
  signUnsignedEnvelope,
  verifyAuthorizedDeviceEnvelope,
} from "@envoymesh/identity";
import { EnvoyMesh } from "@envoymesh/network";
import {
  createSystemPingPayload,
  createSystemSignalPayload,
  createUnsignedEnvelope,
  parseSystemPingPayload,
  parseSystemSignalPayload,
} from "@envoymesh/protocol";
import { parseNodeArgs } from "./args.js";
import { buildOutboundCliEnvelopes } from "./cli-actions.js";
import { createInboundMessageGuard } from "./inbound-guard.js";
import { createTaskDispatcher } from "./task-dispatcher.js";

const args = parseNodeArgs(process.argv.slice(2));
const profile = await loadOrCreateNodeProfile(args.profileDir);
const taskDispatcher = createTaskDispatcher();
const taskStore = createLocalTaskStore(args.profileDir);
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
});

mesh.onMessage(async ({ envelope: inboundEnvelope, remotePeerId }) => {
  const guardDecision = inboundGuard.inspect(inboundEnvelope);

  if (guardDecision.action === "reject") {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.rejected",
        intent: inboundEnvelope.intent,
        messageId: guardDecision.messageId ?? inboundEnvelope.messageId,
        remotePeerId,
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
      return;
    }

    if (capabilityDecision.action === "deny") {
      console.warn(
        `[rejected signal] from ${payload.ownerId}/${payload.deviceId}: ${capabilityDecision.reason}`,
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
        remotePeerId,
        outcome: "allow",
        summary: `Verified signal for owner ${payload.ownerId}.`,
        createdAt: envelope.createdAt,
      }),
    );
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
        remotePeerId,
        outcome: "allow",
        summary: "Verified ping message.",
        createdAt: envelope.createdAt,
      }),
    );
    return;
  }

  const taskDecision = await taskDispatcher.dispatch(envelope);
  if (taskDecision.action === "handled") {
    await taskStore.appendTaskJournalEntry(taskDecision.journalEntry);
    await taskStore.appendAuditEvent(
      auditEventForDispatcherDecision(taskDecision, {
        messageId: envelope.messageId,
        remotePeerId,
        createdAt: envelope.createdAt,
      }),
    );
    console.log(
      `[task ${taskDecision.state}] ${taskDecision.intent} task=${taskDecision.taskId} event=${taskDecision.journalEntry.eventId}`,
    );
    return;
  }

  if (taskDecision.action === "rejected") {
    await taskStore.appendAuditEvent(
      auditEventForDispatcherDecision(taskDecision, {
        messageId: envelope.messageId,
        remotePeerId,
        createdAt: envelope.createdAt,
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
      remotePeerId,
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

if (args.pingTarget) {
  const unsignedEnvelope = createUnsignedEnvelope({
    senderPeerId: derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    recipientPeerId: args.pingTarget,
    intent: "system.ping",
    payload: createSystemPingPayload(args.pingMessage ?? "hello from EnvoyMesh"),
  });
  const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, profile.device.privateKeyPem);

  await mesh.send(args.pingTarget, signedEnvelope);
  console.log(`[sent ping] target ${args.pingTarget}`);
}

if (args.signalTarget) {
  const unsignedEnvelope = createUnsignedEnvelope({
    senderPeerId: derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    recipientPeerId: args.signalTarget,
    intent: "system.signal",
    payload: createSystemSignalPayload({
      deviceCertificate: profile.deviceCertificate,
      ownerPublicKeyPem: profile.owner.publicKeyPem,
      listenAddrs: mesh.multiaddrs,
    }),
  });
  const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, profile.device.privateKeyPem);

  await mesh.send(args.signalTarget, signedEnvelope);
  console.log(`[sent signal] target ${args.signalTarget}`);
}

for (const outbound of buildOutboundCliEnvelopes(args, profile)) {
  await mesh.send(outbound.target, outbound.envelope);
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: outbound.envelope.intent,
      messageId: outbound.envelope.messageId,
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
