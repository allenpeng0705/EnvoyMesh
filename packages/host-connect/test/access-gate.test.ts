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

  it("still refuses a wrong token from loopback", async () => {
    // A token that is present but invalid is never silently downgraded to anonymous.
    const { port } = await boot();
    const reply = await ask("127.0.0.1", port, "not-a-token", PROBE_METHOD);
    expect(reply["error"]).toMatchObject({ code: "UNAUTHORIZED" });
  });
});
