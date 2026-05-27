/** Scheduled friend-autopilot interval (hours). 0 = manual tool only. */
export type FriendAutopilotIntervalHours = 0 | 24 | 168;

export function shouldRunScheduledFriendAutopilot(input: {
  friendAutopilotEnabled: boolean;
  trustModeEnabled: boolean;
  intervalHours: number;
  lastRunAt?: string;
  now?: Date;
}): boolean {
  const { friendAutopilotEnabled, trustModeEnabled, intervalHours, lastRunAt } = input;
  if (!friendAutopilotEnabled || !trustModeEnabled || intervalHours <= 0) {
    return false;
  }
  const now = input.now ?? new Date();
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt);
  if (Number.isNaN(last.getTime())) return true;
  const elapsedMs = now.getTime() - last.getTime();
  return elapsedMs >= intervalHours * 60 * 60 * 1000;
}
