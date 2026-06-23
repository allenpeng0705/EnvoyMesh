/** Serialize outbound sends per transport peer to avoid overlapping dials/writes. */
const outboundSendChains = new Map<string, Promise<void>>();

export async function withOutboundSendLock<T>(
  transportPeerId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = outboundSendChains.get(transportPeerId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chain = prev.then(() => gate);
  outboundSendChains.set(transportPeerId, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (outboundSendChains.get(transportPeerId) === chain) {
      outboundSendChains.delete(transportPeerId);
    }
  }
}
