/**
 * Two-node E2E: NodeServiceImpl.sendAgentChat delivers chat.message with honest agent role.
 */
import {
  createDeviceCertificate,
  deriveDeviceId,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  verifyAgentEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { parseChatMessagePayload } from "@envoymesh/protocol";
import { EnvoyMesh } from "@envoymesh/network";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";

const meshes: EnvoyMesh[] = [];
const profileDirs: string[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => {})));
  await Promise.all(profileDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

interface TestNode {
  profileDir: string;
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
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-agent-chat-"));
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
  return { profileDir, profile, mesh, taskStore, trustStore, peerDirectory, human, service };
}

async function registerBondedPeer(local: TestNode, remote: TestNode, displayName: string): Promise<void> {
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

describe("E2E sendAgentChat (Phase 13A)", () => {
  it("delivers chat.message with senderRole=agent and verifiable agentCredential", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");

    let receivedEnvelope: import("@envoymesh/protocol").EnvoyEnvelope | null = null;

    bob.mesh.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent !== "chat.message") return;
      receivedEnvelope = envelope;
    });

    await alice.mesh.probePeer(bob.mesh.multiaddrs[0]!);

    const result = await alice.service.sendAgentChat(
      bob.profile.owner.ownerId,
      "Auto-reply from Alice agent",
    );
    expect(result.messageId).toBeTruthy();

    await new Promise((r) => setTimeout(r, 1500));

    expect(receivedEnvelope).not.toBeNull();
    expect(receivedEnvelope!.senderRole).toBe("agent");
    expect(receivedEnvelope!.recipientRole).toBe("human");
    expect(receivedEnvelope!.agentCredential).toBeTruthy();
    expect(verifyAgentEnvelope(receivedEnvelope!)).toBe(true);

    const payload = parseChatMessagePayload(receivedEnvelope!.payload);
    expect(payload.text).toContain("Auto-reply from Alice agent");
    expect(payload.senderOwnerId).toBe(alice.profile.owner.ownerId);
    expect(receivedEnvelope!.senderPeerId).not.toBe(
      derivePeerId(alice.profile.device.publicKeyPem),
    );
  });
});
