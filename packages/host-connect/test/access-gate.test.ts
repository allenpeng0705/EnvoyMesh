/**
 * Who may call what, and from where.
 *
 * The transport used to enforce authentication only for clients that *attempted* a
 * token and failed, so a client with no token was unrestricted wherever it connected
 * from — and the host binds `0.0.0.0` on purpose, so paired phones can reach it.
 * Measured on a running node: `listFamilyProfiles` answered an unauthenticated client
 * connecting from the machine's LAN address. The stated reason was "Social UI,
 * Capacitor app … legacy and unrestricted"; the Capacitor app has since been deleted
 * and the Social UI connects over loopback.
 *
 * So these tests are the four flows that matter, and three of them must keep working:
 *
 *   1. the owner's own UI — loopback, no token → **allowed**;
 *   2. a paired phone — any address, valid token → **allowed**;
 *   3. pairing itself — a pre-auth method, no token, any address → **allowed**;
 *   4. a device on the network — non-loopback, no token → **refused**.
 *
 * The non-loopback cases connect to the machine's own LAN address, which is what makes
 * them real: the server sees `192.168.x.y` as the peer even though the test is local.
 */

import { networkInterfaces } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  WsServer,
  canReceiveEvents,
  isLoopbackAddress,
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

/** Authenticates one token, the way a paired phone's session would resolve. */
const sessionIdentity: SessionIdentityResolver = {
  localScopeKey: "local",
  resolveSession: async (token) =>
    token === "phone-token"
      ? { scopeKey: "phone-1", ownerId: "owner-1", isOwnerScope: false, caller: undefined }
      : null,
};

const PROBE_METHOD = "listFamilyProfiles";
const dispatcher: HostRpcDispatcher = async (method) => {
  if (method === PROBE_METHOD) return { profiles: [{ id: "owner" }] };
  if (method === "pairThinClient") return { paired: true };
  throw new Error(`unknown method: ${method}`);
};

async function boot(): Promise<{ port: number }> {
  const server = new WsServer(0, "/ws");
  servers.push(server);
  server.start(nodeService, {
    sessionIdentity,
    dispatch: dispatcher,
    preAuthMethods: ["pairThinClient"],
  });
  await server.waitUntilListening();
  return { port: server.boundPort };
}

/** One RPC over a fresh socket; resolves with the JSON-RPC reply (matched by id). */
async function ask(host: string, port: number, token: string | null, method: string) {
  const { WebSocket } = await import("ws");
  const suffix = token === null ? "" : `?token=${token}`;
  const socket = new WebSocket(`ws://${host}:${port}/ws${suffix}`);
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error(`${method} timed out`));
    }, 5_000);
    socket.on("message", (raw: Buffer) => {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (message["id"] !== 1) return; // ignore unsolicited pushes
      clearTimeout(timer);
      socket.close();
      resolve(message);
    });
    socket.on("open", () => socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {} })));
    socket.on("error", reject);
  });
}

describe("isLoopbackAddress", () => {
  it("recognises loopback in every form Node reports, and nothing else", () => {
    for (const local of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "127.0.0.5"]) {
      expect(isLoopbackAddress(local), local).toBe(true);
    }
    // Bind addresses are not peers: a real peer never has them, so treating one as
    // local would be a hole, not a convenience.
    for (const remote of ["192.168.1.20", "10.0.0.1", "0.0.0.0", "::", "2001:db8::1", "", undefined]) {
      expect(isLoopbackAddress(remote), String(remote)).toBe(false);
    }
  });
});

