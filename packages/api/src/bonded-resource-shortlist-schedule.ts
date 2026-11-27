/**
 * Phase 69C — throttle bonded resource shortlist passes (no auto-acquire).
 */

export type BondedResourceShortlistIntervalHours = 0 | 6 | 24 | 168;

export const DEFAULT_BONDED_RESOURCE_SHORTLIST_INTERVAL_HOURS: BondedResourceShortlistIntervalHours = 24;

export function shouldRunBondedResourceShortlistPass(input: {
  /** Explicit enable, or fall back to documentAcquisitionEnabled when omitted. */
  enabled?: boolean;
  documentAcquisitionEnabled?: boolean;
  autonomousKillSwitch?: boolean;
  intervalHours?: number;
  lastPassAt?: string;
  now?: Date;
}): boolean {
  if (input.autonomousKillSwitch) return false;
  const enabled =
    typeof input.enabled === "boolean"
      ? input.enabled
      : input.documentAcquisitionEnabled === true;
  if (!enabled) return false;

  const intervalHours =
    typeof input.intervalHours === "number" && Number.isFinite(input.intervalHours)
      ? input.intervalHours
      : DEFAULT_BONDED_RESOURCE_SHORTLIST_INTERVAL_HOURS;
  if (intervalHours <= 0) return false;

  const now = input.now ?? new Date();
  if (!input.lastPassAt) return true;
  const last = new Date(input.lastPassAt);
  if (Number.isNaN(last.getTime())) return true;
  return now.getTime() - last.getTime() >= intervalHours * 60 * 60 * 1000;
}
