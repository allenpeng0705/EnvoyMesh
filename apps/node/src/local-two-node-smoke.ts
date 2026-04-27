import {
  createProofOfIntent,
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signMandate,
  signUnsignedEnvelope,
} from "@envoymesh/identity";
import { EnvoyMesh } from "@envoymesh/network";
import {
  createChatMessagePayload,
  createTaskProposePayload,
  createUnsignedEnvelope,
  createUnsignedMandate,
  parseChatMessagePayload,
  parseTaskProposePayload,
} from "@envoymesh/protocol";

interface LocalProfile {
  owner: ReturnType<typeof generateOwnerIdentity>;
  device: ReturnType<typeof generateDeviceIdentity>;
}

async function main(): Promise<void> {
  const meshA = new EnvoyMesh({ listen: ["/ip4/127.0.0.1/tcp/0"], enableMdns: false });
  const meshB = new EnvoyMesh({ listen: ["/ip4/127.0.0.1/tcp/0"], enableMdns: false });
  await Promise.all([meshA.start(), meshB.start()]);

  const profileA = makeProfile();
  const profileB = makeProfile();
  let seenChat = false;
  let seenTask = false;

  meshA.onMessage(async ({ envelope }) => {
    if (envelope.intent === "chat.message") {
      const chat = parseChatMessagePayload(envelope.payload);
      if (chat.text.includes("smoke")) {
        seenChat = true;
      }
    }
    if (envelope.intent === "task.propose") {
      const task = parseTaskProposePayload(envelope.payload);
      if (task.taskId === "local-smoke-task-1") {
        seenTask = true;
      }
    }
  });

  const chatEnvelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(profileB.device.publicKeyPem),
      senderPublicKey: profileB.device.publicKeyPem,
      recipientPeerId: meshA.peerId,
      intent: "chat.message",
      payload: createChatMessagePayload({
        senderOwnerId: profileB.owner.ownerId,
        text: "local smoke hello",
      }),
      correlationId: `local-smoke-chat-${Date.now().toString(36)}`,
    }),
    profileB.device.privateKeyPem,
  );

  const mandate = signMandate({
    owner: profileB.owner,
    unsignedMandate: createUnsignedMandate({
      ownerId: profileB.owner.ownerId,
      issuedToDeviceId: profileB.device.deviceId,
      taskIntent: "local-smoke",
      objective: "Validate local two-node task flow",
      mandateId: "local-smoke-mandate-1",
    }),
  });
  const proofOfIntent = createProofOfIntent({
    mandate,
    taskId: "local-smoke-task-1",
    requestIntent: "task.propose",
    device: profileB.device,
  });
  const taskEnvelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(profileB.device.publicKeyPem),
      senderPublicKey: profileB.device.publicKeyPem,
      recipientPeerId: meshA.peerId,
      intent: "task.propose",
      payload: createTaskProposePayload({
        taskId: "local-smoke-task-1",
        mandateId: mandate.mandateId,
        proofOfIntent,
        objective: "Run local smoke",
        requestedResult: "Acknowledge local flow",
      }),
      correlationId: `local-smoke-task-${Date.now().toString(36)}`,
    }),
    profileB.device.privateKeyPem,
  );

  await meshB.send(meshA.multiaddrs[0], chatEnvelope);
  await meshB.send(meshA.multiaddrs[0], taskEnvelope);
  await waitUntil(() => seenChat && seenTask, 2500);

  await Promise.all([meshA.stop(), meshB.stop()]);
  console.log("[local-two-node-smoke] success: chat + task.propose delivered across two local meshes");
}

function makeProfile(): LocalProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  createDeviceCertificate({
    owner,
    device,
    deviceProfile: "primary",
    capabilities: ["mesh.listen", "mesh.discovery", "message.send", "task.execute"],
  });
  return { owner, device };
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("local-two-node-smoke timed out");
}

void main().catch((error) => {
  console.error("[local-two-node-smoke] failed", error);
  process.exit(1);
});
