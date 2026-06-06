import {
  decodeTerminalFrame,
  encodeTerminalFrame,
  encodeTerminalResize,
  TerminalWireType,
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

export function terminalPathFromAttachWsUrl(wsUrl: string): string {
  const u = new URL(wsUrl);
  return `${u.pathname}${u.search}`;
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
        ws.send(encodeTerminalFrame(TerminalWireType.Pong));
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
    this.ws.send(encodeTerminalFrame(TerminalWireType.Stdin, bytes));
  }

  sendResize(cols: number, rows: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(encodeTerminalResize(cols, rows));
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
  homeTerminalWsOpen(params: { pathWithQuery: string }): Promise<{ ok: boolean; error?: string }>;
  homeTerminalWsSend(params: { dataBase64: string }): Promise<{ ok: boolean; error?: string }>;
  homeTerminalWsClose(): Promise<{ ok: boolean }>;
  subscribeRx: (handler: (data: { dataBase64: string }) => void) => () => void;
  subscribeClosed: (handler: () => void) => () => void;
  pathWithQuery: string;
  cols: number;
  rows: number;
  onData: (data: Uint8Array) => void;
  onExit?: (exitCode: number) => void;
  onStatusChange?: (status: TerminalWsStatus) => void;
}

export class HomeRemoteTerminalClient implements TerminalTransport {
  private unsubRx: (() => void) | null = null;
  private unsubClosed: (() => void) | null = null;
  private readonly options: HomeRemoteTerminalClientOptions;

  constructor(options: HomeRemoteTerminalClientOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    this.close();
    this.options.onStatusChange?.("connecting");
    this.unsubRx = this.options.subscribeRx((data) => {
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
    this.unsubClosed = this.options.subscribeClosed(() => {
      this.options.onStatusChange?.("closed");
    });

    const result = await this.options.homeTerminalWsOpen({ pathWithQuery: this.options.pathWithQuery });
    if (!result.ok) {
      this.options.onStatusChange?.("error");
      throw new Error(result.error ?? "homeTerminalWsOpen failed");
    }
    this.options.onStatusChange?.("open");
    this.sendResize(this.options.cols, this.options.rows);
  }

  sendInput(data: string): void {
    const bytes = new TextEncoder().encode(data);
    const frame = encodeTerminalFrame(TerminalWireType.Stdin, bytes);
    void this.options.homeTerminalWsSend({ dataBase64: bytesToBase64(frame) });
  }

  sendResize(cols: number, rows: number): void {
    const frame = encodeTerminalResize(cols, rows);
    void this.options.homeTerminalWsSend({ dataBase64: bytesToBase64(frame) });
  }

  close(): void {
    this.unsubRx?.();
    this.unsubRx = null;
    this.unsubClosed?.();
    this.unsubClosed = null;
    void this.options.homeTerminalWsClose();
  }
}
