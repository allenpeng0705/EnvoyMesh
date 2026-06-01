/**
 * WAN sign-off for Phase 17A geo discovery (live DHT via relay bootstrap).
 *
 *   TEST_RELAY_ADDR=/ip4/.../p2p/... npm test -- apps/node/test/geo-discovery-wan-signoff.test.ts
 *
 * Exit criteria: two relay-bootstrap nodes with public profiles + same city find each other
 * via searchPeers({ topics: ['geo:city:…'] }) without a prior bond.
 *
 * Manual staging checklist (same criteria in Social UI):
 * 1. Node A: public profile, city precision, WAN bootstrap preset
 * 2. Node B: same city, different owner, WAN bootstrap preset
 * 3. B → Discover → Wider → By place → Same city
 * 4. Expect A in results without prior bond
 *
 * Runtime: ~9 minutes with TEST_RELAY_ADDR (skipped in CI by default).
 * Staging note: advertises `geo:city:US-geo-signoff` on the live DHT — test-only rendezvous topic.
 */
import { defaultBootstrapPresetsForDiscoveryProfile, deriveLocationDiscoveryTopics, locationSearchTopics } from "@envoymesh/api";
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
import { EnvoyMesh, filterBootstrapMultiaddrs } from "@envoymesh/network";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { resolveBootstrapAddresses } from "../src/bootstrap-resolver.js";

const RELAY_ADDR = process.env.TEST_RELAY_ADDR || null;
const itRelayed = RELAY_ADDR ? it : it.skip;
const WAN_TIMEOUT_MS = 180_000;
const BOOTSTRAP_SETTLE_MS = 8_000;

const meshes: EnvoyMesh[] = [];
const profileDirs: string[] = [];

const SIGNOFF_LOCATION = {
  countryCode: "US",
  city: "Geo Signoff",
} as const;

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => {})));
  await Promise.all(profileDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("WAN geo discovery sign-off", () => {
  itRelayed(
    "relay-bootstrap nodes find each other on geo:city topic without prior bond",
    async () => {
      const cityTopic = deriveLocationDiscoveryTopics({
        location: SIGNOFF_LOCATION,
        precision: "city",
      }).find((topic) => topic.startsWith("geo:city:"));
      expect(cityTopic).toBeTruthy();

      const advertiser = await createRelayGeoNode();
      await waitForBootstrapSettle();
      await savePublicCityProfile(advertiser.service, "Geo Signoff Advertiser");
      await waitForTopicProvide(advertiser.mesh, cityTopic!, 90_000);

      const searcher = await createRelayGeoNode();
      await waitForBootstrapSettle();
      await savePublicCityProfile(searcher.service, "Geo Signoff Searcher");

      await waitFor(async () => {
        const results = await searcher.service.searchPeers({
          topics: [cityTopic!],
          maxResults: 50,
        });
        return results.some((row) => row.nodeId === advertiser.mesh.peerId);
      }, WAN_TIMEOUT_MS, 5_000);

      const finalResults = await searcher.service.searchPeers({
        topics: [cityTopic!],
        maxResults: 50,
      });
      const match = finalResults.find((row) => row.nodeId === advertiser.mesh.peerId);
      expect(match).toBeTruthy();
      expect(match?.discoverySource).toBe("dht-capability-topic");
      expect(match?.nodeId).not.toBe(searcher.mesh.peerId);
    },
    WAN_TIMEOUT_MS + 120_000,
  );

  itRelayed(
    "Social Discover → By place → Same city path finds advertiser (locationSearchTopics)",
    async () => {
      const advertiser = await createRelayGeoNode();
      await waitForBootstrapSettle();
      await savePublicCityProfile(advertiser.service, "Social Geo Advertiser");
      const cityTopics = locationSearchTopics({ location: SIGNOFF_LOCATION, scope: "city" });
      expect(cityTopics).toContain("geo:city:US-geo-signoff");
      await waitForTopicProvide(advertiser.mesh, cityTopics[0]!, 90_000);

      const searcher = await createRelayGeoNode();
      await waitForBootstrapSettle();
      await savePublicCityProfile(searcher.service, "Social Geo Searcher");

      await waitFor(async () => {
        const results = await searcher.service.searchPeers({
          topics: cityTopics,
          maxResults: 20,
        });
        return results.some((row) => row.nodeId === advertiser.mesh.peerId);
      }, WAN_TIMEOUT_MS, 5_000);

      const results = await searcher.service.searchPeers({ topics: cityTopics, maxResults: 20 });
      expect(results.some((row) => row.nodeId === advertiser.mesh.peerId)).toBe(true);
    },
    WAN_TIMEOUT_MS + 120_000,
  );
});

async function savePublicCityProfile(
  service: NodeServiceImpl,
  displayName: string,
): Promise<void> {
  await service.updateHumanProfile({
    displayName,
    username: `geosign${Date.now().toString(36).slice(-6)}`,
    profileVisibility: "public",
    hobbies: [],
    discoveryLocation: SIGNOFF_LOCATION,
    discoveryLocationPrecision: "city",
  });
}

async function waitForTopicProvide(mesh: EnvoyMesh, topic: string, timeoutMs: number): Promise<void> {
  // updateHumanProfile already calls provideCapabilityTopic; retry until DHT accepts on WAN bootstrap.
  await waitFor(async () => {
    try {
      await mesh.provideCapabilityTopic(topic);
      return true;
    } catch {
      return false;
    }
  }, timeoutMs, 3_000);
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}

async function writeRelayWanConfig(profileDir: string): Promise<void> {
  await writeFile(
    join(profileDir, "node-config.json"),
    JSON.stringify({
      version: "0.1",
      profileDir,
      discoveryProfile: "wan-default",
      enableMdns: false,
      relayEnabled: true,
      relayServerEnabled: false,
      advertiseAddrs: [],
      bootstrapPeers: RELAY_ADDR ? [RELAY_ADDR] : [],
      bootstrapPresets: [...defaultBootstrapPresetsForDiscoveryProfile("wan-default")],
      configuredRelays: [],
      modelProviders: { mode: "mock" },
      updatedAt: new Date().toISOString(),
    }),
    "utf8",
  );
}

async function resolvedBootstrapPeers(): Promise<string[]> {
  const presetResults = await resolveBootstrapAddresses([
    ...defaultBootstrapPresetsForDiscoveryProfile("wan-default"),
  ]);
  const presetPeers = presetResults.flatMap((result) => result.resolved);
  const explicit = RELAY_ADDR ? [RELAY_ADDR] : [];
  return filterBootstrapMultiaddrs([...new Set([...explicit, ...presetPeers])]);
}

async function createRelayGeoNode() {
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-geo-wan-"));
  profileDirs.push(profileDir);
  await mkdir(profileDir, { recursive: true });
  await writeRelayWanConfig(profileDir);

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

  const bootstrapPeers = await resolvedBootstrapPeers();
  expect(bootstrapPeers.length).toBeGreaterThan(0);

  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
    enableDht: true,
    dhtClientMode: true,
    bootstrapPeers,
    enableRelay: true,
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

async function waitForBootstrapSettle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, BOOTSTRAP_SETTLE_MS));
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 500,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for condition");
}
