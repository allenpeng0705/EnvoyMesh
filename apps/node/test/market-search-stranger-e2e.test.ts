/**
 * Phase 63C — stranger market search E2E (no bond).
 *
 * Alice publishes a public listing (+ bonds-only control). Bob (unbonded)
 * finds the public listing via connected path / peer-directory + market.search,
 * and does not see the bonds-only listing.
 *
 * DHT provide is mocked (same rationale as people-discovery-web-content-e2e);
 * transport is a real two-node libp2p mesh.
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
import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MARKET_SHOP_DHT_TOPIC } from "../src/capability-discovery.js";
import {
  buildMarketSearchResultPayload,
  handleInboundMarketSearch,
} from "../src/market-search-inbound.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";

const meshes: EnvoyMesh[] = [];
const profileDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => {})));
  await new Promise((r) => setTimeout(r, 50));
  await Promise.all(
    profileDirs.splice(0).map((d) => rm(d, { recursive: true, force: true }).catch(() => {})),
  );
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

async function createMarketNode() {
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-market-e2e-"));
  profileDirs.push(profileDir);
  await mkdir(profileDir, { recursive: true });
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

type MarketNode = Awaited<ReturnType<typeof createMarketNode>>;

async function seedPeerDirectory(local: MarketNode, remote: MarketNode): Promise<void> {
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

function wireMarketSearchHandlers(alice: MarketNode): void {
  alice.mesh.onMessage(async ({ envelope, remotePeerId, replyWithEnvelope }) => {
    if (!verifyInboundEnvelope(envelope)) return;
    if (envelope.intent !== "market.search") return;
    if (!replyWithEnvelope) return;
    const shopStore = alice.service.getShopStore();
    const shopProfile = shopStore ? await shopStore.getProfile() : null;
    const result = await handleInboundMarketSearch({
      envelope,
      shopStore,
      remotePeerId,
      trustStore: alice.trustStore,
      peerDirectoryStore: alice.peerDirectory,
      taskStore: alice.taskStore,
      localOwnerId: alice.profile.owner.ownerId,
      shopDisplayName: shopProfile?.displayName,
    });
    if (!result.ok || result.cards.length === 0) return;
    const responsePayload = buildMarketSearchResultPayload({
      query: result.query,
      cards: result.cards,
    });
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(alice.profile.device.publicKeyPem),
      senderPublicKey: alice.profile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: envelope.senderPeerId,
      recipientRole: "human",
      intent: "market.search.result",
      payload: responsePayload,
      correlationId: envelope.correlationId ?? envelope.messageId,
    });
    const signed = signUnsignedEnvelope(unsigned, alice.profile.device.privateKeyPem);
    await replyWithEnvelope(signed);
  });
}

describe("Market search — stranger public listing E2E", () => {
  it("finds a public listing without a bond and hides bonds-only", async () => {
    const alice = await createMarketNode();
    const bob = await createMarketNode();
    const addr = dialableAddr(alice.mesh);
    await bob.mesh.probePeer(addr);

    vi.spyOn(bob.mesh, "findCapabilityTopicProviders").mockImplementation(async (topic) => {
      if (topic !== MARKET_SHOP_DHT_TOPIC) return [];
      return [{ peerId: alice.mesh.peerId, multiaddrs: [addr] }];
    });

    await seedPeerDirectory(bob, alice);
    await seedPeerDirectory(alice, bob);
    wireMarketSearchHandlers(alice);

    await alice.service.shopUpdateProfile({
      displayName: "Alice Books",
      defaultVisibility: "public",
    });
    const publicListing = await alice.service.shopUpsertListing({
      title: "Clean Code paperback",
      description: "A classic software book",
      category: "books",
      tags: ["books", "software"],
      condition: "good",
      status: "active",
      visibility: "public",
      priceAmount: "68.00",
      priceCurrency: "CNY",
    });
    await alice.service.shopUpsertListing({
      title: "Friends-only notebook",
      description: "Only for bonded contacts",
      category: "other",
      tags: ["notebook"],
      condition: "new",
      status: "active",
      visibility: "bonds",
      priceAmount: "20.00",
      priceCurrency: "CNY",
    });

    const byTopic = await bob.service.searchPeers({
      topic: MARKET_SHOP_DHT_TOPIC,
      maxResults: 10,
    });
    expect(byTopic.some((r) => r.nodeId === alice.mesh.peerId)).toBe(true);

    const bond = await bob.trustStore.getTrustRecord(alice.profile.owner.ownerId);
    expect(bond).toBeUndefined();

    const found = await bob.service.marketSearch({ query: "book", limit: 20 });
    expect(found.cards.some((c) => c.listingId === publicListing.listing.listingId)).toBe(true);
    expect(found.cards.every((c) => c.visibility === "public")).toBe(true);
    expect(found.cards.some((c) => /friends-only/i.test(c.title))).toBe(false);
  }, 90_000);
});
