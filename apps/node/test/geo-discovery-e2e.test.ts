/**
 * Two-node geo discovery E2E — two connected NodeService peers; DHT provide/find mocked
 * (real libp2p DHT provide hangs without a full bootstrap network — see dht-capability-topic.test.ts).
 *
 * Validates: public profile save → geo topic advertise; peer searchPeers({ topics }) → find.
 */
import { deriveLocationDiscoveryTopics } from "@envoymesh/api";
import {
  createDeviceCertificate,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { EnvoyMesh } from "@envoymesh/network";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";

const meshes: EnvoyMesh[] = [];
const profileDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => {})));
  await Promise.all(profileDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function dialableAddr(mesh: EnvoyMesh): string {
  const addrs = mesh.multiaddrs.filter((a) => a.includes("/p2p/"));
  if (addrs.length === 0) {
    throw new Error("mesh has no dialable multiaddr");
  }
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
      updatedAt: new Date().toISOString(),
    }),
    "utf8",
  );
}

async function createGeoNode(bootstrapPeers: string[] = []) {
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-geo-e2e-"));
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
      capabilities: ["mesh.listen", "message.send"],
    }),
  };

  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
    enableDht: true,
    dhtClientMode: false,
    bootstrapPeers,
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
  const service = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir, profile);

  return { mesh, service, profile, profileDir };
}

