/**
 * Tier-2 autonomy must not auto-share to referred bonds — proposal only.
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
  createSharePreviewPayload,
  createUnsignedEnvelope,
  parseShareAcceptPayload,
  parseSharePreviewPayload,
} from "@envoymesh/protocol";
import { DEFAULT_DOCUMENT_AUTONOMY_POLICY } from "@envoymesh/api";
import { EnvoyMesh } from "@envoymesh/network";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installEnvoyDataTransferReceiver } from "../src/data-transfer-inbound.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { handleInboundShareRequest } from "../src/share-inbound.js";

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
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-doc-autonomy-ref-"));
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
  level: "direct" | "referred",
): Promise<void> {
  await local.trustStore.setTrustRecord({
    peerOwnerId: remote.profile.owner.ownerId,
    level,
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

function installReceiver(node: TestNode): void {
  installEnvoyDataTransferReceiver({
    mesh: node.mesh,
    peerDirectoryStore: node.peerDirectory,
    taskStore: node.taskStore,
    vaultDir: node.vaultDir,
    resolveInboundRelativePath: (remotePeerId, voucherRelativePath) =>
      node.service.resolveInboundDataTransferRelativePath(remotePeerId, voucherRelativePath),
    onInboundVaultWriteCommitted: (remotePeerId, voucherSourceRelativePath) =>
      node.service.consumeInboundDataTransferSaveMapping(remotePeerId, voucherSourceRelativePath),
    onInboundTransferVerified: (input) => node.service.notifyInboundTransferVerified(input),
  });
}

function wireShareHandlers(sender: TestNode, receiver: TestNode): void {
  receiver.mesh.onMessage(async ({ envelope, remotePeerId }) => {
    if (!verifyInboundEnvelope(envelope)) return;
    if (envelope.intent !== "share.request") return;

    const share = await handleInboundShareRequest({
      envelope,
      remotePeerId,
      receivedAt: Date.now(),
      correlationId: envelope.correlationId,
      taskStore: receiver.taskStore,
      trustStore: receiver.trustStore,
      peerDirectoryStore: receiver.peerDirectory,
      profile: receiver.profile,
      vaultIndex: null,
      vaultDir: receiver.vaultDir,
      modelProviders: { mode: "mock" },
    });
    if (!share.ok) return;

    const unsignedResponse = createUnsignedEnvelope({
      senderPeerId: derivePeerId(receiver.profile.device.publicKeyPem),
      senderPublicKey: receiver.profile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: envelope.senderPeerId,
      recipientRole: "human",
      intent: "share.preview",
      payload: createSharePreviewPayload(share.responsePayload),
      correlationId: envelope.correlationId,
    });
    const signedResponse = signUnsignedEnvelope(unsignedResponse, receiver.profile.device.privateKeyPem);
    await receiver.mesh.send(remotePeerId, signedResponse);
  });

  sender.mesh.onMessage(async ({ envelope, remotePeerId }) => {
    if (!verifyInboundEnvelope(envelope)) return;
    if (envelope.intent === "share.preview") {
      try {
        const preview = parseSharePreviewPayload(envelope.payload);
        if (preview.isFileTransfer && !preview.refused) {
          sender.service.linkOutboundSharePreviewFromInbound(envelope.messageId, preview.inReplyTo);
        }
      } catch {
        /* ignore */
      }
      return;
    }
    if (envelope.intent === "share.accept") {
      try {
        const acc = parseShareAcceptPayload(envelope.payload);
        if (!acc.accept) return;
      } catch {
        return;
      }
      await sender.service.maybeSendShareFileForInboundAccept({
        envelope,
        remotePeerId,
        taskStore: sender.taskStore,
        vaultDir: sender.vaultDir,
      });
    }
  });
}

describe("E2E document autonomy — referred bond blocks tier-2 auto-share", () => {
  it("tier 2 with referred bond creates Inbox proposal instead of auto shareFile", async () => {
    const bob = await createTestNode();
    const alice = await createTestNode();
    await registerBondedPeer(bob, alice, "Alice", "referred");
    installReceiver(alice);
    wireShareHandlers(bob, alice);

    await bob.service.updateNodeConfig({
      aiSettings: {
        documentAutonomy: {
          ...DEFAULT_DOCUMENT_AUTONOMY_POLICY,
          maxAutonomousShareTier: 2,
        },
      },
    });

    await mkdir(join(bob.vaultDir, "out"), { recursive: true });
    await writeFile(join(bob.vaultDir, "out/referred-only.txt"), "referred bond e2e", { mode: 0o600 });

    await bob.mesh.probePeer(alice.mesh.multiaddrs[0]!);

    const turn = await bob.service.runDocumentAgentTurn('share "out/referred-only.txt" to Alice');
    expect(turn.intent).toBe("share_propose");
    expect(turn.toolsUsed).toContain("mesh.share_propose");
    expect(turn.answer).toContain("Inbox");

    const proposals = await bob.service.listAgentShareProposals();
    expect(proposals).toHaveLength(1);
    expect(proposals[0].targetOwnerId).toBe(alice.profile.owner.ownerId);
    expect(await alice.service.listPendingShareOffers()).toHaveLength(0);
  }, 30_000);
});
