/**
 * Two-node E2E: library Published/Private manifest + IPFS export metadata in discovery.
 *
 * Scenarios: DIS-02, EXP-04, EXP-05, EXP-06, E2E-04, and export RPC → peer CID visibility.
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
import { buildVaultIndex } from "@envoymesh/vault";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleInboundDiscoveryIntent } from "../src/discovery-inbound.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { createPublishedExternalStore } from "../src/published-external-store.js";
import * as kubo from "../src/kubo-ipfs-export.js";

vi.mock("../src/kubo-ipfs-engine.js", () => ({
  ensureKuboIpfsReady: vi.fn().mockResolvedValue(undefined),
  getKuboIpfsEngineStatus: vi.fn().mockReturnValue({
    available: true,
    running: false,
    managed: false,
  }),
  shutdownKuboIpfsEngine: vi.fn().mockResolvedValue(undefined),
}));

const meshes: EnvoyMesh[] = [];
const profileDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
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
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-lib-pub-exp-"));
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

async function connectPeers(local: TestNode, remote: TestNode): Promise<void> {
  await local.mesh.probePeer(remote.mesh.multiaddrs[0]!);
}

async function writeVaultFile(node: TestNode, relativePath: string, body: string): Promise<void> {
  const norm = relativePath.replace(/^[\\/]+/, "");
  const parts = norm.split("/");
  if (parts.length > 1) {
    await mkdir(join(node.vaultDir, ...parts.slice(0, -1)), { recursive: true });
  }
  await writeFile(join(node.vaultDir, norm), body, { mode: 0o600 });
}

async function libraryDoc(node: TestNode, pathHint: string) {
  const items = await node.service.listLibraryItems();
  const doc = items.find((i) => i.relativePath.includes(pathHint));
  expect(doc, `expected library item matching ${pathHint}`).toBeDefined();
  return doc!;
}

function bobHits(results: Awaited<ReturnType<NodeServiceImpl["discoverPublishedLibrary"]>>, bob: TestNode) {
  return results.find((r) => r.peerOwnerId === bob.profile.owner.ownerId)?.files ?? [];
}

describe("E2E library publish / export / discovery (two-node)", () => {
  it("DIS-02: private file is not returned in discoverPublishedLibrary", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryHandler(bob);

    await writeVaultFile(bob, "private/secret.txt", "keep this private");
    const doc = await libraryDoc(bob, "secret.txt");
    expect(doc.published).toBe(false);

    await connectPeers(alice, bob);
    const results = await alice.service.discoverPublishedLibrary({ fileTitleQuery: "secret" });
    expect(bobHits(results, bob)).toHaveLength(0);
  }, 30_000);

  it("EXP-04: IPFS export record without publish is invisible to peer discovery", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryHandler(bob);

    await writeVaultFile(bob, "exports/export-only.md", "# export only");
    const doc = await libraryDoc(bob, "export-only");
    const external = createPublishedExternalStore(bob.profileDir);
    await external.recordExport(doc.documentId, {
      cid: "bafyexportonlycid",
      ipfsInteropRecipe: "kubo-ipfs-export-v1",
      kuboVersion: "0.24.0",
      contentHash: doc.contentHash,
    });
    expect(doc.published).toBe(false);

    await connectPeers(alice, bob);
    const results = await alice.service.discoverPublishedLibrary({ fileTitleQuery: "export-only" });
    expect(bobHits(results, bob)).toHaveLength(0);
  }, 30_000);

  it("EXP-05: publish + IPFS export metadata includes cid for bonded peer", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryHandler(bob);

    await writeVaultFile(bob, "catalog/public-paper.md", "# Public paper");
    const doc = await libraryDoc(bob, "public-paper");
    await bob.service.setLibraryItemPublished(doc.documentId, true);
    await createPublishedExternalStore(bob.profileDir).recordExport(doc.documentId, {
      cid: "bafybeigdyrzt5sfp7ud17ehd8yfg4dpfyfm5dqn7q",
      ipfsInteropRecipe: "kubo-ipfs-export-v1",
      kuboVersion: "0.24.0",
      contentHash: doc.contentHash,
    });

    await connectPeers(alice, bob);
    const hits = bobHits(
      await alice.service.discoverPublishedLibrary({ fileTitleQuery: "public-paper" }),
      bob,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toContain("public-paper");
    expect(hits[0]?.cid).toBe("bafybeigdyrzt5sfp7ud17ehd8yfg4dpfyfm5dqn7q");
    expect(hits[0]?.contentHash).toBe(doc.contentHash);
  }, 30_000);

  it("EXP-06: stale IPFS export omits cid when export contentHash does not match vault", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryHandler(bob);

    await writeVaultFile(bob, "catalog/stale-export.md", "stable vault bytes");
    const doc = await libraryDoc(bob, "stale-export");
    await bob.service.setLibraryItemPublished(doc.documentId, true);
    await createPublishedExternalStore(bob.profileDir).recordExport(doc.documentId, {
      cid: "bafystalebeforeedit",
      ipfsInteropRecipe: "kubo-ipfs-export-v1",
      kuboVersion: "0.24.0",
      contentHash: "stale-hash-not-matching-vault",
    });

    await connectPeers(alice, bob);
    const hits = bobHits(
      await alice.service.discoverPublishedLibrary({ fileTitleQuery: "stale-export" }),
      bob,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.cid).toBeUndefined();
    expect(hits[0]?.title).toContain("stale-export");
    expect(hits[0]?.contentHash).toBe(doc.contentHash);
  }, 30_000);

  it("E2E-04: each bonded node discovers the other's published metadata (not their own)", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryHandler(alice);
    wireDiscoveryHandler(bob);

    await writeVaultFile(alice, "shared/alice-catalog.txt", "alice catalog entry");
    await writeVaultFile(bob, "shared/bob-catalog.txt", "bob catalog entry");
    const aliceDoc = await libraryDoc(alice, "alice-catalog");
    const bobDoc = await libraryDoc(bob, "bob-catalog");
    await alice.service.setLibraryItemPublished(aliceDoc.documentId, true);
    await bob.service.setLibraryItemPublished(bobDoc.documentId, true);

    await connectPeers(alice, bob);
    await connectPeers(bob, alice);

    const aliceView = await alice.service.discoverPublishedLibrary({ fileTitleQuery: "catalog" });
    const bobView = await bob.service.discoverPublishedLibrary({ fileTitleQuery: "catalog" });

    const aliceSeesBob = bobHits(aliceView, bob);
    const bobSeesAlice = bobView.find((r) => r.peerOwnerId === alice.profile.owner.ownerId)?.files ?? [];
    const bobSeesBob = bobHits(bobView, bob);

    expect(aliceSeesBob.some((f) => f.relativePath.includes("bob-catalog"))).toBe(true);
    expect(aliceSeesBob.some((f) => f.relativePath.includes("alice-catalog"))).toBe(false);
    expect(bobSeesAlice.some((f) => f.relativePath.includes("alice-catalog"))).toBe(true);
    expect(bobSeesBob.some((f) => f.relativePath.includes("bob-catalog"))).toBe(false);
  }, 45_000);

  it.skip("exportLibraryItemToIpfs on publisher surfaces cid to peer after publish", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryHandler(bob);

    await writeVaultFile(bob, "ipfs/rpc-export.txt", "rpc export path");
    const doc = await libraryDoc(bob, "rpc-export");
    await bob.service.updateNodeConfig({
      externalPublish: { allowIpfs: true, gatewayAllowlist: [] },
    });
    await bob.service.setLibraryItemPublished(doc.documentId, true);

    vi.spyOn(kubo, "kuboIpfsAddFileInteropRecipeV1").mockReturnValue({
      ok: true,
      cid: "bafyrpcexportcid",
      kuboVersion: "0.24.0",
      stderr: "",
    });

    const exported = await bob.service.exportLibraryItemToIpfs(doc.documentId);
    expect(exported.cid).toBe("bafyrpcexportcid");

    const index = await buildVaultIndex({ rootDir: bob.vaultDir });
    const refreshed = index.documents.find((d) => d.documentId === doc.documentId)!;
    const items = await bob.service.listLibraryItems();
    expect(items.find((i) => i.documentId === doc.documentId)?.publishedExternal?.cid).toBe(
      "bafyrpcexportcid",
    );

    await connectPeers(alice, bob);
    const hits = bobHits(
      await alice.service.discoverPublishedLibrary({ fileTitleQuery: "rpc-export" }),
      bob,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.cid).toBe("bafyrpcexportcid");
    expect(hits[0]?.contentHash).toBe(refreshed.contentHash);
  }, 30_000);
});
