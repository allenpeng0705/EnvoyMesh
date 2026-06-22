import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcEvent,
} from "@envoymesh/api";
import { WS_LOOPBACK_URL } from "@envoymesh/api";

import { normalizeLoopbackWsUrl } from "./lib/storage.js";

type EventHandler = (data: unknown) => void;

/**
 * WebSocket client that connects to the node's WsServer and provides
 * a typed interface for NodeService operations.
 */
export type ConnectionChangeHandler = (status: 'connected' | 'disconnected') => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly pendingRequests = new Map<string, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private autoReconnectEnabled = true;
  private readonly maxReconnectDelay = 60000; // 1 minute max
  private lastPong = 0;
  private _statusCallbacks = new Set<ConnectionChangeHandler>();
  private _lastError: string | null = null;
  private _connectTimeout: ReturnType<typeof setTimeout> | null = null;
  /** True after {@link disconnect} — blocks auto-reconnect and stale close handlers. */
  private _disposed = false;

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
    if (!enabled && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
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

  /**
   * Get the last connection error message, if any.
   */
  getLastError(): string | null {
    return this._lastError;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    if (this._disposed) {
      return Promise.reject(new Error("WebSocket client has been disposed"));
    }
    return new Promise((resolve, reject) => {
      let resolved = false;
      try {
        this.ws = new WebSocket(this.url);

        // 15-second connection timeout
        this._connectTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            const isLocalDev = /^ws:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(this.url);
            const err = isLocalDev
              ? "Connection timed out after 15s. Is npm run node:dev running?"
              : "Connection timed out after 15s. Relay may be unreachable.";
            this._lastError = err;
            this.ws.close();
            resolved = true;
            reject(new Error(err));
          }
        }, 15000);

        this.ws.onopen = () => {
          console.log("[ws-client] Connected");
          if (this._connectTimeout) {
            clearTimeout(this._connectTimeout);
            this._connectTimeout = null;
          }
          this.reconnectAttempts = 0;
          this._lastError = null;
          resolved = true;
          // Notify waitForConnection handlers
          const handlers = this.handlers.get("connected");
          if (handlers) {
            handlers.forEach((h) => (h as () => void)());
          }
          // Notify persistent status callbacks
          this._statusCallbacks.forEach((cb) => cb('connected'));
          resolve();
        };

        this.ws.onclose = () => {
          console.log("[ws-client] Disconnected");
          if (this._connectTimeout) {
            clearTimeout(this._connectTimeout);
            this._connectTimeout = null;
          }
          this._statusCallbacks.forEach((cb) => cb("disconnected"));
          if (!resolved) {
            resolved = true;
            const err = this._lastError ?? "WebSocket connection closed before opening";
            reject(new Error(err));
          }
          if (!this._disposed) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = () => {
          const err = `WebSocket error connecting to ${this.url}`;
          console.error("[ws-client]", err);
          this._lastError = err;
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Close the socket without disposing the client (for reconnect / URL change).
   */
  closeConnection(): void {
    if (this._connectTimeout) {
      clearTimeout(this._connectTimeout);
      this._connectTimeout = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.close();
    }
    this._statusCallbacks.forEach((cb) => cb("disconnected"));
  }

  /** Close and reopen; optionally switch URL. Resets disposed state for manual retry. */
  async reconnectTo(url?: string): Promise<void> {
    if (url !== undefined) {
      this.setUrl(url);
    }
    this.closeConnection();
    this._disposed = false;
    await this.connect();
  }

  /**
   * Disconnect from the WebSocket server and dispose the client.
   */
  disconnect(): void {
    this._disposed = true;
    this.closeConnection();
    this.reconnectAttempts = 0;
  }

  /**
   * Wait for the WebSocket to be connected
   */
  async waitForConnection(timeoutMs: number = 10000): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.handlers.delete("connected");
        reject(new Error("Connection timeout"));
      }, timeoutMs);

      const onConnected = () => {
        clearTimeout(timeout);
        this.handlers.delete("connected");
        resolve();
      };

      if (!this.handlers.has("connected")) {
        this.handlers.set("connected", new Set());
      }
      this.handlers.get("connected")!.add(onConnected);

      // Trigger connection if not already trying
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        void this.connect();
      }
    });
  }

  /**
   * Send an RPC request and wait for response
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
      this.pendingRequests.set(id, { resolve: resolve as (result: unknown) => void, reject });

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
   * Subscribe to an event
   */
  on(event: string, handler: EventHandler): () => void {
    let handlers = this.handlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(event, handlers);
    }
    handlers.add(handler);

    // WsServer auto-subscribes connected clients to all push events — local handlers only.

    return () => {
      handlers?.delete(handler);
      if (handlers?.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get reconnection attempts count
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Check if heartbeat is healthy (received pong recently)
   */
  isHeartbeatHealthy(): boolean {
    if (this.lastPong === 0) return true; // No ping expected yet
    return Date.now() - this.lastPong < 60000; // 60 second timeout
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Check if it's a response to our request
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

      // Check if it's an event push
      if ("event" in message && "data" in message) {
        const event = message as JsonRpcEvent;
        const handlers = this.handlers.get(event.event);
        if (handlers) {
          for (const handler of handlers) {
            try {
              handler(event.data);
            } catch (error) {
              console.error(`[ws-client] Error in ${event.event} handler:`, error);
            }
          }
        }
        return;
      }
    } catch (error) {
      console.error("[ws-client] Failed to parse message:", error);
    }
  }

  private scheduleReconnect(): void {
    if (this._disposed || this.reconnectTimer || !this.autoReconnectEnabled) return;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s (cap)
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;

    console.log(`[ws-client] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
}

/**
 * Create a WebSocket client for the node API
 */
export function createWsClient(url?: string): WsClient {
  return new WsClient(url);
}