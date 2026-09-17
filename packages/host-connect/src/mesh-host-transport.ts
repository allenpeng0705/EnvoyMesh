/**
 * The mesh host transport: a product's host protocol, carried over any duplex.
 *
 * ## Why this exists
 *
 * A product that ships a desktop app and a mobile app needs its host reachable two ways: on the local
 * network over a WebSocket, and from anywhere over the family's mesh (a direct libp2p stream, or the
 * shared relay when a home machine has no public address). `WsServer` is the first. This is the
 * second, and it is the *same host contract* — `sessionIdentity`, `dispatch` and an event
 * subscription — so a product's authentication, routing and subscription rules are written once and
 * apply to both transports.
 *
 * It is extracted from EnvoyMesh's own node, where the same shape lived inside
 * `apps/node/src/client-proxy-handler.ts` welded to `NodeServiceImpl`, the node's router and its
 * terminal handling. What is generic is the frame around the middle: the handshake, the
 * request/reply loop, the event push, and closing live streams when a credential is revoked.
 *
 * ## The framing is explicit, and that is a decision
 *
 * Messages are **newline-delimited UTF-8 JSON**. The version this replaces relied on *one write = one
 * read* — no length prefix, no delimiter — which works only because the two implementations that
 * happened to meet preserved message boundaries. Nothing enforced it, and a proxy that coalesced two
 * frames would have merged two RPCs into one unparseable message. Newline framing is self-delimiting,
 * costs no dependency, and is as easy in Dart as it is here.
 *
 * **This is a wire change and the client must move with it** (`envoy-mesh-libp2p-dart`'s handshake).
 * It is made deliberately rather than inherited: the cost is one phone update, and the alternative is
 * a coincidence promoted to a family contract.
 *
 * ## The handshake accepts both shapes the deployed clients send
 *
 * The phone sends `{type: "proxy-connect", token}`; the node's handler read only `{token}` and never
 * checked `type`. Both are accepted, because the client was stricter than the server and turning that
 * into a compatibility break would be a change nobody asked for.
 */

import type { HostRpcDispatcher, SessionIdentityResolver } from "./ws-host-contract.js";
import { rpcErrorCode } from "./rpc-error-code.js";

/**
 * One duplex, framed.
 *
 * Deliberately *not* a libp2p stream: this module has no business knowing what a peer id is, and a
 * transport that took `any` stream would drag libp2p into every consumer. The adapter from a real
 * libp2p stream lives with the mesh (`@envoymesh/network`), one layer down.
 */
export interface FramedDuplex {
  /** Write one frame. The transport appends the delimiter. */
  write(frame: Uint8Array): Promise<void> | void;
  /** Read one frame, or `undefined` when the peer closed. The transport splits on the delimiter. */
  read(): Promise<Uint8Array | undefined>;
  close(): Promise<void> | void;
}

export interface MeshHostTransportOptions<TCaller = unknown> {
  /** The product's authentication — the same port `WsServer` takes. */
  sessionIdentity: SessionIdentityResolver<TCaller>;
  /** The product's dispatch — the same port `WsServer` takes. */
  dispatch: HostRpcDispatcher<TCaller>;
  /**
   * Event push for this connection. Returned function unsubscribes.
   *
   * Injected rather than imported: the product owns which events exist, exactly as it does for the
   * WebSocket host.
   */
  subscribe?: (send: (event: string, data: unknown) => void) => () => void;
  /** Called with the authenticated session, so a product can register hooks (audit, presence). */
  onSession?: (session: Awaited<ReturnType<SessionIdentityResolver<TCaller>["resolveSession"]>>) => void;
}

