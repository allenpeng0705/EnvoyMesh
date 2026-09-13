/**
 * The host's **wiring**, driven end to end through `handleConnection` /
 * `handleMessage` — the three enabling changes, seen from a client's side.
 *
 * The static tests (`ws-narrow-node-surface.test.ts`) prove the transport no
 * longer *depends* on the product. They cannot prove the ports are **called at
 * the right moment**, which is where a wiring mistake hides: a dispatcher that
 * never receives the session, a pre-auth list that is consulted after the gate
 * instead of inside it, or a socket-method port whose "handled" answer is
 * ignored would all pass every static check and break the app.
 *
 * So this drives the real methods with a fake socket. Ordering matters and is
 * asserted: **auth gate → socket methods → dispatch**, with `on` / `off`
 * absorbed by the host before any of it.
 */

import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostSession, SocketMethodPort } from "@envoymesh/host-connect";
import { WsServer } from "@envoymesh/host-connect";

interface Caller {
  tag: string;
}

/** A socket with just enough surface for the host's connection path. */
class FakeSocket extends EventEmitter {
  readyState = 1;
  readonly sent: string[] = [];
  send = vi.fn((raw: string) => {
    this.sent.push(raw);
  });
  ping = vi.fn();
  terminate = vi.fn();

  /** Auth-gate state, stored directly on the socket (see `hostState`). */
  isThinClientAuthenticated = false;
  hadThinClientToken = false;
  missedPongs = 0;

  /** Every JSON frame the host wrote, decoded. */
  frames(): Array<Record<string, unknown>> {
    return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
  }

  /**
   * Only the RPC replies. `handleConnection` pushes a `connected` event first
   * (plus the `node:status` replay on a timer), so "the first frame" is not
   * "the first response" — indexing `frames()` directly hid that and failed
   * seven assertions identically.
   */
  responses(): Array<Record<string, unknown>> {
    return this.frames().filter((frame) => frame["id"] !== undefined);
  }
}

interface Internals {
  handleConnection(ws: unknown, req?: { url: string; socket?: { remoteAddress?: string } }): Promise<void>;
  handleMessage(ws: unknown, message: { id: string; method: string; params?: Record<string, unknown> }): Promise<void>;
}

/**
 * A request from **this machine**, which is what every connection in this file
 * stands for: it drives `handleConnection` with a synthetic socket, and the
 * transport (correctly) treats an unknown peer address as *not* local. Without the
 * address these tests would be asserting the behaviour of a client on the network.
 */
function localReq(url: string) {
  return { url, socket: { remoteAddress: "127.0.0.1" } };
}

function session(scopeKey: string, opts: { owner?: boolean } = {}): HostSession<Caller> {
  return {
    scopeKey,
    ownerId: "acct-1",
    // Default false: most tests here are about what a *non-owner* session may do.
    // Socket methods are the exception — they hand over a live stream (a terminal, an
    // agent core) and the transport requires the owner's scope for them, so the tests
    // about *wiring* that port use an owner session, and the refusal of everyone else
    // lives in `packages/host-connect/test/access-gate.test.ts`.
    isOwnerScope: opts.owner === true,
    caller: { tag: scopeKey },
  };
}

const servers: WsServer<Caller>[] = [];

function makeServer(options: {
  resolveSession?: (token: string) => Promise<HostSession<Caller> | null>;
  dispatch?: ReturnType<typeof vi.fn>;
  socketMethods?: SocketMethodPort<Caller>;
  preAuthMethods?: readonly string[];
}) {
  const dispatch =
    options.dispatch ?? vi.fn(async () => ({ ok: "dispatched" }));
  const server = new WsServer<Caller>(0);
  servers.push(server);
  server.start(
    {
      on: () => undefined,
      onCallEvent: () => () => undefined,
      getNodeStatus: () => "running" as const,
      getConnectionStatus: () => ({ peerId: "peer-1", multiaddrs: [] }),
      noteClientActivity: () => undefined,
    },
    {
      sessionIdentity: {
        localScopeKey: "local",
        resolveSession: options.resolveSession ?? (async () => null),
      },
      dispatch: dispatch as never,
      socketMethods: options.socketMethods,
      preAuthMethods: options.preAuthMethods,
    },
  );
  return { server, dispatch, api: server as unknown as Internals };
}

