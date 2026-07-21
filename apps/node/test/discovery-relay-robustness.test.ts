/**
 * Phase A discovery/relay robustness — unit coverage (no live network).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { isMeshReadyForSponsorBond } from "../src/mesh-readiness.js";
import * as relayClientCycle from "../src/relay-client-cycle.js";

describe("discovery/relay robustness Phase A", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-robust-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(profileDir, { recursive: true, force: true });
  });

  it("capability merge kicks early relay.checkin", async () => {
    const mesh = {
      peerId: "12D3KooWRobust",
      multiaddrs: ["/ip4/127.0.0.1/tcp/4001"],
      hasLiveRelayReservation: () => true,
      hasRelayReservation: () => true,
      getConnectedRelayPeerIds: () => [],
      getConnectedPeerIds: () => [],
    } as unknown as EnvoyMesh;
    const svc = new NodeServiceImpl(
      mesh,
      createLocalTrustStore(profileDir),
      createLocalPeerDirectoryStore(profileDir),
      createHumanProfileStore(profileDir),
      profileDir,
    );

    const runSpy = vi
      .spyOn(relayClientCycle, "runRelayClientCycle")
      .mockResolvedValue(undefined as never);

    const host = svc as unknown as {
      _relayClientCycleDeps: unknown;
      _mergeAdvertisedDiscoveryTopics: (topics: string[]) => void;
    };
    host._relayClientCycleDeps = { getMesh: () => mesh };

    host._mergeAdvertisedDiscoveryTopics([
      "capability:envoymesh.web-content",
      "publish:family-photos",
    ]);

    await new Promise((r) => setTimeout(r, 350));
    expect(runSpy).toHaveBeenCalled();
  });

  it("isMeshReadyForSponsorBond requires live reservation on wan-default", () => {
    const mesh = {
      multiaddrs: ["/ip4/127.0.0.1/tcp/4001"],
      hasLiveRelayReservation: () => false,
      hasRelayReservation: () => false,
      getConnectedRelayPeerIds: () => ["12D3KooWRelay"],
      getConnectedPeerIds: () => ["12D3KooWPeer"],
    };
    expect(
      isMeshReadyForSponsorBond(mesh, {
        discoveryProfile: "wan-default",
        relayEnabled: true,
      }),
    ).toBe(false);

    mesh.hasLiveRelayReservation = () => true;
    expect(
      isMeshReadyForSponsorBond(mesh, {
        discoveryProfile: "wan-default",
        relayEnabled: true,
      }),
    ).toBe(true);
  });

  it("isMeshReadyForSponsorBond allows peers-only on lan-fast", () => {
    const mesh = {
      multiaddrs: ["/ip4/127.0.0.1/tcp/4001"],
      hasLiveRelayReservation: () => false,
      hasRelayReservation: () => false,
      getConnectedRelayPeerIds: () => [],
      getConnectedPeerIds: () => ["12D3KooWLanPeer"],
    };
    expect(
      isMeshReadyForSponsorBond(mesh, {
        discoveryProfile: "lan-fast",
        relayEnabled: true,
      }),
    ).toBe(true);
  });

  it("WAN mint fails when only sticky reservation is true (live false)", async () => {
    const mesh = {
      peerId: "12D3KooWRobust",
      multiaddrs: ["/ip4/192.168.1.10/tcp/4001"],
      hasLiveRelayReservation: () => false,
      hasRelayReservation: () => true,
    } as unknown as EnvoyMesh;
    const svc = new NodeServiceImpl(
      mesh,
      createLocalTrustStore(profileDir),
      createLocalPeerDirectoryStore(profileDir),
      createHumanProfileStore(profileDir),
      profileDir,
    );
    await expect(svc.createWanJoinInvite({ expiresInHours: 24 })).rejects.toThrow(
      /reservation is not active/,
    );
  });
});
