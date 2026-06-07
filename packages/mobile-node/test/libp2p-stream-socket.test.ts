import { describe, expect, it, vi } from "vitest";

import {
  Libp2pStreamSocket,
  type Libp2pStreamIoLike,
} from "../src/libp2p-stream-socket.js";
import { WS_READY_STATE_CLOSED, WS_READY_STATE_OPEN } from "../src/home-remote-client.js";

/**
 * In-memory fake of a libp2p byte-stream — what `byteStream()` from
 * `@libp2p/utils` would produce over a real libp2p stream. The shim only
 * cares about `read`/`write`/`close`, so we model exactly that surface.
 */
function createFakeStreamIo(): Libp2pStreamIoLike & {
  /** Bytes the shim has written (i.e. sent to the home node). */
  outgoing: Uint8Array[];
  /** Push a chunk that the shim should see on its next read. */
  push(bytes: Uint8Array): void;
  isClosed(): boolean;
} {
  const incoming: Uint8Array[] = [];
  const outgoing: Uint8Array[] = [];
  let closed = false;
  let waitResolve: (() => void) | null = null;
  const wakeup = () => {
    if (waitResolve) {
      const r = waitResolve;
      waitResolve = null;
      r();
    }
  };
  return {
    incoming,
    outgoing,
    isClosed: () => closed,
    push(bytes: Uint8Array): void {
      incoming.push(bytes);
      wakeup();
    },
    async read() {
      while (incoming.length === 0 && !closed) {
        await new Promise<void>((r) => {
          waitResolve = r;
        });
      }
      const next = incoming.shift();
      return next ?? null;
    },
    async write(data: Uint8Array): Promise<void> {
      if (closed) throw new Error("stream closed");
      outgoing.push(data);
    },
    async close(): Promise<void> {
      closed = true;
      wakeup();
    },
  };
}

