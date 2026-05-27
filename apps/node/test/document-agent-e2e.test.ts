import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import {
  createUnsignedEnvelope,
  createDiscoveryResponsePayload,
  parseChatMessagePayload,
} from "@envoymesh/protocol";
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
import { EnvoyMesh } from "@envoymesh/network";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleInboundDiscoveryIntent } from "../src/discovery-inbound.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";

const meshes: EnvoyMesh[] = [];
const profileDirs: string[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => {})));
  for (const dir of profileDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  }
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
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-doc-agent-e2e-"));
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

function wireChatCapture(node: TestNode, captured: string[]): void {
  node.mesh.onMessage(async ({ envelope }) => {
    if (!verifyInboundEnvelope(envelope)) return;
    if (envelope.intent !== "chat.message") return;
    const payload = parseChatMessagePayload(envelope.payload);
    captured.push(payload.text);
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

describe("E2E document agent (single node)", () => {
  it("lists library files via runDocumentAgentTurn", async () => {
    const node = await createTestNode();
    await mkdir(join(node.vaultDir, "docs"), { recursive: true });
    await writeFile(join(node.vaultDir, "docs/report.txt"), "doc-agent-e2e", { mode: 0o600 });

    const turn = await node.service.runDocumentAgentTurn("list my library files");
    expect(turn.intent).toBe("list_library");
    expect(turn.answer).toContain("report.txt");

    const activity = await node.service.listAgentActivity({ limit: 5 });
    expect(activity.some((row) => row.summary.includes("H2A list_library"))).toBe(true);
  });

  it("publish and unpublish via runDocumentAgentTurn", async () => {
    const node = await createTestNode();
    await mkdir(join(node.vaultDir, "pub"), { recursive: true });
    await writeFile(join(node.vaultDir, "pub/visible.md"), "# visible", { mode: 0o600 });

    const list = await node.service.listLibraryItems();
    const item = list.find((i) => i.relativePath.includes("visible.md"));
    expect(item).toBeDefined();

    const pub = await node.service.runDocumentAgentTurn('publish "pub/visible.md"');
    expect(pub.intent).toBe("publish");
    expect(pub.answer).toContain("Published metadata");

    const afterPub = await node.service.listLibraryItems();
    expect(afterPub.find((i) => i.documentId === item!.documentId)?.published).toBe(true);

    const unpub = await node.service.runDocumentAgentTurn('unpublish "pub/visible.md"');
    expect(unpub.intent).toBe("unpublish");
    const afterUnpub = await node.service.listLibraryItems();
    expect(afterUnpub.find((i) => i.documentId === item!.documentId)?.published).toBe(false);
  });

  it("share propose creates Inbox agent proposal", async () => {
    const node = await createTestNode();
    await node.trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:alex",
      level: "direct",
      displayName: "Alex",
    });
    await mkdir(join(node.vaultDir, "share"), { recursive: true });
    await writeFile(join(node.vaultDir, "share/contract.pdf"), "%PDF-fake", { mode: 0o600 });

    const turn = await node.service.runDocumentAgentTurn('share "share/contract.pdf" to Alex');
    expect(turn.intent).toBe("share_propose");
    expect(turn.toolsUsed).toContain("mesh.share_propose");

    const proposals = await node.service.listAgentShareProposals();
    expect(proposals.length).toBe(1);
    expect(proposals[0].targetOwnerId).toBe("envoy:owner:alex");
    expect(proposals[0].vaultRelativePath).toContain("contract.pdf");
  });

  it("request share from sends chat without auto-download", async () => {
    const node = await createTestNode();
    await node.trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:sam",
      level: "direct",
      displayName: "Sam",
    });

    const sendAgentChat = vi.spyOn(node.service, "sendAgentChat").mockResolvedValue({ messageId: "msg-1" });
    const discover = vi.spyOn(node.service, "discoverPublishedLibrary").mockResolvedValue([
      {
        peerOwnerId: "envoy:owner:sam",
        displayName: "Sam",
        libp2pPeerId: "12D3Sam",
        bondLevel: "direct",
        bondRank: 0,
        files: [
          {
            documentId: "d1",
            title: "kubo-parity.md",
            relativePath: "docs/kubo-parity.md",
            contentHash: "abc123hash0000",
            byteLength: 100,
          },
        ],
        latencyMs: 5,
      },
    ]);

    const turn = await node.service.runDocumentAgentTurn("request share from Sam for kubo parity");
    expect(turn.intent).toBe("request_share_from");
    expect(discover).toHaveBeenCalled();
    expect(sendAgentChat).toHaveBeenCalledWith(
      "envoy:owner:sam",
      expect.stringContaining("[Envoy AI]"),
    );
    expect(turn.answer).toContain("Sam");
  });

  it("discover intent includes request hints in answer", async () => {
    const node = await createTestNode();
    vi.spyOn(node.service, "discoverPublishedLibrary").mockResolvedValue([
      {
        peerOwnerId: "envoy:owner:sam",
        displayName: "Sam",
        libp2pPeerId: "12D3Sam",
        bondLevel: "direct",
        bondRank: 0,
        files: [
          {
            documentId: "d1",
            title: "parity.md",
            relativePath: "docs/parity.md",
            contentHash: "deadbeef1234",
            byteLength: 50,
          },
        ],
        latencyMs: 3,
      },
    ]);

    const turn = await node.service.runDocumentAgentTurn("who has parity checklist");
    expect(turn.intent).toBe("discover");
    expect(turn.answer).toContain("request share from Sam");
  });
});

