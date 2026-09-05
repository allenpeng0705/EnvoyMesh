/**
 * Focused tests for the EM-R self-revoke "response-then-close" behavior of
 * WsServer.disconnectClientsForDevice (FIX-1).
 *
 * There is no full WsServer suite today, so this drives the disconnect /
 * deferral logic directly with fake sockets, establishing the same per-RPC
 * async caller context the RPC handler wraps around `routeToNodeService` (see
 * ws-server.ts handleMessage). The parked socket is closed by the parking RPC
 * invocation's handler immediately after `sendResponse` — the ordering that
 * guarantees the `{ ok, revokedDeviceIds }` result reaches a self-revoking
 * device — and never by a *different* concurrent RPC on the same socket.
 */
import { describe, expect, it, vi } from "vitest";
import { WsServer } from "../src/ws-server.js";

interface TestSocket {
  close: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  readyState: number;
}

interface TestInvocation {
  ws: TestSocket;
}

function fakeSocket(): TestSocket {
  return { close: vi.fn(), terminate: vi.fn(), readyState: 1 };
}

interface WsInternals {
  authenticatedSessions: Map<TestSocket, { deviceId: string }>;
  activeRpcWs: { run: (invocation: TestInvocation, fn: () => void) => void };
  flushDeferredDeviceClose: (ws: TestSocket, invocation: TestInvocation) => void;
}

/** Instantiate WsServer without start(); reach the private registries it needs. */
function makeServer(): { server: WsServer } & WsInternals {
  const server = new WsServer(0);
  const internals = server as unknown as WsInternals;
  // authenticatedSessions / activeRpcWs are own instance fields; the flush
  // method lives on the prototype, so bind it to the instance explicitly.
  return {
    server,
    authenticatedSessions: internals.authenticatedSessions,
    activeRpcWs: internals.activeRpcWs,
    flushDeferredDeviceClose: (ws, invocation) =>
      (
        server as unknown as {
          flushDeferredDeviceClose(ws: TestSocket, invocation: TestInvocation): void;
        }
      ).flushDeferredDeviceClose(ws, invocation),
  };
}

describe("WsServer.disconnectClientsForDevice (EM-R self-revoke)", () => {
  it("parks the caller's own socket until the parking RPC flushes it", () => {
    const { server, authenticatedSessions, activeRpcWs, flushDeferredDeviceClose } = makeServer();
    const self = fakeSocket();
    const invocation = { ws: self };
    authenticatedSessions.set(self, { deviceId: "dev-a" });

    const closedCount = activeRpcWs.run(invocation, () =>
      server.disconnectClientsForDevice("dev-a"),
    );

    expect(closedCount).toBe(1);
    // Not closed yet — the JSON-RPC response must be written first.
    expect(self.close).not.toHaveBeenCalled();
    expect(self.terminate).not.toHaveBeenCalled();

    // The parking RPC's handler calls this right after sendResponse.
    flushDeferredDeviceClose(self, invocation);
    expect(self.close).toHaveBeenCalledWith(4001, "device revoked");
    expect(self.terminate).not.toHaveBeenCalled();
  });

  it("closes a different device synchronously while the caller is mid-RPC", () => {
    const { server, authenticatedSessions, activeRpcWs } = makeServer();
    const self = fakeSocket();
    const other = fakeSocket();
    authenticatedSessions.set(self, { deviceId: "dev-self" });
    authenticatedSessions.set(other, { deviceId: "dev-other" });

    const closedCount = activeRpcWs.run({ ws: self }, () =>
      server.disconnectClientsForDevice("dev-other"),
    );

    expect(closedCount).toBe(1);
    expect(other.close).toHaveBeenCalledWith(4001, "device revoked");
    expect(self.close).not.toHaveBeenCalled();
  });

  it("closes other sockets of the same device synchronously, parking only the caller's", () => {
    const { server, authenticatedSessions, activeRpcWs, flushDeferredDeviceClose } = makeServer();
    const self = fakeSocket();
    const twin = fakeSocket();
    const invocation = { ws: self };
    authenticatedSessions.set(self, { deviceId: "dev-a" });
    authenticatedSessions.set(twin, { deviceId: "dev-a" });

    const closedCount = activeRpcWs.run(invocation, () => server.disconnectClientsForDevice("dev-a"));

    expect(closedCount).toBe(2);
    expect(twin.close).toHaveBeenCalledWith(4001, "device revoked");
    expect(self.close).not.toHaveBeenCalled();
    flushDeferredDeviceClose(self, invocation);
    expect(self.close).toHaveBeenCalledWith(4001, "device revoked");
  });

  it("a different concurrent RPC on the same socket cannot flush the parked close early", () => {
    const { server, authenticatedSessions, activeRpcWs, flushDeferredDeviceClose } = makeServer();
    const self = fakeSocket();
    const revokeInvocation = { ws: self };
    const otherInvocation = { ws: self }; // a second, concurrent read RPC
    authenticatedSessions.set(self, { deviceId: "dev-a" });

    activeRpcWs.run(revokeInvocation, () => server.disconnectClientsForDevice("dev-a"));

    expect(self.close).not.toHaveBeenCalled();
    // The concurrent read RPC finishes first — it must NOT close the socket.
    flushDeferredDeviceClose(self, otherInvocation);
    expect(self.close).not.toHaveBeenCalled();
    // The parking revoke RPC finishes — only now does the socket close.
    flushDeferredDeviceClose(self, revokeInvocation);
    expect(self.close).toHaveBeenCalledWith(4001, "device revoked");
  });

  it("closes synchronously when there is no active RPC context (back-compat)", () => {
    const { server, authenticatedSessions } = makeServer();
    const a = fakeSocket();
    authenticatedSessions.set(a, { deviceId: "dev-a" });

    const closedCount = server.disconnectClientsForDevice("dev-a");

    expect(closedCount).toBe(1);
    expect(a.close).toHaveBeenCalledWith(4001, "device revoked");
  });

  it("falls back to terminate() when close() throws (non-self socket)", () => {
    const { server, authenticatedSessions, activeRpcWs } = makeServer();
    const self = fakeSocket();
    const other = fakeSocket();
    other.close.mockImplementation(() => {
      throw new Error("already closed");
    });
    authenticatedSessions.set(self, { deviceId: "dev-self" });
    authenticatedSessions.set(other, { deviceId: "dev-other" });

    activeRpcWs.run({ ws: self }, () => server.disconnectClientsForDevice("dev-other"));

    expect(other.close).toHaveBeenCalled();
    expect(other.terminate).toHaveBeenCalled();
  });

  it("flush is a no-op for a socket that was never parked", () => {
    const { server, flushDeferredDeviceClose } = makeServer();
    const a = fakeSocket();
    expect(() => flushDeferredDeviceClose(a, { ws: a })).not.toThrow();
    expect(a.close).not.toHaveBeenCalled();
    expect(a.terminate).not.toHaveBeenCalled();
    expect(server.disconnectClientsForDevice("  ")).toBe(0);
  });
});
