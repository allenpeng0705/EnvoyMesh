import {
  decodeTerminalFrame,
  encodeTerminalFrame,
  encodeTerminalResize,
  TerminalWireType,
} from "@envoymesh/api";

export type TerminalWsStatus = "connecting" | "open" | "closed" | "error";

export interface TerminalWsClientOptions {
  wsUrl: string;
  cols: number;
  rows: number;
  onData: (data: Uint8Array) => void;
  onExit?: (exitCode: number) => void;
  onStatusChange?: (status: TerminalWsStatus) => void;
}

export class TerminalWsClient {
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
