import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loopbackWsUrlForPort,
  orderedDevLoopbackWsPorts,
  parseLoopbackWsPort,
  resolveDevLoopbackWsUrlHeal,
} from "../../src/lib/discover-local-node.js";

describe("discover-local-node helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses loopback ws ports", () => {
    expect(parseLoopbackWsPort("ws://127.0.0.1:4030/ws")).toBe(4030);
    expect(parseLoopbackWsPort("ws://127.0.0.1/ws")).toBe(3030);
    expect(parseLoopbackWsPort("ws://example.com:3030/ws")).toBeNull();
  });

  it("orders prefer port before defaults", () => {
    expect(orderedDevLoopbackWsPorts(4030)).toEqual([4030, 3030]);
    expect(orderedDevLoopbackWsPorts(3030)).toEqual([3030, 4030]);
    expect(orderedDevLoopbackWsPorts(null)).toEqual([3030, 4030]);
  });

  it("builds loopback ws urls", () => {
    expect(loopbackWsUrlForPort(4030)).toBe("ws://127.0.0.1:4030/ws");
  });

  it("does not heal away from primary 3030 toward 4030", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          wsUrl: "ws://127.0.0.1:4030/ws",
          port: 4030,
          preferredPort: 3030,
          preferredOpen: false,
          openPorts: [4030],
        }),
      })),
    );
    await expect(
      resolveDevLoopbackWsUrlHeal("ws://127.0.0.1:3030/ws"),
    ).resolves.toBeNull();
  });

  it("heals dead 4030 toward primary 3030", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          wsUrl: "ws://127.0.0.1:3030/ws",
          port: 3030,
          preferredPort: 4030,
          preferredOpen: false,
          openPorts: [3030],
        }),
      })),
    );
    await expect(
      resolveDevLoopbackWsUrlHeal("ws://127.0.0.1:4030/ws"),
    ).resolves.toBe("ws://127.0.0.1:3030/ws");
  });
});
