import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { decodeWanJoinInviteV1, parseEnvoyJoinUri } from "@envoymesh/api";

describe("NodeServiceImpl WAN join invite", () => {
  let profileDir: string;
  let svc: NodeServiceImpl;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-wan-invite-"));
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const mesh = {
      peerId: "12D3KooWHomeInvite",
      multiaddrs: ["/ip4/192.168.1.50/tcp/63641"],
    } as unknown as EnvoyMesh;
    svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("createWanJoinInvite returns envoy://join URI and apply merges bootstrap", async () => {
    // Seed a bootstrap peer so the invite has something to carry.
    await svc.updateNodeConfig({
      bootstrapPeers: ["/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWExistingBootstrap"],
    });
    const created = await svc.createWanJoinInvite({ expiresInHours: 24, note: "test" });
    expect(created.uri.startsWith("envoy://join?")).toBe(true);
    expect(created.token).toBeTruthy();
    const decoded = decodeWanJoinInviteV1(parseEnvoyJoinUri(created.uri));
    expect(decoded.note).toBe("test");
    expect(decoded.bootstrapPeers.length).toBeGreaterThan(0);
    expect(decoded.targetPeerId).toBe("12D3KooWHomeInvite");

    const before = await svc.getNodeConfig();
    const peerCountBefore = before.bootstrapPeers.length;

    const applied = await svc.applyWanJoinInvite(created.token);
    expect(applied.ok).toBe(true);
    expect(applied.seedsPersisted).toBeGreaterThan(0);

    const after = await svc.getNodeConfig();
    expect(after.bootstrapPeers.length).toBeGreaterThanOrEqual(peerCountBefore);
  });

  it("createWanJoinInvite clamps expiresInHours to one year", async () => {
    const created = await svc.createWanJoinInvite({ expiresInHours: 99999 });
    const decoded = decodeWanJoinInviteV1(parseEnvoyJoinUri(created.token));
    expect(decoded.expiresAt).toBeTruthy();
    const expiresMs = Date.parse(decoded.expiresAt!);
    const createdMs = Date.parse(decoded.createdAt);
    const hours = (expiresMs - createdMs) / (60 * 60 * 1000);
    expect(hours).toBeGreaterThan(8700);
    expect(hours).toBeLessThanOrEqual(8760);
  });

  it("createWanJoinInvite compact omits accumulated bootstrap peers", async () => {
    await svc.updateNodeConfig({
      bootstrapPeers: [
        "/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWExistingBootstrap",
        "/ip4/5.6.7.8/tcp/4001/p2p/12D3KooWAnotherBootstrap",
      ],
      bootstrapPresets: ["public-libp2p", "cn-relay"],
    });
    const full = await svc.createWanJoinInvite({ expiresInHours: 24 });
    const compact = await svc.createWanJoinInvite({ expiresInHours: 24, compact: true });
    const fullDecoded = decodeWanJoinInviteV1(parseEnvoyJoinUri(full.token));
    const compactDecoded = decodeWanJoinInviteV1(parseEnvoyJoinUri(compact.token));
    expect(fullDecoded.bootstrapPeers.length).toBeGreaterThan(0);
    expect(compactDecoded.bootstrapPeers).toEqual([]);
    expect(compactDecoded.bootstrapPresets).toEqual(["public-libp2p", "cn-relay"]);
    expect(compact.token.length).toBeLessThan(full.token.length);
  });
});
