/**
 * Tests for the getPairingPayload runtime.
 */
import { describe, expect, it, vi } from "vitest";

import {
  getPairingPayloadViaRuntime,
  type GetPairingPayloadContext,
} from "../src/node-service-handlers-pairing-payload.js";

function makeCtx(
  overrides: Partial<GetPairingPayloadContext> = {},
): { ctx: GetPairingPayloadContext; spies: Record<string, ReturnType<typeof vi.fn>> } {
  const spies: Record<string, ReturnType<typeof vi.fn>> = {
    getBridgeStatus: vi.fn(async () => ({ enabled: false })),
    getReachableMesh: vi.fn(() => undefined),
    getWsPort: vi.fn(() => undefined),
    getWsPath: vi.fn(() => undefined),
    getRelayPublicWsUrl: vi.fn(() => undefined),
    getRelayBootstrapPeers: vi.fn(() => []),
    getProfile: vi.fn(() => undefined),
    deriveRelayWsUrl: vi.fn(() => undefined),
    autoDiscoverRelayWsUrl: vi.fn(async () => undefined),
    autoDiscoverRelayPeerId: vi.fn(async () => undefined),
    setPairingToken: vi.fn(),
  };
  const ctx: GetPairingPayloadContext = {
    ...spies,
    ...overrides,
  } as never;
  return { ctx, spies };
}

describe("getPairingPayloadViaRuntime", () => {
  it("returns a basic payload with LAN wsUrl when no relay", async () => {
    const { ctx, spies } = makeCtx({
      getWsPort: () => 3030,
      getWsPath: () => "/ws",
      getProfile: () => ({ owner: { ownerId: "owner-1", publicKeyPem: "PK" } }) as never,
    });
    const out = (await getPairingPayloadViaRuntime(ctx)) as Record<string, unknown>;
    expect(out.wsUrl).toBe("ws://localhost:3030/ws");
    expect(out.token).toEqual(expect.any(String));
    expect(spies.setPairingToken).toHaveBeenCalledTimes(1);
  });

  it("uses 3030 / /ws defaults when wsPort / wsPath are undefined", async () => {
    const { ctx } = makeCtx();
    const out = (await getPairingPayloadViaRuntime(ctx)) as Record<string, unknown>;
    expect(out.wsUrl).toBe("ws://localhost:3030/ws");
  });

  it("skips 127.0.0.1 when deriving LAN IP", async () => {
    const { ctx } = makeCtx({
      getReachableMesh: () => ({
        peerId: "peer-1",
        multiaddrs: [
          "/ip4/127.0.0.1/tcp/4001",
          "/ip4/192.168.1.100/tcp/63641",
        ],
      }) as never,
    });
    const out = (await getPairingPayloadViaRuntime(ctx)) as Record<string, unknown>;
    expect(out.lanWsUrl).toBe("ws://192.168.1.100:3030/ws");
  });

  it("uses relay wsUrl with target+token params when relay is discovered", async () => {
    const { ctx } = makeCtx({
      autoDiscoverRelayWsUrl: async () => "wss://relay.example.com",
      getReachableMesh: () => ({ peerId: "home-peer", multiaddrs: [] }) as never,
    });
    const out = (await getPairingPayloadViaRuntime(ctx)) as Record<string, unknown>;
    expect(out.wsUrl).toContain("wss://relay.example.com?");
    expect(String(out.wsUrl)).toContain("target=home-peer");
    expect(String(out.wsUrl)).toMatch(/token=/);
    expect(out.relayWsUrl).toBe("wss://relay.example.com");
  });

  it("treats empty-string relayPublicWsUrl as disabled (no auto-discover)", async () => {
    const { ctx, spies } = makeCtx({
      getRelayPublicWsUrl: () => "",
      autoDiscoverRelayWsUrl: async () => {
        throw new Error("should not be called");
      },
    });
    const out = (await getPairingPayloadViaRuntime(ctx)) as Record<string, unknown>;
    expect(out.wsUrl).toBe("ws://localhost:3030/ws");
    expect(spies.autoDiscoverRelayWsUrl).not.toHaveBeenCalled();
  });

  it("includes bridge fields when bridge is enabled", async () => {
    const { ctx } = makeCtx({
      getBridgeStatus: async () => ({
        enabled: true,
        agentPeerId: "agent-1",
        agentPublicKeyPem: "AGENT-PUB",
        agentName: "MyAgent",
      }),
    });
    const out = (await getPairingPayloadViaRuntime(ctx)) as Record<string, unknown>;
    expect(out.agentPeerId).toBe("agent-1");
    expect(out.agentPubKey).toBe("AGENT-PUB");
    expect(out.agentName).toBe("MyAgent");
  });

  it("includes bootstrap peers + preset names", async () => {
    const { ctx } = makeCtx({
      getRelayBootstrapPeers: () => ["public-libp2p", "cn-relay"],
    });
    const out = (await getPairingPayloadViaRuntime(ctx)) as Record<string, unknown>;
    expect((out.bootstrapPeers as string[]).length).toBeGreaterThan(5);
    expect((out.bootstrapPeers as string[])).toContain("public-libp2p");
    expect((out.bootstrapPeers as string[])).toContain("cn-relay");
    expect((out.bootstrapPresetNames as string[])).toEqual(
      expect.arrayContaining(["public-libp2p", "cn-relay", "public-libp2p-am6"]),
    );
  });

  it("includes homeNodePeerId when reachable", async () => {
    const { ctx } = makeCtx({
      getReachableMesh: () => ({ peerId: "home-1", multiaddrs: [] }) as never,
    });
    const out = (await getPairingPayloadViaRuntime(ctx)) as Record<string, unknown>;
    expect(out.homeNodePeerId).toBe("home-1");
  });
});