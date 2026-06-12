/**
 * Home node → relay WebSocket tunnel client (TURN-like, for NAT-traversal).
 *
 * The home node dials OUT to the relay's `/ws/home?peerId=<homePeerId>` endpoint
 * and keeps the connection alive. The relay stores this connection keyed by
 * peer ID. When a mobile client connects to the relay's `/ws?target=<homePeerId>`
 * endpoint, the relay bridges the mobile's traffic through this tunnel to the
 * home node, which opens a local ws-server connection (port 3030) to handle
 * the JSON-RPC. This lets pairing work even when the home node is behind NAT
 * and cannot be reached by direct libp2p dial.
 *
 * Protocol frames (all JSON text frames):
 *
 *   relay → home:
 *     { type: "open", channelId, token, targetPeerId }
 *       Ask home to open a new local ws-server connection for `channelId`.
 *       The `token` is the pairing token from the QR; the home node validates
 *       it on the first RPC call (pairSharedIdentity).
 *     { type: "data", channelId, data: <text> }
 *       Forward `data` (a JSON-RPC message from the mobile) to the local
 *       ws-server connection for `channelId`.
 *     { type: "close", channelId }
 *       Close the local connection for `channelId` (e.g. mobile disconnected).
 *
 *   home → relay:
 *     { type: "open-ack", channelId }
 *       Local ws-server connection for `channelId` is open and ready.
 *     { type: "data", channelId, data: <text> }
 *       Forward `data` (a JSON-RPC response or push event from the home) to
 *       the mobile client on the relay.
 *     { type: "close", channelId }
 *       Local connection closed (e.g. ws-server closed the connection).
 */

import { WebSocket } from "ws";

export interface RelayTunnelClientOptions {
  /** Relay base WebSocket URL, e.g. `ws://47.93.11.212:15432/ws`. */
  relayWsUrl: string;
  /** This home node's libp2p peer ID. */
  homePeerId: string;
  /** Local ws-server URL to bridge mobile traffic to, e.g. `ws://127.0.0.1:3030/ws`. */
  localWsServerUrl: string;
  /** Optional token for /ws/home (used when relay requires it). */
  authToken?: string;
  /** Diagnostic log sink. */
  log?: (msg: string) => void;
}

interface OpenChannel {
  channelId: string;
  localWs: WebSocket;
  /** Mobile messages received before the local ws-server connection was open. */
  pendingData: string[];
  /** True once the local ws-server connection has been opened. */
  localReady: boolean;
}

export class RelayTunnelClient {
  private readonly opts: RelayTunnelClientOptions;
  private tunnelWs: WebSocket | null = null;
  private readonly channels = new Map<string, OpenChannel>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = 1000;
  private disposed = false;
  private connected = false;

  constructor(opts: RelayTunnelClientOptions) {
    this.opts = opts;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  start(): void {
    if (this.disposed) return;
    this.connect();
  }

  stop(): void {
    this.disposed = true;
    this._stopKeepalive();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.tunnelWs) {
      try { this.tunnelWs.close(); } catch { /* ignore */ }
      this.tunnelWs = null;
    }
    for (const ch of this.channels.values()) {
      try { ch.localWs.close(); } catch { /* ignore */ }
    }
    this.channels.clear();
  }

  private connect(): void {
    if (this.disposed) return;
    if (this.tunnelWs) return;
    const url = new URL(this.opts.relayWsUrl);
    url.pathname = "/ws/home";
    const params = new URLSearchParams();
    params.set("peerId", this.opts.homePeerId);
    if (this.opts.authToken) params.set("token", this.opts.authToken);
    url.search = `?${params.toString()}`;
    const ws = new WebSocket(url.toString());
    this.tunnelWs = ws;

    ws.on("open", () => {
      this.connected = true;
      // Reset delay on successful connect - connection is stable.
      this.reconnectDelayMs = 1000;
      this.opts.log?.(`[relay-tunnel] connected to ${url.toString()}`);
      // Start keepalive ping to detect dead connections.
      this._startKeepalive();
    });

    ws.on("message", (raw) => {
      this.handleTunnelMessage(raw);
    });

    ws.on("close", (code, reason) => {
      this.connected = false;
      this.tunnelWs = null;
      this._stopKeepalive();
      this.opts.log?.(`[relay-tunnel] disconnected code=${code} reason=${reason?.toString() ?? ""}`);
      // Close all channels.
      for (const ch of this.channels.values()) {
        try { ch.localWs.close(); } catch { /* ignore */ }
      }
      this.channels.clear();
      this.scheduleReconnect();
    });

    ws.on("error", (err) => {
      this.opts.log?.(`[relay-tunnel] error: ${err.message}`);
    });

    ws.on("pong", () => {
      // Pong received - connection is alive. No logging needed.
    });
  }

