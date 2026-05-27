export function shouldRunScheduledFriendAutopilot(input) {
    const { friendAutopilotEnabled, trustModeEnabled, intervalHours, lastRunAt } = input;
    if (!friendAutopilotEnabled || !trustModeEnabled || intervalHours <= 0) {
        return false;
    }
    const now = input.now ?? new Date();
    if (!lastRunAt)
        return true;
    const last = new Date(lastRunAt);
    if (Number.isNaN(last.getTime()))
        return true;
    const elapsedMs = now.getTime() - last.getTime();
    return elapsedMs >= intervalHours * 60 * 60 * 1000;
}
//# sourceMappingURL=friend-autopilot.js.map