/**
 * Phase 66A — debounced full Agent Network worker refresh after bond.
 *
 * LAN auto-bond already refreshed; generic / sponsor bonds only auto-fetched
 * one card. One debounced `refreshAgentNetworkWorkers` covers cold Join→lease.
 */

export type DebouncedAgentNetworkRefresh = {
  /** Schedule a refresh (coalesces bursts of bond:established). */
  schedule: (reason: string) => void;
  /** Cancel pending timer (e.g. stopNode). */
  cancel: () => void;
};

export function createDebouncedAgentNetworkRefresh(opts: {
  refresh: () => Promise<unknown>;
  /** Default 750ms — enough to coalesce multi-accept LAN + sponsor bursts. */
  debounceMs?: number;
  track?: (work: Promise<unknown>) => void;
  onError?: (err: unknown, reason: string) => void;
}): DebouncedAgentNetworkRefresh {
  const debounceMs = opts.debounceMs ?? 750;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastReason = "bond";

  const run = () => {
    timer = undefined;
    const reason = lastReason;
    const work = opts.refresh().catch((err) => {
      opts.onError?.(err, reason);
    });
    opts.track?.(work);
  };

  return {
    schedule: (reason: string) => {
      lastReason = reason || "bond";
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, debounceMs);
      timer.unref?.();
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
