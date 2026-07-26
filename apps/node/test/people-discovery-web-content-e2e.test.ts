/**
 * People discovery E2E — non-bonded contact find + public blog read.
 *
 * DHT find is mocked (same rationale as geo-discovery-e2e). Transport is a
 * real two-node libp2p mesh so libraryRead exercises the stranger/public path.
 *
 * Covers:
 *  - Bob searchPeers(capability:envoymesh.web-content / publish:photography)
 *    resolves Alice's ownerId (People sample / topic search)
 *  - Bob (unbonded) libraryReads Alice's public blog index + post body
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
} from "@envoymesh/local-store";
import { EnvoyMesh, setAllowLoopbackDialHints } from "@envoymesh/network";
import {
  createLibraryReadResponsePayload,
  createUnsignedEnvelope,
} from "@envoymesh/protocol";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WEB_CONTENT_DHT_TOPIC } from "../src/capability-discovery.js";
import { handleInboundLibraryRead } from "../src/library-read-inbound.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";

const meshes: EnvoyMesh[] = [];
const profileDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => {})));
  await Promise.all(profileDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  setAllowLoopbackDialHints(false);
});

function dialableAddr(mesh: EnvoyMesh): string {
  const addrs = mesh.multiaddrs.filter((a) => a.includes("/p2p/"));
  if (addrs.length === 0) throw new Error("mesh has no dialable multiaddr");
  return addrs[0]!;
}

async function writeWanConfig(profileDir: string): Promise<void> {
  await writeFile(
    join(profileDir, "node-config.json"),
    JSON.stringify({
      version: "0.1",
      profileDir,
      discoveryProfile: "wan-default",
      enableMdns: false,
      relayEnabled: false,
      relayServerEnabled: false,
      advertiseAddrs: [],
      bootstrapPeers: [],
      bootstrapPresets: ["public-libp2p"],
      configuredRelays: [],
      modelProviders: { mode: "mock" },
      chatAssistEnabled: false,
      updatedAt: new Date().toISOString(),
    }),
    "utf8",
  );
}

async function createPeopleNode() {
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-people-e2e-"));
  profileDirs.push(profileDir);
  await mkdir(profileDir, { recursive: true });
  await mkdir(join(profileDir, "web"), { recursive: true });
  await writeWanConfig(profileDir);

  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  const profile = {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "message.send", "vault.retrieve"],
    }),
  };

  setAllowLoopbackDialHints(true);
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
    enableDht: true,
    dhtClientMode: false,
    bootstrapPeers: [],
    enableRelay: false,
    enableAutoNat: false,
    enableDcutr: false,
    libp2pPrivateKeyPath: join(profileDir, "libp2p-key"),
  });
  await mesh.start();
  meshes.push(mesh);

  const trustStore = createLocalTrustStore(profileDir);
  const peerDirectory = createLocalPeerDirectoryStore(profileDir);
  const human = createHumanProfileStore(profileDir);
  const taskStore = createLocalTaskStore(profileDir);
  const service = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir, profile);
  service.bindCliTaskStore(taskStore);
  service.bindExternalMesh(mesh);

  return { mesh, service, profile, profileDir, taskStore, trustStore, peerDirectory };
}

type PeopleNode = Awaited<ReturnType<typeof createPeopleNode>>;

function wireLibraryReadHandler(node: PeopleNode): void {
  node.mesh.onMessage(async ({ envelope, remotePeerId, replyWithEnvelope }) => {
    if (!verifyInboundEnvelope(envelope)) return;
    if (envelope.intent !== "library.read") return;
    if (!replyWithEnvelope) return;

    const result = await handleInboundLibraryRead({
      envelope,
      remotePeerId,
      receivedAt: Date.now(),
      correlationId: envelope.correlationId,
      taskStore: node.taskStore,
      trustStore: node.trustStore,
      peerDirectoryStore: node.peerDirectory,
      profile: node.profile,
      profileDir: node.profileDir,
    });
    if (!result.ok) return;
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(node.profile.device.publicKeyPem),
      senderPublicKey: node.profile.device.publicKeyPem,
      recipientPeerId: envelope.senderPeerId,
      intent: "library.read.response",
      payload: createLibraryReadResponsePayload(result.responsePayload),
      correlationId: envelope.correlationId,
    });
    const signed = signUnsignedEnvelope(unsigned, node.profile.device.privateKeyPem);
    await replyWithEnvelope(signed);
  });
}

async function seedPeerDirectory(local: PeopleNode, remote: PeopleNode): Promise<void> {
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

describe("People discovery — web-content + public blog E2E", () => {
  it("finds a publisher via topic search and reads their public blog without a bond", async () => {
    const alice = await createPeopleNode();
    const bob = await createPeopleNode();
    const addr = dialableAddr(alice.mesh);
    await bob.mesh.probePeer(addr);

    const publishTopic = "publish:photography";
    vi.spyOn(bob.mesh, "findCapabilityTopicProviders").mockImplementation(async (topic) => {
      if (topic !== WEB_CONTENT_DHT_TOPIC && topic !== publishTopic) return [];
      return [{ peerId: alice.mesh.peerId, multiaddrs: [addr] }];
    });

    await alice.service.updateHumanProfile({
      displayName: "Alice Photographer",
      username: "alicephoto",
      profileVisibility: "public",
      hobbies: ["photography"],
      knowledge: [],
    });

    const published = await alice.service.publishWebContentEntry({
      template: "blog-post",
      title: "Street Light at Dusk",
      body: "A short public essay about city light.",
      visibility: "public",
      tags: ["photography"],
    });
    expect(published.path).toMatch(/^blog\/posts\//);

    // People searchPeers maps DHT peerId → ownerId via local peer-directory.
    await seedPeerDirectory(bob, alice);

    const byCapability = await bob.service.searchPeers({
      topic: WEB_CONTENT_DHT_TOPIC,
      maxResults: 10,
    });
    expect(byCapability.some((r) => r.nodeId === alice.mesh.peerId)).toBe(true);
    expect(byCapability.some((r) => r.ownerId === alice.profile.owner.ownerId)).toBe(true);
    expect(
      byCapability.find((r) => r.ownerId === alice.profile.owner.ownerId)?.profileVisibility,
    ).toBe("public");

    const byPublish = await bob.service.searchPeers({
      topic: publishTopic,
      maxResults: 10,
    });
    expect(byPublish.some((r) => r.ownerId === alice.profile.owner.ownerId)).toBe(true);

    // Still unbonded — public blog must be readable by strangers.
    const aliceBond = await bob.trustStore.getTrustRecord(alice.profile.owner.ownerId);
    expect(aliceBond).toBeUndefined();

    wireLibraryReadHandler(alice);

    const index = await bob.service.libraryRead({
      targetOwnerId: alice.profile.owner.ownerId,
      path: "blog/index.md",
    });
    expect(index.status).toBe("ok");
    expect(index.body).toContain("Street Light at Dusk");
    expect(index.body).toContain(published.path);

    const post = await bob.service.libraryRead({
      targetOwnerId: alice.profile.owner.ownerId,
      path: published.path,
    });
    expect(post.status).toBe("ok");
    expect(post.body).toContain("Street Light at Dusk");
    expect(post.body).toContain("city light");
  }, 60_000);
});
