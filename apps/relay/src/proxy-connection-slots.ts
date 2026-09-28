/**
 * Cap tracking for libp2p-fallback client-proxy WebSockets.
 *
 * Extracted so the "release the slot even if the phone hangs up mid-dial"
 * contract can be unit-tested without standing up the full relay. The
 * production path in `index.ts` still owns dial + handshake; this module
 * only owns the counters that previously leaked.
 */

export type ProxySlotRejectReason = "full" | "per-target";

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
}

/**
 * Soft handle for a socket in the set. Production uses `ws.WebSocket`; tests
 * may pass a minimal stub with `readyState`.
 */
export interface ProxySlotSocket {
  readyState: number;
}

export class ProxyConnectionSlots {
  readonly maxTotal: number;
  readonly maxPerTarget: number;
  private readonly closedReadyState: number;

  private total = 0;
  private readonly byTarget = new Map<string, Set<ProxySlotSocket>>();
  private readonly meta = new Map<ProxySlotSocket, { targetPeerId: string }>();

  constructor(options: ProxyConnectionSlotsOptions) {
    this.maxTotal = options.maxTotal;
    this.maxPerTarget = options.maxPerTarget;
    this.closedReadyState = options.closedReadyState ?? 3;
  }

  get totalConnections(): number {
    return this.total;
  }

  connectionsFor(targetPeerId: string): number {
    return this.byTarget.get(targetPeerId)?.size ?? 0;
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
}
