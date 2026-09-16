/**
 * The local product attach: the exchange, and the gates in front of it.
 *
 * A product on this machine asks a running node for a session of its own. Three
 * things have to hold, and each one is a way this could go wrong:
 *
 *   1. **it works from loopback without a token** — a product has no credential yet;
 *   2. **it is refused from the network** — it hands out a session, so reachable off
 *      machine any device could issue itself a credential;
 *   3. **the session it grants is scoped to the product** (`product:<Name>`, never the
 *      owner's scope), which is what makes least privilege structural rather than a
 *      promise.
 *
 * The tests drive a real `WsServer`, so the transport's gates are exercised rather
 * than simulated. The node-side mapping from that session to a caller context lives
 * in `apps/node/test/product-attach.test.ts`.
 */

import { networkInterfaces } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ATTACH_METHOD, requestProductSession } from "../src/attach-client.js";
import {
  WsServer,
  type HostNodeService,
  type HostRpcDispatcher,
  type SessionIdentityResolver,
} from "../src/index.js";

const servers: WsServer[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) {
    try {
      server.stop();
    } catch {
      /* best effort */
    }
  }
});

/** A LAN address of this machine, or null when there is none (offline CI). */
function lanAddress(): string | null {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return null;
}

const nodeService: HostNodeService = {
  on: () => undefined,
  onCallEvent: () => () => undefined,
  getNodeStatus: () => "running",
  getConnectionStatus: () => ({ peerId: "peer-1", multiaddrs: [] }),
  noteClientActivity: () => undefined,
};

/** Accepts the token the attach returned, the way the node's resolver would. */
const sessionIdentity: SessionIdentityResolver = {
  localScopeKey: "owner",
  resolveSession: async (token) =>
    token === "granted-token"
      ? { scopeKey: "product:EnvoyDev", ownerId: "owner-1", isOwnerScope: false, caller: undefined }
      : null,
};

async function boot(opts: { loopbackOnly?: boolean } = {}): Promise<{
  port: number;
  attach: ReturnType<typeof vi.fn>;
}> {
  const attach = vi.fn(async () => ({
    token: "granted-token",
    scopeKey: "product:EnvoyDev",
    ownerId: "owner-1",
  }));
  const dispatch: HostRpcDispatcher = async (method) => {
    if (method === DEFAULT_ATTACH_METHOD) return await attach();
    if (method === "getProfile") return { profile: "owner" };
    throw new Error(`unknown method: ${method}`);
  };
  const server = new WsServer(0, "/ws");
  servers.push(server);
  server.start(nodeService, {
    sessionIdentity,
    dispatch,
    preAuthMethods: [DEFAULT_ATTACH_METHOD],
    ...(opts.loopbackOnly === false ? {} : { loopbackOnlyMethods: [DEFAULT_ATTACH_METHOD] }),
  });
  await server.waitUntilListening();
  return { port: server.boundPort, attach };
}

/** One RPC over a fresh socket to an explicit host; the reply is matched by id. */
async function askDirect(host: string, port: number, method: string, params: unknown) {
  const { WebSocket } = await import("ws");
  const socket = new WebSocket(`ws://${host}:${port}/ws`);
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error(`${method} timed out`));
    }, 5_000);
    socket.on("message", (raw: Buffer) => {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (message["id"] !== 1) return; // unsolicited `connected` push
      clearTimeout(timer);
      socket.close();
      resolve(message);
    });
    socket.on("open", () =>
      socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })),
    );
    socket.on("error", reject);
  });
}

