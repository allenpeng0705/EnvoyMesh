/**
 * Phase 46 P3 — process-spawn multi-relay E2E.
 *
 * Spawns two real `apps/relay` processes (tsx), not in-process EnvoyMesh.
 * Covers CLI / HTTP /info|/version|/health, on-disk control identity, and
 * 46B miss-forward when A is started with `--bootstrap` pointing at B.
 *
 * Included whenever RUN_E2E=1 (vitest exclude pattern). Also:
 *   RUN_E2E=1 npx vitest run apps/node/test/multi-relay-fleet-process-e2e.test.ts
 *   npm run test:e2e:relay:process
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateIdentity } from "@envoymesh/identity";
import { EnvoyMesh, setAllowLoopbackDialHints } from "@envoymesh/network";
import {
  collectRelayControlTargets,
  warmAndWatchRelayReservations,
} from "../src/relay-reservation-health.js";
import {
  checkinToRelay,
  lookupPeerOnRelay,
  startRelayClient,
  waitFor,
} from "./helpers/multi-relay-fleet-client.js";
import {
  spawnStandaloneRelay,
  type SpawnedStandaloneRelay,
} from "./helpers/spawn-standalone-relay.js";

const meshes: EnvoyMesh[] = [];
const relays: SpawnedStandaloneRelay[] = [];
const tempDirs: string[] = [];

describe("E2E Phase 46 multi-relay fleet (spawned apps/relay processes)", () => {
  afterEach(async () => {
    setAllowLoopbackDialHints(false);
    await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => undefined)));
    await Promise.all(relays.splice(0).map((r) => r.stop()));
    await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it(
    "spawns two relays: multi-home reserve + miss-forward via --bootstrap sibling",
    async () => {
      setAllowLoopbackDialHints(true);
      const profileB = await mkdtemp(join(tmpdir(), "envoy-proc-relay-b-"));
      const profileA = await mkdtemp(join(tmpdir(), "envoy-proc-relay-a-"));
      tempDirs.push(profileB, profileA);

      // B first (home's relay). A bootstraps B so miss-forward A→B works.
      // Loopback bootstrap is filtered out of libp2p bootstrap discovery but
      // still seeds the standalone sibling book (seedRelayBookFromBootstrap).
      const b = await spawnStandaloneRelay({ label: "b", profileDir: profileB });
      relays.push(b);
      const a = await spawnStandaloneRelay({
        label: "a",
        profileDir: profileA,
        bootstrapPeers: [b.addr],
      });
      relays.push(a);

      expect(a.peerId).not.toBe(b.peerId);

      const targets = collectRelayControlTargets({
        configuredRelays: [
          { enabled: true, addr: a.addr },
          { enabled: true, addr: b.addr },
        ],
        bootstrapPeers: [],
      });
      expect(targets).toEqual(expect.arrayContaining([a.addr, b.addr]));

      // 46A: multi-home reserve against both process relays.
      const multiHome = await startRelayClient(meshes);
      await warmAndWatchRelayReservations(
        multiHome,
        {
          configuredRelays: [
            { enabled: true, addr: a.addr },
            { enabled: true, addr: b.addr },
          ],
        },
        { healthIntervalMs: 15_000 },
      );
      await waitFor(() => multiHome.hasLiveRelayReservation() === true, 60_000, "multi-home reserved");
      expect(multiHome.getRelayReservationStatus().state).toBe("reserved");

      // 46B: peer only on B; lookup on A with maxHops=1 must miss-forward.
      const home = await startRelayClient(meshes);
      const joiner = await startRelayClient(meshes);
      const homeId = generateIdentity();
      const joinerId = generateIdentity();

      await warmAndWatchRelayReservations(
        home,
        { configuredRelays: [{ enabled: true, addr: b.addr }] },
        { healthIntervalMs: 15_000 },
      );
      await waitFor(() => home.hasLiveRelayReservation() === true, 60_000, "home on B");
      await checkinToRelay(home, b.addr, homeId);
      await new Promise((r) => setTimeout(r, 1_000));

      const miss = await lookupPeerOnRelay(joiner, a.addr, joinerId, home.peerId, 0);
      expect(miss.peers.filter((p) => p.peerId === home.peerId)).toHaveLength(0);

      const hit = await lookupPeerOnRelay(joiner, a.addr, joinerId, home.peerId, 1);
      const peer = hit.peers.find((p) => p.peerId === home.peerId);
      expect(peer).toBeTruthy();
      expect(peer!.hasHopSlot).not.toBe(false);
      expect(
        peer!.multiaddrs.some((m) => m.includes("/p2p-circuit/") && m.includes(b.peerId)),
      ).toBe(true);
      expect(peer!.viaRelayId).toBe(b.peerId);
    },
    180_000,
  );
});
