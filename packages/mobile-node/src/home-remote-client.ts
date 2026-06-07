import { encodeTerminalFrame, encodeTerminalResize, TerminalWireType, TERMINAL_ASSIST_RPC_TIMEOUT_MS } from "@envoymesh/api";

type EventHandler = (data: unknown) => void;

interface PendingRpc {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * Minimal interface that the home-remote wire protocol needs from a transport.
 * Both the browser `WebSocket` and our libp2p-stream shim satisfy this shape,
 * so {@link HomeRemoteClient} is transport-agnostic and can speak the same
 * JSON-RPC + push-event protocol over either.
 *
 * Wire-level contract (JSON, one message per call to `send`):
 *   client → server: `{ id, method, params }`  (requests)
 *   server → client: `{ id, result | error }`  (responses)
 *   server → client: `{ event, data }`         (push events, e.g. homeTerminalWs:rx)
 *   client → server: `{ id, method, params }`  (binary terminal frames ride on
 *                                                 homeTerminalWsOpen/Send/Close RPCs)
 */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

export const WS_READY_STATE_CONNECTING = 0;
export const WS_READY_STATE_OPEN = 1;
export const WS_READY_STATE_CLOSING = 2;
export const WS_READY_STATE_CLOSED = 3;

/**
 * One candidate transport for connecting to the home node.
 * The candidates are tried in order; the first one that connects wins.
 * Candidates are re-checked periodically so the client can upgrade
 * (LAN → libp2p → tunnel) as network conditions change.
 */
export interface HomeRemoteCandidate {
  /** Display label for logs / diagnostics / UI status. */
  name: string;
  /**
   * Transport-specific dial target:
   *   - `ws://...` or `wss://...`  → standard WebSocket URL
   *   - `libp2p://<peerId>`         → open a libp2p stream on CLIENT_PROXY_PROTOCOL
   */
  url: string;
}

export interface HomeRemoteClientOptions {
  /**
   * Returns the candidate transports to try, in priority order.
   * Called on every (re)connect so the resolver can return up-to-date URLs
   * (e.g. a fresh relay session token, or a LAN URL that was discovered later).
   *
   * The candidates are tried top-down. The first one that opens becomes the
   * active transport. Higher-priority candidates that fail are abandoned for
   * the current attempt; they will be retried during a background upgrade sweep.
   */
  resolveCandidates: () => Promise<HomeRemoteCandidate[]>;
  /**
   * Factory that opens a transport given a candidate. The default opens
   * a real `new WebSocket(url)` synchronously. Callers may return a
   * Promise — useful for transports (e.g. libp2p) that need an async
   * handshake before they can hand back a stream-shaped object.
   */
  createTransport?: (candidate: HomeRemoteCandidate) => WebSocketLike | Promise<WebSocketLike>;
  onHomeOnlineChange?: (online: boolean) => void;
  /**
   * Active-transport change notification. Useful for surfacing "direct LAN" vs
   * "libp2p" vs "relay tunnel" status in the UI. Called whenever the active
   * transport is established or replaced (including periodic upgrade sweeps).
   */
  onActiveTransportChange?: (candidate: HomeRemoteCandidate | null) => void;
  /**
   * Per-candidate connect timeout in ms. Defaults to 8 seconds.
   * Stays short so unreachable candidates (e.g. LAN when on cellular) fail
   * fast and the next candidate can be tried.
   */
  perCandidateTimeoutMs?: number;
  /**
   * Background upgrade sweep interval in ms. The client will periodically
   * re-check higher-priority candidates and switch to them if reachable.
   * Defaults to 30 seconds. Set to 0 to disable.
   */
  upgradeSweepMs?: number;
}

/**
 * Default transport factory: open a real WebSocket.
 * Works in browser, Node 22+, and Capacitor WebView.
 */
function defaultCreateTransport(candidate: HomeRemoteCandidate): WebSocketLike {
  return new WebSocket(candidate.url) as unknown as WebSocketLike;
}

/**
 * Persistent transport to the paired home node.
 *
 * Supports multiple candidate transport URLs (LAN, libp2p, relay tunnel) with
 * automatic fallback. The first candidate that opens becomes the active
 * transport. If the active transport closes, the next candidate is tried.
 * A background sweep periodically re-tries higher-priority candidates so the
 * client can upgrade (e.g. LAN becomes reachable after switching WiFi).
 *
 * Multiplexes JSON-RPC calls and push events (e.g. homeTerminalWs:rx) over
 * whichever transport is currently active. Transport-agnostic — works over
 * WebSocket, libp2p streams, or any custom duplex that satisfies
 * {@link WebSocketLike}.
 */
export class HomeRemoteClient {
  private ws: WebSocketLike | null = null;
  private connectPromise: Promise<void> | null = null;
  private readonly pending = new Map<string, PendingRpc>();
  private readonly eventHandlers = new Map<string, Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private upgradeSweepTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectDelayMs = 1000;
  private disposed = false;
  private _homeOnline = false;
  private _activeCandidate: HomeRemoteCandidate | null = null;
  /**
   * True while a transport upgrade is in progress (i.e. `tryUpgradeTo`
   * is closing the current transport and dialing a higher-priority one).
   * While set, `setHomeOnline(false)` from the old socket's `onclose`
   * is suppressed so the UI doesn't flicker offline during the upgrade.
   * Cleared on either successful upgrade or upgrade failure.
   */
  private _upgrading = false;
  /**
   * Per-candidate-name backoff for upgrade probes. Maps candidate name
   * → { lastAttemptAt: ms, failures: count }. The next probe for a
   * candidate is skipped if the cooldown hasn't elapsed. Cooldown
   * doubles on each failure up to a 5-minute cap.
   */
  private _probeCooldown: Map<string, { lastAttemptAt: number; failures: number }>;

