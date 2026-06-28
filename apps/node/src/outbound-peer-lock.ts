/**
 * Per-peer outbound send lock — serialises concurrent calls for the same
 * remote peer so that `_warmContactConnectionTransport` and the dial flow
 * do not race when two outbound intents (message + presence signal) fire
 * back-to-back (added post-00b5b5d).
 */

const peerLocks = new Map<string, Promise<unknown>>();

export async function withOutboundPeerLock<T>(
  transportPeerId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = peerLocks.get(transportPeerId);
  const next = (async () => {
    await prev;
    return fn();
  })();
  peerLocks.set(transportPeerId, next);
  try {
    return (await next) as T;
  } finally {
    if (peerLocks.get(transportPeerId) === next) {
      peerLocks.delete(transportPeerId);
    }
  }
}
