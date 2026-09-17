/**
 * Regression: `stop()` must not report "NEVER reserved a relay slot" on a node
 * that actually holds a reservation.
 *
 * Observed against the community relay (cn-relay, 47.93.11.212:4001) with the
 * relay link healthy: the store held a reservation
 * (`hasLiveRelayReservation() === true`, `getRelayReservationStatus().state ===
 * "reserved"`) while the shutdown warning claimed the opposite.
 *
 * Root cause: libp2p dispatches `relay:created-reservation` on the
 * circuit-relay-v2 transport's private `ReservationStore`, not on the libp2p
 * node event emitter; `installRelayLogging()` subscribes on the node, so a
 * reservation created by the configured `<relay>/p2p-circuit` listen address
 * never flips `relayEverReserved`. The fix derives the report from the same
 * store query the public getter uses. See `hasHeldRelayReservation()` in
 * `packages/network/src/index.ts`.
 *
 * The test is hermetic: it installs a fake libp2p node whose reservation store
 * reports a slot for the configured relay and whose connection manager reports
 * an open connection to it — exactly the state the real run was in. No relay,
 * no network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { peerIdFromString } from "@libp2p/peer-id";
import { EnvoyMesh } from "../src/index.js";

/** cn-relay — the relay the contradiction was observed on. */
const RELAY_ADDR =
  "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
const RELAY_PEER_ID = RELAY_ADDR.split("/p2p/")[1];

/**
 * Minimal node surface read by `hasLiveRelayReservation()` /
 * `getRelayReservationStatus()`: an open direct connection to the relay and a
 * reservation store that reports the relay as reserved.
 */
function fakeNodeWithLiveReservation() {
  return {
    stop: vi.fn(async () => {}),
    getConnections: () => [
      {
        status: "open",
        remoteAddr: { toString: () => RELAY_ADDR },
        remotePeer: { toString: () => RELAY_PEER_ID },
      },
    ],
    components: {
      transportManager: {
        getTransports: () => [
          {
            [Symbol.toStringTag]: "@libp2p/circuit-relay-v2-transport",
            reservationStore: {
              hasReservation: (pid: ReturnType<typeof peerIdFromString>) =>
                pid.toString() === RELAY_PEER_ID,
            },
          },
        ],
      },
    },
  };
}

describe("EnvoyMesh.stop() relay reservation report", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not claim 'NEVER reserved' while a live reservation exists", async () => {
    const mesh = new EnvoyMesh({ enableRelay: true });
    // Bypass createLibp2p with the fake node (the same injection the
    // requestRelayReservation tests use).
    (mesh as unknown as { node: unknown }).node = fakeNodeWithLiveReservation();
    // `start()` sets these from `configuredRelayAddrs`; we skip `start()`, so
    // mirror that one side effect — it is what makes the store queryable.
    (mesh as unknown as { preferredRelayPeerIds: string[] }).preferredRelayPeerIds = [RELAY_PEER_ID];

    // The observable state the log contradicted: the node holds a live slot.
    expect(mesh.hasLiveRelayReservation()).toBe(true);
    expect(mesh.getRelayReservationStatus().state).toBe("reserved");

    const warns: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warns.push(args.map((a) => String(a)).join(" "));
    });
    await mesh.stop();

    // The shutdown log is the contract here — the getter already told the
    // truth, so only the message can lie. Pre-fix this array contains
    // "[p2p] stop(): node NEVER reserved a relay slot during this run.".
    expect(warns.some((w) => w.includes("NEVER reserved"))).toBe(false);
  });
});
