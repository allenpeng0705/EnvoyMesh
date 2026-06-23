import type { PeerConnectionInfo } from "@envoymesh/api";

export type ReachabilityLabel = "offline" | "direct" | "relay";

/** Background read interval while a chat thread is open. */
export const REACHABILITY_OPEN_CHAT_POLL_MS = 30_000;
/** Background read interval when chat is not focused (unused by open-chat hook today). */
export const REACHABILITY_POLL_MS = 60_000;
/** Keep showing Online through brief libp2p idle drops (quiet chats, tab switches). */
export const REACHABILITY_OFFLINE_GRACE_MS = 5 * 60_000;
/** Minimum gap between redial attempts when libp2p reports disconnected (background). */
export const REACHABILITY_MIN_REDIAL_MS = 90_000;
/** Faster redial while an active chat panel is open. */
export const REACHABILITY_OPEN_CHAT_MIN_REDIAL_MS = 45_000;
/** Consecutive disconnected polls before flipping Online → Offline. */
export const REACHABILITY_STABLE_OFFLINE_POLLS = 4;
/** Consecutive connected polls before flipping Offline → Online. */
export const REACHABILITY_STABLE_ONLINE_POLLS = 2;
/** Consecutive polls before switching Direct ↔ Relay label. */
export const REACHABILITY_STABLE_PATH_POLLS = 5;

export function reachabilityLabel(info: Pick<PeerConnectionInfo, "connected" | "direct">): ReachabilityLabel {
  if (!info.connected) return "offline";
  return info.direct ? "direct" : "relay";
}

export type ReachabilityHysteresisState = {
  displayedLabel: ReachabilityLabel | null;
  lastConnectedAt: number;
  streakLabel: ReachabilityLabel;
  streakCount: number;
};

export function createReachabilityHysteresisState(): ReachabilityHysteresisState {
  return {
    displayedLabel: null,
    lastConnectedAt: 0,
    streakLabel: "offline",
    streakCount: 0,
  };
}

/** Apply one libp2p reading; returns whether UI info should update. */
export function applyReachabilityHysteresis(
  state: ReachabilityHysteresisState,
  next: PeerConnectionInfo,
  now: number,
  options?: { offlineGraceMs?: number; holdOnline?: boolean },
): { state: ReachabilityHysteresisState; info: PeerConnectionInfo | null; shouldUpdate: boolean } {
  const offlineGraceMs = options?.offlineGraceMs ?? REACHABILITY_OFFLINE_GRACE_MS;
  const holdOnline = options?.holdOnline === true;
  const label = reachabilityLabel(next);
  let { displayedLabel, lastConnectedAt, streakLabel, streakCount } = state;

  if (next.connected) {
    lastConnectedAt = now;
    if (label === streakLabel) streakCount += 1;
    else {
      streakLabel = label;
      streakCount = 1;
    }

    const comingFromOffline = displayedLabel === "offline";
    if (comingFromOffline && streakCount < REACHABILITY_STABLE_ONLINE_POLLS) {
      return {
        state: { displayedLabel, lastConnectedAt, streakLabel, streakCount },
        info: null,
        shouldUpdate: false,
      };
    }

    const isPathChange =
      displayedLabel !== null && displayedLabel !== "offline" && displayedLabel !== label;
    if (isPathChange && streakCount < REACHABILITY_STABLE_PATH_POLLS) {
      return {
        state: { displayedLabel, lastConnectedAt, streakLabel, streakCount },
        info: null,
        shouldUpdate: false,
      };
    }

    displayedLabel = label;
    return {
      state: { displayedLabel, lastConnectedAt, streakLabel, streakCount },
      info: next,
      shouldUpdate: true,
    };
  }

  if (label === streakLabel) streakCount += 1;
  else {
    streakLabel = label;
    streakCount = 1;
  }

  if (streakCount < REACHABILITY_STABLE_OFFLINE_POLLS) {
    return {
      state: { displayedLabel, lastConnectedAt, streakLabel, streakCount },
      info: null,
      shouldUpdate: false,
    };
  }

  const wasOnline = displayedLabel !== null && displayedLabel !== "offline";
  if (wasOnline && holdOnline) {
    return {
      state: { displayedLabel, lastConnectedAt, streakLabel, streakCount },
      info: null,
      shouldUpdate: false,
    };
  }
  if (wasOnline && now - lastConnectedAt < offlineGraceMs) {
    return {
      state: { displayedLabel, lastConnectedAt, streakLabel, streakCount },
      info: null,
      shouldUpdate: false,
    };
  }

  displayedLabel = "offline";
  return {
    state: { displayedLabel, lastConnectedAt, streakLabel, streakCount },
    info: next,
    shouldUpdate: true,
  };
}
