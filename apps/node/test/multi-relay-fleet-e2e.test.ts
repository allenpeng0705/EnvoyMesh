/**
 * Phase 46 in-process E2E: multi-home overlap (46A) + miss-forward (46B).
 *
 * Always-on (no TEST_RELAY_ADDR). Spins two EnvoyMesh circuit-relay servers,
 * attaches standalone control plane from apps/relay, and exercises clients.
 *
 *   npx vitest run apps/node/test/multi-relay-fleet-e2e.test.ts
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { EnvoyMesh } from "@envoymesh/network";
import {
  createRelayCheckinPayload,
  createRelayLookupPayload,
  createUnsignedEnvelope,
  parseRelayLookupResponsePayload,
} from "@envoymesh/protocol";
import {
  derivePeerId,
  generateIdentity,
  signUnsignedEnvelope,
} from "@envoymesh/identity";
import { createRelayRoster } from "../../relay/src/relay-roster.js";
import { createRelayLookupRouter } from "../../relay/src/relay-lookup-router.js";
import { loadOrCreateRelayControlIdentity } from "../../relay/src/relay-control-identity.js";
import { attachStandaloneRelayControl } from "../../relay/src/standalone-relay-control.js";
import {
  collectRelayControlTargets,
  warmAndWatchRelayReservations,
} from "../src/relay-reservation-health.js";

const meshes: EnvoyMesh[] = [];
const cleanups: Array<() => void> = [];
const tempDirs: string[] = [];

async function waitFor(
  pred: () => boolean | Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timeout waiting for ${label} (${timeoutMs}ms)`);
}

function relayAddrOf(mesh: EnvoyMesh): string {
  const bases = mesh.multiaddrs
    .map((a) => (a.includes("/p2p/") ? a : `${a}/p2p/${mesh.peerId}`))
    .filter((a) => a.includes("/tcp/") && !a.includes("/p2p-circuit/"));
  if (bases.length === 0) throw new Error(`no relay base for ${mesh.peerId}`);
  return bases[0]!;
}

async function startStandaloneRelay(label: string): Promise<{
  mesh: EnvoyMesh;
  addr: string;
  roster: ReturnType<typeof createRelayRoster>;
}> {
  const profileDir = await mkdtemp(join(tmpdir(), `envoy-fleet-${label}-`));
  tempDirs.push(profileDir);
  const mesh = new EnvoyMesh({
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
  await mesh.start();
  meshes.push(mesh);
  const roster = createRelayRoster();
  const router = createRelayLookupRouter();
  const identity = await loadOrCreateRelayControlIdentity(profileDir);
  const unsub = attachStandaloneRelayControl({
    mesh,
    roster,
    router,
    identity,
    circuitBases: () => [relayAddrOf(mesh)],
    forwardTimeoutMs: 15_000,
  });
  cleanups.push(unsub);
  return { mesh, addr: relayAddrOf(mesh), roster };
}

async function startClient(): Promise<EnvoyMesh> {
  const client = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableRelay: true,
    enableRelayServer: false,
    enableDht: false,
    enableMdns: false,
  });
  await client.start();
  meshes.push(client);
  return client;
}

async function checkinToRelay(
  client: EnvoyMesh,
  relayAddr: string,
  identity: ReturnType<typeof generateIdentity>,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 25 * 60_000).toISOString();
  const payload = createRelayCheckinPayload({
    peerId: client.peerId,
    relayReachableAddrs: client.multiaddrs,
    capabilities: ["mesh.discovery"],
    advertisements: [{ capability: "mesh.discovery", visibility: "public", expiresAt }],
    relayHints: [],
    expiresAt,
  });
  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(identity.publicKeyPem),
      senderPublicKey: identity.publicKeyPem,
      senderRole: "system",
      intent: "relay.checkin",
      payload,
    }),
    identity.privateKeyPem,
  );
  await client.send(relayAddr, envelope);
}

async function lookupPeer(
  client: EnvoyMesh,
  relayAddr: string,
  identity: ReturnType<typeof generateIdentity>,
  targetPeerId: string,
  maxHops: number,
) {
  const expiresAt = new Date(Date.now() + 25 * 60_000).toISOString();
  const payload = createRelayLookupPayload({
    queryId: `fleet_e2e_${randomUUID()}`,
    targetPeerId,
    capability: "mesh.discovery",
    maxResults: 8,
    maxHops,
    maxFanout: 2,
    visibilityScope: "public",
    expiresAt,
  });
  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(identity.publicKeyPem),
      senderPublicKey: identity.publicKeyPem,
      senderRole: "system",
      intent: "relay.lookup",
      payload,
    }),
    identity.privateKeyPem,
  );
  const reply = await client.sendExpectReply(relayAddr, envelope, { timeoutMs: 20_000 });
  expect(reply.intent).toBe("relay.lookup.response");
  return parseRelayLookupResponsePayload(reply.payload);
}

describe("E2E Phase 46 multi-relay fleet (in-process)", () => {
  afterEach(async () => {
    for (const fn of cleanups.splice(0)) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => undefined)));
    await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it(
    "46A: multi-home collect + reserve on both relays",
    async () => {
      const a = await startStandaloneRelay("a");
      const b = await startStandaloneRelay("b");
      const targets = collectRelayControlTargets({
        configuredRelays: [
          { enabled: true, addr: a.addr },
          { enabled: true, addr: b.addr },
        ],
        bootstrapPeers: [],
      });
      expect(targets).toEqual(expect.arrayContaining([a.addr, b.addr]));
      expect(targets.length).toBe(2);

      const home = await startClient();
      await warmAndWatchRelayReservations(
        home,
        {
          configuredRelays: [
            { enabled: true, addr: a.addr },
            { enabled: true, addr: b.addr },
          ],
        },
        { healthIntervalMs: 15_000 },
      );
      await waitFor(() => home.hasLiveRelayReservation() === true, 45_000, "home reserved");
      expect(home.getRelayReservationStatus().state).toBe("reserved");

      // Reservations should exist on both hop servers when multi-homed.
      await waitFor(
        () =>
          a.mesh.inspectCircuitRelayReservations().some((r) => r.peerId === home.peerId) &&
          b.mesh.inspectCircuitRelayReservations().some((r) => r.peerId === home.peerId),
        45_000,
        "reservation on both relays",
      );
    },
    90_000,
  );

  it(
    "46B: miss-forward returns foreign circuit when peer only on sibling",
    async () => {
      const a = await startStandaloneRelay("fwd-a");
      const b = await startStandaloneRelay("fwd-b");

      // Seed mutual verified siblings so A can forward to B.
      const expiresAt = new Date(Date.now() + 35 * 60_000).toISOString();
      a.roster.registerRelay({
        relayId: b.mesh.peerId,
        addrs: [b.addr],
        relation: "sibling",
        state: "verified",
        expiresAt,
      });
      b.roster.registerRelay({
        relayId: a.mesh.peerId,
        addrs: [a.addr],
        relation: "sibling",
        state: "verified",
        expiresAt,
      });

      // Dial relays to each other so forward sendExpectReply works.
      await a.mesh.eagerConnectToRelays([b.addr], { timeoutMs: 15_000 });
      await b.mesh.eagerConnectToRelays([a.addr], { timeoutMs: 15_000 });

      const home = await startClient();
      const joiner = await startClient();
      const homeId = generateIdentity();
      const joinerId = generateIdentity();

      // Home reserves + checkins only on B.
      await warmAndWatchRelayReservations(
        home,
        { configuredRelays: [{ enabled: true, addr: b.addr }] },
        { healthIntervalMs: 15_000 },
      );
      await waitFor(() => home.hasLiveRelayReservation() === true, 45_000, "home on B");
      await checkinToRelay(home, b.addr, homeId);
      await waitFor(
        () => b.roster.entries().some((e) => e.peerId === home.peerId),
        10_000,
        "home on B roster",
      );

      // Lookup on A with maxHops=0 must miss.
      const miss = await lookupPeer(joiner, a.addr, joinerId, home.peerId, 0);
      expect(miss.peers.filter((p) => p.peerId === home.peerId)).toHaveLength(0);

      // Lookup on A with maxHops=1 must miss-forward to B.
      const hit = await lookupPeer(joiner, a.addr, joinerId, home.peerId, 1);
      const peer = hit.peers.find((p) => p.peerId === home.peerId);
      expect(peer).toBeTruthy();
      expect(peer!.hasHopSlot).not.toBe(false);
      expect(peer!.multiaddrs.some((m) => m.includes("/p2p-circuit/") && m.includes(b.mesh.peerId))).toBe(
        true,
      );
      expect(peer!.viaRelayId).toBe(b.mesh.peerId);
    },
    120_000,
  );
});
