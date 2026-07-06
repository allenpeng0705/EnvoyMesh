/** Default WAN join invite lifetime (Share contact card / casual sharing). */
export const WAN_JOIN_INVITE_DEFAULT_EXPIRES_HOURS = 168;

/** Maximum allowed WAN join invite lifetime (1 calendar year). */
export const WAN_JOIN_INVITE_MAX_EXPIRES_HOURS = 24 * 365;

/** UI presets for invite expiry (hours). */
export const WAN_JOIN_INVITE_EXPIRY_PRESETS = {
  days7: 168,
  days30: 720,
  year1: WAN_JOIN_INVITE_MAX_EXPIRES_HOURS,
} as const;

export type WanJoinInviteExpiryPresetId = keyof typeof WAN_JOIN_INVITE_EXPIRY_PRESETS;

export function clampWanJoinInviteExpiresInHours(
  hours: number | undefined,
  defaultHours: number = WAN_JOIN_INVITE_DEFAULT_EXPIRES_HOURS,
): number {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) {
    return defaultHours;
  }
  return Math.min(Math.floor(hours), WAN_JOIN_INVITE_MAX_EXPIRES_HOURS);
}
