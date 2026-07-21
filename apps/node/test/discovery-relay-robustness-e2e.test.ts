/**
 * E2E: discovery + circuit-relay robustness (Phase A).
 *
 * Private in-process relay (always runnable):
 *   - relay server + client obtain a live reservation
 *   - WAN invite mint succeeds after reserved; fails when live=false
 *
 * Live fleet relay (optional):
 *   RUN_E2E_RELAY_TESTS=1 or TEST_RELAY_ADDR=/ip4/.../p2p/...
 *   - client warms reservation against community/private hop
 *
 *   npx vitest run apps/node/test/discovery-relay-robustness-e2e.test.ts
 *   RUN_E2E_RELAY_TESTS=1 npx vitest run apps/node/test/discovery-relay-robustness-e2e.test.ts
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { EnvoyMesh } from "@envoymesh/network";
import { DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR } from "@envoymesh/api";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { isMeshReadyForSponsorBond } from "../src/mesh-readiness.js";
import { warmAndWatchRelayReservations } from "../src/relay-reservation-health.js";

const LIVE_RELAY =
  process.env.TEST_RELAY_ADDR ||
  (process.env.RUN_E2E_RELAY_TESTS === "1"
    ? DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR
    : "");
const itLive = LIVE_RELAY ? it : it.skip;

const meshes: EnvoyMesh[] = [];

async function waitFor(
  pred: () => boolean | Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timeout waiting for ${label} (${timeoutMs}ms)`);
}

describe("E2E discovery/relay robustness (private in-process relay)", () => {
  afterEach(async () => {
    await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => undefined)));
  });

  it(
    "client gets live reservation on local relay server; WAN mint + probe gate",
    async () => {
      const relay = new EnvoyMesh({
        listen: ["/ip4/127.0.0.1/tcp/0"],
        enableRelayServer: true,
        enableRelay: true,
        enableDht: false,
        enableMdns: false,
        circuitRelayServer: {
          maxReservations: 64,
          reservationTtl: 30 * 60_000,
          defaultDataLimit: 4 * 1024 * 1024,
          defaultDurationLimit: 60 * 60_000,
          hopTimeout: 90_000,
        },
      });
      await relay.start();
      meshes.push(relay);
      const relayPeerId = relay.peerId;
      const relayBases = relay.multiaddrs
        .map((a) => (a.includes("/p2p/") ? a : `${a}/p2p/${relayPeerId}`))
        .filter((a) => a.includes("/tcp/") && !a.includes("/p2p-circuit/"));
      expect(relayBases.length).toBeGreaterThan(0);
      const relayAddr = relayBases[0]!;

      const client = new EnvoyMesh({
        listen: ["/ip4/127.0.0.1/tcp/0"],
        enableRelay: true,
        enableRelayServer: false,
        enableDht: false,
        enableMdns: false,
        // Do not put 127.0.0.1 in bootstrapPeers — isUnusableBootstrapMultiaddr
        // strips loopback and @libp2p/bootstrap then throws on an empty list.
      });
      await client.start();
      meshes.push(client);

      await warmAndWatchRelayReservations(
        client,
        {
          bootstrapPeers: [relayAddr],
          configuredRelays: [{ addr: relayAddr, enabled: true }],
        },
        { healthIntervalMs: 15_000 },
      );

      await waitFor(
        () => client.hasLiveRelayReservation() === true,
        45_000,
        "live circuit-relay reservation",
      );

      expect(client.getRelayReservationStatus().state).toBe("reserved");
      expect(
        isMeshReadyForSponsorBond(client, {
          discoveryProfile: "wan-default",
          relayEnabled: true,
        }),
      ).toBe(true);

      const profileDir = await mkdtemp(join(tmpdir(), "envoy-robust-e2e-"));
      try {
        const svc = new NodeServiceImpl(
          client,
          createLocalTrustStore(profileDir),
          createLocalPeerDirectoryStore(profileDir),
          createHumanProfileStore(profileDir),
          profileDir,
        );
        await svc.updateNodeConfig({
          discoveryProfile: "wan-default",
          relayEnabled: true,
          bootstrapPeers: [relayAddr!],
        });

        const invite = await svc.createWanJoinInvite({ expiresInHours: 24 });
        expect(invite.uri.startsWith("envoy://join?")).toBe(true);
        expect(
          invite.invite.targetMultiaddrs?.some((a) => a.includes("/p2p-circuit/")) ||
            client.multiaddrs.some((a) => a.includes("/p2p-circuit/")),
        ).toBe(true);
      } finally {
        await rm(profileDir, { recursive: true, force: true });
      }
    },
    90_000,
  );

  it(
    "WAN mint refuses when client has no live reservation",
    async () => {
      const client = new EnvoyMesh({
        listen: ["/ip4/127.0.0.1/tcp/0"],
        enableRelay: true,
        enableRelayServer: false,
        enableDht: false,
        enableMdns: false,
      });
      await client.start();
      meshes.push(client);

      expect(client.hasLiveRelayReservation()).toBe(false);

      const profileDir = await mkdtemp(join(tmpdir(), "envoy-robust-e2e-noresv-"));
      try {
        const svc = new NodeServiceImpl(
          client,
          createLocalTrustStore(profileDir),
          createLocalPeerDirectoryStore(profileDir),
          createHumanProfileStore(profileDir),
          profileDir,
        );
        await svc.updateNodeConfig({
          discoveryProfile: "wan-default",
          relayEnabled: true,
        });
        await expect(svc.createWanJoinInvite({ expiresInHours: 24 })).rejects.toThrow(
          /reservation is not active/,
        );
      } finally {
        await rm(profileDir, { recursive: true, force: true });
      }
    },
    30_000,
  );
});

describe("E2E discovery/relay robustness (live fleet relay)", () => {
  afterEach(async () => {
    await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => undefined)));
  });

  itLive(
    "warms live reservation against TEST_RELAY_ADDR / community cn-relay",
    async () => {
      const client = new EnvoyMesh({
        listen: ["/ip4/0.0.0.0/tcp/0"],
        enableRelay: true,
        enableDht: true,
        dhtClientMode: true,
        bootstrapPeers: [LIVE_RELAY],
      });
      await client.start();
      meshes.push(client);

      await warmAndWatchRelayReservations(client, {
        bootstrapPeers: [LIVE_RELAY],
        configuredRelays: [{ addr: LIVE_RELAY, enabled: true }],
      }, { healthIntervalMs: 30_000 });

      await waitFor(
        () => client.hasLiveRelayReservation() === true,
        90_000,
        "live reservation on fleet relay",
      );
      expect(client.getRelayReservationStatus().live).toBe(true);
    },
    120_000,
  );
});
