import { encodeTerminalFrame, encodeTerminalResize, TerminalWireType } from "@envoymesh/api";

type EventHandler = (data: unknown) => void;

interface PendingRpc {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export interface HomeRemoteClientOptions {
  resolveProxyWsUrl: () => Promise<string | undefined>;
  onHomeOnlineChange?: (online: boolean) => void;
}

/**
 * Persistent relay-proxy WebSocket to the paired home node.
 * Multiplexes JSON-RPC calls and push events (e.g. homeTerminalWs:rx).
 */
export class HomeRemoteClient {
  private ws: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private readonly pending = new Map<string, PendingRpc>();
  private readonly eventHandlers = new Map<string, Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = 1000;
  private disposed = false;
  private _homeOnline = false;

  constructor(private readonly options: HomeRemoteClientOptions) {}

  get homeOnline(): boolean {
    return this._homeOnline;
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
    this._homeOnline = online;
    this.options.onHomeOnlineChange?.(online);
  }

  async ensureConnected(): Promise<void> {
    if (this.disposed) throw new Error("homeRemote.disposed");
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connectInternal().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async connectInternal(): Promise<void> {
    const url = await this.options.resolveProxyWsUrl();
    if (!url) throw new Error("homeRemote.notConfigured");

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        //
      }
      this.ws = null;
    }

    const ws = new WebSocket(url);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("homeRemote.connectTimeout")), 20_000);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
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

  async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    await this.ensureConnected();
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("homeRemote.notConnected");
    }
    const id = crypto.randomUUID();
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`homeRemote.${method}Timeout`));
      }, 60_000);
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
    if (!ws || ws.readyState !== WebSocket.OPEN) {
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
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const id = crypto.randomUUID();
    ws.send(JSON.stringify({ id, method: "homeTerminalWsClose", params: {} }));
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
    this.setHomeOnline(false);
  }
}

/** Extract `/ws/terminal/...?...` from a loopback attach URL returned by home `terminalAttach`. */
export function terminalPathFromAttachWsUrl(wsUrl: string): string {
  const u = new URL(wsUrl);
  return `${u.pathname}${u.search}`;
}
