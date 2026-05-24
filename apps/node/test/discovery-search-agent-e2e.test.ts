/**
 * Agent discovery.search over real libp2p — requires verifyInboundEnvelope (not verifyEnvelope).
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
import { executeTool } from "../src/tool-registry.js";

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
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-disc-search-agent-"));
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

describe("E2E discovery.search (agent over libp2p)", () => {
  it("executeTool discovery.search receives discovery.response on same stream", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryHandler(bob);

    await mkdir(join(bob.vaultDir, "docs"), { recursive: true });
    await writeFile(join(bob.vaultDir, "docs/agent-search.txt"), "agent discovery search e2e", {
      mode: 0o600,
    });
    const doc = (await bob.service.listLibraryItems()).find((i) => i.relativePath.includes("agent-search"));
    await bob.service.setLibraryItemPublished(doc!.documentId, true);

    await alice.mesh.probePeer(bob.mesh.multiaddrs[0]!);

    const ctx = await alice.service.getToolExecutionContext();
    expect(ctx).not.toBeNull();

    const result = await executeTool(
      "discovery.search",
      {
        targetOwnerId: bob.profile.owner.ownerId,
        fileTitleQuery: "agent-search",
      },
      ctx!,
    );

    expect(result.ok).toBe(true);
    const payload = result.result as { matches?: Array<{ libraryMatches?: unknown[] }> };
    expect(payload.matches?.some((m) => (m.libraryMatches?.length ?? 0) > 0)).toBe(true);
  }, 30_000);
});
