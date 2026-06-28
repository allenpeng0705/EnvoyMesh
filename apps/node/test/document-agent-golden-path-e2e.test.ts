/**
 * P0 golden path: agent publish → discover → request share → Bob shareFile → Alice accept
 * → verified bytes + transfer status (including agent transfer_status queries).
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
  createSharePreviewPayload,
  createUnsignedEnvelope,
  parseChatMessagePayload,
  parseShareAcceptPayload,
  parseSharePreviewPayload,
  parseShareRequestPayload,
} from "@envoymesh/protocol";
import { EnvoyMesh } from "@envoymesh/network";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleInboundDiscoveryIntent } from "../src/discovery-inbound.js";
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
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-golden-path-"));
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
  const file = {
    version: "0.1" as const,
    records: [
      {
        version: "0.1" as const,
        ownerId: remote.profile.owner.ownerId,
        peerId: remote.mesh.peerId,
        deviceId: deriveDeviceId(remote.profile.device.publicKeyPem),
        devicePublicKeyPem: remote.profile.device.publicKeyPem,
        lastSeenAt: new Date().toISOString(),
        listenAddrs: remote.mesh.multiaddrs.map(String),
      },
    ],
  };
  await writeFile(join(local.profileDir, "peer-directory.json"), JSON.stringify(file, null, 2), {
    mode: 0o600,
  });
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

function wireChatCapture(node: TestNode, captured: string[]): void {
  node.mesh.onMessage(async ({ envelope }) => {
    if (!verifyInboundEnvelope(envelope)) return;
    if (envelope.intent !== "chat.message") return;
    const payload = parseChatMessagePayload(envelope.payload);
    captured.push(payload.text);
  });
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 25_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for condition");
}

describe("E2E document agent golden path (two-node libp2p)", () => {
  it("publish → discover → request → share → accept → verified bytes and transfer status", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryHandler(bob);
    installReceiver(alice);
    wireShareHandlers(bob, alice);

    const bobChat: string[] = [];
    wireChatCapture(bob, bobChat);

    const content = "golden path e2e payload\n";
    await mkdir(join(bob.vaultDir, "shared"), { recursive: true });
    await writeFile(join(bob.vaultDir, "shared/golden.txt"), content, { mode: 0o600 });

    const publishTurn = await bob.service.runDocumentAgentTurn('publish "shared/golden.txt"');
    expect(publishTurn.intent).toBe("publish");
    expect(publishTurn.toolsUsed).toContain("mesh.library_publish");

    const bobItems = await bob.service.listLibraryItems();
    expect(bobItems.find((i) => i.relativePath.includes("golden.txt"))?.published).toBe(true);

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);

    const discoverTurn = await alice.service.runDocumentAgentTurn("who has golden");
    expect(discoverTurn.intent).toBe("discover");
    expect(discoverTurn.answer.toLowerCase()).toContain("golden");

    const requestTurn = await alice.service.runDocumentAgentTurn("request share from Bob for golden");
    expect(requestTurn.intent).toBe("request_share_from");
    expect(requestTurn.toolsUsed).toContain("mesh.library_request_share");

    await waitFor(async () => bobChat.some((t) => t.includes("[Envoy AI]") && t.toLowerCase().includes("golden")));

    await bob.service.shareFile(alice.profile.owner.ownerId, {
      path: "shared/golden.txt",
      sensitivity: "friends",
    });

    const bobActive = await bob.service.listActiveTransfers();
    expect(bobActive.length).toBeGreaterThan(0);
    const outboundCorrelationId = bobActive[0]!.correlationId;

    await waitFor(async () => (await alice.service.listPendingShareOffers()).length > 0);
    const offers = await alice.service.listPendingShareOffers();
    expect(offers[0]?.senderVaultRelativePath).toContain("golden");
    const shareId = offers[0]!.shareId;

    await alice.service.acceptShare(shareId, "inbox/golden-received.txt");

    await waitFor(async () => {
      try {
        const out = await readFile(join(alice.vaultDir, "inbox/golden-received.txt"), "utf8");
        return out === content;
      } catch {
        return false;
      }
    });

    await waitFor(async () => {
      const senderStatus = await bob.service.getTransferStatus(outboundCorrelationId);
      return senderStatus?.phase === "verified";
    });
    await waitFor(async () => {
      const receiverStatus = await alice.service.getTransferStatus(shareId);
      return receiverStatus?.phase === "verified";
    });

    const received = await readFile(join(alice.vaultDir, "inbox/golden-received.txt"), "utf8");
    expect(received).toBe(content);

    const bobStatusTurn = await bob.service.runDocumentAgentTurn(`status of ${outboundCorrelationId}`);
    expect(bobStatusTurn.intent).toBe("transfer_status");
    expect(bobStatusTurn.answer).toContain("verified");

    const aliceStatusTurn = await alice.service.runDocumentAgentTurn(`status of ${shareId}`);
    expect(aliceStatusTurn.intent).toBe("transfer_status");
    expect(aliceStatusTurn.answer).toContain("verified");
  }, 60_000);
});