describe("the access gate", () => {
  it("allows the owner's own UI: loopback, no token", async () => {
    const { port } = await boot();
    const reply = await ask("127.0.0.1", port, null, PROBE_METHOD);
    expect(reply["error"]).toBeUndefined();
    expect(reply["result"]).toEqual({ profiles: [{ id: "owner" }] });
  });

  it("allows a paired phone: valid token, from anywhere", async () => {
    const { port } = await boot();
    const lan = lanAddress();
    const host = lan ?? "127.0.0.1";
    const reply = await ask(host, port, "phone-token", PROBE_METHOD);
    expect(reply["error"]).toBeUndefined();
    expect(reply["result"]).toEqual({ profiles: [{ id: "owner" }] });
  });

  it("allows pairing itself: a pre-auth method, no token, from the network", async () => {
    // Phones pair *before* they have a token, so this flow must survive the gate —
    // otherwise the fix would break the only way a new device can get in.
    const { port } = await boot();
    const host = lanAddress() ?? "127.0.0.1";
    const reply = await ask(host, port, null, "pairThinClient");
    expect(reply["error"]).toBeUndefined();
    expect(reply["result"]).toEqual({ paired: true });
  });

  it("refuses a device on the network with no token", async () => {
    const lan = lanAddress();
    if (!lan) {
      // Offline machine: the loopback path is covered above, and this case cannot be
      // constructed without a non-loopback address to connect to.
      expect(lan).toBeNull();
      return;
    }
    const { port } = await boot();
    const reply = await ask(lan, port, null, PROBE_METHOD);
    expect(reply["error"]).toMatchObject({ code: "UNAUTHORIZED" });
    expect(reply["result"]).toBeUndefined();
  });

  it("refuses a wrong token from the network (unchanged behaviour)", async () => {
    const { port } = await boot();
    const host = lanAddress() ?? "127.0.0.1";
    const reply = await ask(host, port, "not-a-token", PROBE_METHOD);
    expect(reply["error"]).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("lets the product refuse a live stream to a family session, and allows it to the owner's UI", async () => {
    // Socket methods (a terminal, an agent core) run *before* the dispatcher. Owner-only
    // gating belongs in the product's `handle` (see `createSocialSocketMethods`) — the host
    // used to refuse *every* method for non-owner sessions whenever socketMethods was set,
    // which locked paired phones out of ordinary product RPC. This test pins the new split:
    // the product refuses the stream; the host still reaches `handle` so that refusal can run.
    const handled: string[] = [];
    const socketMethods = {
      handle: async (ctx: {
        method: string;
        session?: { isOwnerScope?: boolean };
        fail: (message: string) => void;
      }) => {
        if (ctx.method !== "homeTerminalWsOpen") return false;
        handled.push(ctx.method);
        if (ctx.session && ctx.session.isOwnerScope !== true) {
          ctx.fail("Only the node owner can do that");
          return true;
        }
        return false;
      },
    };
    const server = new WsServer(0, "/ws");
    servers.push(server);
    server.start(nodeService, {
      sessionIdentity: {
        localScopeKey: "owner",
        // A family member: an authenticated session that is *not* the owner.
        resolveSession: async (token) =>
          token === "family-token"
            ? { scopeKey: "mom", ownerId: "owner-1", isOwnerScope: false, caller: undefined }
            : null,
      },
      dispatch: async (method) => ({ ok: method }),
      socketMethods: socketMethods as never,
    });
    await server.waitUntilListening();

    const family = await ask("127.0.0.1", server.boundPort, "family-token", "homeTerminalWsOpen");
    expect(family["error"]).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Only the node owner can do that",
    });
    expect(handled).toEqual(["homeTerminalWsOpen"]);

    // The owner's own UI (no token, loopback) still gets through to the dispatcher.
    const owner = await ask("127.0.0.1", server.boundPort, null, "homeTerminalWsOpen");
    expect(owner["error"]).toBeUndefined();
    expect(handled).toEqual(["homeTerminalWsOpen", "homeTerminalWsOpen"]);
  });

  it("still refuses a wrong token from loopback", async () => {
    // A token that is present but invalid is never silently downgraded to anonymous.
    const { port } = await boot();
    const reply = await ask("127.0.0.1", port, "not-a-token", PROBE_METHOD);
    expect(reply["error"]).toMatchObject({ code: "UNAUTHORIZED" });
  });
});

/* ────────────────────────────── the push channel ────────────────────────────── */

/**
 * A node surface whose events the test fires by hand.
 *
 * The server subscribes to the node for **every name in the merged disposition table**, so this is
 * also how a test sees what the host registered.
 */
function capturableNodeService(): {
  service: HostNodeService;
  emit: (event: string, data: unknown) => void;
  /** A function: the host registers dispositions during `serve()`, after this is built. */
  subscribed: () => string[];
} {
  const listeners = new Map<string, (data: unknown) => void>();
  return {
    service: {
      on: (event: string, listener: (data: unknown) => void) => {
        listeners.set(event, listener);
      },
      onCallEvent: () => () => undefined,
      getNodeStatus: () => "running",
      getConnectionStatus: () => ({ peerId: "peer-1", multiaddrs: ["/ip4/1.2.3.4/tcp/4001"] }),
      noteClientActivity: () => undefined,
    },
    emit: (event, data) => listeners.get(event)?.(data),
    subscribed: () => [...listeners.keys()],
  };
}

