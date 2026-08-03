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

  it("returns false on lan-fast even when not direct", async () => {
    const prefer = await preferCircuitHintsForCallDelivery(
      { loadConfig: async () => ({ discoveryProfile: "lan-fast" }) },
      { connected: false, direct: false },
    );
    expect(prefer).toBe(false);
  });

  it("returns false when discoveryProfile is empty (defaults to lan-fast)", async () => {
    const prefer = await preferCircuitHintsForCallDelivery(
      { loadConfig: async () => ({}) },
      { connected: false, direct: false },
    );
    expect(prefer).toBe(false);
  });

  it("returns true on wan-default when not direct", async () => {
    const prefer = await preferCircuitHintsForCallDelivery(
      { loadConfig: async () => ({ discoveryProfile: "wan-default" }) },
      { connected: false, direct: false },
    );
    expect(prefer).toBe(true);
  });

  it("returns true when config load fails and peer is not direct", async () => {
    const prefer = await preferCircuitHintsForCallDelivery(
      {
        loadConfig: async () => {
          throw new Error("no config");
        },
      },
      { connected: false, direct: false },
    );
    expect(prefer).toBe(true);
  });
});

describe("effectiveCallIceServersViaRuntime", () => {
  it("returns empty list on lan-fast when unset", async () => {
    const { effectiveCallIceServersViaRuntime } = await import("../src/node-service-calls.js");
    const servers = await effectiveCallIceServersViaRuntime(
      {
        loadConfig: async () => ({ discoveryProfile: "lan-fast" }),
      } as never,
      undefined,
    );
    expect(servers).toEqual([]);
  });

  it("returns public STUN on wan-default when unset", async () => {
    const { effectiveCallIceServersViaRuntime } = await import("../src/node-service-calls.js");
    const servers = await effectiveCallIceServersViaRuntime(
      {
        loadConfig: async () => ({ discoveryProfile: "wan-default" }),
      } as never,
      undefined,
    );
    expect(servers.some((s) => String(s.urls).includes("google"))).toBe(true);
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
