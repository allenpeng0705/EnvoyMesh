/**
 * Agent-card refresh timing for Team jobs / Agent Network.
 *
 * `refreshAgentNetworkWorkers` used to wrap every `requestAgentCard` in a
 * flat 12s (then 30s) timeout. That is too short for relay circuit dials
 * (dial-hints alone may take up to 30s) and too long when the peer is
 * already connected — and running peers sequentially made the RPC hang
 * for N × timeout.
 *
 * Rules:
 * - Already connected → short budget (card send is cheap).
 * - Need dial / relay → long budget that exceeds dial-hints + deliver.
 * - Warm briefly before the request so more peers take the short path.
 * - Fetch in parallel with bounded concurrency so UI stays responsive.
 */

export const AGENT_CARD_REFRESH_CONNECTED_MS = 15_000;
/** Must exceed `_dialHintsForChat` (≤30s) + resolve/sign/deliver headroom. */
export const AGENT_CARD_REFRESH_RELAY_MS = 60_000;
export const AGENT_CARD_REFRESH_WARM_MS = 8_000;
export const AGENT_CARD_REFRESH_CONCURRENCY = 3;
/** Default dial-hints cap inside `requestAgentCard` when no budget is passed. */
export const AGENT_CARD_DIAL_HINTS_MAX_MS = 30_000;

/** Per-peer outer timeout for a card request during refresh. */
export function agentCardRefreshTimeoutMs(connected: boolean): number {
  return connected ? AGENT_CARD_REFRESH_CONNECTED_MS : AGENT_CARD_REFRESH_RELAY_MS;
}

/**
 * Budget for `_dialHintsForChat` inside a total request budget.
 * Leaves headroom for resolve + sign + deliver after hints resolve.
 */
export function agentCardDialHintsBudgetMs(totalBudgetMs: number): number {
  const headroomMs = 15_000;
  return Math.min(
    AGENT_CARD_DIAL_HINTS_MAX_MS,
    Math.max(5_000, totalBudgetMs - headroomMs),
  );
}

/** Run `fn` over `items` with at most `concurrency` in flight. */
export async function mapPoolSettled<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]!, i);
      }
    }),
  );
  return results;
}
