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
export class WsClient {
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly pendingRequests = new Map<string, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly url: string;

  constructor(url: string = "ws://localhost:3030/ws") {
    this.url = url;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("[ws-client] Connected");
          resolve();
        };

        this.ws.onclose = () => {
          console.log("[ws-client] Disconnected");
          this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error("[ws-client] Error:", error);
          reject(new Error("WebSocket connection failed"));
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
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

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log("[ws-client] Attempting to reconnect...");
      void this.connect();
    }, 5000);
  }
}

/**
 * Create a WebSocket client for the node API
 */
export function createWsClient(url?: string): WsClient {
  return new WsClient(url);
}