describe("Geo discovery two-node E2E", () => {
  it("advertiser saves public city profile; searcher finds geo:city topic on DHT", async () => {
    const advertiser = await createGeoNode();
    const addr = dialableAddr(advertiser.mesh);

    const searcher = await createGeoNode([addr]);
    await searcher.mesh.probePeer(addr);

    const discoveryLocation = { countryCode: "US", city: "Boston" };
    const cityTopic = "geo:city:US-boston";
    expect(
      deriveLocationDiscoveryTopics({ location: discoveryLocation, precision: "city" }),
    ).toContain(cityTopic);

    const advertisedTopics: string[] = [];
    vi.spyOn(advertiser.mesh, "provideCapabilityTopic").mockImplementation(async (topic) => {
      advertisedTopics.push(topic);
      return { cid: {} as never };
    });

    vi.spyOn(searcher.mesh, "findCapabilityTopicProviders").mockImplementation(async (topic) => {
      if (topic !== cityTopic) return [];
      return [
        {
          peerId: advertiser.mesh.peerId,
          multiaddrs: [addr],
        },
      ];
    });

    await advertiser.service.updateHumanProfile({
      displayName: "Boston Alice",
      username: "bostonalice",
      profileVisibility: "public",
      hobbies: [],
      knowledge: [],
      discoveryLocation,
      discoveryLocationPrecision: "city",
    });

    expect(advertisedTopics).toContain(cityTopic);
    expect(advertisedTopics).toContain("geo:country:US");
    expect(advertisedTopics).toContain("username:bostonalice");

    const results = await searcher.service.searchPeers({
      topics: [cityTopic],
      maxResults: 10,
    });

    expect(results.some((row) => row.nodeId === advertiser.mesh.peerId)).toBe(true);
    expect(results[0]?.discoverySource).toBe("dht-capability-topic");
  });

  it("downgrading precision cancels stale geo city topic", async () => {
    const advertiser = await createGeoNode();
    const cityTopic = "geo:city:US-boston";
    const countryTopic = "geo:country:US";

    vi.spyOn(advertiser.mesh, "provideCapabilityTopic").mockResolvedValue({ cid: {} as never });
    const cancelSpy = vi
      .spyOn(advertiser.mesh, "cancelCapabilityTopicReprovide")
      .mockResolvedValue(undefined);

    await advertiser.service.updateHumanProfile({
      displayName: "Boston Alice",
      username: "bostonalice",
      profileVisibility: "public",
      hobbies: [],
      knowledge: [],
      discoveryLocation: { countryCode: "US", city: "Boston" },
      discoveryLocationPrecision: "city",
    });

    cancelSpy.mockClear();

    await advertiser.service.updateHumanProfile({
      displayName: "Boston Alice",
      username: "bostonalice",
      profileVisibility: "public",
      hobbies: [],
      knowledge: [],
      discoveryLocation: { countryCode: "US", city: "Boston" },
      discoveryLocationPrecision: "country",
    });

    expect(cancelSpy).toHaveBeenCalledWith(cityTopic);
    expect(cancelSpy).not.toHaveBeenCalledWith(countryTopic);
  });

  it("private profile cancels auto-advertised geo topics", async () => {
    const advertiser = await createGeoNode();
    vi.spyOn(advertiser.mesh, "provideCapabilityTopic").mockResolvedValue({ cid: {} as never });
    const cancelSpy = vi
      .spyOn(advertiser.mesh, "cancelCapabilityTopicReprovide")
      .mockResolvedValue(undefined);

    await advertiser.service.updateHumanProfile({
      displayName: "Boston Alice",
      username: "bostonalice",
      profileVisibility: "public",
      hobbies: [],
      knowledge: [],
      discoveryLocation: { countryCode: "US", city: "Boston" },
      discoveryLocationPrecision: "city",
    });

    cancelSpy.mockClear();

    await advertiser.service.updateHumanProfile({
      displayName: "Boston Alice",
      username: "bostonalice",
      profileVisibility: "private",
      hobbies: [],
      knowledge: [],
      discoveryLocation: { countryCode: "US", city: "Boston" },
      discoveryLocationPrecision: "city",
    });

    expect(cancelSpy).toHaveBeenCalledWith("geo:city:US-boston");
    expect(cancelSpy).toHaveBeenCalledWith("geo:country:US");
    expect(cancelSpy).toHaveBeenCalledWith("username:bostonalice");
  });

  it("multi-topic search dedupes providers by peer", async () => {
    const advertiser = await createGeoNode();
    const addr = dialableAddr(advertiser.mesh);
    const searcher = await createGeoNode([addr]);
    await searcher.mesh.probePeer(addr);

    const countryTopic = "geo:country:US";
    const cityTopic = "geo:city:US-boston";

    vi.spyOn(advertiser.mesh, "provideCapabilityTopic").mockResolvedValue({ cid: {} as never });
    vi.spyOn(searcher.mesh, "findCapabilityTopicProviders").mockImplementation(async (topic) => {
      if (topic !== countryTopic && topic !== cityTopic) return [];
      return [{ peerId: advertiser.mesh.peerId, multiaddrs: [addr] }];
    });

    await advertiser.service.updateHumanProfile({
      displayName: "Boston Alice",
      username: "bostonalice",
      profileVisibility: "public",
      hobbies: [],
      knowledge: [],
      discoveryLocation: { countryCode: "US", city: "Boston" },
      discoveryLocationPrecision: "city",
    });

    const results = await searcher.service.searchPeers({
      topics: [countryTopic, cityTopic],
      maxResults: 10,
    });

    expect(results.filter((row) => row.nodeId === advertiser.mesh.peerId)).toHaveLength(1);
  });

  it("filters self from geo topic search results", async () => {
    const node = await createGeoNode();
    const addr = dialableAddr(node.mesh);
    const selfTopic = "geo:city:US-boston";

    vi.spyOn(node.mesh, "provideCapabilityTopic").mockResolvedValue({ cid: {} as never });
    vi.spyOn(node.mesh, "findCapabilityTopicProviders").mockImplementation(async (topic) => {
      if (topic !== selfTopic) return [];
      return [{ peerId: node.mesh.peerId, multiaddrs: [addr] }];
    });

    await node.service.updateHumanProfile({
      displayName: "Boston Self",
      username: "bostonself",
      profileVisibility: "public",
      hobbies: [],
      knowledge: [],
      discoveryLocation: { countryCode: "US", city: "Boston" },
      discoveryLocationPrecision: "city",
    });

    const results = await node.service.searchPeers({ topics: [selfTopic], maxResults: 10 });
    expect(results.some((row) => row.nodeId === node.mesh.peerId)).toBe(false);
  });
});
