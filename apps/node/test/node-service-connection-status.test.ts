/**
 * Tests for node-service-connection-status.ts — getConnectionStatus.
 */
import { describe, expect, it, vi } from "vitest";

import {
  getConnectionStatusViaRuntime,
  getBridgeStatusViaRuntime,
  getOpenClawStatusViaRuntime,
  type ConnectionStatusContext,
} from "../src/node-service-connection-status.js";
import type { BridgeStatus } from "@envoymesh/api";

interface MockMesh {
  peerId: string;
  multiaddrs: string[];
  getConnectionStats(): { circuitPeerIds: string[] };
}

function makeCtx(
  overrides: Partial<{
    lastError: string | undefined;
    lastErrorAt: string | undefined;
    mesh: MockMesh | undefined;
    nodeStatus: string;
    bootstrapPeers: string[];
    hasTerminalManager: boolean;
  }> = {},
): ConnectionStatusContext {
  return {
    getLastNodeError: () => overrides.lastError,
    getLastNodeErrorAt: () => overrides.lastErrorAt,
    getReachableMesh: () => overrides.mesh as never,
    getNodeStatus: () => overrides.nodeStatus ?? "running",
    getRelayBootstrapPeers: () => overrides.bootstrapPeers ?? [],
    hasTerminalManager: () => overrides.hasTerminalManager ?? false,
  };
}

describe("getConnectionStatusViaRuntime", () => {
  it("returns an offline shape when the mesh is unreachable", () => {
    const out = getConnectionStatusViaRuntime(
      makeCtx({ mesh: undefined, nodeStatus: "running" }),
    );
    expect(out.online).toBe(false);
    expect(out.peerId).toBe("");
    expect(out.multiaddrs).toEqual([]);
    expect(out.connectedRelays).toEqual([]);
    expect(out.terminalsAvailable).toBe(false);
  });

  it("returns an offline shape when nodeStatus is not 'running'", () => {
    const out = getConnectionStatusViaRuntime(
      makeCtx({
        mesh: {
          peerId: "peer-1",
          multiaddrs: ["/ip4/1.2.3.4/tcp/4001"],
          getConnectionStats: () => ({ circuitPeerIds: ["relay-1"] }),
        },
        nodeStatus: "starting",
      }),
    );
    expect(out.online).toBe(false);
    expect(out.peerId).toBe(""); // mesh exists but node not running yet
  });

  it("returns the online shape with mesh metadata when running", () => {
    const out = getConnectionStatusViaRuntime(
      makeCtx({
        mesh: {
          peerId: "peer-1",
          multiaddrs: ["/ip4/1.2.3.4/tcp/4001"],
          getConnectionStats: () => ({ circuitPeerIds: ["relay-1"] }),
        },
        nodeStatus: "running",
        bootstrapPeers: ["/dns4/relay-a.example/tcp/443"],
        hasTerminalManager: true,
      }),
    );
    expect(out.online).toBe(true);
    expect(out.peerId).toBe("peer-1");
    expect(out.multiaddrs).toEqual(["/ip4/1.2.3.4/tcp/4001"]);
    expect(out.connectedRelays).toEqual(["relay-1"]);
    expect(out.terminalsAvailable).toBe(true);
    expect(out.bootstrapPeers).toEqual(["/dns4/relay-a.example/tcp/443"]);
    expect(out.bondedPeers).toBe(0);
  });

  it("preserves lastError diagnostics when present", () => {
    const out = getConnectionStatusViaRuntime(
      makeCtx({
        mesh: undefined,
        lastError: "boot failed: missing config",
        lastErrorAt: "2026-06-30T00:00:00Z",
      }),
    );
    expect(out.online).toBe(false);
    expect(out.lastError).toBe("boot failed: missing config");
    expect(out.lastErrorAt).toBe("2026-06-30T00:00:00Z");
  });
});

describe("getBridgeStatusViaRuntime", () => {
  it("returns the default when no bridge status is set", () => {
    const ctx: ConnectionStatusContext = {
      ...makeCtx(),
      getBridgeStatus: () => undefined,
    };
    const out = getBridgeStatusViaRuntime(ctx);
    expect(out.enabled).toBe(false);
    expect(out.agentPeerId).toBe("");
    expect(out.listenPort).toBe(0);
  });

  it("returns the current bridge status when set", () => {
    const bridge: BridgeStatus = {
      enabled: true,
      agentPeerId: "agent-peer-1",
      agentUrl: "ws://example",
      listenPort: 4001,
      agentName: "my-agent",
      agentType: "openclaw",
    };
    const ctx: ConnectionStatusContext = {
      ...makeCtx(),
      getBridgeStatus: () => bridge,
    };
    expect(getBridgeStatusViaRuntime(ctx)).toEqual(bridge);
  });
});

describe("getOpenClawStatusViaRuntime", () => {
  it("returns the openclaw status with child pid when running", async () => {
    const out = await getOpenClawStatusViaRuntime({
      isOpenClawEnabled: async () => true,
      isOpenClawReady: () => true,
      getAssistantAgentUrl: () => "http://127.0.0.1:9999",
      getOpenClawGatewayChild: () => ({ killed: false, pid: 12345 }),
    });
    expect(out.enabled).toBe(true);
    expect(out.running).toBe(true);
    expect(out.url).toBe("http://127.0.0.1:9999");
    expect(out.childPid).toBe(12345);
  });

  it("returns childPid: undefined when child is killed", async () => {
    const out = await getOpenClawStatusViaRuntime({
      isOpenClawEnabled: async () => true,
      isOpenClawReady: () => false,
      getAssistantAgentUrl: () => "http://127.0.0.1:9999",
      getOpenClawGatewayChild: () => ({ killed: true }),
    });
    expect(out.childPid).toBeUndefined();
    expect(out.running).toBe(false);
  });
});