/**
 * Phase A1 E2E — quietWan connectivity mode end-to-end.
 *
 * Proves the central claim of `docs/connectivity-internals-and-design.md`
 * Solution A1: a node configured like quietWan (DHT disabled, relay-only
 * discovery) can STILL discover a peer cross-network and exchange a message
 * over a relay circuit — because discovery flows through the relay roster
 * (relay.checkin / relay.lookup), not the public DHT.
 *
 * This is the regression guard for "if we disable the DHT, does bonded-peer
 * reachability survive?" The answer must be yes, or quietWan is not shippable.
 *
 *   npx vitest run apps/node/test/connectivity-quiet-wan-e2e.test.ts
 *
 * Topology (all in-process, no external relay):
 *
 *   relay (EnvoyMesh server + standalone control)
 *      │
 *      ├── clientA (quietWan-like: DHT off, relay-only)
 *      │     - reserves a circuit slot
 *      │     - checks in to relay with a capability advertisement
 *      │
 *      └── clientB (quietWan-like: DHT off, relay-only)
 *            - reserves a circuit slot
 *            - looks up clientA by capability via relay.lookup
 *            - sends a signed envelope to clientA over the relay circuit
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
  createSystemPingPayload,
  createUnsignedEnvelope,
  parseRelayLookupResponsePayload,
  type EnvoyEnvelope,
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

const meshes: EnvoyMesh[] = [];
const cleanups: Array<() => void> = [];
const tempDirs: string[] = [];

async function waitFor<T>(
  fn: () => T | Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `timeout waiting for ${label} (${timeoutMs}ms)${lastErr ? `: ${lastErr}` : ""}`,
  );
}

function relayBaseAddr(mesh: EnvoyMesh): string {
  const bases = mesh.multiaddrs
    .map((a) => (a.includes("/p2p/") ? a : `${a}/p2p/${mesh.peerId}`))
    .filter((a) => a.includes("/tcp/") && !a.includes("/p2p-circuit/"));
  if (bases.length === 0) throw new Error(`no relay base for ${mesh.peerId}`);
  return bases[0]!;
}

async function startStandaloneRelay(label: string): Promise<{
  mesh: EnvoyMesh;
  addr: string;
}> {
  const profileDir = await mkdtemp(join(tmpdir(), `envoy-quietwan-relay-${label}-`));
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
    circuitBases: () => [relayBaseAddr(mesh)],
    forwardTimeoutMs: 15_000,
  });
  cleanups.push(unsub);
  return { mesh, addr: relayBaseAddr(mesh) };
}

/**
 * A quietWan-shaped client: DHT off, mDNS off, relay on, with a configured
 * relay address. This mirrors the mesh options a home node gets when
 * `connectivityMode: quietWan` resolves to `forceDisableDht: true`.
 * mDNS is disabled only for test determinism (real quietWan keeps it on).
 */
async function startQuietWanClient(relayAddr: string): Promise<{
  mesh: EnvoyMesh;
  identity: ReturnType<typeof generateIdentity>;
}> {
  const identity = generateIdentity();
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableRelay: true,
    enableRelayServer: false,
    enableDht: false, // quietWan: forceDisableDht
    enableMdns: false, // deterministic test
    configuredRelayAddrs: [relayAddr],
  });
  await mesh.start();
  meshes.push(mesh);

  // Reserve a circuit slot so the relay can HOP inbound to this client.
  // Without this, a peer dialing /p2p-circuit/ to us gets NO_RESERVATION.
  const resv = await mesh.requestRelayReservation([relayAddr]);
  expect(resv.reserved).toBe(1);

  return { mesh, identity };
}

