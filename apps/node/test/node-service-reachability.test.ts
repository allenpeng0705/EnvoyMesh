import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";

describe("NodeServiceImpl reachability (KEEP_ALIVE / external mesh)", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-reachability-"));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  function spyMesh(): {
    mesh: EnvoyMesh;
    tagSpy: ReturnType<typeof vi.fn>;
    untagSpy: ReturnType<typeof vi.fn>;
  } {
    const tagSpy = vi.fn().mockResolvedValue(undefined);
    const untagSpy = vi.fn().mockResolvedValue(undefined);
    const mesh = {
      tagContactForPersistentReachability: tagSpy,
      untagContactForPersistentReachability: untagSpy,
    } as unknown as EnvoyMesh;
    return { mesh, tagSpy, untagSpy };
  }

  it("resync skips blocked identities and tags others when external mesh is bound", async () => {
    const { mesh, tagSpy } = spyMesh();
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:alice",
      level: "direct",
      displayName: "Alice",
      now: "2026-05-05T12:00:00.000Z",
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:bob",
      level: "blocked",
      displayName: "Bob",
      now: "2026-05-05T12:00:00.000Z",
    });
    await peerDirectory.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:alice",
      peerId: "alice-libp2p-peer-id",
      listenAddrs: [],
    });
    await peerDirectory.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:bob",
      peerId: "bob-libp2p-peer-id",
      listenAddrs: [],
    });

    const svc = new NodeServiceImpl(undefined, trustStore, peerDirectory, human, profileDir);
    svc.bindExternalMesh(mesh);
    tagSpy.mockClear();

    await svc.resyncBondedContactReachabilityTags();

    expect(tagSpy).toHaveBeenCalledWith("alice-libp2p-peer-id");
    expect(tagSpy).not.toHaveBeenCalledWith("bob-libp2p-peer-id");
  });

  it("blockPeer clears reachability tags when mesh is bound", async () => {
    const { mesh, untagSpy } = spyMesh();
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);

    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:carol",
      level: "direct",
      now: "2026-05-05T12:00:00.000Z",
    });
    await peerDirectory.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:carol",
      peerId: "carol-libp2p-peer-id",
      listenAddrs: [],
    });

    const svc = new NodeServiceImpl(undefined, trustStore, peerDirectory, human, profileDir);
    svc.bindExternalMesh(mesh);

    await svc.blockPeer("envoy:owner:carol");

    expect(untagSpy).toHaveBeenCalledWith("carol-libp2p-peer-id");
    const blocked = await trustStore.getTrustRecord("envoy:owner:carol");
    expect(blocked?.level).toBe("blocked");
  });

  it("revokeBond untags using directory peer id before removing trust row", async () => {
    const { mesh, untagSpy } = spyMesh();
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);

    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:dave",
      level: "direct",
      now: "2026-05-05T12:00:00.000Z",
    });
    await peerDirectory.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:dave",
      peerId: "dave-libp2p-peer-id",
      listenAddrs: [],
    });

    const svc = new NodeServiceImpl(undefined, trustStore, peerDirectory, human, profileDir);
    svc.bindExternalMesh(mesh);

    await svc.revokeBond("envoy:owner:dave");

    expect(untagSpy).toHaveBeenCalledWith("dave-libp2p-peer-id");
    await expect(trustStore.getTrustRecord("envoy:owner:dave")).resolves.toBeUndefined();
  });
});
