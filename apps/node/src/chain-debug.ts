/**
 * Concise Team-job debug logging. Prefix every line with `[chain.*]` so
 * `node:dev` terminals / log greps stay easy to filter during live demos.
 */

export function shortPeerId(peerId: string | undefined | null): string {
  if (!peerId) return "?";
  if (peerId.length <= 16) return peerId;
  return `${peerId.slice(0, 10)}…${peerId.slice(-4)}`;
}

export function chainLog(
  scope: string,
  message: string,
  detail?: Record<string, unknown>,
): void {
  if (detail && Object.keys(detail).length > 0) {
    console.info(`[chain.${scope}] ${message}`, detail);
  } else {
    console.info(`[chain.${scope}] ${message}`);
  }
}

export function chainWarn(
  scope: string,
  message: string,
  detail?: Record<string, unknown>,
): void {
  if (detail && Object.keys(detail).length > 0) {
    console.warn(`[chain.${scope}] ${message}`, detail);
  } else {
    console.warn(`[chain.${scope}] ${message}`);
  }
}