describe("requestProductSession", () => {
  it("gets a product-scoped session from a running node on this machine", async () => {
    const { port, attach } = await boot();
    const grant = await requestProductSession({ port }, { product: "EnvoyDev", version: "1.0.0" });

    expect(attach).toHaveBeenCalledTimes(1);
    expect(grant.scopeKey).toBe("product:EnvoyDev");
    expect(grant.ownerId).toBe("owner-1");
    expect(grant.token).toBe("granted-token");
    // Ready to dial: the caller must not have to reassemble the URL.
    expect(grant.wsUrl).toBe(`ws://127.0.0.1:${port}/ws?token=granted-token`);
  });

  it("hands back a URL whose token the same host accepts", async () => {
    // The claim that matters to a product: the granted session actually works.
    const { port } = await boot();
    const grant = await requestProductSession({ port }, { product: "EnvoyDev" });

    const { WebSocket } = await import("ws");
    const socket = new WebSocket(grant.wsUrl);
    const reply = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no reply")), 5_000);
      socket.on("message", (raw: Buffer) => {
        const message = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (message["id"] !== 2) return;
        clearTimeout(timer);
        socket.close();
        resolve(message);
      });
      socket.on("open", () =>
        socket.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "getProfile", params: {} })),
      );
      socket.on("error", reject);
    });
    expect(reply["error"]).toBeUndefined();
    expect(reply["result"]).toEqual({ profile: "owner" });
  });

  it("grants the session from loopback but refuses it from the network", async () => {
    const { port, attach } = await boot();
    const params = { product: "EnvoyDev" };

    // 1) This machine — no token needed, and the handler runs.
    const local = await askDirect("127.0.0.1", port, DEFAULT_ATTACH_METHOD, params);
    expect(local["error"]).toBeUndefined();
    expect(attach).toHaveBeenCalledTimes(1);

    // 2) The network — refused **before the handler**, because this method hands out
    // a credential and "anyone on the Wi-Fi" must not be able to issue themselves one.
    const lan = lanAddress();
    if (!lan) {
      expect(lan).toBeNull();
      return;
    }
    const remote = await askDirect(lan, port, DEFAULT_ATTACH_METHOD, params);
    expect(remote["error"]).toMatchObject({ code: "UNAUTHORIZED" });
    expect(attach).toHaveBeenCalledTimes(1); // still just the loopback call
  });

  it("surfaces a refusal from the node as an error, not a timeout", async () => {
    const dispatch: HostRpcDispatcher = async () => {
      throw new Error("Attach is not supported here");
    };
    const server = new WsServer(0, "/ws");
    servers.push(server);
    server.start(nodeService, {
      sessionIdentity,
      dispatch,
      preAuthMethods: [DEFAULT_ATTACH_METHOD],
      loopbackOnlyMethods: [DEFAULT_ATTACH_METHOD],
    });
    await server.waitUntilListening();

    await expect(
      requestProductSession({ port: server.boundPort }, { product: "EnvoyDev" }),
    ).rejects.toThrow(/Attach is not supported here/);
  });

  it("answers a client that sends before token resolution finishes", async () => {
    // `ws` is an EventEmitter, so a frame arriving while `resolveSession` is still
    // running used to be emitted with **no listener attached and dropped**: the socket
    // authenticated, the request vanished, and the caller timed out. Found by
    // verifying a real attach against a running node, where the product attach call
    // itself was the client that sent on `open`.
    //
    // Deterministic here: the resolver is deliberately slow, so the send always beats
    // it — before the fix this test hangs and fails on the timeout.
    const slow: SessionIdentityResolver = {
      localScopeKey: "owner",
      resolveSession: async (token) => {
        await new Promise((r) => setTimeout(r, 300));
        return token === "slow-token"
          ? { scopeKey: "owner", ownerId: "owner-1", isOwnerScope: true, caller: undefined }
          : null;
      },
    };
    const dispatch: HostRpcDispatcher = async (method) => {
      if (method === DEFAULT_ATTACH_METHOD) {
        return { token: "slow-token", scopeKey: "product:EnvoyDev", ownerId: "owner-1" };
      }
      return { ok: method };
    };
    const server = new WsServer(0, "/ws");
    servers.push(server);
    server.start(nodeService, {
      sessionIdentity: slow,
      dispatch,
      preAuthMethods: [DEFAULT_ATTACH_METHOD],
      loopbackOnlyMethods: [DEFAULT_ATTACH_METHOD],
    });
    await server.waitUntilListening();

    const grant = await requestProductSession(
      { port: server.boundPort },
      { product: "EnvoyDev", timeoutMs: 5_000 },
    );
    expect(grant.token).toBe("slow-token");

    // …and once authenticated, the session token still works on a fresh socket.
    const { WebSocket } = await import("ws");
    const socket = new WebSocket(grant.wsUrl);
    const reply = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no reply")), 5_000);
      socket.on("message", (raw: Buffer) => {
        const message = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (message["id"] !== 4) return;
        clearTimeout(timer);
        socket.close();
        resolve(message);
      });
      socket.on("open", () =>
        socket.send(JSON.stringify({ jsonrpc: "2.0", id: 4, method: "getProfile", params: {} })),
      );
      socket.on("error", reject);
    });
    expect(reply["result"]).toEqual({ ok: "getProfile" });
  });

  it("reports a missing node as an error, not a hang", async () => {
    await expect(
      requestProductSession({ port: 1 }, { product: "EnvoyDev", timeoutMs: 1_000 }),
    ).rejects.toThrow();
  });
});
