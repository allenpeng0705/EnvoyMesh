/** Serialize outbound peer operations (warm + send) per transport peer. */
const outboundPeerChains = new Map<string, Promise<void>>();

/**
 * Run `fn` while holding the per-transport-peer lock.
 * Warm dials and chat/send delivery for the same libp2p peer cannot overlap.
 */
export async function withOutboundPeerLock<T>(
  transportPeerId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = outboundPeerChains.get(transportPeerId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chain = prev.then(() => gate);
  outboundPeerChains.set(transportPeerId, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (outboundPeerChains.get(transportPeerId) === chain) {
      outboundPeerChains.delete(transportPeerId);
    }
  }
}

/** @deprecated use {@link withOutboundPeerLock} */
export const withOutboundSendLock = withOutboundPeerLock;

/** Test helper */
export function resetOutboundPeerLockForTests(): void {
  outboundPeerChains.clear();
}
