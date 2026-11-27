import type {
  JsonRpcRequest,
  JsonRpcEvent,
} from "@envoymesh/api";
import { WS_LOOPBACK_URL } from "@envoymesh/api";

import { normalizeLoopbackWsUrl } from "./lib/storage.js";

type EventHandler = (data: unknown) => void;

/**
 * WebSocket client that connects to the node's WsServer and provides
 * a typed interface for NodeService operations.
 */
export type ConnectionChangeHandler = (status: "connected" | "disconnected") => void;

const LOOPBACK_WS_RE = /^ws:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i;

/** Exported for tests. */
export function isLoopbackWsUrl(url: string): boolean {
  return LOOPBACK_WS_RE.test(url);
}

/** Exported for tests — exponential backoff with loopback vs remote caps. */
export function computeReconnectDelayMs(
  attempts: number,
  opts: { loopback: boolean; jitterRatio?: number; random?: () => number },
): number {
  const cap = opts.loopback ? 8_000 : 60_000;
  const base = Math.min(1000 * Math.pow(2, Math.max(0, attempts)), cap);
  const jitterRatio = opts.jitterRatio ?? 0.2;
  const random = opts.random ?? Math.random;
  const jitter = base * jitterRatio * random();
  return Math.round(base + jitter);
}

export class WsClient {
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private autoReconnectEnabled = true;
  private _statusCallbacks = new Set<ConnectionChangeHandler>();
  private _lastError: string | null = null;
  private _connectTimeout: ReturnType<typeof setTimeout> | null = null;
  /** True after {@link disconnect} — blocks auto-reconnect and stale close handlers. */
  private _disposed = false;
  /** Prevents overlapping connect() sockets. */
  private _connecting = false;
  /** Bumped so orphaned socket handlers become no-ops. */
  private _connectGeneration = 0;
  private lastActivityAt = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatInFlight = false;
  private nextReconnectAt: number | null = null;
  private wakeUnsub: (() => void) | null = null;

  constructor(url: string = WS_LOOPBACK_URL) {
    this.url = normalizeLoopbackWsUrl(url);
  }

  /** Update the target WebSocket URL (applied on next connect/reconnect). */
  setUrl(url: string): void {
    this.url = normalizeLoopbackWsUrl(url.trim() || this.url);
  }

  /** When false, connection drops are not auto-retried (manual connect only). */
  setAutoReconnectEnabled(enabled: boolean): void {
    this.autoReconnectEnabled = enabled;
    if (!enabled) {
      this.clearReconnectTimer();
    }
  }

  /**
   * Register a persistent callback for connection state changes.
   * Returns an unsubscribe function.
   */
  onStatusChange(cb: ConnectionChangeHandler): () => void {
    this._statusCallbacks.add(cb);
    if (this.ws?.readyState === WebSocket.OPEN) {
      cb("connected");
    }
    return () => {
      this._statusCallbacks.delete(cb);
    };
  }

  /** Get the last connection error message, if any. */
  getLastError(): string | null {
    return this._lastError;
  }

  /**
   * Ms until the next scheduled auto-reconnect, or `null` if none pending.
   */
  getNextReconnectDelayMs(): number | null {
    if (this.nextReconnectAt == null) return null;
    return Math.max(0, this.nextReconnectAt - Date.now());
  }

  private isLoopback(): boolean {
    return isLoopbackWsUrl(this.url);
  }

  private connectTimeoutMs(): number {
    return this.isLoopback() ? 8_000 : 15_000;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.nextReconnectAt = null;
  }

  private clearConnectTimeout(): void {
    if (this._connectTimeout) {
      clearTimeout(this._connectTimeout);
      this._connectTimeout = null;
    }
  }