afterEach(() => {
  while (servers.length) servers.pop()?.stop();
});

describe("the dispatcher receives the session the host authenticated", () => {
  it("passes the resolved session through, and only the host's own fields with it", async () => {
    const { dispatch, api } = makeServer({
      resolveSession: async (token) => (token === "good" ? session("mom") : null),
    });
    const ws = new FakeSocket();
    await api.handleConnection(ws, localReq("/ws?token=good"));

    await api.handleMessage(ws, { id: "1", method: "getProfile", params: {} });

    expect(dispatch).toHaveBeenCalledTimes(1);
    const [method, params, passed] = dispatch.mock.calls[0] as [string, unknown, HostSession<Caller>];
    expect(method).toBe("getProfile");
    expect(params).toEqual({});
    expect(passed.scopeKey).toBe("mom");
    // The host hands the caller over **opaquely** — it never inspects it.
    expect(passed.caller).toEqual({ tag: "mom" });
    expect(ws.responses()).toEqual([{ id: "1", result: { ok: "dispatched" } }]);
  });

  it("passes no session for an untokened client (the legacy Social path)", async () => {
    const { dispatch, api } = makeServer({});
    const ws = new FakeSocket();
    await api.handleConnection(ws, localReq("/ws"));

    await api.handleMessage(ws, { id: "2", method: "getNodeStatus" });

    expect(dispatch.mock.calls[0]?.[2]).toBeUndefined();
  });

  it("reports a dispatch failure as a typed error frame", async () => {
    const dispatch = vi.fn(async () => {
      throw new Error("Only the node owner can do that");
    });
    const { api } = makeServer({ dispatch });
    const ws = new FakeSocket();
    await api.handleConnection(ws, localReq("/ws"));

    await api.handleMessage(ws, { id: "3", method: "getProfile" });

    const frame = ws.responses()[0] as { error?: { code?: string; message?: string } };
    expect(frame.error?.message).toBe("Only the node owner can do that");
    expect(frame.error?.code).toBeTruthy();
  });
});

