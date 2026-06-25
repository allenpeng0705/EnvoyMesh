/**
 * E2E: two real libp2p nodes on localhost — verified file bytes over ENVOY_DATA_PROTOCOL
 * and full share.request → share.preview → share.accept → data transfer via NodeServiceImpl.
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
import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installEnvoyDataTransferReceiver } from "../src/data-transfer-inbound.js";
import { sendVaultFileViaDataTransfer } from "../src/node-file-share.js";
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
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
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

async function createTestNode(): Promise<TestNode> {
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-two-node-"));
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
    displayName: "Bonded peer",
  });
  await local.peerDirectory.ensurePeerFromInboundChat({
    ownerId: remote.profile.owner.ownerId,
    peerId: remote.mesh.peerId,
    listenAddrs: remote.mesh.multiaddrs.map(String),
  });
  await local.peerDirectory.mergeInboundDeviceBinding({
    peerId: remote.mesh.peerId,
    ownerId: remote.profile.owner.ownerId,
    devicePublicKeyPem: remote.profile.device.publicKeyPem,
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
  });
}

/** Minimal share pipeline (subset of apps/node/src/index.ts inbound handlers). */
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

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for condition");
}

describe("E2E two-node file share (real libp2p)", () => {
  it("delivers vault bytes over ENVOY_DATA_PROTOCOL between two meshes", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(bob, alice);
    installReceiver(bob);

    const content = "two-node libp2p data transfer e2e\n";
    await mkdir(join(alice.vaultDir, "share"), { recursive: true });
    await writeFile(join(alice.vaultDir, "share/payload.txt"), content, { mode: 0o600 });

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);

    await sendVaultFileViaDataTransfer({
      mesh: alice.mesh,
      profile: alice.profile,
      taskStore: alice.taskStore,
      vaultDir: alice.vaultDir,
      relativePath: "share/payload.txt",
      toPeerId: bob.mesh.multiaddrs[0]!,
    });

    await waitFor(async () => {
      try {
        const out = await readFile(join(bob.vaultDir, "share/payload.txt"), "utf8");
        return out === content;
      } catch {
        return false;
      }
    });

    const out = await readFile(join(bob.vaultDir, "share/payload.txt"), "utf8");
    expect(out).toBe(content);
  }, 30_000);

  it("shareFile → acceptShare → receiver vault contains sender file at save path", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob);
    await registerBondedPeer(bob, alice);
    installReceiver(bob);
    wireShareHandlers(alice, bob);

    const content = "full two-node share protocol e2e\n";
    await mkdir(join(alice.vaultDir, "out"), { recursive: true });
    await writeFile(join(alice.vaultDir, "out/report.txt"), content, { mode: 0o600 });

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);

    await alice.service.shareFile(bob.profile.owner.ownerId, {
      path: "out/report.txt",
      sensitivity: "friends",
    });

    await waitFor(async () => (await bob.service.listPendingShareOffers()).length > 0);
    const offers = await bob.service.listPendingShareOffers();
    expect(offers.length).toBe(1);
    expect(offers[0].senderVaultRelativePath).toBe("out/report.txt");

    await bob.service.acceptShare(offers[0].shareId, "inbox/received-report.txt");

    await waitFor(async () => {
      try {
        const out = await readFile(join(bob.vaultDir, "inbox/received-report.txt"), "utf8");
        return out === content;
      } catch {
        return false;
      }
    }, 20_000);

    const received = await readFile(join(bob.vaultDir, "inbox/received-report.txt"), "utf8");
    expect(received).toBe(content);
    expect(await bob.service.listPendingShareOffers()).toHaveLength(0);
  }, 45_000);
});
