import { generateIdentity, signUnsignedEnvelope, verifyEnvelope } from "@envoymesh/identity";
import { createSystemPingPayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "../src/index.js";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
});

describe("QUIC transport (additive)", () => {
  it("accepts QUIC on a system.ping round trip", async (context) => {
    const senderIdentity = generateIdentity();
    let receiver: EnvoyMesh;
    let sender: EnvoyMesh;
    try {
      receiver = await startQuicMesh();
      sender = await startQuicMesh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("enableQuic requested but QUIC transport could not initialize")) {
        context.skip();
        return;
      }
      throw error;
    }

    const quicListen = receiver.multiaddrs.find((addr) => addr.includes("/quic-v1"));
    expect(quicListen).toBeDefined();
    // libp2p listen addresses already include `/p2p/<localPeerId>`; do not append `/p2p/` again.

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
      payload: createSystemPingPayload("quic integration test"),
    });

    await sender.send(quicListen!, signUnsignedEnvelope(unsignedEnvelope, senderIdentity.privateKeyPem));

    await expect(received).resolves.toBe(true);
  });
});

async function startQuicMesh(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
    enableQuic: true,
  });

  await mesh.start();
  meshes.push(mesh);
  expect(mesh.enabledFeatures).toContain("quic");
  return mesh;
}