describe("the pre-auth list is data the product supplies", () => {
  it("refuses a bad-token client for a normal method, without dispatching", async () => {
    const { dispatch, api } = makeServer({});
    const ws = new FakeSocket();
    await api.handleConnection(ws, localReq("/ws?token=stale"));

    await api.handleMessage(ws, { id: "4", method: "getProfile" });

    expect(dispatch).not.toHaveBeenCalled();
    const frame = ws.responses()[0] as { error?: { code?: string } };
    expect(frame.error?.code).toBe("UNAUTHORIZED");
  });

  it("lets the same client reach exactly the methods the product listed", async () => {
    // This is the change: the two names used to be written in the transport.
    const handle = vi.fn(async (ctx: { method: string; ok: (r: unknown) => void }) => {
      ctx.ok({ ok: true, handled: ctx.method });
      return true;
    });
    const { dispatch, api } = makeServer({
      socketMethods: { handle },
      preAuthMethods: ["previewFamilyInvite", "pairThinClient"],
    });
    const ws = new FakeSocket();
    await api.handleConnection(ws, localReq("/ws?token=stale"));

    await api.handleMessage(ws, { id: "5", method: "previewFamilyInvite", params: {} });

    expect(handle).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
    expect(ws.responses()[0]).toEqual({ id: "5", result: { ok: true, handled: "previewFamilyInvite" } });
  });

  it("refuses a method the product did not list", async () => {
    const handle = vi.fn(async () => true);
    const { api } = makeServer({ socketMethods: { handle }, preAuthMethods: ["previewFamilyInvite"] });
    const ws = new FakeSocket();
    await api.handleConnection(ws, localReq("/ws?token=stale"));

    await api.handleMessage(ws, { id: "6", method: "pairThinClient" });

    expect(handle).not.toHaveBeenCalled();
    expect(ws.responses()[0]?.error).toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("socket methods run after the gate and before the dispatcher", () => {
  it("stops at the product's handler when it answers", async () => {
    const handle = vi.fn(async (ctx: { fail: (m: string) => void }) => {
      ctx.fail("proxy refused");
      return true;
    });
    const { dispatch, api } = makeServer({ socketMethods: { handle } });
    const ws = new FakeSocket();
    await api.handleConnection(ws, localReq("/ws"));

    await api.handleMessage(ws, { id: "7", method: "homeTerminalWsOpen", params: { pathWithQuery: "/x" } });

    expect(handle).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
    expect(ws.responses()[0]).toEqual({ id: "7", error: undefined, result: { ok: false, error: "proxy refused" } });
  });

  it("refuses a client from the network with no token, before any handler", async () => {
    // The gate, at the wiring level: a caller that is neither on this machine nor
    // authenticated may not reach the dispatcher or a socket method at all. Before
    // this, "no token" meant "trusted" and the host binds 0.0.0.0 for paired phones.
    const handle = vi.fn(async () => true);
    const { dispatch, api } = makeServer({ socketMethods: { handle } });
    const ws = new FakeSocket();
    await api.handleConnection(ws, { url: "/ws", socket: { remoteAddress: "192.168.1.20" } });

    await api.handleMessage(ws, { id: "9", method: "getProfile" });

    expect(dispatch).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
    expect(ws.responses()[0]).toMatchObject({ id: "9", error: { code: "UNAUTHORIZED" } });
  });

  it("still lets a network client reach a pre-auth method (pairing)", async () => {
    // Otherwise the fix would break the only way a new device gets in.
    const { dispatch, api } = makeServer({ preAuthMethods: ["pairThinClient"] });
    const ws = new FakeSocket();
    await api.handleConnection(ws, { url: "/ws", socket: { remoteAddress: "192.168.1.20" } });

    await api.handleMessage(ws, { id: "10", method: "pairThinClient", params: {} });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(ws.responses()[0]).toEqual({ id: "10", result: { ok: "dispatched" } });
  });

  it("falls through to the dispatcher when the port declines the method", async () => {
    const handle = vi.fn(async () => false);
    const { dispatch, api } = makeServer({ socketMethods: { handle } });
    const ws = new FakeSocket();
    await api.handleConnection(ws, localReq("/ws"));

    await api.handleMessage(ws, { id: "8", method: "getProfile" });

    expect(handle).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("hands the port the connection, the method, the session and a reply surface", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const handle = vi.fn(async (ctx: Record<string, unknown>) => {
      seen.push(ctx);
      (ctx.ok as (r: unknown) => void)({ ok: true });
      return true;
    });
    const { api } = makeServer({
      resolveSession: async () => session("owner", { owner: true }),
      socketMethods: { handle: handle as never },
    });
    const ws = new FakeSocket();
    await api.handleConnection(ws, localReq("/ws?token=good"));

    await api.handleMessage(ws, { id: "9", method: "homeClawCoreWsSend", params: { text: "hi" } });

    expect(seen[0]?.connection).toBe(ws);
    expect(seen[0]?.method).toBe("homeClawCoreWsSend");
    expect(seen[0]?.params).toEqual({ text: "hi" });
    expect((seen[0]?.session as HostSession<Caller>).scopeKey).toBe("owner");
    expect(typeof seen[0]?.send).toBe("function");
  });

  it("releases the product's proxy when the connection closes", async () => {
    // The leak this guards: the host used to call both `…ForCompanion(ws)`
    // cleanups itself, and moving them behind a port that is never notified
    // would leak one proxy per disconnect.
    const closed = vi.fn();
    const { api } = makeServer({ socketMethods: { handle: async () => false, closed } });
    const ws = new FakeSocket();
    await api.handleConnection(ws, localReq("/ws"));

    ws.emit("close");

    expect(closed).toHaveBeenCalledTimes(1);
    expect(closed.mock.calls[0]?.[0]).toBe(ws);
  });
});

describe("the host's own methods never reach the product", () => {
  it("handles on/off itself", async () => {
    const { dispatch, api } = makeServer({});
    const ws = new FakeSocket();
    await api.handleConnection(ws, localReq("/ws"));

    await api.handleMessage(ws, { id: "10", method: "on", params: { event: "terminal:watch-ready" } });
    await api.handleMessage(ws, { id: "11", method: "off", params: { event: "terminal:watch-ready" } });

    expect(dispatch).not.toHaveBeenCalled();
    expect(ws.responses()).toEqual([
      { id: "10", result: { success: true } },
      { id: "11", result: { success: true } },
    ]);
  });
});
