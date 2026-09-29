/**
 * Cap tracking for client-proxy WebSockets (libp2p fallback and home-tunnel).
 *
 * Extracted so the "release the slot even if the phone hangs up mid-dial"
 * contract can be unit-tested without standing up the full relay.
 */

export type ProxySlotRejectReason = "full" | "per-target" | "gone";

export interface ProxySlotAcquireOk {
  ok: true;
}

export interface ProxySlotAcquireReject {
  ok: false;
  reason: ProxySlotRejectReason;
}

export type ProxySlotAcquireResult = ProxySlotAcquireOk | ProxySlotAcquireReject;

export interface ProxyConnectionSlotsOptions {
  maxTotal: number;
  maxPerTarget: number;
  /** Defaults to WebSocket.CLOSED (3). Injected so tests can use plain objects. */
  closedReadyState?: number;
  /** Defaults to WebSocket.CLOSING (2). */
  closingReadyState?: number;
}

/**
 * Soft handle for a socket in the set. Production uses `ws.WebSocket`; tests
 * may pass a minimal stub with `readyState` (+ optional EventEmitter `on`).
 */
export interface ProxySlotSocket {
  readyState: number;
  on?(event: "close", listener: () => void): void;
}

export class ProxyConnectionSlots {
  readonly maxTotal: number;
  readonly maxPerTarget: number;
  private readonly closedReadyState: number;
  private readonly closingReadyState: number;

  private total = 0;
  private readonly byTarget = new Map<string, Set<ProxySlotSocket>>();
  private readonly meta = new Map<ProxySlotSocket, { targetPeerId: string }>();

  constructor(options: ProxyConnectionSlotsOptions) {
    this.maxTotal = options.maxTotal;
    this.maxPerTarget = options.maxPerTarget;
    this.closedReadyState = options.closedReadyState ?? 3;
    this.closingReadyState = options.closingReadyState ?? 2;
  }

  get totalConnections(): number {
    return this.total;
  }

  connectionsFor(targetPeerId: string): number {
    return this.byTarget.get(targetPeerId)?.size ?? 0;
  }

  /** True when the socket will never emit a future useful `close` for slot release. */
  isGone(ws: ProxySlotSocket): boolean {
    return (
      ws.readyState === this.closedReadyState ||
      ws.readyState === this.closingReadyState
    );
  }

  /**
   * Drop sockets already CLOSED so a missed `close` listener cannot keep the
   * per-target set at the cap forever.
   */
  pruneDead(targetPeerId: string): number {
    const set = this.byTarget.get(targetPeerId);
    if (!set) return 0;
    let pruned = 0;
    for (const sock of [...set]) {
      if (sock.readyState === this.closedReadyState && set.delete(sock)) {
        this.meta.delete(sock);
        this.total = Math.max(0, this.total - 1);
        pruned++;
      }
    }
    if (set.size === 0) this.byTarget.delete(targetPeerId);
    return pruned;
  }

  tryAcquire(ws: ProxySlotSocket, targetPeerId: string): ProxySlotAcquireResult {
    this.pruneDead(targetPeerId);
    // Refuse a socket that already left — never useful, and a missed
    // pre-listen `close` would otherwise leak until pruneDead.
    if (this.isGone(ws)) {
      return { ok: false, reason: "gone" };
    }
    if (this.total >= this.maxTotal) {
      return { ok: false, reason: "full" };
    }
    const existing = this.byTarget.get(targetPeerId);
    if (existing && existing.size >= this.maxPerTarget) {
      return { ok: false, reason: "per-target" };
    }
    this.total++;
    const conns = existing ?? new Set<ProxySlotSocket>();
    conns.add(ws);
    this.byTarget.set(targetPeerId, conns);
    this.meta.set(ws, { targetPeerId });
    return { ok: true };
  }

  /**
   * Release exactly once. Safe to call from `ws.on("close")` *before* dial
   * finishes — that is the regression this module exists to pin.
   */
  release(ws: ProxySlotSocket): boolean {
    const entry = this.meta.get(ws);
    if (!entry) return false;
    this.meta.delete(ws);
    const set = this.byTarget.get(entry.targetPeerId);
    if (set?.delete(ws)) {
      this.total = Math.max(0, this.total - 1);
    }
    if (set && set.size === 0) this.byTarget.delete(entry.targetPeerId);
    return true;
  }

  /** True when this socket still holds a counted slot. */
  holds(ws: ProxySlotSocket): boolean {
    return this.meta.has(ws);
  }

  /** Clear all slots (relay shutdown). */
  clear(): void {
    this.byTarget.clear();
    this.meta.clear();
    this.total = 0;
  }
}

/**
 * Register `release` on `close`, and run it immediately if the socket is
 * already CLOSING/CLOSED — Node will not re-emit `close` if it fired before
 * the listener was attached (the acquire→listen race).
 *
 * `release` must be idempotent.
 */
export function armProxySlotRelease(
  ws: ProxySlotSocket,
  release: () => void,
  readyStates: { closed?: number; closing?: number } = {},
): void {
  const closed = readyStates.closed ?? 3;
  const closing = readyStates.closing ?? 2;
  let done = false;
  const once = (): void => {
    if (done) return;
    done = true;
    release();
  };
  ws.on?.("close", once);
  if (ws.readyState === closed || ws.readyState === closing) {
    once();
  }
}
