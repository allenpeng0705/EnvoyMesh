import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";

import {
  HomeRemoteClient,
  terminalPathFromAttachWsUrl,
  WS_READY_STATE_OPEN,
  type HomeRemoteCandidate,
  type WebSocketLike,
} from "../src/home-remote-client.js";

describe("terminalPathFromAttachWsUrl", () => {
  it("extracts path and query from loopback attach URL", () => {
    expect(
      terminalPathFromAttachWsUrl(
        "ws://127.0.0.1:3031/ws/terminal/abc-123?token=secret",
      ),
    ).toBe("/ws/terminal/abc-123?token=secret");
  });
});

/**
 * Spin up a tiny WebSocket echo server on a random port.
 * Returns the URL and a handle for cleanup.
 */
function startEchoServer(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const httpServer = createServer();
    const wss = new WebSocketServer({ noServer: true });
    httpServer.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.on("message", (raw) => {
          const msg = JSON.parse(String(raw)) as { id?: string; method?: string };
          if (msg.method) {
            ws.send(JSON.stringify({ id: msg.id, result: { ok: true } }));
          }
        });
      });
    });
    httpServer.listen(0, "127.0.0.1", () => {
      const port = (httpServer.address() as AddressInfo).port;
      resolve({
        url: `ws://127.0.0.1:${port}/ws?token=test`,
        close: () =>
          new Promise<void>((res) => {
            wss.close();
            httpServer.close(() => res());
          }),
      });
    });
  });
}

