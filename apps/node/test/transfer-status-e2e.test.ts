/**
 * ADB-D E2E: transfer status tracking across two-node share + data transfer.
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
  parseShareRequestPayload,
} from "@envoymesh/protocol";
import { EnvoyMesh } from "@envoymesh/network";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-transfer-e2e-"));
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

async function registerBondedPeer(local: TestNode, remote: TestNode): Promise<void> {
  await local.trustStore.setTrustRecord({
    peerOwnerId: remote.profile.owner.ownerId,
    level: "direct",
    displayName: "Peer",
  });
  await writeFile(
    join(local.profileDir, "peer-directory.json"),
    JSON.stringify({
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
    }),
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
    let shareRequestPayload: ReturnType<typeof parseShareRequestPayload> | null = null;
    try {
      shareRequestPayload = parseShareRequestPayload(envelope.payload);
    } catch {
      shareRequestPayload = null;
    }
    if (shareRequestPayload?.requestType === "file" && shareRequestPayload.fileOrigin === "sender") {
      await receiver.service.recordInboundPushShareOffer({
        shareId: signedResponse.messageId,
        senderPeerId: remotePeerId,
        previewText: share.responsePayload.previewText,
        sensitivity: share.responsePayload.sensitivity as "public" | "friends" | "private",
        relativePath: shareRequestPayload.relativePath ?? "",
      });
    }
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
        if (!acc.accept) {
          sender.service.clearPendingShareStateForPreview(acc.inReplyTo);
          return;
        }
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

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for condition");
}

describe("E2E transfer status (ADB-D)", () => {
  it("tracks negotiating → verified for outbound share and inbound receive", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob);
    await registerBondedPeer(bob, alice);
    installReceiver(bob);
    wireShareHandlers(alice, bob);

    const alicePhases: string[] = [];
    const bobPhases: string[] = [];
    const stopAliceProgress = alice.service.on("share:progress", (status) => {
      alicePhases.push(status.phase);
    });
    const stopBobProgress = bob.service.on("share:progress", (status) => {
      bobPhases.push(status.phase);
    });

    const content = "transfer status e2e payload\n";
    await mkdir(join(alice.vaultDir, "out"), { recursive: true });
    await writeFile(join(alice.vaultDir, "out/status.txt"), content, { mode: 0o600 });

    await alice.mesh.probePeer(bob.mesh.multiaddrs[0]!);

    try {
      await alice.service.shareFile(bob.profile.owner.ownerId, {
        path: "out/status.txt",
        sensitivity: "friends",
      });

      const activeAfterShare = await alice.service.listActiveTransfers();
      expect(activeAfterShare.length).toBeGreaterThan(0);
      expect(activeAfterShare[0]?.phase).toBe("negotiating");
      const outboundCorrelationId = activeAfterShare[0]!.correlationId;

      await waitFor(async () => (await bob.service.listPendingShareOffers()).length > 0);
      const offers = await bob.service.listPendingShareOffers();
      const shareId = offers[0]!.shareId;

      await bob.service.acceptShare(shareId, "inbox/status-received.txt");

      await waitFor(async () => {
        const senderStatus = await alice.service.getTransferStatus(outboundCorrelationId);
        return senderStatus?.phase === "verified";
      });

      const senderStatus = await alice.service.getTransferStatus(outboundCorrelationId);
      expect(senderStatus?.phase).toBe("verified");
      expect(senderStatus?.vaultRelativePath).toContain("status");

      await waitFor(async () => {
        const receiverStatus = await bob.service.getTransferStatus(shareId);
        return receiverStatus?.phase === "verified";
      });

      const out = await readFile(join(bob.vaultDir, "inbox/status-received.txt"), "utf8");
      expect(out).toBe(content);

      expect(alicePhases).toContain("negotiating");
      expect(alicePhases).toContain("verified");
      expect(bobPhases).toContain("negotiating");
      expect(bobPhases).toContain("verified");
    } finally {
      stopAliceProgress();
      stopBobProgress();
    }
  }, 30_000);

  it("agent can query active transfers via runDocumentAgentTurn", async () => {
    const alice = await createTestNode();
    await alice.trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:bob",
      level: "direct",
      displayName: "Bob",
    });
    await writeFile(
      join(alice.profileDir, "peer-directory.json"),
      JSON.stringify({ version: "0.1", records: [] }),
      { mode: 0o600 },
    );
    await mkdir(join(alice.vaultDir, "out"), { recursive: true });
    await writeFile(join(alice.vaultDir, "out/x.txt"), "x", { mode: 0o600 });

    try {
      await alice.service.shareFile("envoy:owner:bob", { path: "out/x.txt", sensitivity: "friends" });
    } catch {
      // peer unreachable is fine — negotiating state may still be recorded before send fails
    }

    const turn = await alice.service.runDocumentAgentTurn("active transfers");
    expect(turn.intent).toBe("transfer_status");
    expect(turn.toolsUsed).toContain("mesh.transfer_status");
  });
});
