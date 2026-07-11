/**
 * Tests for the `CircuitRelayServerConfig` plumbing in `@envoymesh/network`.
 *
 * Verifies the user-facing config object is faithfully passed through to
 * the libp2p `circuitRelayServer()` call: the helper converts camelCase
 * keys to the libp2p camelCase shape (no underscore keys to remember),
 * converts the per-reservation data limit from a number to a bigint (the
 * libp2p ReservationStore expects a bigint), and only emits the keys the
 * caller actually set — the libp2p default kicks in for everything else.
 */
import { describe, expect, it } from "vitest";
import { __testing, EnvoyMesh } from "../src/index.js";

const { buildCircuitRelayServerInit } = __testing;

describe("buildCircuitRelayServerInit", () => {
  it("returns an empty object when no config is provided", () => {
    expect(buildCircuitRelayServerInit(undefined)).toEqual({});
  });

  it("returns an empty object when config is empty", () => {
    expect(buildCircuitRelayServerInit({})).toEqual({});
  });

  it("passes through maxReservations unchanged", () => {
    expect(buildCircuitRelayServerInit({ maxReservations: 256 })).toEqual({
      reservations: { maxReservations: 256 },
    });
  });

  it("passes through reservationTtl as a number (ms)", () => {
    expect(buildCircuitRelayServerInit({ reservationTtl: 600_000 })).toEqual({
      reservations: { reservationTtl: 600_000 },
    });
  });

  it("converts defaultDataLimit from a number to a bigint", () => {
    // libp2p ReservationStore expects `bigint`, not `number`. Forgetting
    // this conversion is a silent type coercion in JS that may produce
    // wrong reservations at runtime.
    const result = buildCircuitRelayServerInit({ defaultDataLimit: 1_048_576 });
    expect(result).toEqual({ reservations: { defaultDataLimit: BigInt(1_048_576) } });
    // Stronger type assertion — fails at runtime if we accidentally pass
    // a number.
    expect(typeof (result as { reservations: { defaultDataLimit: bigint } })
      .reservations.defaultDataLimit).toBe("bigint");
  });

  it("passes through defaultDurationLimit as a number (ms)", () => {
    expect(buildCircuitRelayServerInit({ defaultDurationLimit: 1_800_000 })).toEqual({
      reservations: { defaultDurationLimit: 1_800_000 },
    });
  });

  it("passes through hopTimeout as a number (ms)", () => {
    expect(buildCircuitRelayServerInit({ hopTimeout: 60_000 })).toEqual({
      hopTimeout: 60_000,
    });
  });

  it("passes through maxInboundHopStreams", () => {
    expect(buildCircuitRelayServerInit({ maxInboundHopStreams: 128 })).toEqual({
      maxInboundHopStreams: 128,
    });
  });

  it("passes through maxOutboundStopStreams", () => {
    expect(buildCircuitRelayServerInit({ maxOutboundStopStreams: 600 })).toEqual({
      maxOutboundStopStreams: 600,
    });
  });

  it("combines all fields when set together", () => {
    const result = buildCircuitRelayServerInit({
      maxReservations: 256,
      reservationTtl: 600_000,
      defaultDataLimit: 1_048_576,
      defaultDurationLimit: 1_800_000,
      hopTimeout: 60_000,
      maxInboundHopStreams: 128,
      maxOutboundStopStreams: 600,
    });
    expect(result).toEqual({
      reservations: {
        maxReservations: 256,
        reservationTtl: 600_000,
        defaultDataLimit: BigInt(1_048_576),
        defaultDurationLimit: 1_800_000,
      },
      hopTimeout: 60_000,
      maxInboundHopStreams: 128,
      maxOutboundStopStreams: 600,
    });
  });

  it("emits no `reservations` key when no reservation field is set", () => {
    // The relay-server `circuitRelayServer` call accepts the reservations
    // sub-object. If the caller only sets top-level fields, we must
    // NOT emit an empty `reservations: {}` — the libp2p default would
    // still apply, but a future libp2p version might treat {} as "use
    // these zeros for everything" and break silently. Be conservative.
    const result = buildCircuitRelayServerInit({ hopTimeout: 60_000 });
    expect(result).toEqual({ hopTimeout: 60_000 });
    expect((result as { reservations?: unknown }).reservations).toBeUndefined();
  });
});

describe("EnvoyMesh circuitRelayServer config", () => {
  it("exposes the active config via getCircuitRelayServerConfig", () => {
    const config = {
      maxReservations: 256,
      reservationTtl: 600_000,
      defaultDataLimit: 1_048_576,
      defaultDurationLimit: 1_800_000,
      hopTimeout: 60_000,
    };
    const mesh = new EnvoyMesh({
      enableRelayServer: true,
      circuitRelayServer: config,
    });
    expect(mesh.getCircuitRelayServerConfig()).toEqual(config);
  });

  it("returns undefined when no config was provided", () => {
    const mesh = new EnvoyMesh({ enableRelayServer: true });
    expect(mesh.getCircuitRelayServerConfig()).toBeUndefined();
  });

  it("returns 0 from getCircuitRelayReservationCount when start() hasn't run", () => {
    const mesh = new EnvoyMesh({ enableRelayServer: true });
    // No start() → no libp2p node → no relay service → 0.
    expect(mesh.getCircuitRelayReservationCount()).toBe(0);
  });
});