/** Connect, record every frame, and give the test a way to wait for quiet. */
async function watch(
  host: string,
  port: number,
  token: string | null,
): Promise<{ frames: string[]; send: (message: unknown) => void; settle: () => Promise<void>; close: () => void }> {
  const { WebSocket } = await import("ws");
  const suffix = token === null ? "" : `?token=${token}`;
  const socket = new WebSocket(`ws://${host}:${port}/ws${suffix}`);
  const frames: string[] = [];
  socket.on("message", (raw: Buffer) => frames.push(raw.toString()));
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
    setTimeout(() => reject(new Error("socket did not open")), 5_000);
  });
  return {
    frames,
    send: (message) => socket.send(JSON.stringify(message)),
    // **600 ms, not 250.** The connection handler also sends a deferred snapshot after 350 ms, and a
    // test that finished before it would assert "nothing was pushed" while the push was still in
    // flight — which is exactly how the first version of this test passed with one leak site left
    // unfixed. A consumer's smoke test, waiting longer, is what caught it.
    settle: async () => {
      await new Promise((done) => setTimeout(done, 600));
    },
    close: () => socket.close(),
  };
}

async function bootWithEvents(): Promise<{ port: number; node: ReturnType<typeof capturableNodeService> }> {
  const node = capturableNodeService();
  const server = new WsServer(0, "/ws");
  servers.push(server);
  server.start(node.service, { sessionIdentity, dispatch: dispatcher });
  await server.waitUntilListening();
  return { port: server.boundPort, node };
}

describe("who may receive events", () => {
  it("is the owner's machine or a session, and nothing else", () => {
    expect(canReceiveEvents({ isLoopbackPeer: true })).toBe(true);
    expect(canReceiveEvents({ isThinClientAuthenticated: true })).toBe(true);
    expect(canReceiveEvents({ isLoopbackPeer: true, isThinClientAuthenticated: true })).toBe(true);
    expect(canReceiveEvents({})).toBe(false);
    expect(canReceiveEvents({ isLoopbackPeer: false, isThinClientAuthenticated: false })).toBe(false);
    // Explicitly false is not "unknown": a socket whose loopback check returned false or undefined
    // must not be treated as local. `isLoopbackAddress` never returns undefined, and this is the
    // assertion that keeps a defaulted field from becoming a hole.
    expect(canReceiveEvents({ isLoopbackPeer: false })).toBe(false);
    expect(canReceiveEvents({ isThinClientAuthenticated: false })).toBe(false);
  });

  it("still delivers to the owner's own UI — loopback, no token", async () => {
    const { port, node } = await bootWithEvents();
    const client = await watch("127.0.0.1", port, null);
    node.emit("node:status", { up: true });
    await client.settle();
    expect(client.frames.join("\n")).toContain('"up":true');
    client.close();
  });

  it("still delivers to a paired phone — valid token, from the network", async () => {
    const { port, node } = await bootWithEvents();
    const client = await watch(lanAddress() ?? "127.0.0.1", port, "phone-token");
    node.emit("node:status", { up: true });
    await client.settle();
    expect(client.frames.join("\n")).toContain('"up":true');
    client.close();
  });

  it("delivers nothing at all to a device on the network with no token", async () => {
    // The bug this pins: the event path never reached the gate. A LAN client with no token received
    // the node's handshake, its status, and every broadcast the node emitted — while its first RPC
    // was correctly refused. Reproduced before the fix, and the reproduction is why the assertion is
    // "not one frame" rather than "not the payload".
    const lan = lanAddress();
    if (!lan) {
      expect(lan).toBeNull();
      return;
    }
    const { port, node } = await bootWithEvents();
    const client = await watch(lan, port, null);
    client.send({ jsonrpc: "2.0", id: 1, method: "on", params: { event: "node:status" } });
    node.emit("node:status", { up: true, ownerOnly: "secret" });
    await client.settle();
    expect(client.frames.filter((frame) => frame.includes("secret"))).toEqual([]);
    expect(client.frames.filter((frame) => frame.includes('"event"'))).toEqual([]);
    expect(JSON.parse(client.frames[0] ?? "{}")).toMatchObject({
      id: 1,
      error: { code: "UNAUTHORIZED" },
    });
    client.close();
  });

  it("refuses a subscription from the network, even with a valid token for a wrong scope", async () => {
    // `on` used to be handled before the gate, so subscribing needed no authentication whatsoever.
    const lan = lanAddress();
    if (!lan) {
      expect(lan).toBeNull();
      return;
    }
    const { port } = await bootWithEvents();
    const client = await watch(lan, port, null);
    client.send({ jsonrpc: "2.0", id: 7, method: "on", params: { event: "chat:message" } });
    await client.settle();
    expect(client.frames.map((frame) => JSON.parse(frame))).toContainEqual({
      id: 7,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
    client.close();
  });
});
