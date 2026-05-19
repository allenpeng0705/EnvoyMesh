import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcEvent,
} from "@envoymesh/api";

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
  private readonly url: string;
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 60000; // 1 minute max
  private lastPong = 0;
  private _statusCallbacks = new Set<ConnectionChangeHandler>();
  private _lastError: string | null = null;
  private _connectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string = "ws://localhost:3030/ws") {
    this.url = url;
  }

  /**
   * Register a persistent callback for connection state changes.
   * Returns an unsubscribe function.
   */
  onStatusChange(cb: ConnectionChangeHandler): () => void {
    this._statusCallbacks.add(cb);
    return () => { this._statusCallbacks.delete(cb); };
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
    return new Promise((resolve, reject) => {
      let resolved = false;
      try {
        this.ws = new WebSocket(this.url);

        // 15-second connection timeout
        this._connectTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            const err = "Connection timed out after 15s. Relay may be unreachable.";
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
          // Notify persistent status callbacks
          this._statusCallbacks.forEach((cb) => cb('disconnected'));
          // If onopen never fired (e.g. connection refused), reject the promise
          if (!resolved) {
            resolved = true;
            reject(new Error("WebSocket connection closed before opening"));
          }
          this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error("[ws-client] Error:", error);
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
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this._connectTimeout) {
      clearTimeout(this._connectTimeout);
      this._connectTimeout = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = 0;
    // Notify persistent status callbacks
    this._statusCallbacks.forEach((cb) => cb('disconnected'));
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
  async rpc<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to server");
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (result: unknown) => void, reject });

      const request: JsonRpcRequest = { id, method, params };
      this.ws!.send(JSON.stringify(request));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} timed out`));
        }
      }, 30000);
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

    // Tell server we want this event
    void this.rpc("on", { event });

    // Return unsubscribe function
    return () => {
      handlers?.delete(handler);
      if (handlers?.size === 0) {
        this.handlers.delete(event);
        void this.rpc("off", { event });
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
    if (this.reconnectTimer) return;

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