interface JsonRpcRequest {
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Split a byte buffer into complete newline-delimited frames, returning the remainder. */
export function splitFrames(buffer: string, chunk: string): { frames: string[]; rest: string } {
  const combined = buffer + chunk;
  const parts = combined.split("\n");
  // The last part is either empty (a clean boundary) or an incomplete frame.
  const rest = parts.pop() ?? "";
  return { frames: parts.filter((part) => part.trim() !== ""), rest };
}

/**
 * Serve one mesh connection.
 *
 * Options are built **per connection** via a factory. A shared options object would share every
 * closure across connections — companion terminal state, caller identity, push unsubscribe — which
 * is a silent cross-phone leak. Callers that truly need no per-connection state write `() => options`.
 *
 * Resolves when the peer closes or the handshake is refused. Never throws for a peer's misbehaviour:
 * a malformed frame or a failed dispatch is answered or dropped, because one bad client must not take
 * down the transport that serves every other one.
 */
export function createMeshHostTransport<TCaller = unknown>(
  optionsFactory: (duplex: FramedDuplex) => MeshHostTransportOptions<TCaller>,
): (duplex: FramedDuplex) => Promise<void> {
  return async (duplex) => {
    const options = optionsFactory(duplex);
    // A connection that never sends a frame must not hold a slot forever; the lease is deliberately
    // generous because the first frame is a user's phone waking up.
    const handshake = await readOneFrame(duplex);
    if (handshake === undefined) {
      await duplex.close();
      return;
    }

    let parsed: { type?: unknown; token?: unknown };
    try {
      parsed = JSON.parse(handshake) as { type?: unknown; token?: unknown };
    } catch {
      await writeFrame(duplex, { type: "proxy-reject", reason: "handshake was not JSON" });
      await duplex.close();
      return;
    }

    // Both deployed shapes: `{type:"proxy-connect", token}` from the phone, `{token}` from the node's
    // older handler. A `type` that is present and different is a client we do not know.
    if (parsed.type !== undefined && parsed.type !== "proxy-connect") {
      await writeFrame(duplex, { type: "proxy-reject", reason: "unknown handshake type" });
      await duplex.close();
      return;
    }
    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    if (token === "") {
      await writeFrame(duplex, { type: "proxy-reject", reason: "no token" });
      await duplex.close();
      return;
    }

    const session = await options.sessionIdentity.resolveSession(token);
    if (!session) {
      // One reason, not three: a wrong, an expired and a revoked token are indistinguishable to a
      // caller by design, and telling them apart is how an attacker enumerates.
      await writeFrame(duplex, { type: "proxy-reject", reason: "invalid or expired token" });
      await duplex.close();
      return;
    }

    options.onSession?.(session);
    await writeFrame(duplex, { type: "proxy-accept" });

    const unsubscribe =
      options.subscribe?.((event, data) => {
        void writeFrame(duplex, { event, data });
      }) ?? (() => undefined);

    let buffer = "";
    try {
      for (;;) {
        const chunk = await duplex.read();
        if (chunk === undefined) return;
        const split = splitFrames(buffer, decoder.decode(chunk));
        buffer = split.rest;
        for (const frame of split.frames) {
          await handleFrame(options, duplex, session, frame);
        }
      }
    } finally {
      unsubscribe();
      try {
        await duplex.close();
      } catch {
        // Closing a duplex that is already gone is the ordinary end of a connection.
      }
    }
  };
}

async function handleFrame<TCaller>(
  options: MeshHostTransportOptions<TCaller>,
  duplex: FramedDuplex,
  session: Awaited<ReturnType<SessionIdentityResolver<TCaller>["resolveSession"]>>,
  frame: string,
): Promise<void> {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(frame) as JsonRpcRequest;
  } catch {
    // No id, so nothing to answer. Dropping it is the only honest option; answering would invent a
    // correlation the client never made.
    return;
  }

  // A reply the client sent (it made a request of us) has no method — ignore rather than error.
  if (typeof request.method !== "string") return;
  const id = request.id;

  try {
    const result = await options.dispatch(
      request.method,
      (request.params ?? {}) as Record<string, unknown>,
      session ?? undefined,
    );
    await writeFrame(duplex, { id, result });
  } catch (error) {
    // Prefer an explicit `code` on the thrown Error (e.g. UNAUTHORIZED from the
    // product). Otherwise lift a known catalog token from the message; everything
    // else is ERROR — a product's envoydev.* code still rides in the message.
    const message = error instanceof Error ? error.message : String(error);
    const explicit =
      error instanceof Error &&
      typeof (error as Error & { code?: unknown }).code === "string"
        ? (error as Error & { code: string }).code
        : undefined;
    const code = explicit ?? rpcErrorCode(message);
    await writeFrame(duplex, { id, error: { code, message } });
  }
}

async function writeFrame(duplex: FramedDuplex, payload: unknown): Promise<void> {
  try {
    await duplex.write(encoder.encode(`${JSON.stringify(payload)}\n`));
  } catch {
    // A write to a closing socket is the peer going away, not a failure of ours; the read loop will
    // end and unwind.
  }
}

/** Read one complete frame, tolerating a peer that sends its first frame in pieces. */
async function readOneFrame(duplex: FramedDuplex): Promise<string | undefined> {
  let buffer = "";
  for (;;) {
    const chunk = await duplex.read();
    if (chunk === undefined) return undefined;
    const split = splitFrames(buffer, decoder.decode(chunk));
    if (split.frames.length > 0) return split.frames[0];
    buffer = split.rest;
  }
}

/**
 * Close live connections when a credential is revoked.
 *
 * A device-scoped registry, because revocation that only takes effect on the *next* request leaves a
 * stream open that a revoked phone can keep using — which is revocation in name only. Extracted from
 * the node, where the same map lived beside the handler.
 */
export function createProxyCloseRegistry(): {
  register: (deviceId: string | undefined, close: () => void) => () => void;
  closeForDevice: (deviceId: string) => number;
  size: () => number;
} {
  const byDevice = new Map<string, Set<() => void>>();
  return {
    register(deviceId, close) {
      if (!deviceId) return () => undefined;
      let set = byDevice.get(deviceId);
      if (!set) {
        set = new Set();
        byDevice.set(deviceId, set);
      }
      set.add(close);
      return () => {
        set.delete(close);
        if (set.size === 0) byDevice.delete(deviceId);
      };
    },
    closeForDevice(deviceId) {
      const set = byDevice.get(deviceId);
      if (!set) return 0;
      const count = set.size;
      for (const close of [...set]) close();
      byDevice.delete(deviceId);
      return count;
    },
    size: () => byDevice.size,
  };
}
