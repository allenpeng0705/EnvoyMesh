/**
 * The mesh host transport.
 *
 * What these tests are for, in order of what would break a user:
 *
 *   1. **A paired phone can actually reach the host** — the handshake accepts the shape the phone
 *      sends and the shape the node's older handler sent, and a bad token is refused in one sentence
 *      that does not say *why* it was bad.
 *   2. **Framing survives a hostile stream.** The version this replaces assumed one write = one read.
 *      These tests feed a frame in two pieces and two frames in one piece, because that is what a real
 *      relay does and what the old framing would have silently corrupted.
 *   3. **Revocation closes live streams**, not just future ones.
 *   4. **Two concurrent connections keep their own state** — the factory form exists so companion /
 *      caller closures are not shared across phones.
 */

import { describe, expect, it } from "vitest";

import {
  createMeshHostTransport,
  createProxyCloseRegistry,
  splitFrames,
  type FramedDuplex,
  type MeshHostTransportOptions,
} from "../src/mesh-host-transport.js";

/** A duplex pair the test drives by hand, so chunking is ours to decide. */
function pair(): {
  server: FramedDuplex;
  client: {
    send(text: string): void;
    frames: string[];
    closed: boolean;
    write(text: string): void;
    read: () => Promise<Uint8Array | undefined>;
  };
} {
  const toServer: Uint8Array[] = [];
  const toClient: Uint8Array[] = [];
  const encoder = new TextEncoder();

  let notifyServer: (() => void) | undefined;
  let notifyClient: (() => void) | undefined;
  const wake = (which: "server" | "client"): void => {
    if (which === "server") notifyServer?.();
    else notifyClient?.();
  };

  async function take(
    queue: Uint8Array[],
    register: (fn: () => void) => void,
  ): Promise<Uint8Array | undefined> {
    for (;;) {
      const next = queue.shift();
      if (next) return next;
      const waited = await new Promise<boolean>((resolve) => {
        register(() => resolve(true));
        setTimeout(() => resolve(false), 50);
      });
      if (!waited) return undefined;
    }
  }

  const state = { closed: false };

  const server: FramedDuplex = {
    write: (frame) => {
      toClient.push(frame);
      wake("client");
    },
    read: () =>
      take(toServer, (fn) => {
        notifyServer = fn;
      }),
    close: () => {
      state.closed = true;
    },
  };

  return {
    server,
    client: {
      frames: [],
      get closed() {
        return state.closed;
      },
      /** Send raw bytes, so a test can split or coalesce frames. */
      write(text: string) {
        toServer.push(encoder.encode(text));
        wake("server");
      },
      send(text: string) {
        this.write(`${text}\n`);
      },
      read: () =>
        take(toClient, (fn) => {
          notifyClient = fn;
        }),
    },
  };
}

const sessions = {
  localScopeKey: "product:Test",
  resolveSession: async (token: string) =>
    token === "good-token" || token === "good-token-b"
      ? {
          scopeKey: "product:Test",
          ownerId: "owner-1",
          isOwnerScope: true,
          caller: { deviceId: token === "good-token" ? "d1" : "d2" },
        }
      : null,
};

function options(
  patch: Partial<MeshHostTransportOptions> = {},
): MeshHostTransportOptions {
  return {
    sessionIdentity: sessions as never,
    dispatch: async (method, params) => ({ method, params }),
    ...patch,
  };
}

/** Read frames off the client side until `count` have arrived. */
async function readFrames(
  client: ReturnType<typeof pair>["client"],
  count: number,
): Promise<string[]> {
  const decoder = new TextDecoder();
  let buffer = "";
  const out: string[] = [];
  while (out.length < count) {
    const chunk = await client.read();
    if (chunk === undefined) break;
    const split = splitFrames(buffer, decoder.decode(chunk));
    buffer = split.rest;
    out.push(...split.frames);
  }
  return out;
}

describe("a phone reaching the host over a mesh stream", () => {
  it("accepts the handshake the phone sends, then answers a request", async () => {
    const { server, client } = pair();
    const serve = createMeshHostTransport(() => options());
    void serve(server);

    // The phone's shape, which carries a `type` the node's own handler never checked.
    client.send(JSON.stringify({ type: "proxy-connect", token: "good-token" }));
    expect(await readFrames(client, 1)).toEqual([
      JSON.stringify({ type: "proxy-accept" }),
    ]);

    client.send(
      JSON.stringify({ id: 1, method: "coder.hello", params: { a: 1 } }),
    );
    const [reply] = await readFrames(client, 1);
    expect(JSON.parse(reply!)).toEqual({
      id: 1,
      result: { method: "coder.hello", params: { a: 1 } },
    });
  });

  it("also accepts the shape the node's older handler sent, so a deployed client keeps working", async () => {
    const { server, client } = pair();
    void createMeshHostTransport(() =>
      options({ dispatch: async () => ({ ok: true }) }),
    )(server);

    client.send(JSON.stringify({ token: "good-token" }));
    expect(await readFrames(client, 1)).toEqual([
      JSON.stringify({ type: "proxy-accept" }),
    ]);
  });

  it("refuses a bad token in one sentence that does not say which kind of bad", async () => {
    const { server, client } = pair();
    void createMeshHostTransport(() =>
      options({ dispatch: async () => ({ ok: true }) }),
    )(server);

    client.send(
      JSON.stringify({
        type: "proxy-connect",
        token: "expired-or-wrong-or-revoked",
      }),
    );
    const [reply] = await readFrames(client, 1);
    // Telling an unauthenticated caller *why* their token failed is how they enumerate.
    expect(JSON.parse(reply!)).toEqual({
      type: "proxy-reject",
      reason: "invalid or expired token",
    });
  });

  it("refuses a handshake type it does not know", async () => {
    const { server, client } = pair();
    void createMeshHostTransport(() =>
      options({ dispatch: async () => ({ ok: true }) }),
    )(server);

    client.send(
      JSON.stringify({ type: "proxy-somethingelse", token: "good-token" }),
    );
    const [reply] = await readFrames(client, 1);
    expect(JSON.parse(reply!).type).toBe("proxy-reject");
  });
});

