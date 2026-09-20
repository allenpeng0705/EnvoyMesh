/**
 * The relay's client-proxy handshake: the framing, and the bound on a silent home.
 *
 * Both are regression tests for a *hang*, which is the failure these bugs produce:
 *
 *   * The relay wrote the `proxy-connect` handshake as a bare `JSON.stringify`. The home's mesh host
 *     transport reads **newline-delimited** frames (`splitFrames`), so it buffered the bare JSON as
 *     an incomplete frame and waited forever — no `proxy-accept`, no `proxy-reject`, and a phone
 *     that sits on "Connecting". The round-trip test below drives the real
 *     `createMeshHostTransport` reader, so it fails if the delimiter ever drifts again.
 *   * A home that accepts the libp2p stream and then says nothing used to hold the proxy connection
 *     (and one of the relay's capped connection slots) open indefinitely. `readProxyResponse` is the
 *     bound; the silent-duplex test pins it.
 */

import { describe, expect, it } from "vitest";
import { createMeshHostTransport, splitFrames } from "@envoymesh/host-connect";
import {
  readProxyResponse,
  writeProxyConnect,
  type ProxyHandshakeIo,
} from "../src/client-proxy-handshake.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Two ends of one in-memory duplex, each end's writes arriving at the other's `read`. */
function channelPair(): { client: ProxyHandshakeIo & { close(): void }; home: ProxyHandshakeIo & { close(): void } } {
  const toHome: Uint8Array[] = [];
  const toClient: Uint8Array[] = [];
  let clientClosed = false;
  let homeClosed = false;
  const homeWaiters: Array<() => void> = [];
  const clientWaiters: Array<() => void> = [];
  const wake = () => {
    for (const w of [...homeWaiters.splice(0), ...clientWaiters.splice(0)]) w();
  };
  const readFrom =
    (queue: Uint8Array[], waiters: Array<() => void>, closed: () => boolean) =>
    async (): Promise<Uint8Array | undefined> => {
      while (queue.length === 0 && !closed()) await new Promise<void>((resolve) => waiters.push(resolve));
      return queue.shift();
    };
  return {
    client: {
      write: async (bytes) => {
        toHome.push(bytes);
        wake();
      },
      read: readFrom(toClient, clientWaiters, () => homeClosed),
      close: () => {
        clientClosed = true;
        wake();
      },
    },
    home: {
      write: async (bytes) => {
        toClient.push(bytes);
        wake();
      },
      read: readFrom(toHome, homeWaiters, () => clientClosed),
      close: () => {
        homeClosed = true;
        wake();
      },
    },
  };
}

function serveHome(home: ProxyHandshakeIo): void {
  const serve = createMeshHostTransport<unknown>(() => ({
    sessionIdentity: {
      resolveSession: async (token: string) => (token === "tok" ? { deviceId: "d" } : undefined),
    },
    dispatch: async () => ({}),
  }));
  void serve(home);
}

describe("client-proxy handshake framing", () => {
  it("a bare JSON handshake is not a frame — the defect this fixes", () => {
    const bare = JSON.stringify({ type: "proxy-connect", token: "tok" });
    const split = splitFrames("", bare);
    // The reader needs one frame and gets none; the payload stays in the buffer forever.
    expect(split.frames).toHaveLength(0);
    expect(split.rest).toBe(bare);
  });

  it("writeProxyConnect produces a frame the home transport accepts", async () => {
    const pair = channelPair();
    serveHome(pair.home);

    await writeProxyConnect(pair.client, "tok");

    const response = await pair.client.read();
    expect(response).toBeDefined();
    expect(JSON.parse(dec.decode(response))).toEqual({ type: "proxy-accept" });
  });

  it("the framed bytes end with the delimiter the reader splits on", async () => {
    const writes: Uint8Array[] = [];
    const sink: ProxyHandshakeIo = {
      write: (bytes) => {
        writes.push(bytes);
      },
      read: async () => undefined,
    };
    await writeProxyConnect(sink, "tok");
    const text = dec.decode(writes[0]);
    expect(text.endsWith("\n")).toBe(true);
    expect(splitFrames("", text).frames).toHaveLength(1);
  });
});

describe("client-proxy handshake bound", () => {
  it("a home that takes the stream and says nothing fails the wait instead of holding it", async () => {
    const pair = channelPair();
    // Deliberately no transport on the home end: an open, silent stream.
    const started = Date.now();
    await writeProxyConnect(pair.client, "tok");

    const result = await readProxyResponse(pair.client, 50);

    expect(result).toEqual({ kind: "timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("a home that hangs up is reported as closed, not as a timeout", async () => {
    const pair = channelPair();
    const reading = readProxyResponse(pair.client, 2000);
    // The home takes the stream and closes it without ever answering the handshake.
    pair.home.close();

    expect(await reading).toEqual({ kind: "closed" });
  });
});
