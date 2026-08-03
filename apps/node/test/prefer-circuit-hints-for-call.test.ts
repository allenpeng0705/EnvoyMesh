import { describe, expect, it } from "vitest";
import { preferCircuitHintsForCallDelivery } from "../src/node-service-calls.js";

describe("preferCircuitHintsForCallDelivery", () => {
  it("returns false when peer is already direct", async () => {
    const prefer = await preferCircuitHintsForCallDelivery(
      { loadConfig: async () => ({ discoveryProfile: "wan-default" }) },
      { connected: true, direct: true },
    );
    expect(prefer).toBe(false);
  });

  it("returns false when already connected via relay", async () => {
    const prefer = await preferCircuitHintsForCallDelivery(
      { loadConfig: async () => ({ discoveryProfile: "lan-fast" }) },
      { connected: true, direct: false },
    );
    expect(prefer).toBe(false);
  });

  it("returns true when not connected (circuit-first for invite reliability)", async () => {
    const prefer = await preferCircuitHintsForCallDelivery(
      { loadConfig: async () => ({ discoveryProfile: "lan-fast" }) },
      { connected: false, direct: false },
    );
    expect(prefer).toBe(true);
  });

  it("returns true on wan-default when not connected", async () => {
    const prefer = await preferCircuitHintsForCallDelivery(
      { loadConfig: async () => ({ discoveryProfile: "wan-default" }) },
      { connected: false, direct: false },
    );
    expect(prefer).toBe(true);
  });
});

describe("effectiveCallIceServersViaRuntime", () => {
  it("returns non-Google STUN defaults when unset", async () => {
    const { effectiveCallIceServersViaRuntime } = await import("../src/node-service-calls.js");
    const servers = await effectiveCallIceServersViaRuntime(
      {
        loadConfig: async () => ({ discoveryProfile: "lan-fast" }),
      } as never,
      undefined,
    );
    expect(servers.length).toBeGreaterThan(0);
    expect(servers.some((s) => String(s.urls).includes("google"))).toBe(false);
  });

  it("honors explicit empty caller list", async () => {
    const { effectiveCallIceServersViaRuntime } = await import("../src/node-service-calls.js");
    const servers = await effectiveCallIceServersViaRuntime(
      {
        loadConfig: async () => ({ discoveryProfile: "wan-default" }),
      } as never,
      [],
    );
    expect(servers).toEqual([]);
  });
});
