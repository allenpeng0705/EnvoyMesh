/**
 * Adapt a libp2p stream into the framed duplex the mesh host transport expects.
 *
 * Lives here (not in host-connect) because host-connect deliberately does not know what a peer or a
 * stream is — this package is the only place that should.
 *
 * `read()` returns whatever arrived; the transport's `splitFrames` reassembles newline-delimited
 * JSON. Do not re-implement framing here.
 */

import { byteStream } from "@libp2p/utils";

/** Minimal stream surface used by {@link meshStreamAsDuplex}. */
export type P2PStreamLike = {
  close?: () => Promise<void> | void;
  closeWrite?: () => Promise<void> | void;
  abort?: (err?: Error) => void;
};

/**
 * One duplex for the mesh host transport.
 *
 * Shape matches `@envoymesh/host-connect`'s `FramedDuplex` without importing it — network must not
 * depend on the host layer.
 */
export type MeshFramedDuplex = {
  write(frame: Uint8Array): Promise<void> | void;
  read(): Promise<Uint8Array | undefined>;
  close(): Promise<void> | void;
};

export function meshStreamAsDuplex(stream: P2PStreamLike): MeshFramedDuplex {
  // One byteStream per stream: multiple wrappers register duplicate listeners.
  const streamIo = byteStream(stream as never);
  return {
    async write(frame) {
      await streamIo.write(frame);
    },
    async read() {
      const bytes = await streamIo.read();
      if (!bytes || bytes.length === 0) return undefined;
      // Copy out of the list — callers may retain the chunk across awaits.
      return bytes.subarray();
    },
    async close() {
      try {
        await stream.close?.();
      } catch {
        try {
          stream.abort?.(new Error("mesh duplex close"));
        } catch {
          /* already gone */
        }
      }
    },
  };
}
