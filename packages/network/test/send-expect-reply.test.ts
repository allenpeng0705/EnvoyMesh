import { generateIdentity, signUnsignedEnvelope, verifyEnvelope } from "@envoymesh/identity";
import { createSystemPingPayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { EnvoyMesh } from "../src/index.js";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
});

describe("EnvoyMesh sendExpectReply", () => {
  it("reads relay-style reply on the same stream", async () => {
    const senderIdentity = generateIdentity();
    const receiverIdentity = generateIdentity();
    const receiver = await startMesh();
    const sender = await startMesh();

    receiver.onMessage(async ({ envelope, replyWithEnvelope }) => {
      if (
        envelope.intent === "system.ping" &&
        envelope.payload &&
        typeof envelope.payload === "object" &&
        (envelope.payload as { message?: string }).message === "request" &&
        replyWithEnvelope
      ) {
        const replyUnsigned = createUnsignedEnvelope({
          senderPeerId: receiverIdentity.peerId,
          senderPublicKey: receiverIdentity.publicKeyPem,
          recipientPeerId: senderIdentity.peerId,
          intent: "system.ping",
          payload: createSystemPingPayload("reply-on-stream"),
        });
        const reply = signUnsignedEnvelope(replyUnsigned, receiverIdentity.privateKeyPem);
        await replyWithEnvelope(reply);
      }
    });

    const request = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: senderIdentity.peerId,
        senderPublicKey: senderIdentity.publicKeyPem,
        recipientPeerId: receiver.peerId,
        intent: "system.ping",
        payload: createSystemPingPayload("request"),
      }),
      senderIdentity.privateKeyPem,
    );

    const reply = (await sender.sendExpectReply(receiver.multiaddrs[0], request)) as EnvoyEnvelope;
    expect(reply.intent).toBe("system.ping");
    expect(verifyEnvelope(reply)).toBe(true);
    const body = reply.payload as { message?: string };
    expect(body.message).toBe("reply-on-stream");
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
