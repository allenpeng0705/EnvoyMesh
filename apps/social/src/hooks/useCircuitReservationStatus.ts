import { useEffect, useState } from "react";
import type { CircuitReservationStatus } from "@envoymesh/api";
import { useNodeService } from "./useNodeService.js";

export type CircuitReservationChipView = {
  state: string;
  live: boolean;
  lastError?: string;
  /** e.g. "2/3" when multiple configured relays are tracked. */
  liveFraction?: string;
};

/**
 * Poll thin `getCircuitReservationStatus` for Settings / Discover soft-gates.
 * Prefer this over `getConnectivityDiagnostics` (audit + WAN axes).
 */
export function useCircuitReservationStatus(options: {
  enabled: boolean;
  pollMs?: number;
}): {
  chip: CircuitReservationChipView | null;
  ready: boolean;
} {
  const nodeService = useNodeService();
  const pollMs = options.pollMs ?? 5000;
  const [chip, setChip] = useState<CircuitReservationChipView | null>(null);

  useEffect(() => {
    if (!options.enabled) {
      setChip(null);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void nodeService
        .getCircuitReservationStatus()
        .then((status: CircuitReservationStatus) => {
          if (cancelled) return;
          setChip({
            state: status.state,
            live: status.live,
            lastError: status.lastError,
            liveFraction:
              status.relayPeerIds.length > 1
                ? `${(status.liveRelayPeerIds ?? []).length}/${status.relayPeerIds.length}`
                : undefined,
          });
        })
        .catch(() => {
          /* keep last */
        });
    };
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [nodeService, options.enabled, pollMs]);

  const ready = chip?.state === "reserved" || chip?.live === true;
  return { chip, ready };
}
