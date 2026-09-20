/**
 * Newline-delimited JSON framing — the family's mesh host wire.
 *
 * ## Why this is one module, not two
 *
 * The host transport (`@envoymesh/host-connect`'s `createMeshHostTransport`) reads frames by
 * splitting on `"\n"`. Every process that *writes* to a home over a raw duplex must frame the same
 * way, and the failure when it does not is not a parse error — it is a **hang**: the reader buffers
 * the bytes as an incomplete frame and waits, forever, for a delimiter that never comes. That is
 * exactly what the relay's `proxy-connect` handshake did when it wrote a bare `JSON.stringify`
 * (an unresponsive "Connecting" on the phone), so the delimiter and the splitter live together here
 * and both ends call them rather than each appending `"\n"` by hand.
 *
 * Lives in `protocol` because that is the only package both sides already depend on: `host-connect`
 * (the reader) and `apps/relay` (the writer) both take `@envoymesh/protocol`, and `network` — which
 * must not know what a host protocol is — can stay out of it.
 */

/** The frame delimiter. One definition; every writer and reader uses it. */
export const FRAME_DELIMITER = "\n";

const encoder = new TextEncoder();

/**
 * Serialize `payload` as one newline-terminated UTF-8 frame.
 *
 * The delimiter is what makes this a frame. A caller that wants the bytes *without* the frame
 * boundary wants `JSON.stringify`, not this.
 */
export function encodeJsonFrame(payload: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(payload)}${FRAME_DELIMITER}`);
}

/**
 * Split a byte buffer into complete newline-delimited frames, returning the remainder.
 *
 * `chunk` is whatever the transport delivered, which need not align with frame boundaries; `buffer`
 * is the incomplete tail from the previous call. Blank frames are dropped (a `\n\n` is a keepalive,
 * not a message).
 */
export function splitFrames(buffer: string, chunk: string): { frames: string[]; rest: string } {
  const combined = buffer + chunk;
  const parts = combined.split(FRAME_DELIMITER);
  // The last part is either empty (a clean boundary) or an incomplete frame.
  const rest = parts.pop() ?? "";
  return { frames: parts.filter((part) => part.trim() !== ""), rest };
}