describe("E2E document agent (two-node libp2p)", () => {
  it("discovers published metadata from bonded peer", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryHandler(bob);

    await mkdir(join(bob.vaultDir, "docs"), { recursive: true });
    await writeFile(join(bob.vaultDir, "docs/kubo-parity.md"), "# kubo parity checklist", { mode: 0o600 });
    const bobItems = await bob.service.listLibraryItems();
    const doc = bobItems.find((i) => i.relativePath.includes("kubo-parity"));
    expect(doc).toBeDefined();
    await bob.service.setLibraryItemPublished(doc!.documentId, true);

    await alice.mesh.probePeer(bob.mesh.multiaddrs[0]!);

    const results = await alice.service.discoverPublishedLibrary({ fileTitleQuery: "kubo-parity" });
    expect(results.some((r) => r.files.some((f) => f.title.includes("kubo-parity")))).toBe(true);
  }, 30_000);

  it("request share from peer delivers chat message over libp2p", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryHandler(bob);

    const bobChat: string[] = [];
    wireChatCapture(bob, bobChat);

    await mkdir(join(bob.vaultDir, "docs"), { recursive: true });
    await writeFile(join(bob.vaultDir, "docs/notes.md"), "shared notes", { mode: 0o600 });
    const bobDoc = (await bob.service.listLibraryItems()).find((i) => i.relativePath.includes("notes.md"));
    await bob.service.setLibraryItemPublished(bobDoc!.documentId, true);

    await alice.mesh.probePeer(bob.mesh.multiaddrs[0]!);

    const turn = await alice.service.runDocumentAgentTurn("request share from Bob for notes");
    expect(turn.intent).toBe("request_share_from");

    await waitFor(async () => bobChat.some((t) => t.includes("[Envoy AI]") && t.includes("notes")));
    expect(bobChat.some((t) => t.includes("notes.md"))).toBe(true);
  }, 30_000);

  it("full flow: publish → discover → request share (no vault bytes on requester)", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryHandler(bob);
    wireChatCapture(bob, []);

    await mkdir(join(bob.vaultDir, "shared"), { recursive: true });
    await writeFile(join(bob.vaultDir, "shared/golden.txt"), "golden test data", { mode: 0o600 });
    const doc = (await bob.service.listLibraryItems()).find((i) => i.relativePath.includes("golden"));
    await bob.service.setLibraryItemPublished(doc!.documentId, true);

    await alice.mesh.probePeer(bob.mesh.multiaddrs[0]!);

    const discoverTurn = await alice.service.runDocumentAgentTurn("who has golden");
    expect(discoverTurn.intent).toBe("discover");
    expect(discoverTurn.answer).toContain("golden");

    const requestTurn = await alice.service.runDocumentAgentTurn("request share from Bob for golden");
    expect(requestTurn.intent).toBe("request_share_from");

    const aliceVaultCopy = join(alice.vaultDir, "shared/golden.txt");
    let exists = false;
    try {
      await readFile(aliceVaultCopy);
      exists = true;
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  }, 30_000);
});
