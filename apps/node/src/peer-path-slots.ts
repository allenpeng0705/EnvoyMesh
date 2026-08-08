/**
 * Global PeerPath dial concurrency (no imports from warm/outbound — avoids cycles).
 */
export const PEER_PATH_SOFT_CONNECTION_CAP = 64;
export const PEER_PATH_MAX_IN_FLIGHT_DIALS = 3;
export const PEER_PATH_USER_SLOT_WAIT_MS = 8_000;

export type PeerPathIntent = "warm" | "upgrade" | "keepalive" | "verify" | "force";

type SlotWaiter = {
  resolve: (acquired: boolean) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
};

let inFlightDials = 0;
const waitQueue: SlotWaiter[] = [];

export function inferPeerPathIntent(options?: {
  verifyOnly?: boolean;
  force?: boolean;
  redial?: boolean;
  upgradeRelayToDirect?: boolean;
  keepAlive?: boolean;
  verifyConnection?: boolean;
}): PeerPathIntent {
  if (options?.verifyOnly === true) return "verify";
  if (options?.force === true || options?.redial === true) return "force";
  if (options?.upgradeRelayToDirect === true) return "upgrade";
  if (options?.keepAlive === true || options?.verifyConnection === true) return "keepalive";
  return "warm";
}

function isUserFacingIntent(intent: PeerPathIntent): boolean {
  return intent === "upgrade" || intent === "force";
}

function wakeNextWaiter(): void {
  while (waitQueue.length > 0 && inFlightDials < PEER_PATH_MAX_IN_FLIGHT_DIALS) {
    const next = waitQueue.shift();
    if (!next) return;
    if (next.timer) clearTimeout(next.timer);
    inFlightDials += 1;
    next.resolve(true);
  }
}

export function tryAcquirePeerPathDialSlot(input: {
  intent: PeerPathIntent;
  waitMs?: number;
}): Promise<boolean> {
  if (input.intent === "verify") {
    return Promise.resolve(true);
  }
  if (inFlightDials < PEER_PATH_MAX_IN_FLIGHT_DIALS) {
    inFlightDials += 1;
    return Promise.resolve(true);
  }
  if (!isUserFacingIntent(input.intent)) {
    return Promise.resolve(false);
  }
  const waitMs = input.waitMs ?? PEER_PATH_USER_SLOT_WAIT_MS;
  return new Promise((resolve) => {
    const waiter: SlotWaiter = {
      resolve,
      timer: setTimeout(() => {
        const idx = waitQueue.indexOf(waiter);
        if (idx >= 0) waitQueue.splice(idx, 1);
        resolve(false);
      }, waitMs),
    };
    waitQueue.push(waiter);
  });
}

export function releasePeerPathDialSlot(intent: PeerPathIntent = "warm"): void {
  if (intent === "verify") return;
  if (inFlightDials > 0) inFlightDials -= 1;
  wakeNextWaiter();
}

export function isPeerPathConnectionCapReached(totalConnections: number): boolean {
  return totalConnections >= PEER_PATH_SOFT_CONNECTION_CAP;
}

export function getPeerPathDialStatsForTests(): {
  inFlightDials: number;
  waitQueueLength: number;
} {
  return { inFlightDials, waitQueueLength: waitQueue.length };
}

export function resetPeerPathDialSlotsForTests(): void {
  for (const w of waitQueue) {
    if (w.timer) clearTimeout(w.timer);
    w.resolve(false);
  }
  waitQueue.length = 0;
  inFlightDials = 0;
}
