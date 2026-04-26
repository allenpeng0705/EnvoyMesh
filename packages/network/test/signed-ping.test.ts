import { generateIdentity, signUnsignedEnvelope, verifyEnvelope } from "@envoymesh/identity";
import { createSystemPingPayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "../src/index.js";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
});

describe("signed ping over EnvoyMesh", () => {
  it("sends and verifies a signed system.ping between two local nodes", async () => {
    const senderIdentity = generateIdentity();
    const receiver = await startMesh();
    const sender = await startMesh();

    const received = new Promise<boolean>((resolve) => {
      receiver.onMessage(async ({ envelope }) => {
        resolve(
          envelope.intent === "system.ping" &&
            envelope.senderPeerId === senderIdentity.peerId &&
            verifyEnvelope(envelope),
        );
      });
    });

    const unsignedEnvelope = createUnsignedEnvelope({
      senderPeerId: senderIdentity.peerId,
      senderPublicKey: senderIdentity.publicKeyPem,
      recipientPeerId: receiver.peerId,
      intent: "system.ping",
      payload: createSystemPingPayload("integration test"),
    });

    await sender.send(receiver.multiaddrs[0], signUnsignedEnvelope(unsignedEnvelope, senderIdentity.privateKeyPem));

    await expect(received).resolves.toBe(true);
  });
});

async function startMesh(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
  });

  await mesh.start();
  meshes.push(mesh);
  return mesh;
}