describe("Libp2pStreamSocket", () => {
  const TOKEN = "test-session-token";

  it("completes the proxy-connect handshake and reaches OPEN", async () => {
    const stream = createFakeStreamIo();
    const openPromise = Libp2pStreamSocket.open(async () => stream, TOKEN, 2_000);
    // The shim awaits the handshake reply, so we have to push the accept
    // *during* the open() call.
    queueMicrotask(() =>
      stream.push(
        new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })),
      ),
    );
    const sock = await openPromise;

    expect(sock.readyState).toBe(WS_READY_STATE_OPEN);

    // The handshake should have written the token handshake first.
    const handshakeBytes = stream.outgoing.shift();
    expect(handshakeBytes).toBeDefined();
    const handshake = JSON.parse(new TextDecoder().decode(handshakeBytes!));
    expect(handshake).toEqual({ type: "proxy-connect", token: TOKEN });

    sock.close();
  });

  it("rejects the open() promise when the server replies proxy-reject", async () => {
    const stream = createFakeStreamIo();
    // Push the reject *during* the open handshake (the read() inside the
    // handshake will pick it up).
    const openPromise = Libp2pStreamSocket.open(async () => stream, TOKEN, 2_000);
    queueMicrotask(() =>
      stream.push(
        new TextEncoder().encode(
          JSON.stringify({ type: "proxy-reject", reason: "expired" }),
        ),
      ),
    );
    await expect(openPromise).rejects.toThrow(/handshakeRejected.*expired/);
  });

  it("rejects the open() promise when the factory itself throws", async () => {
    await expect(
      Libp2pStreamSocket.open(
        async () => {
          throw new Error("dial boom");
        },
        TOKEN,
        2_000,
      ),
    ).rejects.toThrow("dial boom");
  });

  it("rejects the open() promise when the handshake reply is malformed", async () => {
    const stream = createFakeStreamIo();
    const openPromise = Libp2pStreamSocket.open(async () => stream, TOKEN, 2_000);
    queueMicrotask(() =>
      stream.push(new TextEncoder().encode("not-json-at-all{{")),
    );
    await expect(openPromise).rejects.toThrow(/handshakeMalformed/);
  });

  it("rejects the open() promise when the handshake reply is an unknown type", async () => {
    const stream = createFakeStreamIo();
    const openPromise = Libp2pStreamSocket.open(async () => stream, TOKEN, 2_000);
    queueMicrotask(() =>
      stream.push(new TextEncoder().encode(JSON.stringify({ type: "weird" }))),
    );
    await expect(openPromise).rejects.toThrow(/handshakeUnknown/);
  });

  it("dispatches inbound bytes to onmessage as decoded text", async () => {
    const stream = createFakeStreamIo();
    const openPromise = Libp2pStreamSocket.open(async () => stream, TOKEN, 2_000);
    queueMicrotask(() =>
      stream.push(
        new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })),
      ),
    );
    const sock = await openPromise;

    const messages: string[] = [];
    sock.onmessage = (ev) => messages.push(ev.data);

    stream.push(new TextEncoder().encode(JSON.stringify({ event: "tick", data: 1 })));
    stream.push(new TextEncoder().encode(JSON.stringify({ event: "tick", data: 2 })));

    // Yield a few microtasks so the read loop drains.
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(messages).toEqual([
      JSON.stringify({ event: "tick", data: 1 }),
      JSON.stringify({ event: "tick", data: 2 }),
    ]);

    sock.close();
  });

  it("send() writes JSON-RPC frames to the stream", async () => {
    const stream = createFakeStreamIo();
    const openPromise = Libp2pStreamSocket.open(async () => stream, TOKEN, 2_000);
    queueMicrotask(() =>
      stream.push(
        new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })),
      ),
    );
    const sock = await openPromise;

    sock.send(JSON.stringify({ id: "r1", method: "ping" }));

    // Allow the write microtask to flush.
    for (let i = 0; i < 5; i++) await Promise.resolve();

    // The handshake was the first outgoing frame; skip it.
    stream.outgoing.shift();
    const sent = stream.outgoing.shift();
    expect(sent).toBeDefined();
    const frame = JSON.parse(new TextDecoder().decode(sent!));
    expect(frame).toEqual({ id: "r1", method: "ping" });

    sock.close();
  });

  it("send() throws if the socket is not open", async () => {
    const stream = createFakeStreamIo();
    const openPromise = Libp2pStreamSocket.open(async () => stream, TOKEN, 2_000);
    queueMicrotask(() =>
      stream.push(
        new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })),
      ),
    );
    const sock = await openPromise;
    sock.close();
    expect(() => sock.send("x")).toThrow(/notOpen/);
  });

  it("fires onclose when the stream closes from the other side", async () => {
    const stream = createFakeStreamIo();
    const openPromise = Libp2pStreamSocket.open(async () => stream, TOKEN, 2_000);
    queueMicrotask(() =>
      stream.push(
        new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })),
      ),
    );
    const sock = await openPromise;

    const closed = vi.fn();
    sock.onclose = closed;

    await stream.close();
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(closed).toHaveBeenCalled();
    expect(sock.readyState).toBe(WS_READY_STATE_CLOSED);
  });

  it("aborts the open() promise if the factory is still pending when the timeout fires", async () => {
    // Build a factory that never resolves — simulating a libp2p dial that
    // hangs. The shim's open() timeout should win the race, forceClose()
    // should fire, and once the factory *eventually* resolves the late
    // stream should be closed (not adopted into the socket).
    const lateStream = createFakeStreamIo();
    let resolveFactory: ((s: Libp2pStreamIoLike) => void) | null = null;
    const hangingFactory = new Promise<Libp2pStreamIoLike>((r) => {
      resolveFactory = r;
    });

    const openPromise = Libp2pStreamSocket.open(
      () => hangingFactory,
      TOKEN,
      // Tiny timeout so the test runs fast.
      20,
    );

    // Wait for the open to time out.
    await expect(openPromise).rejects.toThrow(/openTimeout/);

    // Now resolve the factory *after* the timeout fired. The shim should
    // close the late stream and discard it (no resurrection into OPEN).
    resolveFactory!(lateStream);
    // Yield a few microtasks so the late-stream close microtask has a
    // chance to run.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(lateStream.isClosed()).toBe(true);
  });

  it("fires onopen only after the awaiting caller has had a chance to install handlers", async () => {
    // Regression test for the race where `open()` resolves before the
    // caller can install `onopen` — if the shim fired onopen during the
    // same microtask drain, the awaiting caller's connect promise would
    // never resolve. The shim defers onopen to a macrotask so the
    // caller can do:
    //   const ws = await open();
    //   ws.onopen = handler;            // <-- installed after open resolves
    //   await new Promise(r => ws.onopen = r);
    const stream = createFakeStreamIo();
    const openPromise = Libp2pStreamSocket.open(async () => stream, TOKEN, 2_000);
    queueMicrotask(() =>
      stream.push(
        new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })),
      ),
    );
    const sock = await openPromise;

    // Mimic HomeRemoteClient: set onopen AFTER the open() promise
    // resolved, then wait for it to fire.
    const opened = new Promise<void>((resolve) => {
      sock.onopen = () => resolve();
    });
    // The deferred macrotask hasn't run yet, so the promise is pending.
    await opened;
    expect(sock.readyState).toBe(WS_READY_STATE_OPEN);

    sock.close();
  });
});
