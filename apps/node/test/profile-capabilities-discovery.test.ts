/**
 * Profile About capability tags → manifest sync + DHT advertise on public profile save.
 */
import {
  createDeviceCertificate,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import {
  createCapabilityManifestStore,
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { profileCapabilityDiscoveryTopics } from "@envoymesh/api";
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
  await Promise.all(
    profileDirs.splice(0).map((d) =>
      rm(d, { recursive: true, force: true }).catch(() => undefined),
    ),
  );
});

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

async function createNode() {
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-profile-cap-"));
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
    bootstrapPeers: [],
    enableRelay: false,
    enableAutoNat: false,
    enableDcutr: false,
    libp2pPrivateKeyPath: join(profileDir, "libp2p-key"),
  });
  await mesh.start();
  meshes.push(mesh);

  const service = new NodeServiceImpl(
    mesh,
    createLocalTrustStore(profileDir),
    createLocalPeerDirectoryStore(profileDir),
    createHumanProfileStore(profileDir),
    profileDir,
    profile,
  );

  return { mesh, service, profileDir };
}

describe("Profile capability discovery wiring", () => {
  it("syncs profile capability tags into manifest and advertises DHT topics", async () => {
    const { mesh, service, profileDir } = await createNode();
    const advertised: string[] = [];
    // 2026-07-10: the DHT-route-table-empty gate
    // (`_advertisePublicDiscoveryTopics` skips fan-out when fewer than 2
    // peers are connected) requires this stub. The test creates an
    // EnvoyMesh with `bootstrapPeers: []`, so without this spy the gate
    // would skip the advertising it was set up to verify.
    vi.spyOn(mesh, "getConnectedPeerIds").mockReturnValue([
      "12D3KooWPeerAMockForGate",
      "12D3KooWPeerBMockForGate",
    ]);
    vi.spyOn(mesh, "provideCapabilityTopic").mockImplementation(async (topic) => {
      advertised.push(topic);
      return { cid: {} as never };
    });

    await service.updateHumanProfile({
      displayName: "Cap Alice",
      username: "capalice",
      profileVisibility: "public",
      hobbies: [],
      knowledge: [],
      capabilities: [{ tag: "coding-help" }, { tag: "expertise:rust" }],
    });

    const manifest = await createCapabilityManifestStore(profileDir).loadManifest();
    expect(manifest?.capabilities).toContain("coding-help");
    expect(manifest?.capabilities).toContain("expertise:rust");

    await vi.waitFor(() => {
      for (const topic of profileCapabilityDiscoveryTopics(["coding-help", "expertise:rust"])) {
        expect(advertised).toContain(topic);
      }
    });
  });

  it("removes dropped profile capability tags from manifest on save", async () => {
    const { mesh, service, profileDir } = await createNode();
    // 2026-07-10: same DHT-route-table-empty gate override as above —
    // see comment in the first test.
    vi.spyOn(mesh, "getConnectedPeerIds").mockReturnValue([
      "12D3KooWPeerAMockForGate",
      "12D3KooWPeerBMockForGate",
    ]);
    vi.spyOn(mesh, "provideCapabilityTopic").mockResolvedValue({ cid: {} as never, timedOut: false });
    const manifestStore = createCapabilityManifestStore(profileDir);

    await service.updateHumanProfile({
      displayName: "Cap Alice",
      username: "capalice",
      profileVisibility: "public",
      hobbies: [],
      knowledge: [],
      capabilities: [{ tag: "coding-help" }, { tag: "expertise:rust" }],
    });

    await service.updateHumanProfile({
      displayName: "Cap Alice",
      username: "capalice",
      profileVisibility: "public",
      hobbies: [],
      knowledge: [],
      capabilities: [{ tag: "coding-help" }],
    });

    const manifest = await manifestStore.loadManifest();
    expect(manifest?.capabilities).toContain("coding-help");
    expect(manifest?.capabilities).not.toContain("expertise:rust");
  });
});