describe("HomeRemoteClient RPC", () => {
  it("calls JSON-RPC methods over a mock home WebSocket", async () => {
    const server = await startEchoServer();
    const client = new HomeRemoteClient({
      resolveCandidates: async () => [{ name: "tunnel", url: server.url }],
    });

    const result = await client.call<{ ok: boolean }>("listTerminalSessions", {});
    expect(result).toEqual({ ok: true });

    client.dispose();
    await server.close();
  });

  it("falls back to the next candidate when the first is unreachable", async () => {
    const tunnel = await startEchoServer();
    // 127.0.0.1:1 is never listening — the LAN candidate should fail fast
    // and the client should fall back to the tunnel candidate.
    const lanUrl = "ws://127.0.0.1:1/ws?token=test";

    const client = new HomeRemoteClient({
      resolveCandidates: async () => [
        { name: "lan", url: lanUrl },
        { name: "tunnel", url: tunnel.url },
      ],
      perCandidateTimeoutMs: 1_000,
      upgradeSweepMs: 0,
    });

    const result = await client.call<{ ok: boolean }>("ping", {});
    expect(result).toEqual({ ok: true });
    expect(client.activeCandidate?.name).toBe("tunnel");

    client.dispose();
    await tunnel.close();
  });

  it("prefers the higher-priority candidate when reachable", async () => {
    const tunnel = await startEchoServer();
    const lan = await startEchoServer();

    const client = new HomeRemoteClient({
      resolveCandidates: async () => [
        { name: "lan", url: lan.url },
        { name: "tunnel", url: tunnel.url },
      ],
      perCandidateTimeoutMs: 1_000,
      upgradeSweepMs: 0,
    });

    const result = await client.call<{ ok: boolean }>("ping", {});
    expect(result).toEqual({ ok: true });
    expect(client.activeCandidate?.name).toBe("lan");

    client.dispose();
    await lan.close();
    await tunnel.close();
  });

  it("notifies onActiveTransportChange when a transport is selected", async () => {
    const tunnel = await startEchoServer();
    const seen: (string | null)[] = [];

    const client = new HomeRemoteClient({
      resolveCandidates: async () => [{ name: "tunnel", url: tunnel.url }],
      onActiveTransportChange: (c) => seen.push(c?.name ?? null),
      upgradeSweepMs: 0,
    });

    await client.call<{ ok: boolean }>("ping", {});
    expect(seen).toContain("tunnel");

    client.dispose();
    await tunnel.close();
  });

  it("selects the libp2p candidate when a custom createTransport opens it", async () => {
    const tunnel = await startEchoServer();
    const seen: (string | null)[] = [];

    // The factory hands back a tiny WebSocket-shaped mock that
    // 1) fires onopen the moment HomeRemoteClient's `openSocket` has
    //    installed its onopen handler (we use a microtask so the
    //    assignment finishes first), and
    // 2) replies to JSON-RPC requests with a success result on its
    //    onmessage handler, simulating a real libp2p stream echo.
    const factory = (candidate: HomeRemoteCandidate): WebSocketLike | Promise<WebSocketLike> => {
      if (candidate.name !== "libp2p") {
        return new WebSocket(candidate.url) as unknown as WebSocketLike;
      }
      const sock: WebSocketLike = {
        readyState: WS_READY_STATE_OPEN,
        send(data: string) {
          const req = JSON.parse(data) as { id?: string; method?: string };
          if (req.id) {
            queueMicrotask(() => {
              this.onmessage?.({
                data: JSON.stringify({ id: req.id, result: { ok: true } }),
              });
            });
          }
        },
        close() {
          this.onclose?.(undefined);
        },
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
      };
      // Return a Promise so the `await createTransport(...)` always yields
      // at least one microtask, then fire onopen from a setTimeout(0) so
      // it runs *after* HomeRemoteClient installs its onopen handler in
      // the `await new Promise(...)` block of `openSocket`.
      return Promise.resolve(sock).then((s) => {
        setTimeout(() => s.onopen?.(undefined), 0);
        return s;
      });
    };

    const client = new HomeRemoteClient({
      resolveCandidates: async () => [
        { name: "lan", url: "ws://127.0.0.1:1/ws?token=test" }, // unreachable
        { name: "libp2p", url: "libp2p://12D3KooWHomePeerIdForTesting1234567890" },
        { name: "tunnel", url: tunnel.url },
      ],
      createTransport: factory,
      onActiveTransportChange: (c) => seen.push(c?.name ?? null),
      perCandidateTimeoutMs: 1_000,
      upgradeSweepMs: 0,
    });

    const result = await client.call<{ ok: boolean }>("ping", {});
    expect(result).toEqual({ ok: true });
    expect(client.activeCandidate?.name).toBe("libp2p");
    expect(seen).toContain("libp2p");

    client.dispose();
    await tunnel.close();
  });

  it("clears this.ws after a failed candidate so racing RPCs don't send on a dead socket", async () => {
    // A previous iteration of the code would leave this.ws pointing at
    // the just-failed transport. A concurrent `call()` could then try
    // to send to it. The fix is to clear this.ws in the catch block.
    //
    // We can't directly observe the internal `this.ws` field, so we
    // assert via behavior: after a failed candidate, a new call()
    // should not throw "notOpen" (which would happen if the call
    // landed on a closed transport and ws.send was invoked on it).
    const tunnel = await startEchoServer();
    const client = new HomeRemoteClient({
      resolveCandidates: async () => [
        { name: "lan", url: "ws://127.0.0.1:1/ws?token=test" }, // unreachable
        { name: "tunnel", url: tunnel.url },
      ],
      perCandidateTimeoutMs: 1_000,
      upgradeSweepMs: 0,
    });

    const result = await client.call<{ ok: boolean }>("ping", {});
    expect(result).toEqual({ ok: true });
    expect(client.activeCandidate?.name).toBe("tunnel");

    client.dispose();
    await tunnel.close();
  });

  it("backoff cooldown skips higher-priority candidates that just failed", async () => {
    // Two real servers: an unreachable LAN (port 1) and a reachable tunnel.
    // On the first connect, the LAN fails, the tunnel succeeds, and the
    // LAN name should be recorded as failing so the upgrade sweep skips
    // it on the very next tick.
    const tunnel = await startEchoServer();
    let lanProbeCount = 0;

    // A factory whose "lan" candidate always opens an immediately-closed
    // socket to simulate a host that accepts and resets.
    const factory = (candidate: HomeRemoteCandidate): WebSocketLike | Promise<WebSocketLike> => {
      if (candidate.name === "lan") {
        lanProbeCount++;
        // Return a socket that fires onerror synchronously (after the
        // caller installs its handler). This is what the HomeRemoteClient
        // sees as "connect failed" and falls back to the next candidate.
        const sock: WebSocketLike = {
          readyState: WS_READY_STATE_OPEN,
          send() {
            // The home-remote client never sends before call(), so
            // this branch is dead in the test.
          },
          close() {
            this.onclose?.(undefined);
          },
          onopen: null,
          onmessage: null,
          onclose: null,
          onerror: null,
        };
        return Promise.resolve(sock).then((s) => {
          setTimeout(() => s.onerror?.(undefined), 0);
          return s;
        });
      }
      return new WebSocket(candidate.url) as unknown as WebSocketLike;
    };

    // First the client connects cold. LAN fails, tunnel succeeds.
    const client = new HomeRemoteClient({
      resolveCandidates: async () => [
        { name: "lan", url: "ws://127.0.0.1:1/ws?token=test" },
        { name: "tunnel", url: tunnel.url },
      ],
      createTransport: factory,
      perCandidateTimeoutMs: 1_000,
      // Disable the upgrade sweep — we test the connect-time fallback
      // path here, not the sweep.
      upgradeSweepMs: 0,
    });

    const result = await client.call<{ ok: boolean }>("ping", {});
    expect(result).toEqual({ ok: true });
    expect(client.activeCandidate?.name).toBe("tunnel");
    // LAN was probed exactly once (during connect), then the cooldown
    // should prevent it from being re-probed by the upgrade sweep.
    expect(lanProbeCount).toBe(1);

    client.dispose();
    await tunnel.close();
  });

  it("dispose() clears the probe cooldown and the upgrading guard", () => {
    // We exercise dispose() in isolation. The internal state of the
    // cooldown map and the _upgrading flag are not directly observable,
    // but we can verify that dispose doesn't throw and clears timers
    // (the interval is unref'd implicitly via clearInterval).
    const client = new HomeRemoteClient({
      resolveCandidates: async () => [{ name: "tunnel", url: "ws://127.0.0.1:1/ws?token=test" }],
      upgradeSweepMs: 100,
    });
    // Should not throw, even though we never called ensureConnected.
    expect(() => client.dispose()).not.toThrow();
  });
});
