import { evaluateCapability } from "@envoymesh/bonds";
import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyAuthorizedDeviceEnvelope,
} from "@envoymesh/identity";
import { createSystemSignalPayload, createUnsignedEnvelope, parseSystemSignalPayload } from "@envoymesh/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "../src/index.js";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
});

describe("signed signal over EnvoyMesh", () => {
  it("sends and verifies a certified primary system.signal between two local nodes", async () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const deviceCertificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "mesh.discovery", "message.send", "device.sync"],
    });
    const receiver = await startMesh();
    const sender = await startMesh();

    const received = new Promise<boolean>((resolve) => {
      receiver.onMessage(async ({ envelope }) => {
        const payload = parseSystemSignalPayload(envelope.payload);
        const capabilityDecision = evaluateCapability(envelope.intent, payload.capabilities);

        resolve(
          verifyAuthorizedDeviceEnvelope(envelope, payload.deviceCertificate, payload.ownerPublicKeyPem) &&
            capabilityDecision.action === "allow" &&
            payload.deviceProfile === "primary",
        );
      });
    });

    const unsignedEnvelope = createUnsignedEnvelope({
      senderPeerId: derivePeerId(device.publicKeyPem),
      senderPublicKey: device.publicKeyPem,
      recipientPeerId: receiver.peerId,
      intent: "system.signal",
      payload: createSystemSignalPayload({
        deviceCertificate,
        ownerPublicKeyPem: owner.publicKeyPem,
        listenAddrs: sender.multiaddrs,
      }),
    });

    await sender.send(receiver.multiaddrs[0], signUnsignedEnvelope(unsignedEnvelope, device.privateKeyPem));

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
