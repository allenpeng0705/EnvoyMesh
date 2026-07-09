/**
 * Automated §4 WAN relay sign-off helper.
 *
 * When TEST_RELAY_ADDR is set, two relay-bootstrap clients must exchange
 * signed chat traffic — evidence for [wan-connectivity-signoff.md](../../docs/wan-connectivity-signoff.md).
 *
 * Default relay: community relay at 47.93.11.212:4001. Override with
 * TEST_RELAY_ADDR when running against a private relay.
 *
 *   npx vitest run apps/node/test/wan-relay-signoff-e2e.test.ts
 */

import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createChatMessagePayload,
  createUnsignedEnvelope,
  parseChatMessagePayload,
} from "@envoymesh/protocol";
import { EnvoyMesh } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/local-store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR } from "@envoymesh/api";

const RELAY_ADDR = process.env.TEST_RELAY_ADDR || DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR;
const itRelayed = RELAY_ADDR ? it : it.skip;
const meshes: EnvoyMesh[] = [];

describe("WAN §4 relay sign-off (automated, live relay)", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-wan-signoff-"));
  });

  afterEach(async () => {
    await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
    await rm(profileDir, { recursive: true, force: true });
  });

  itRelayed("relay-bootstrap clients exchange signed traffic (§4 baseline)", async () => {
    const senderProfile = testProfile();
    const sender = await startMeshWithRelay();
    const receiver = await startMeshWithRelay();

    const received: string[] = [];
    receiver.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent !== "chat.message") return;
      received.push(parseChatMessagePayload(envelope.payload).text);
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const chatPayload = createChatMessagePayload({
      senderOwnerId: senderProfile.owner.ownerId,
      text: "wan-relay-signoff ping",
    });
    const unsignedEnvelope = createUnsignedEnvelope({
      senderPeerId: derivePeerId(senderProfile.device.publicKeyPem),
      senderPublicKey: senderProfile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: receiver.peerId,
      recipientRole: "human",
      intent: "chat.message",
      payload: chatPayload,
    });
    const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, senderProfile.device.privateKeyPem);
    await sender.sendChat(receiver.multiaddrs[0], signedEnvelope);

    await waitFor(async () => received.length > 0, 8000);
    expect(received[0]).toBe("wan-relay-signoff ping");
  });
});

async function startMeshWithRelay(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
    bootstrapPeers: RELAY_ADDR ? [RELAY_ADDR] : [],
  });
  await mesh.start();
  meshes.push(mesh);
  return mesh;
}

function testProfile(): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "message.send", "task.execute"],
    }),
  };
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for condition");
}
