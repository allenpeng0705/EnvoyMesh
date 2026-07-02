import {
  decodeTerminalFrame,
  encodeTerminalFrame,
  encodeTerminalResize,
  TerminalWireType,
  type HomeTerminalWsClosedEvent,
  type HomeTerminalWsRxEvent,
} from "@envoymesh/api";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const i of bytes) s += String.fromCharCode(i);
  return btoa(s);
}

function wsSendBytes(ws: WebSocket, bytes: Uint8Array): void {
  ws.send(bytes as BufferSource);
}

export function terminalPathFromAttachWsUrl(wsUrl: string): string {
  const u = new URL(wsUrl);
  return `${u.pathname}${u.search}`;
}

export function terminalSessionIdFromPath(pathWithQuery: string): string | null {
  const pathOnly = pathWithQuery.split("?")[0] ?? "";
  const m = /^\/ws\/terminal\/([^/?#]+)/.exec(pathOnly);
  const id = m?.[1]?.trim() ?? "";
  return id || null;
}

export interface TerminalTransport {
  connect(): void | Promise<void>;
  sendInput(data: string): void;
  sendResize(cols: number, rows: number): void;
  close(): void;
}

export type TerminalWsStatus = "connecting" | "open" | "closed" | "error";

export interface TerminalWsClientOptions {
  wsUrl: string;
  cols: number;
  rows: number;
  onData: (data: Uint8Array) => void;
  onExit?: (exitCode: number) => void;
  onStatusChange?: (status: TerminalWsStatus) => void;
}

export class TerminalWsClient implements TerminalTransport {
  private ws: WebSocket | null = null;
  private readonly options: TerminalWsClientOptions;

  constructor(options: TerminalWsClientOptions) {
    this.options = options;
  }

  connect(): void {
    this.close();
    this.options.onStatusChange?.("connecting");
    const ws = new WebSocket(this.options.wsUrl);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      this.options.onStatusChange?.("open");
      this.sendResize(this.options.cols, this.options.rows);
    };

    ws.onmessage = (event) => {
      const raw = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : null;
      if (!raw) return;
      const frame = decodeTerminalFrame(raw);
      if (!frame) return;
      if (frame.type === TerminalWireType.Stdout) {
        this.options.onData(frame.payload);
      } else if (frame.type === TerminalWireType.Exit) {
        const code =
          frame.payload.length >= 4
            ? new DataView(frame.payload.buffer, frame.payload.byteOffset, frame.payload.byteLength).getInt32(0, false)
            : 0;
        this.options.onExit?.(code);
      } else if (frame.type === TerminalWireType.Ping) {
        wsSendBytes(ws, encodeTerminalFrame(TerminalWireType.Pong));
      }
    };

    ws.onerror = () => {
      this.options.onStatusChange?.("error");
    };

    ws.onclose = () => {
      this.options.onStatusChange?.("closed");
    };
  }

  sendInput(data: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const bytes = new TextEncoder().encode(data);
    wsSendBytes(this.ws, encodeTerminalFrame(TerminalWireType.Stdin, bytes));
  }

  sendResize(cols: number, rows: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    wsSendBytes(this.ws, encodeTerminalResize(cols, rows));
  }

  close(): void {
    if (!this.ws) return;
    try {
      this.ws.close();
    } catch {
      //
    }
    this.ws = null;
  }
}

export interface HomeRemoteTerminalClientOptions {
  sessionId: string;
  homeTerminalWsOpen(params: { pathWithQuery: string }): Promise<{ ok: boolean; error?: string }>;
  homeTerminalWsSend(params: {
    dataBase64: string;
    sessionId: string;
  }): Promise<{ ok: boolean; error?: string }>;
  homeTerminalWsClose(params: { sessionId: string }): Promise<{ ok: boolean; error?: string }>;
  subscribeRx: (handler: (data: HomeTerminalWsRxEvent) => void) => () => void;
  subscribeClosed: (handler: (data: HomeTerminalWsClosedEvent) => void) => () => void;
  pathWithQuery: string;
  cols: number;
  rows: number;
  onData: (data: Uint8Array) => void;
  onExit?: (exitCode: number) => void;
  onStatusChange?: (status: TerminalWsStatus) => void;
  /** Called when the home closes this session's PTY tunnel (network blip, token expiry, etc.). */
  onTunnelClosed?: () => void;
  onSendError?: (message: string) => void;
}

/** Proactive attach-token refresh while a mobile session stays open (~8 min, token TTL is 10 min). */
export const HOME_REMOTE_TERMINAL_TOKEN_REFRESH_MS = 8 * 60_000;

export class HomeRemoteTerminalClient implements TerminalTransport {
  private unsubRx: (() => void) | null = null;
  private unsubClosed: (() => void) | null = null;
  private readonly options: HomeRemoteTerminalClientOptions;
  private open = false;

  constructor(options: HomeRemoteTerminalClientOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    this.detachLocal();
    this.options.onStatusChange?.("connecting");
    this.unsubRx = this.options.subscribeRx((data) => {
      if (data.sessionId && data.sessionId !== this.options.sessionId) return;
      const frame = decodeTerminalFrame(base64ToBytes(data.dataBase64));
      if (!frame) return;
      if (frame.type === TerminalWireType.Stdout) {
        this.options.onData(frame.payload);
      } else if (frame.type === TerminalWireType.Exit) {
        const code =
          frame.payload.length >= 4
            ? new DataView(frame.payload.buffer, frame.payload.byteOffset, frame.payload.byteLength).getInt32(0, false)
            : 0;
        this.options.onExit?.(code);
      }
    });
    this.unsubClosed = this.options.subscribeClosed((data) => {
      if (data.sessionId && data.sessionId !== this.options.sessionId) return;
      this.open = false;
      this.options.onStatusChange?.("closed");
      this.options.onTunnelClosed?.();
    });

    const result = await this.options.homeTerminalWsOpen({ pathWithQuery: this.options.pathWithQuery });
    if (!result.ok) {
      this.options.onStatusChange?.("error");
      throw new Error(result.error ?? "homeTerminalWsOpen failed");
    }
    this.open = true;
    this.options.onStatusChange?.("open");
    await this.sendFrame(encodeTerminalResize(this.options.cols, this.options.rows));
  }

  sendInput(data: string): void {
    const bytes = new TextEncoder().encode(data);
    void this.sendFrame(encodeTerminalFrame(TerminalWireType.Stdin, bytes));
  }

  sendResize(cols: number, rows: number): void {
    void this.sendFrame(encodeTerminalResize(cols, rows));
  }

  close(): void {
    if (this.open) {
      void this.options.homeTerminalWsClose({ sessionId: this.options.sessionId });
    }
    this.detachLocal();
  }

  private detachLocal(): void {
    this.open = false;
    this.unsubRx?.();
    this.unsubRx = null;
    this.unsubClosed?.();
    this.unsubClosed = null;
  }

  private async sendFrame(frame: Uint8Array): Promise<void> {
    if (!this.open) return;
    const result = await this.options.homeTerminalWsSend({
      dataBase64: bytesToBase64(frame),
      sessionId: this.options.sessionId,
    });
    if (!result.ok) {
      this.open = false;
      this.options.onSendError?.(result.error ?? "homeTerminalWsSend failed");
      this.options.onStatusChange?.("closed");
    }
  }
}