  constructor(private readonly options: HomeRemoteClientOptions) {
    const sweepMs = options.upgradeSweepMs ?? 30_000;
    if (sweepMs > 0) {
      this.upgradeSweepTimer = setInterval(() => {
        this.maybeUpgradeTransport();
      }, sweepMs);
    }
    // Track the last time we attempted each candidate name in a probe.
    // If a candidate failed its last probe, back off exponentially so
    // we don't burn a full perCandidateTimeout on a known-bad target
    // every 30s. The active transport's first failure is exempt (we
    // always retry whatever we were using) but higher-priority probes
    // obey the cooldown.
    this._probeCooldown = new Map();
  }

  get homeOnline(): boolean {
    return this._homeOnline;
  }

  get activeCandidate(): HomeRemoteCandidate | null {
    return this._activeCandidate;
  }

  on(event: string, handler: EventHandler): () => void {
    let set = this.eventHandlers.get(event);
    if (!set) {
      set = new Set();
      this.eventHandlers.set(event, set);
    }
    set.add(handler);
    return () => set?.delete(handler);
  }

  private emit(event: string, data: unknown): void {
    const set = this.eventHandlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(data);
      } catch {
        //
      }
    }
  }

  private setHomeOnline(online: boolean): void {
    if (this._homeOnline === online) return;
    // Suppress offline notifications while a transport upgrade is in
    // flight. The new transport's `connected` event will re-set the
    // online state shortly; we don't want the UI to flicker offline
    // for a few hundred ms in between.
    if (!online && this._upgrading) return;
    this._homeOnline = online;
    this.options.onHomeOnlineChange?.(online);
  }

  private setActiveCandidate(candidate: HomeRemoteCandidate | null): void {
    if (this._activeCandidate?.name === candidate?.name && this._activeCandidate?.url === candidate?.url) {
      return;
    }
    this._activeCandidate = candidate;
    this.options.onActiveTransportChange?.(candidate);
  }

  async ensureConnected(): Promise<void> {
    if (this.disposed) throw new Error("homeRemote.disposed");
    if (this.ws?.readyState === WS_READY_STATE_OPEN) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connectInternal().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async connectInternal(): Promise<void> {
    const candidates = await this.options.resolveCandidates();
    if (this.disposed) throw new Error("homeRemote.disposed");
    if (candidates.length === 0) throw new Error("homeRemote.notConfigured");

    // Start from the first candidate on cold-connect. On reconnect, prefer
    // the same candidate we were using before (it likely just flapped) — the
    // periodic upgrade sweep is responsible for trying higher-priority ones.
    let startIndex = 0;
    if (this._activeCandidate) {
      const idx = candidates.findIndex(
        (c) => c.name === this._activeCandidate?.name && c.url === this._activeCandidate?.url,
      );
      if (idx >= 0) startIndex = idx;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        //
      }
      this.ws = null;
    }

    const perTimeout = this.options.perCandidateTimeoutMs ?? 8_000;
    let lastError: Error | null = null;
    for (let i = startIndex; i < candidates.length; i++) {
      const candidate = candidates[i];
      try {
        await this.openSocket(candidate, perTimeout);
        // Clear any cooldown on this name — the candidate is alive.
        this._probeCooldown.delete(candidate.name);
        this.setActiveCandidate(candidate);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // openSocket's onerror / timer callback already called cleanup()
        // on the failed transport. Clear this.ws so an RPC that races
        // between the failed assignment and the next iteration doesn't
        // try to send on a dead socket.
        this.ws = null;
        // Record the failure so the periodic upgrade sweep backs off
        // this name until the cooldown elapses.
        this._recordProbeFailure(candidate.name);
        // Try the next candidate.
      }
    }
    throw lastError ?? new Error("homeRemote.connectFailed");
  }

  private async openSocket(candidate: HomeRemoteCandidate, perTimeoutMs: number): Promise<void> {
    const ws = await (this.options.createTransport
      ? this.options.createTransport(candidate)
      : Promise.resolve(defaultCreateTransport(candidate)));
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        try {
          ws.close();
        } catch {
          // Best-effort — the transport may already be closed.
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("homeRemote.connectTimeout"));
      }, perTimeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        cleanup();
        reject(new Error("homeRemote.connectFailed"));
      };
    });

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          id?: string;
          result?: unknown;
          error?: { message?: string };
          event?: string;
          data?: unknown;
        };
        if (msg.event) {
          if (msg.event === "connected") {
            this.setHomeOnline(true);
            this.reconnectDelayMs = 1000;
          }
          this.emit(msg.event, msg.data);
          return;
        }
        if (!msg.id) return;
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message ?? "homeRemote.rpcFailed"));
        } else {
          pending.resolve(msg.result);
        }
      } catch {
        //
      }
    };

    ws.onclose = () => {
      this.setHomeOnline(false);
      this.ws = null;
      for (const [, pending] of this.pending) {
        pending.reject(new Error("homeRemote.disconnected"));
      }
      this.pending.clear();
      // Don't clear the active candidate here — on reconnect we want to
      // prefer the same transport if it's still around. The periodic
      // upgrade sweep will switch us off it if a higher-priority candidate
      // becomes reachable.
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      this.setHomeOnline(false);
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnected().catch(() => {
        this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 30_000);
        this.scheduleReconnect();
      });
    }, this.reconnectDelayMs);
  }

  /**
   * Periodically try to upgrade to a higher-priority candidate.
   * Only triggers an actual re-dial if a higher-priority candidate is reachable
   * and the current transport is *not* that candidate.
   *
   * Each higher-priority candidate is rate-limited by `_probeCooldown`:
   * a candidate that failed its last probe won't be retried for an
   * exponentially-growing window (1s, 2s, 4s, ..., capped at 5min).
   * Successful probes clear the cooldown.
   */
  private maybeUpgradeTransport(): void {
    if (this.disposed) return;
    // Only attempt upgrade if we currently have a working transport.
    if (this.ws?.readyState !== WS_READY_STATE_OPEN) return;

    void this.options.resolveCandidates().then((candidates) => {
      if (this.disposed) return;
      const currentIdx = candidates.findIndex(
        (c) => c.name === this._activeCandidate?.name && c.url === this._activeCandidate?.url,
      );
      // No current → no upgrade (let the reconnect logic handle it).
      if (currentIdx <= 0) return;

      // Skip past candidates still in cooldown. We start from the
      // top and advance while the current candidate is in cooldown;
      // the loop stops as soon as we find one that's eligible (no
      // entry, or cooldown elapsed) OR we've exhausted the
      // higher-priority list. We don't probe candidates we skip
      // because if a candidate failed recently it's almost certainly
      // still bad, and the cooldown is the point.
      const now = Date.now();
      let firstEligible = 0;
      while (firstEligible < currentIdx) {
        const c = candidates[firstEligible];
        const entry = this._probeCooldown.get(c.name);
        if (entry) {
          const cooldown = Math.min(entry.lastAttemptAt + this._backoffMs(entry.failures), now + 60_000);
          if (cooldown > now) {
            firstEligible++;
            continue;
          }
        }
        break;
      }
      if (firstEligible >= currentIdx) return;
      void this.tryUpgradeTo(candidates, firstEligible, currentIdx);
    }).catch(() => {
      // Resolver failed; ignore — next sweep will retry.
    });
  }

  /**
   * Backoff schedule for failed probes. Roughly 1s, 2s, 4s, 8s, 16s,
   * 32s, 64s, 128s, 256s, capped at 5 minutes.
   */
  private _backoffMs(failures: number): number {
    return Math.min(1_000 * 2 ** Math.min(failures, 9), 5 * 60_000);
  }

  private async tryUpgradeTo(
    candidates: HomeRemoteCandidate[],
    from: number,
    currentIdx: number,
  ): Promise<void> {
    const perTimeout = this.options.perCandidateTimeoutMs ?? 4_000;
    for (let i = from; i < currentIdx; i++) {
      const candidate = candidates[i];
      const probe = await this.probeCandidate(candidate, perTimeout);
      if (probe) {
        // Successful probe — clear the cooldown for this name.
        this._probeCooldown.delete(candidate.name);
        // We're committing to the upgrade. From here until the new
        // transport's `connected` event arrives, suppress offline
        // notifications so the UI doesn't see a flicker.
        this._upgrading = true;
        try {
          // Close the current WebSocket; onclose will fire, but its
          // setHomeOnline(false) is suppressed while _upgrading is true.
          try {
            this.ws?.close();
          } catch {
            //
          }
          this.ws = null;
          try {
            await this.openSocket(candidate, perTimeout);
            this.setActiveCandidate(candidate);
            this.reconnectDelayMs = 1000;
          } catch {
            // Upgrade failed; reconnect logic will fall back to the old
            // candidate. Record the failure so we back off the next
            // probe for this name.
            this._recordProbeFailure(candidate.name);
            this._upgrading = false;
            this.scheduleReconnect();
          }
        } finally {
          // Whether the new transport succeeded or failed, clear the
          // guard. If the new transport succeeds, the next call to
          // setHomeOnline (e.g. the new socket's `connected` event)
          // will simply re-set the state if it had drifted. If it
          // failed, the reconnect above is now responsible for
          // surfacing the offline state.
          this._upgrading = false;
        }
        return;
      }
      // Probe failed but we still have higher-priority candidates to
      // try. Record the failure so we don't re-probe this name on the
      // very next sweep.
      this._recordProbeFailure(candidate.name);
    }
  }

  private _recordProbeFailure(candidateName: string): void {
    const existing = this._probeCooldown.get(candidateName);
    this._probeCooldown.set(candidateName, {
      lastAttemptAt: Date.now(),
      failures: (existing?.failures ?? 0) + 1,
    });
  }

  /**
   * Attempt a one-shot WebSocket open against a candidate without disturbing
   * the current transport. Returns true on success (and immediately closes
   * the probe socket — the caller will reopen it for real use).
   */
  private async probeCandidate(candidate: HomeRemoteCandidate, timeoutMs: number): Promise<boolean> {
    let ws: WebSocketLike;
    try {
      const maybeWs = this.options.createTransport
        ? this.options.createTransport(candidate)
        : defaultCreateTransport(candidate);
      ws = await Promise.resolve(maybeWs);
    } catch {
      return false;
    }
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          //
        }
        resolve(false);
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          //
        }
        resolve(true);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        resolve(false);
      };
    });
  }

  async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    await this.ensureConnected();
    const ws = this.ws;
    if (!ws || ws.readyState !== WS_READY_STATE_OPEN) {
      throw new Error("homeRemote.notConnected");
    }
    const id = crypto.randomUUID();
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`homeRemote.${method}Timeout`));
      }, TERMINAL_ASSIST_RPC_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async openTerminalTunnel(pathWithQuery: string): Promise<{ ok: boolean; error?: string }> {
    return this.call("homeTerminalWsOpen", { pathWithQuery });
  }

  sendTerminalFrame(bytes: Uint8Array): { ok: boolean; error?: string } {
    const ws = this.ws;
    if (!ws || ws.readyState !== WS_READY_STATE_OPEN) {
      return { ok: false, error: "homeRemote.notConnected" };
    }
    const id = crypto.randomUUID();
    const dataBase64 = Buffer.from(bytes).toString("base64");
    ws.send(JSON.stringify({ id, method: "homeTerminalWsSend", params: { dataBase64 } }));
    return { ok: true };
  }

  sendTerminalInput(text: string): void {
    const bytes = new TextEncoder().encode(text);
    this.sendTerminalFrame(encodeTerminalFrame(TerminalWireType.Stdin, bytes));
  }

  sendTerminalResize(cols: number, rows: number): void {
    this.sendTerminalFrame(encodeTerminalResize(cols, rows));
  }

  closeTerminalTunnel(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WS_READY_STATE_OPEN) return;
    const id = crypto.randomUUID();
    ws.send(JSON.stringify({ id, method: "homeTerminalWsClose", params: {} }));
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.upgradeSweepTimer) {
      clearInterval(this.upgradeSweepTimer);
      this.upgradeSweepTimer = null;
    }
    this._probeCooldown.clear();
    this._upgrading = false;
    for (const [, pending] of this.pending) {
      pending.reject(new Error("homeRemote.disposed"));
    }
    this.pending.clear();
    try {
      this.ws?.close();
    } catch {
      //
    }
    this.ws = null;
    this.setActiveCandidate(null);
    this.setHomeOnline(false);
  }
}

/** Extract `/ws/terminal/...?...` from a loopback attach URL returned by home `terminalAttach`. */
export function terminalPathFromAttachWsUrl(wsUrl: string): string {
  const u = new URL(wsUrl);
  return `${u.pathname}${u.search}`;
}
