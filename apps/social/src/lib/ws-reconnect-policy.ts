/** Keep the shell mounted this long after a drop before the full splash. */
export const WS_OFFLINE_GRACE_MS = 10_000;

/** Hold last node-status hydration this long so short blips do not flash Syncing. */
export const WS_HYDRATION_HOLD_MS = 10_000;

/** After this offline, Tauri re-arms wait/restart recovery (post first connect). */
export const TAURI_RECOVERY_AFTER_MS = 45_000;

/**
 * Full-screen "Connecting to EnvoyMesh" vs in-app reconnect banner.
 *
 * - Never connected yet → splash immediately (startup / first launch).
 * - Already connected once → grace window keeps the shell; splash after grace.
 */
export function shouldShowFullConnectingSplash(opts: {
  isConnected: boolean;
  hadConnected: boolean;
  offlineMs: number;
  graceMs?: number;
}): boolean {
  if (opts.isConnected) return false;
  if (!opts.hadConnected) return true;
  return opts.offlineMs >= (opts.graceMs ?? WS_OFFLINE_GRACE_MS);
}

/** True while the shell should stay up with a reconnect banner. */
export function shouldShowReconnectGraceBanner(opts: {
  isConnected: boolean;
  hadConnected: boolean;
  offlineMs: number;
  graceMs?: number;
}): boolean {
  if (opts.isConnected || !opts.hadConnected) return false;
  return opts.offlineMs < (opts.graceMs ?? WS_OFFLINE_GRACE_MS);
}

/** Whether Tauri should kick wait-for-node / restart recovery for this outage. */
export function shouldArmTauriOfflineRecovery(opts: {
  tauriShell: boolean;
  isConnected: boolean;
  hadConnected: boolean;
  offlineMs: number;
  alreadyAttempted: boolean;
  afterMs?: number;
}): boolean {
  if (!opts.tauriShell || opts.isConnected || !opts.hadConnected) return false;
  if (opts.alreadyAttempted) return false;
  return opts.offlineMs >= (opts.afterMs ?? TAURI_RECOVERY_AFTER_MS);
}

/** Ms until Tauri recovery should fire, or 0 if due now, or null if not applicable. */
export function tauriRecoveryDueInMs(opts: {
  tauriShell: boolean;
  isConnected: boolean;
  hadConnected: boolean;
  offlineSince: number | null;
  alreadyAttempted: boolean;
  nowMs?: number;
  afterMs?: number;
}): number | null {
  if (!opts.tauriShell || opts.isConnected || !opts.hadConnected) return null;
  if (opts.alreadyAttempted || opts.offlineSince == null) return null;
  const after = opts.afterMs ?? TAURI_RECOVERY_AFTER_MS;
  const elapsed = (opts.nowMs ?? Date.now()) - opts.offlineSince;
  return Math.max(0, after - elapsed);
}