  private _keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  private _startKeepalive(): void {
    this._stopKeepalive();
    // Send ping every 15 seconds to keep connection alive and detect dead connections.
    this._keepaliveTimer = setInterval(() => {
      if (this.tunnelWs && this.tunnelWs.readyState === WebSocket.OPEN) {
        this.tunnelWs.ping();
        // Only log on error, not every ping.
      }
    }, 15_000);
  }

  private _stopKeepalive(): void {
    if (this._keepaliveTimer) {
      clearInterval(this._keepaliveTimer);
      this._keepaliveTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.reconnectTimer) return;
    const delay = this.reconnectDelayMs;
    // Exponential backoff, but cap at 30 seconds.
    // Don't increase delay too much - we want to reconnect quickly.
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 30_000);
    this.opts.log?.(`[relay-tunnel] scheduling reconnect in ${delay}ms (attempt ${++this._reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private _reconnectAttempts = 0;

  private handleTunnelMessage(raw: unknown): void {
    const text = typeof raw === "string"
      ? raw
      : Buffer.isBuffer(raw as Buffer)
        ? (raw as Buffer).toString("utf-8")
        : Array.isArray(raw)
          ? Buffer.concat(raw as Buffer[]).toString("utf-8")
          : new TextDecoder().decode(new Uint8Array(raw as ArrayBuffer));
    let env: { type?: string; channelId?: string; data?: string; token?: string; targetPeerId?: string };
    try {
      env = JSON.parse(text);
    } catch {
      this.opts.log?.(`[relay-tunnel] ignoring non-JSON frame`);
      return;
    }

    if (env.type === "home-tunnel-ack") {
      this.opts.log?.(`[relay-tunnel] ack received`);
      return;
    }

    if (env.type === "open" && typeof env.channelId === "string") {
      this.openChannel(env.channelId, env.token ?? "").catch((err) => {
        this.opts.log?.(`[relay-tunnel] failed to open channel ${env.channelId}: ${err.message}`);
        this.sendTunnelFrame({ type: "close", channelId: env.channelId });
      });
      return;
    }

    if (env.type === "data" && typeof env.channelId === "string" && typeof env.data === "string") {
      const ch = this.channels.get(env.channelId);
      if (!ch) return;
      if (!ch.localReady) {
        ch.pendingData.push(env.data);
        return;
      }
      try {
        ch.localWs.send(env.data);
      } catch (err) {
        this.opts.log?.(`[relay-tunnel] local send failed for ${env.channelId}: ${(err as Error).message}`);
      }
      return;
    }

    if (env.type === "close" && typeof env.channelId === "string") {
      const ch = this.channels.get(env.channelId);
      if (ch) {
        try { ch.localWs.close(); } catch { /* ignore */ }
        this.channels.delete(env.channelId);
      }
      return;
    }
  }

  private async openChannel(channelId: string, _token: string): Promise<void> {
    // Open a NEW local WebSocket to the home node's own ws-server (port 3030).
    // From the ws-server's perspective, this is a normal client connection
    // that it handles as JSON-RPC. The pairing token is validated by the
    // home node's pairSharedIdentity handler at the RPC level.
    const localWs = new WebSocket(this.opts.localWsServerUrl, {
      headers: {
        "x-relay-channel": channelId,
      },
    });

    const ch: OpenChannel = {
      channelId,
      localWs,
      pendingData: [],
      localReady: false,
    };
    this.channels.set(channelId, ch);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("local ws open timeout")), 10_000);
      localWs.once("open", () => {
        clearTimeout(timer);
        ch.localReady = true;
        this.sendTunnelFrame({ type: "open-ack", channelId });
        this.opts.log?.(`[relay-tunnel] local ws-server connection open for channel ${channelId.slice(0, 8)}…`);
        // Flush any pending data that arrived before the local connection
        // was ready.
        for (const data of ch.pendingData) {
          try { localWs.send(data); } catch { /* ignore */ }
        }
        ch.pendingData.length = 0;
        resolve();
      });
      localWs.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    // Wire up forwarding from local ws-server → tunnel → relay → mobile.
    localWs.on("message", (data) => {
      const text = Buffer.isBuffer(data as Buffer)
        ? (data as Buffer).toString("utf-8")
        : Array.isArray(data)
          ? Buffer.concat(data as Buffer[]).toString("utf-8")
          : typeof data === "string"
            ? data
            : new TextDecoder().decode(new Uint8Array(data as ArrayBuffer));
      this.sendTunnelFrame({ type: "data", channelId, data: text });
    });

    localWs.on("close", () => {
      this.sendTunnelFrame({ type: "close", channelId });
      this.channels.delete(channelId);
    });

    localWs.on("error", (err) => {
      this.opts.log?.(`[relay-tunnel] local ws error for ${channelId}: ${err.message}`);
    });
  }

  private sendTunnelFrame(obj: unknown): void {
    const ws = this.tunnelWs;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(obj));
    } catch { /* ignore */ }
  }
}
