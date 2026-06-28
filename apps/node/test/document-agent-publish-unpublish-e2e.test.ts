/**
 * Publish → discover sees metadata → unpublish → discover no longer matches.
 */
import {
  createDeviceCertificate,
  deriveDeviceId,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import {
  createDiscoveryResponsePayload,
  createUnsignedEnvelope,
} from "@envoymesh/protocol";
import { EnvoyMesh } from "@envoymesh/network";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleInboundDiscoveryIntent } from "../src/discovery-inbound.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";

const meshes: EnvoyMesh[] = [];
const profileDirs: string[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => {})));
  await Promise.all(profileDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

interface TestNode {
  profileDir: string;
  vaultDir: string;
  profile: NodeProfile;
  mesh: EnvoyMesh;
  taskStore: ReturnType<typeof createLocalTaskStore>;
  trustStore: ReturnType<typeof createLocalTrustStore>;
  peerDirectory: ReturnType<typeof createLocalPeerDirectoryStore>;
  human: ReturnType<typeof createHumanProfileStore>;
  service: NodeServiceImpl;
}

async function startMesh(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({ listen: ["/ip4/127.0.0.1/tcp/0"], enableMdns: false });
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

async function createTestNode(): Promise<TestNode> {
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-pub-unpub-"));
  profileDirs.push(profileDir);
  const vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });

  const profile = testProfile();
  const mesh = await startMesh();
  const taskStore = createLocalTaskStore(profileDir);
  const trustStore = createLocalTrustStore(profileDir);
  const peerDirectory = createLocalPeerDirectoryStore(profileDir);
  const human = createHumanProfileStore(profileDir);
  const service = new NodeServiceImpl(
    mesh,
    trustStore,
    peerDirectory,
    human,
    profileDir,
    profile,
    vaultDir,
  );
  service.bindCliTaskStore(taskStore);
  service.bindExternalMesh(mesh);
  return { profileDir, vaultDir, profile, mesh, taskStore, trustStore, peerDirectory, human, service };
}

async function registerBondedPeer(
  local: TestNode,
  remote: TestNode,
  displayName: string,
): Promise<void> {
  await local.trustStore.setTrustRecord({
    peerOwnerId: remote.profile.owner.ownerId,
    level: "direct",
    displayName,
  });
  await writeFile(
    join(local.profileDir, "peer-directory.json"),
    JSON.stringify(
      {
        version: "0.1",
        records: [
          {
            version: "0.1",
            ownerId: remote.profile.owner.ownerId,
            peerId: remote.mesh.peerId,
            deviceId: deriveDeviceId(remote.profile.device.publicKeyPem),
            devicePublicKeyPem: remote.profile.device.publicKeyPem,
            lastSeenAt: new Date().toISOString(),
            listenAddrs: remote.mesh.multiaddrs.map(String),
          },
        ],
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}

function wireDiscoveryHandler(node: TestNode): void {
  node.mesh.onMessage(async ({ envelope, remotePeerId, replyWithEnvelope }) => {
    if (!verifyInboundEnvelope(envelope)) return;
    if (envelope.intent !== "discovery.request" && envelope.intent !== "discovery.response") return;
    const discovery = await handleInboundDiscoveryIntent({
      envelope,
      profile: node.profile,
      remotePeerId,
      receivedAt: Date.now(),
      correlationId: envelope.correlationId,
      taskStore: node.taskStore,
      trustStore: node.trustStore,
      capabilityManifest: { version: "0.1", capabilities: [], topics: [] },
      anonymousDiscoveryMode: "off",
      vaultDir: node.vaultDir,
      profileDir: node.profileDir,
    });
    if (!discovery.ok || envelope.intent !== "discovery.request" || !discovery.responsePayload) return;
    if (!replyWithEnvelope) return;
    const unsignedResponse = createUnsignedEnvelope({
      senderPeerId: derivePeerId(node.profile.device.publicKeyPem),
      senderPublicKey: node.profile.device.publicKeyPem,
      recipientPeerId: envelope.senderPeerId,
      intent: "discovery.response",
      payload: createDiscoveryResponsePayload(discovery.responsePayload),
      correlationId: envelope.correlationId,
    });
    const signedResponse = signUnsignedEnvelope(unsignedResponse, node.profile.device.privateKeyPem);
    await replyWithEnvelope(signedResponse);
  });
}

describe("E2E document agent publish / unpublish catalog", () => {
  it("discover finds published metadata then unpublish removes it", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryHandler(bob);

    await mkdir(join(bob.vaultDir, "catalog"), { recursive: true });
    await writeFile(join(bob.vaultDir, "catalog/ephemeral-note.txt"), "publish unpublish e2e", {
      mode: 0o600,
    });

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);

    const publishTurn = await bob.service.runDocumentAgentTurn('publish "catalog/ephemeral-note.txt"');
    expect(publishTurn.intent).toBe("publish");
    expect(
      (await bob.service.listLibraryItems()).find((i) => i.relativePath.includes("ephemeral-note"))?.published,
    ).toBe(true);

    const discoverBefore = await alice.service.runDocumentAgentTurn("who has ephemeral-note");
    expect(discoverBefore.intent).toBe("discover");
    expect(discoverBefore.answer.toLowerCase()).toContain("ephemeral");

    const unpublishTurn = await bob.service.runDocumentAgentTurn('unpublish "catalog/ephemeral-note.txt"');
    expect(unpublishTurn.intent).toBe("unpublish");
    expect(
      (await bob.service.listLibraryItems()).find((i) => i.relativePath.includes("ephemeral-note"))?.published,
    ).toBe(false);

    const discoverAfter = await alice.service.runDocumentAgentTurn("who has ephemeral-note");
    expect(discoverAfter.intent).toBe("discover");
    expect(discoverAfter.answer.toLowerCase()).not.toContain("ephemeral-note");
  }, 45_000);
});
