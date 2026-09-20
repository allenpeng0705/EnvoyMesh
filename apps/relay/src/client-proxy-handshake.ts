/**
 * The relay's half of the client-proxy handshake: framing, and the bound on the home's answer.
 *
 * ## Why this is its own module
 *
 * Both halves here exist because of bugs that read as a *hang*, not an error:
 *
 * 1. **Framing.** The home serves the mesh host contract, whose wire is newline-delimited JSON
 *    (`@envoymesh/host-connect`'s `splitFrames`). This handshake used to write a bare
 *    `JSON.stringify`, so the home buffered it as an incomplete frame and waited forever: no
 *    `proxy-accept`, no error, and a phone stuck on "Connecting". The frame is now built by
 *    `encodeJsonFrame`, the same helper the host writes with, so the delimiter has one definition.
 * 2. **The bound.** A home that accepts the libp2p stream and then never answers must not hold this
 *    proxy connection (and one of the relay's capped connection slots) open indefinitely. The
 *    mobile's own per-candidate budget ends its wait, but the relay must not depend on the client to
 *    clean up after it.
 *
 * The module is separate from `index.ts` so both can be tested without starting a relay or a
 * libp2p node — the failure they prevent is a byte string and a timer.
 */

import { encodeJsonFrame } from "@envoymesh/protocol";

/**
 * The bytes one frame arrived as.
 *
 * `@libp2p/utils`'s `byteStream().read()` answers with a `Uint8ArrayList`, while an in-memory test
 * duplex answers with a `Uint8Array`; both have `length` and `subarray()`, so the handshake takes the
 * shape it actually uses rather than importing a libp2p-internal type into the relay's own module.
 */
export interface ProxyFrameBytes {
  readonly length: number;
  subarray(): Uint8Array;
}

/** The duplex surface the handshake needs: the libp2p stream, narrowed to two methods. */
export interface ProxyHandshakeIo {
  write(bytes: Uint8Array): Promise<void> | void;
  read(): Promise<ProxyFrameBytes | null | undefined>;
}

/**
 * How long the relay waits for the home's `proxy-accept` after `proxy-connect` has been written.
 *
 * Generous on purpose: the home may still be doing real work (a slow device, a cold start), and this
 * bound is not the phone's budget — it is only here so a silent home leaks nothing. It deliberately
 * sits above the thin client's 8 s per-candidate default, so an ordinary slow home is failed by the
 * phone's own budget with the phone's own message, and this one only catches a home that never
 * answers at all.
 */
export const PROXY_HANDSHAKE_TIMEOUT_MS = 15_000;

/**
 * Write the `proxy-connect` handshake as one newline-delimited frame.
 *
 * Never hand-append the delimiter here: `encodeJsonFrame` is the contract, and it is what keeps this
 * writer and the home's `splitFrames` reader from drifting apart.
 */
export async function writeProxyConnect(io: ProxyHandshakeIo, token: string): Promise<void> {
  await io.write(encodeJsonFrame({ type: "proxy-connect", token }));
}

export type ProxyResponse =
  | { kind: "bytes"; bytes: ProxyFrameBytes }
  | { kind: "closed" }
  | { kind: "timeout" };

/**
 * Read the home's handshake response, giving up after `timeoutMs` instead of holding the socket.
 *
 * `closed` and `timeout` are kept distinct: the first is the home hanging up (a reachability
 * answer), the second is the home saying nothing (a liveness answer), and the two want different
 * log lines and different close reasons.
 */
export async function readProxyResponse(
  io: ProxyHandshakeIo,
  timeoutMs: number = PROXY_HANDSHAKE_TIMEOUT_MS,
): Promise<ProxyResponse> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<ProxyResponse>([
      io
        .read()
        .then((bytes) => (bytes && bytes.length > 0 ? ({ kind: "bytes", bytes } as const) : ({ kind: "closed" } as const))),
      new Promise<ProxyResponse>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
        // A pending handshake timer must not be the reason a relay process stays alive.
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