  /**
   * Connect to the WebSocket server.
   */
  connect(): Promise<void> {
    if (this._disposed) {
      return Promise.reject(new Error("WebSocket client has been disposed"));
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    // Share an in-flight handshake instead of opening a second socket.
    if (this._connecting && this.ws?.readyState === WebSocket.CONNECTING) {
      return this.waitForConnection(this.connectTimeoutMs() + 1_000);
    }

    this.clearReconnectTimer();
    this.detachSocket({ notify: false, scheduleReconnect: false });

    this._connecting = true;
    const generation = ++this._connectGeneration;

    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        const socket = new WebSocket(this.url);
        this.ws = socket;

        const timeoutMs = this.connectTimeoutMs();
        this._connectTimeout = setTimeout(() => {
          if (generation !== this._connectGeneration) return;
          if (socket.readyState === WebSocket.OPEN) return;
          const err = this.isLoopback()
            ? `Connection timed out after ${Math.round(timeoutMs / 1000)}s. Is the home node running?`
            : `Connection timed out after ${Math.round(timeoutMs / 1000)}s. Relay may be unreachable.`;
          this._lastError = err;
          try {
            socket.close();
          } catch {
            /* ignore */
          }
          if (!settled) {
            settled = true;
            this._connecting = false;
            reject(new Error(err));
          }
        }, timeoutMs);

        socket.onopen = () => {
          if (generation !== this._connectGeneration) return;
          console.log("[ws-client] Connected");
          this.clearConnectTimeout();
          this._connecting = false;
          this.reconnectAttempts = 0;
          this.nextReconnectAt = null;
          this._lastError = null;
          this.lastActivityAt = Date.now();
          this.startHeartbeat();
          this.ensureWakeHandlers();
          if (!settled) {
            settled = true;
            resolve();
          }
          const handlers = this.handlers.get("connected");
          if (handlers) {
            handlers.forEach((h) => (h as () => void)());
          }
          this._statusCallbacks.forEach((cb) => cb("connected"));
        };

        socket.onclose = () => {
          if (generation !== this._connectGeneration) return;
          console.log("[ws-client] Disconnected");
          this.clearConnectTimeout();
          this._connecting = false;
          this.stopHeartbeat();
          if (this.ws === socket) {
            this.ws = null;
          }
          this.rejectPendingRequests("WebSocket disconnected");
          this._statusCallbacks.forEach((cb) => cb("disconnected"));
          if (!settled) {
            settled = true;
            const err =
              this._lastError ?? "WebSocket connection closed before opening";
            reject(new Error(err));
          }
          if (!this._disposed) {
            this.scheduleReconnect();
          }
        };

        socket.onerror = () => {
          if (generation !== this._connectGeneration) return;
          const err = `WebSocket error connecting to ${this.url}`;
          console.error("[ws-client]", err);
          this._lastError = err;
        };

        socket.onmessage = (event) => {
          if (generation !== this._connectGeneration) return;
          this.lastActivityAt = Date.now();
          this.handleMessage(String(event.data));
        };
      } catch (error) {
        this._connecting = false;
        reject(error);
      }
    });
  }

  /**
   * Detach the current socket without disposing the client.
   */
  private detachSocket(opts: {
    notify: boolean;
    scheduleReconnect: boolean;
  }): void {
    this.clearConnectTimeout();
    this.stopHeartbeat();
    this._connecting = false;
    // Invalidate in-flight handlers before closing.
    this._connectGeneration++;
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onopen = null;
      socket.onmessage = null;
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    }
    this.rejectPendingRequests("WebSocket disconnected");
    if (opts.notify) {
      this._statusCallbacks.forEach((cb) => cb("disconnected"));
    }
    if (opts.scheduleReconnect && !this._disposed) {
      this.scheduleReconnect();
    }
  }

  /**
   * Close the socket without disposing the client (for reconnect / URL change).
   */
  closeConnection(): void {
    this.clearReconnectTimer();
    this.detachSocket({ notify: true, scheduleReconnect: false });
  }

  /**
   * Close and reopen; optionally switch URL. Resets disposed state and backoff
   * so manual Retry is always immediate.
   */
  async reconnectTo(url?: string): Promise<void> {
    if (url !== undefined) {
      this.setUrl(url);
    }
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.closeConnection();
    this._disposed = false;
    await this.connect();
  }

  /**
   * Wake / focus / online: drop backoff and reconnect now when the socket is
   * down. When still "OPEN" but idle after sleep, probe immediately.
   */
  nudgeReconnect(reason = "wake"): void {
    if (this._disposed || !this.autoReconnectEnabled) return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      const idle = Date.now() - this.lastActivityAt;
      if (idle > 20_000) {
        console.log(`[ws-client] Nudge (${reason}): probing idle socket`);
        void this.runHeartbeatProbe({ force: true });
      }
      return;
    }
    if (this._connecting && this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }
    console.log(`[ws-client] Nudge (${reason}): reconnecting now`);
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    void this.connect();
  }

  /**
   * Disconnect from the WebSocket server and dispose the client.
   */
  disconnect(): void {
    this._disposed = true;
    this.clearReconnectTimer();
    this.teardownWakeHandlers();
    this.detachSocket({ notify: true, scheduleReconnect: false });
    this.reconnectAttempts = 0;
  }

  /**
   * Wait for the WebSocket to be connected.
   */
  async waitForConnection(timeoutMs: number = 10000): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        handlers?.delete(onConnected);
        reject(new Error("Connection timeout"));
      }, timeoutMs);

      const onConnected = () => {
        clearTimeout(timeout);
        handlers?.delete(onConnected);
        resolve();
      };

      if (!this.handlers.has("connected")) {
        this.handlers.set("connected", new Set());
      }
      const handlers = this.handlers.get("connected")!;
      handlers.add(onConnected);

      const state = this.ws?.readyState;
      if (
        !this._connecting &&
        (this.ws == null ||
          state === WebSocket.CLOSED ||
          state === WebSocket.CLOSING)
      ) {
        void this.connect().catch(() => {
          /* onclose schedules / rejects; wait uses connected handler */
        });
      }
    });
  }

  /**
   * Send an RPC request and wait for response.
   */
  async rpc<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    opts?: { timeoutMs?: number },
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to server");
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
      });

      const request: JsonRpcRequest = { id, method, params };
      this.ws!.send(JSON.stringify(request));

      const timeoutMs = opts?.timeoutMs ?? 30_000;
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
    });
  }

  /**
   * Subscribe to an event.
   */
  on(event: string, handler: EventHandler): () => void {
    let handlers = this.handlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(event, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers?.delete(handler);
      if (handlers?.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /** True when a recent frame or heartbeat probe succeeded. */
  isHeartbeatHealthy(): boolean {
    if (!this.isConnected()) return false;
    if (this.lastActivityAt === 0) return true;
    const limit = this.isLoopback() ? 60_000 : 90_000;
    return Date.now() - this.lastActivityAt < limit;
  }

  private rejectPendingRequests(reason: string): void {
    if (this.pendingRequests.size === 0) return;
    const pending = [...this.pendingRequests.entries()];
    this.pendingRequests.clear();
    for (const [, handlers] of pending) {
      handlers.reject(new Error(reason));
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if ("id" in message && message.id) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          this.pendingRequests.delete(message.id);
          if (message.error) {
            pending.reject(new Error(message.error.message));
          } else {
            pending.resolve(message.result);
          }
        }
        return;
      }

      if ("event" in message && "data" in message) {
        const event = message as JsonRpcEvent;
        const handlers = this.handlers.get(event.event);
        if (handlers) {
          for (const handler of handlers) {
            try {
              handler(event.data);
            } catch (error) {
              console.error(
                `[ws-client] Error in ${event.event} handler:`,
                error,
              );
            }
          }
        }
      }
    } catch (error) {
      console.error("[ws-client] Failed to parse message:", error);
    }
  }

  private scheduleReconnect(): void {
    if (this._disposed || this.reconnectTimer || !this.autoReconnectEnabled) {
      return;
    }

    const delay = computeReconnectDelayMs(this.reconnectAttempts, {
      loopback: this.isLoopback(),
    });
    this.reconnectAttempts++;
    this.nextReconnectAt = Date.now() + delay;

    console.log(
      `[ws-client] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.nextReconnectAt = null;
      void this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const intervalMs = this.isLoopback() ? 15_000 : 20_000;
    this.heartbeatTimer = setInterval(() => {
      void this.runHeartbeatProbe({ force: false });
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatInFlight = false;
  }

  /**
   * Cheap liveness probe (`getNodeStatus`). Recycles the socket on failure so
   * half-open connections after sleep/wake do not sit forever.
   */
  private async runHeartbeatProbe(opts: { force: boolean }): Promise<void> {
    if (!this.isConnected() || this._disposed || this.heartbeatInFlight) return;
    const staleAfter = this.isLoopback() ? 35_000 : 50_000;
    const idle = Date.now() - this.lastActivityAt;
    if (!opts.force && idle < staleAfter) return;

    this.heartbeatInFlight = true;
    try {
      await this.rpc("getNodeStatus", {}, { timeoutMs: 8_000 });
      this.lastActivityAt = Date.now();
    } catch (error) {
      console.warn("[ws-client] Heartbeat failed — recycling socket", error);
      this._lastError = "Connection went idle — reconnecting…";
      this.reconnectAttempts = 0;
      this.clearReconnectTimer();
      this.detachSocket({ notify: true, scheduleReconnect: false });
      if (!this._disposed && this.autoReconnectEnabled) {
        void this.connect();
      }
    } finally {
      this.heartbeatInFlight = false;
    }
  }

  private ensureWakeHandlers(): void {
    if (typeof window === "undefined" || this.wakeUnsub) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        this.nudgeReconnect("visibility");
      }
    };
    const onOnline = () => this.nudgeReconnect("online");
    const onFocus = () => this.nudgeReconnect("focus");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    this.wakeUnsub = () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
    };
  }

  private teardownWakeHandlers(): void {
    this.wakeUnsub?.();
    this.wakeUnsub = null;
  }
}

/**
 * Create a WebSocket client for the node API.
 */
export function createWsClient(url?: string): WsClient {
  return new WsClient(url);
}
