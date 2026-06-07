import { byteStream } from "@libp2p/utils";
import { CLIENT_PROXY_PROTOCOL } from "#network/protocols";
import {
  WS_READY_STATE_CLOSED,
  WS_READY_STATE_CLOSING,
  WS_READY_STATE_CONNECTING,
  WS_READY_STATE_OPEN,
  type WebSocketLike,
} from "./home-remote-client.js";

/**
 * A minimal, transport-agnostic byte-stream interface.
 *
 * The production implementation wraps a real libp2p stream with `byteStream()`
 * from `@libp2p/utils`; tests can pass a tiny in-memory mock. Both satisfy
 * this shape, so {@link Libp2pStreamSocket} never needs to know whether it's
 * talking to the real libp2p transport or a test double.
 */
export interface Libp2pStreamIoLike {
  /** Returns the next chunk, or `null` if the stream has closed. */
  read: (opts?: unknown) => Promise<{ subarray: (begin?: number, end?: number) => Uint8Array } | null>;
  write: (data: Uint8Array) => Promise<void>;
  close?: () => Promise<void>;
}

/**
 * Wrap a raw libp2p stream in a `Libp2pStreamIoLike` using `byteStream()`.
 * The home node's `createClientProxyHandler` and many other libp2p protocol
 * handlers already do exactly this — we use the same plumbing on the client
 * side so the wire format is symmetric.
 */
export function libp2pStreamToIo(stream: unknown): Libp2pStreamIoLike {
  return byteStream(stream as any) as unknown as Libp2pStreamIoLike;
}

/**
 * WebSocket-shaped wrapper around a libp2p stream to the home node's
 * {@link CLIENT_PROXY_PROTOCOL} handler.
 *
 * The home node's `client-proxy-handler.ts` already speaks the same
 * JSON-RPC + push-event wire protocol as the WebSocket relay tunnel, so we
 * can speak `HomeRemoteClient`'s wire format over a libp2p stream with only
 * a small token-handshake shim on top.
 *
 * Handshake (matches the home's `createClientProxyHandler`):
 *
 *   client → server: `{ type: "proxy-connect", token }`
 *   server → client: `{ type: "proxy-accept" }`     → readyState = OPEN
 *                  | `{ type: "proxy-reject", reason }` → close with error
 *
 * After the handshake, every `send()` writes JSON-RPC text; every inbound
 * chunk is decoded as UTF-8 and emitted on `onmessage` exactly as a browser
 * `WebSocket.message` event would.
 *
 * The shim is `WebSocketLike`-compatible, so it drops into
 * {@link HomeRemoteClient} via the `createTransport` factory.
 */
export class Libp2pStreamSocket implements WebSocketLike {
  public readyState: number = WS_READY_STATE_CONNECTING;
  public onopen: ((ev?: unknown) => void) | null = null;
  public onmessage: ((ev: { data: string }) => void) | null = null;
  public onclose: ((ev?: unknown) => void) | null = null;
  public onerror: ((ev?: unknown) => void) | null = null;

  private streamIo: Libp2pStreamIoLike | null = null;
  private decoder = new TextDecoder();
  private readLoopAbort: AbortController | null = null;
  /**
   * The in-flight read loop. Captured so a `dispose()` (added later) can
   * await its completion. Currently fire-and-forget — the loop self-exits
   * when the abort signal fires or the stream returns `null`.
   */
  private readLoopPromise: Promise<void> | null = null;
  /**
   * Set to true when the socket was torn down (by `close()`, `forceClose()`,
   * or a timeout) before the open() promise resolved. Once set, the
   * handshake coroutine will abort at the next checkpoint instead of
   * resurrecting the socket into the OPEN state. Without this guard, a
   * late-completing libp2p dial that lost the timeout race would otherwise
   * set `readyState = OPEN` and start the read loop after the caller has
   * already moved on.
   */
  private _tornDown = false;

  private constructor(
    private readonly streamIoFactory: () => Promise<Libp2pStreamIoLike>,
    private readonly sessionToken: string,
  ) {}

