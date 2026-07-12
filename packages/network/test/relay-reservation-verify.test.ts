/**
 * Tests for `requestRelayReservation` verify-then-retry behavior.
 *
 * Background (2026-07-12, community relay 47.93.11.212): libp2p's
 * `reservationStore.addRelay(pid, "configured")` can return success
 * without the relay actually creating the reservation. The client/server
 * state desync leaves the local node with `relayRoster=0` and all
 * downstream `/p2p-circuit/` dials fail with NO_RESERVATION. The fix
 * wraps each `addRelay` in a verify-then-retry loop: after addRelay
 * resolves, check `reservationStore.hasReservation(pid)`; if it's
 * missing, retry with backoff.
 *
 * These tests verify the verify-then-retry behavior using a minimal
 * fake libp2p transport — we don't need real libp2p for this.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnvoyMesh } from "../src/index.js";

interface FakeRelayStoreState {
  addRelay: ReturnType<typeof vi.fn>;
  hasReservation: ReturnType<typeof vi.fn>;
}

function makeFakeRelayStore(
  behaviour: (
    state: FakeRelayStoreState,
    pid: ReturnType<typeof parsePeerId>,
  ) => Promise<{ reserved: boolean; throwsOnAdd?: boolean }>,
) {
  const state: FakeRelayStoreState = {
    addRelay: vi.fn(),
    hasReservation: vi.fn(),
  };
  state.addRelay.mockImplementation(async (pid: ReturnType<typeof parsePeerId>) => {
    const r = await behaviour(state, pid);
    if (r.throwsOnAdd) {
      throw new Error("simulated addRelay transport error");
    }
    return { ok: !r.reserved ? null : { relay: pid, details: {} } };
  });
  return state;
}

function parsePeerId(s: string) {
  // peerIdFromString is the actual libp2p helper; we only need a unique
  // object identity for the test, but the real one is fine.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { peerIdFromString } = require("@libp2p/peer-id");
  return peerIdFromString(s);
}

function buildFakeNode(relayStore: FakeRelayStoreState) {
  // The shape mirrors what `node.components.transportManager.getTransports()`
  // returns. Only the fields `requestRelayReservation` actually reads.
  return {
    components: {
      transportManager: {
        getTransports: () => [
          {
            [Symbol.toStringTag]: "@libp2p/circuit-relay-v2-transport",
            reservationStore: relayStore,
          },
        ],
      },
    },
  };
}

async function makeMeshWith(node: unknown): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({
    enableRelay: true,
    enableP2pDebug: false,
  });
  // Bypass the real createLibp2p — directly install the fake node.
  // The private `node` field is reached via a type-asserted accessor.
  (mesh as unknown as { node: unknown }).node = node;
  return mesh;
}

const RELAY_ADDR =
  "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";

describe("requestRelayReservation — verify-then-retry", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns reserved=1 when the reservation lands on the first attempt", async () => {
    const store = makeFakeRelayStore(async (s) => {
      s.hasReservation.mockReturnValue(true);
      return { reserved: true };
    });
    const mesh = await makeMeshWith(buildFakeNode(store));
    const out = await mesh.requestRelayReservation([RELAY_ADDR]);
    expect(out.reserved).toBe(1);
    expect(out.failed).toBe(0);
    expect(out.skipped).toBe(0);
    expect(store.addRelay).toHaveBeenCalledTimes(1);
    expect(store.hasReservation).toHaveBeenCalledTimes(1);
  });

  it("retries when addRelay returns but the reservation is missing (client/server desync)", async () => {
    const store = makeFakeRelayStore(async (s, _pid) => {
      // Simulate the desync: first 2 addRelay calls land but no
      // reservation in the local store; the 3rd succeeds. Use chained
      // mockReturnValueOnce so the 3rd hasReservation return is true.
      s.hasReservation.mockReturnValueOnce(false);
      s.hasReservation.mockReturnValueOnce(false);
      s.hasReservation.mockReturnValueOnce(true);
      return { reserved: true };
    });
    const mesh = await makeMeshWith(buildFakeNode(store));
    const out = await mesh.requestRelayReservation([RELAY_ADDR]);
    expect(out.reserved).toBe(1);
    expect(out.failed).toBe(0);
    expect(store.addRelay).toHaveBeenCalledTimes(3);
    expect(store.hasReservation).toHaveBeenCalledTimes(3);
  });

  it("returns failed=1 when all retry attempts are exhausted", async () => {
    const store = makeFakeRelayStore(async (s) => {
      s.hasReservation.mockReturnValue(false);
      return { reserved: false };
    });
    const mesh = await makeMeshWith(buildFakeNode(store));
    const out = await mesh.requestRelayReservation([RELAY_ADDR]);
    expect(out.reserved).toBe(0);
    expect(out.failed).toBe(1);
    expect(out.failures[0]).toMatch(/did not land after 3 attempts/);
    expect(store.addRelay).toHaveBeenCalledTimes(3);
  });

  it("fails immediately on addRelay transport error (no retry)", async () => {
    const store = makeFakeRelayStore(async () => {
      return { reserved: false, throwsOnAdd: true };
    });
    const mesh = await makeMeshWith(buildFakeNode(store));
    const out = await mesh.requestRelayReservation([RELAY_ADDR]);
    expect(out.reserved).toBe(0);
    expect(out.failed).toBe(1);
    expect(out.failures[0]).toMatch(/simulated addRelay transport error/);
    expect(store.addRelay).toHaveBeenCalledTimes(1);
  });

  it("skips /p2p-circuit/ addresses (target dials, not relay hops)", async () => {
    const store = makeFakeRelayStore(async (s) => {
      s.hasReservation.mockReturnValue(true);
      return { reserved: true };
    });
    const mesh = await makeMeshWith(buildFakeNode(store));
    const out = await mesh.requestRelayReservation([
      "/p2p-circuit/p2p/12D3KooWALICE...",
    ]);
    expect(out.skipped).toBe(1);
    expect(out.reserved).toBe(0);
    expect(out.skipReasons[0]).toMatch(/contains \/p2p-circuit\//);
    expect(store.addRelay).not.toHaveBeenCalled();
  });

  it("returns the 'mesh-not-started' failure when no node is installed", async () => {
    const mesh = new EnvoyMesh({ enableRelay: true });
    // No node installed → triggers the early 'mesh-not-started' path.
    // Note: the early-return path leaves `failed: 0` but still records
    // the reason in `failures[]` — this is the existing pre-patch
    // behavior; the contract is "failures[] is the source of truth,
    // failed is a counter for the parallel per-multiaddr path".
    const out = await mesh.requestRelayReservation([RELAY_ADDR]);
    expect(out.reserved).toBe(0);
    expect(out.skipped).toBe(0);
    expect(out.attempted).toBe(0);
    expect(out.failures[0]).toMatch(/mesh-not-started/);
  });
});