describe("framing", () => {
  it("reassembles a frame that arrived in pieces", async () => {
    const { server, client } = pair();
    void createMeshHostTransport(() =>
      options({
        dispatch: async (method) => ({ echo: method }),
      }),
    )(server);

    client.send(JSON.stringify({ type: "proxy-connect", token: "good-token" }));
    await readFrames(client, 1);

    // Half a frame, a pause, then the rest — what a relay does under load.
    const request = `${JSON.stringify({ id: 7, method: "coder.listTasks", params: {} })}\n`;
    client.write(request.slice(0, 12));
    await new Promise((resolve) => setTimeout(resolve, 10));
    client.write(request.slice(12));

    const [reply] = await readFrames(client, 1);
    expect(JSON.parse(reply!)).toEqual({
      id: 7,
      result: { echo: "coder.listTasks" },
    });
  });

  it("keeps two frames that arrived in one piece apart", async () => {
    const { server, client } = pair();
    void createMeshHostTransport(() => options())(server);

    client.send(JSON.stringify({ type: "proxy-connect", token: "good-token" }));
    await readFrames(client, 1);

    // Two requests in one read: the old framing would have made this one unparseable message.
    client.write(
      `${JSON.stringify({ id: 1, method: "coder.hello", params: {} })}\n` +
        `${JSON.stringify({ id: 2, method: "coder.listTasks", params: {} })}\n`,
    );

    const replies = (await readFrames(client, 2)).map((frame) =>
      JSON.parse(frame),
    );
    expect(replies.map((reply) => reply.id)).toEqual([1, 2]);
  });

  it("answers a failing method with the message carrying the code, not a lost error", async () => {
    const { server, client } = pair();
    void createMeshHostTransport(() =>
      options({
        dispatch: async () => {
          throw new Error("envoydev.unauthorized: only at the machine itself");
        },
      }),
    )(server);

    client.send(JSON.stringify({ type: "proxy-connect", token: "good-token" }));
    await readFrames(client, 1);
    client.send(
      JSON.stringify({ id: 3, method: "coder.mintPairing", params: {} }),
    );

    const [reply] = await readFrames(client, 1);
    // The family's transports set `code` from their own catalogue and answer `ERROR` otherwise, so a
    // product's code rides in the message. Reproduced, not reinvented.
    expect(JSON.parse(reply!)).toEqual({
      id: 3,
      error: {
        code: "ERROR",
        message: "envoydev.unauthorized: only at the machine itself",
      },
    });
  });
});

describe("revocation", () => {
  it("closes the live streams a revoked device is holding", () => {
    const registry = createProxyCloseRegistry();
    const closed: string[] = [];
    registry.register("phone", () => closed.push("phone"));
    registry.register("phone", () => closed.push("phone-2"));
    registry.register("laptop", () => closed.push("laptop"));

    // Revocation that only took effect on the *next* request would leave the phone's stream open and
    // usable, which is revocation in name only.
    expect(registry.closeForDevice("phone")).toBe(2);
    expect(closed).toEqual(["phone", "phone-2"]);
    expect(registry.size()).toBe(1);
    expect(registry.closeForDevice("phone")).toBe(0);
  });
});

describe("per-connection factory", () => {
  it("keeps companion/caller state isolated across two concurrent connections", async () => {
    const a = pair();
    const b = pair();
    const companions: object[] = [];
    const serve = createMeshHostTransport((duplex) => {
      const companion = { id: companions.length };
      companions.push(companion);
      return {
        sessionIdentity: sessions as never,
        dispatch: async (_method, _params, session) => ({
          companionId: (companion as { id: number }).id,
          deviceId: (session?.caller as { deviceId?: string } | undefined)
            ?.deviceId,
        }),
        // Duplex is unique per connection — prove the factory saw both.
        onSession: () => {
          void duplex;
        },
      };
    });
    void serve(a.server);
    void serve(b.server);

    a.client.send(
      JSON.stringify({ type: "proxy-connect", token: "good-token" }),
    );
    b.client.send(
      JSON.stringify({ type: "proxy-connect", token: "good-token-b" }),
    );
    await readFrames(a.client, 1);
    await readFrames(b.client, 1);

    a.client.send(JSON.stringify({ id: 1, method: "ping", params: {} }));
    b.client.send(JSON.stringify({ id: 1, method: "ping", params: {} }));
    const [replyA] = await readFrames(a.client, 1);
    const [replyB] = await readFrames(b.client, 1);

    expect(companions).toHaveLength(2);
    expect(companions[0]).not.toBe(companions[1]);
    expect(JSON.parse(replyA!).result).toEqual({
      companionId: 0,
      deviceId: "d1",
    });
    expect(JSON.parse(replyB!).result).toEqual({
      companionId: 1,
      deviceId: "d2",
    });
  });
});