  /**
   * Open a libp2p stream to the home node and complete the token handshake.
   * Resolves when the stream is ready (i.e. `readyState === OPEN`).
   * Rejects on dial failure, handshake rejection, or timeout.
   *
   * The caller supplies `streamIoFactory` so this constructor stays free of
   * any direct dependency on a running libp2p mesh. Production wires it up
   * with `() => libp2pStreamToIo(await mesh.dialProtocol(...))`; tests pass
   * an in-memory mock.
   */
  static async open(
    streamIoFactory: () => Promise<Libp2pStreamIoLike>,
    sessionToken: string,
    openTimeoutMs: number,
  ): Promise<Libp2pStreamSocket> {
    if (!sessionToken) throw new Error("libp2pStreamSocket.missingSessionToken");

    const sock = new Libp2pStreamSocket(streamIoFactory, sessionToken);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        sock.forceClose();
        reject(new Error("libp2pStreamSocket.openTimeout"));
      }, openTimeoutMs);
    });

    try {
      await Promise.race([sock.dialAndHandshake(), timeoutPromise]);
      if (timer) clearTimeout(timer);
      return sock;
    } catch (err) {
      if (timer) clearTimeout(timer);
      sock.forceClose();
      throw err;
    }
  }

  private async dialAndHandshake(): Promise<void> {
    const streamIo = await this.streamIoFactory();
    // The factory may have raced with a timeout/close. If we lost the
    // race, drop the freshly-opened stream instead of resurrecting the
    // socket. This is the only point where we can catch a tear-down
    // that happened during the await above.
    if (this._tornDown) {
      await streamIo.close?.().catch(() => {
        // Best-effort; the stream may already be closed.
      });
      throw new Error("libp2pStreamSocket.openAborted");
    }
    this.streamIo = streamIo;

    // Send the token handshake.
    const handshake = JSON.stringify({
      type: "proxy-connect",
      token: this.sessionToken,
    });
    await this.streamIo.write(new TextEncoder().encode(handshake));
    if (this._tornDown) {
      throw new Error("libp2pStreamSocket.openAborted");
    }

    // Read the handshake response.
    const replyBytes = await this.streamIo.read();
    if (!replyBytes) {
      throw new Error("libp2pStreamSocket.handshakeClosed");
    }
    if (this._tornDown) {
      throw new Error("libp2pStreamSocket.openAborted");
    }
    let reply: { type?: string; reason?: string };
    try {
      reply = JSON.parse(this.decoder.decode(replyBytes.subarray()));
    } catch {
      throw new Error("libp2pStreamSocket.handshakeMalformed");
    }
    if (reply.type === "proxy-accept") {
      // Final tear-down check before transitioning to OPEN — a tear-down
      // could have happened during the read above.
      if (this._tornDown) {
        throw new Error("libp2pStreamSocket.openAborted");
      }
      this.readyState = WS_READY_STATE_OPEN;
      this.startReadLoop();
      // Defer the onopen fire to a macrotask so the awaiting caller
      // (typically HomeRemoteClient.openSocket) has a chance to install
      // its onopen handler after `open()` resolves. This mirrors the
      // standard browser WebSocket semantics, where `new WebSocket(url)`
      // returns synchronously and the open event is delivered later in
      // the event loop — so the caller can always do:
      //   const ws = await open();
      //   ws.onopen = () => ...;     // <-- safe
      //   await new Promise(r => ws.onopen = r);  // <-- resolves
      // Without this defer, the onopen event would fire while `onopen` is
      // still null, and the caller's connect promise would never resolve.
      // Microtasks are not enough: the caller's `await open()` resumes
      // in the same microtask drain, *after* the queueMicrotask we
      // would schedule here, so onopen would still fire too early.
      setTimeout(() => {
        if (this._tornDown) return;
        this.onopen?.(undefined);
      }, 0);
      return;
    }
    if (reply.type === "proxy-reject") {
      throw new Error(
        `libp2pStreamSocket.handshakeRejected: ${reply.reason ?? "unknown"}`,
      );
    }
    throw new Error(
      `libp2pStreamSocket.handshakeUnknown: ${JSON.stringify(reply)}`,
    );
  }

  /**
   * Continuously read from the libp2p stream and dispatch decoded text
   * frames to `onmessage`, the same way a browser WebSocket would.
   */
  private startReadLoop(): void {
    if (!this.streamIo) return;
    const streamIo = this.streamIo;
    const abort = new AbortController();
    this.readLoopAbort = abort;

    this.readLoopPromise = (async () => {
      try {
        while (!abort.signal.aborted) {
          const bytes = await streamIo.read();
          if (!bytes || abort.signal.aborted) break;
          const text = this.decoder.decode(bytes.subarray());
          try {
            this.onmessage?.({ data: text });
          } catch {
            // Listener threw; ignore (matches the WebSocket event semantics).
          }
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          this.onerror?.(err);
        }
      } finally {
        // The other end hung up.
        this.markClosed();
      }
    })();
  }

  send(data: string): void {
    if (this.readyState !== WS_READY_STATE_OPEN || !this.streamIo) {
      throw new Error("libp2pStreamSocket.notOpen");
    }
    // Fire-and-forget: libp2p streams are async; if the write rejects, the
    // read loop will observe the close and tear down the socket.
    void this.streamIo.write(new TextEncoder().encode(data)).catch((err: unknown) => {
      this.onerror?.(err);
      this.markClosed();
    });
  }

  close(): void {
    if (this.readyState === WS_READY_STATE_CLOSED) return;
    this._tornDown = true;
    this.readyState = WS_READY_STATE_CLOSING;
    this.readLoopAbort?.abort();
    void this.streamIo?.close?.().catch(() => {
      // Best-effort — the stream may already be closed.
    });
    this.markClosed();
  }

  private forceClose(): void {
    this._tornDown = true;
    this.readLoopAbort?.abort();
    try {
      void this.streamIo?.close?.();
    } catch {
      //
    }
    this.markClosed();
  }

  private markClosed(): void {
    if (this.readyState === WS_READY_STATE_CLOSED) return;
    this.readyState = WS_READY_STATE_CLOSED;
    this.onclose?.(undefined);
  }
}
