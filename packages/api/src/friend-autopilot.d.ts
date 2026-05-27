/** Scheduled friend-autopilot interval (hours). 0 = manual tool only. */
export type FriendAutopilotIntervalHours = 0 | 24 | 168;
export declare function shouldRunScheduledFriendAutopilot(input: {
    friendAutopilotEnabled: boolean;
    trustModeEnabled: boolean;
    intervalHours: number;
    lastRunAt?: string;
    now?: Date;
}): boolean;
//# sourceMappingURL=friend-autopilot.d.ts.map