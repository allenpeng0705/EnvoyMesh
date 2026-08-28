/**
 * Phase 46E.1 — hot-reload relay control targets without process restart.
 *
 * Re-warms reservations and restarts the relay-client scheduler with fresh deps.
 */
import type { EnvoyMesh } from "@envoymesh/network";
import { warmAndWatchRelayReservations } from "./relay-reservation-health.js";
import {
  runRelayClientCycle,
  startRelayClientScheduler,
  type RelayClientCycleDeps,
} from "./relay-client-cycle.js";

export interface ReloadRelayControlTargetsInput {
  mesh: EnvoyMesh;
  deps: RelayClientCycleDeps;
  /** Extra addrs from signed roster selection / vouched hints. */
  activeRelayAddrs?: readonly string[];
  relayEnabled?: boolean;
  relayReservationEnabled?: boolean;
  intervalMs?: number;
  stopScheduler?: (() => void) | undefined;
  setDeps: (deps: RelayClientCycleDeps) => void;
  setStopScheduler: (stop: (() => void) | undefined) => void;
  /** Skip waiting for live reservation on hot-reload (default true). */
  skipWaitForLive?: boolean;
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
}

export interface ReloadRelayControlTargetsResult {
  addrs: string[];
  warmed: boolean;
}

export async function reloadRelayControlTargets(
  input: ReloadRelayControlTargetsInput,
): Promise<ReloadRelayControlTargetsResult> {
  const log = input.log ?? console.log;
  const warn = input.warn ?? console.warn;

  const nextDeps: RelayClientCycleDeps = {
    ...input.deps,
    activeRelayAddrs: [...(input.activeRelayAddrs ?? [])],
  };
  input.setDeps(nextDeps);

  input.stopScheduler?.();
  input.setStopScheduler(undefined);

  let warmed = false;
  let addrs: string[] = [];
  try {
    const result = await warmAndWatchRelayReservations(
      input.mesh,
      {
        configuredRelays: nextDeps.configuredRelays,
        bootstrapPeers: nextDeps.bootstrapPeers,
        bootstrapPresets: nextDeps.bootstrapPresets,
        activeRelayAddrs: nextDeps.activeRelayAddrs,
        relayEnabled: input.relayEnabled ?? true,
        relayReservationEnabled: input.relayReservationEnabled ?? true,
      },
      {
        waitForLiveMs: input.skipWaitForLive === false ? undefined : 0,
      },
    );
    warmed = result.warmed;
    addrs = result.addrs;
    log(
      `[relay-reload] targets=${addrs.length} warmed=${warmed}` +
        (result.reason ? ` reason=${result.reason}` : ""),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`[relay-reload] warm failed (non-fatal): ${msg}`);
  }

  if (input.relayEnabled === false) {
    return { addrs, warmed };
  }

  try {
    await runRelayClientCycle(nextDeps);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`[relay-reload] immediate cycle failed (non-fatal): ${msg}`);
  }

  const stop = startRelayClientScheduler({
    ...nextDeps,
    intervalMs: input.intervalMs,
  });
  input.setStopScheduler(stop);

  return { addrs, warmed };
}
