/**
 * Phase 69B — throttle scheduled social-proxy passes.
 * Chat-triggered passes stay immediate; scheduled ticks respect interval + lastPassAt.
 */

/** Hours between background social-proxy passes. 0 = scheduled off (chat/manual only). */
export type SocialProxyIntervalHours = 0 | 1 | 6 | 24 | 168;

/** Default when config omits interval — avoid 30s busy-loop discovery. */
export const DEFAULT_SOCIAL_PROXY_INTERVAL_HOURS: SocialProxyIntervalHours = 1;

export function shouldRunScheduledSocialProxyPass(input: {
  socialProxyEnabled: boolean;
  trustModeEnabled: boolean;
  autonomousKillSwitch?: boolean;
  /** Hours between passes; default {@link DEFAULT_SOCIAL_PROXY_INTERVAL_HOURS}. */
  intervalHours?: number;
  lastPassAt?: string;
  now?: Date;
}): boolean {
  if (!input.socialProxyEnabled || !input.trustModeEnabled) return false;
  if (input.autonomousKillSwitch) return false;
  const intervalHours =
    typeof input.intervalHours === "number" && Number.isFinite(input.intervalHours)
      ? input.intervalHours
      : DEFAULT_SOCIAL_PROXY_INTERVAL_HOURS;
  if (intervalHours <= 0) return false;

  const now = input.now ?? new Date();
  if (!input.lastPassAt) return true;
  const last = new Date(input.lastPassAt);
  if (Number.isNaN(last.getTime())) return true;
  const elapsedMs = now.getTime() - last.getTime();
  return elapsedMs >= intervalHours * 60 * 60 * 1000;
}