async function checkinWithCapability(
  client: EnvoyMesh,
  relayAddr: string,
  identity: ReturnType<typeof generateIdentity>,
  capability: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 25 * 60_000).toISOString();
  const payload = createRelayCheckinPayload({
    peerId: client.peerId,
    relayReachableAddrs: client.multiaddrs,
    capabilities: [capability],
    advertisements: [{ capability, visibility: "public", expiresAt }],
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

async function lookupByCapability(
  client: EnvoyMesh,
  relayAddr: string,
  identity: ReturnType<typeof generateIdentity>,
  capability: string,
) {
  const expiresAt = new Date(Date.now() + 25 * 60_000).toISOString();
  const payload = createRelayLookupPayload({
    queryId: `quietwan_e2e_${randomUUID()}`,
    capability,
    maxResults: 8,
    maxHops: 1,
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

describe("E2E quietWan — DHT-off relay-roster discovery", () => {
  afterEach(async () => {
    for (const fn of cleanups.splice(0)) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    for (const m of meshes.splice(0)) {
      try {
        await m.stop();
      } catch {
        /* ignore */
      }
    }
    for (const d of tempDirs.splice(0)) {
      try {
        await rm(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("a quietWan client discovers another quietWan client via relay.lookup (no DHT)", async () => {
    const { addr: relayAddr } = await startStandaloneRelay("a");

    const clientA = await startQuietWanClient(relayAddr);
    const clientB = await startQuietWanClient(relayAddr);

    // Both clients have DHT off. ClientA advertises a capability via relay.checkin.
    await checkinWithCapability(clientA.mesh, relayAddr, clientA.identity, "quietwan.test.cap");

    // ClientB (also DHT-off) discovers clientA via relay.lookup — NOT the DHT.
    // Retry briefly to let the roster propagate the checkin.
    const response = await waitFor(
      async () => {
        const r = await lookupByCapability(
          clientB.mesh,
          relayAddr,
          clientB.identity,
          "quietwan.test.cap",
        );
        return r.peers.some((p) => p.peerId === clientA.mesh.peerId) ? r : null;
      },
      15_000,
      "clientA to appear in relay.lookup results",
    );

    const discovered = response.peers.find((p) => p.peerId === clientA.mesh.peerId);
    expect(discovered, "clientA should be discoverable via relay roster with DHT off").toBeTruthy();
  }, 60_000);

  it("a quietWan client delivers a signed envelope to another over the relay circuit", async () => {
    const { addr: relayAddr } = await startStandaloneRelay("b");

    const clientA = await startQuietWanClient(relayAddr);
    const clientB = await startQuietWanClient(relayAddr);

    // Register an inbound handler on clientB. The proof we want is simply
    // that clientA's envelope ARRIVES at clientB over the relay circuit —
    // i.e. DHT-off does not break cross-NAT reachability when a circuit is
    // available. We don't need a reply round-trip; delivery is the proof.
    const received = new Promise<EnvoyEnvelope>((resolve) => {
      const unsub = clientB.mesh.onMessage(async ({ envelope }) => {
        if (envelope.intent === "system.ping") {
          unsub();
          resolve(envelope);
        }
      });
      cleanups.push(unsub);
    });

    const ping = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(clientA.identity.publicKeyPem),
        senderPublicKey: clientA.identity.publicKeyPem,
        senderRole: "human",
        recipientPeerId: clientB.mesh.peerId,
        recipientRole: "human",
        intent: "system.ping",
        payload: createSystemPingPayload("quietwan-circuit-reachability"),
      }),
      clientA.identity.privateKeyPem,
    );

    // Dial clientB over the relay circuit (HOP through the relay) and send.
    const targetAddr = `${relayAddr}/p2p-circuit/p2p/${clientB.mesh.peerId}`;
    await clientA.mesh.send(targetAddr, ping);

    // The envelope must arrive at clientB over the circuit within the timeout.
    const got = await waitFor(
      () => received,
      40_000,
      "ping to arrive at clientB over the relay circuit",
    );

    expect(got.intent).toBe("system.ping");
    expect(got.senderPeerId).toBe(derivePeerId(clientA.identity.publicKeyPem));
  }, 90_000);
});
