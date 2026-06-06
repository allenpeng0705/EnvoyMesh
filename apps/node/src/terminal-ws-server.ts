import { createServer, type IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { URL } from "node:url";

import {
  encodeTerminalFrame,
  encodeTerminalExit,
  decodeTerminalFrame,
  TerminalWireType,
} from "@envoymesh/api";
import WebSocket, { WebSocketServer } from "ws";

import type { TerminalManager } from "./terminal-manager.js";

function isLoopbackAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  return remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
}

function parseTerminalPath(pathname: string, pathPrefix: string): { sessionId: string } | null {
  const prefix = pathPrefix.endsWith("/") ? pathPrefix.slice(0, -1) : pathPrefix;
  if (!pathname.startsWith(`${prefix}/`)) return null;
  const sessionId = pathname.slice(prefix.length + 1).split("/")[0]?.trim();
  if (!sessionId) return null;
  return { sessionId };
}

export interface TerminalWsServerOptions {
  port: number;
  pathPrefix?: string;
  manager: TerminalManager;
}

export class TerminalWsServer {
  private readonly port: number;
  private readonly pathPrefix: string;
  private readonly manager: TerminalManager;
  private httpServer: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;

  constructor(options: TerminalWsServerOptions) {
    this.port = options.port;
    this.pathPrefix = options.pathPrefix ?? "/ws/terminal";
    this.manager = options.manager;
  }

  start(): void {
    if (this.httpServer) return;

    this.httpServer = createServer((_req, res) => {
      res.writeHead(426, { "Content-Type": "text/plain" });
      res.end("Upgrade Required");
    });

    this.wss = new WebSocketServer({ noServer: true });

    this.httpServer.on("upgrade", (req, socket, head) => {
      void this.handleUpgrade(req, socket as Socket, head);
    });

    this.httpServer.listen(this.port, "127.0.0.1", () => {
      console.log(`[terminal-ws] Listening on ws://127.0.0.1:${this.port}${this.pathPrefix}/{sessionId}`);
    });
  }

  stop(): void {
    this.wss?.close();
    this.httpServer?.close();
    this.wss = null;
    this.httpServer = null;
  }

  private handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    if (!this.wss) {
      socket.destroy();
      return;
    }

    const remote = req.socket.remoteAddress;
    if (!isLoopbackAddress(remote)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    let pathname = req.url ?? "/";
    let token = "";
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      pathname = url.pathname;
      token = url.searchParams.get("token")?.trim() ?? "";
    } catch {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    const parsed = parseTerminalPath(pathname, this.pathPrefix);
    if (!parsed || !token) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    const { sessionId } = parsed;
    if (!this.manager.validateAttachToken(sessionId, token)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.attachClient(ws, sessionId);
    });
  }

  private attachClient(ws: WebSocket, sessionId: string): void {
    const live = this.manager.getLiveSession(sessionId);
    if (!live || live.summary.state !== "running") {
      ws.close(4404, "session not running");
      return;
    }

    const scrollback = this.manager.getScrollback(sessionId);
    if (scrollback.length > 0) {
      ws.send(Buffer.from(encodeTerminalFrame(TerminalWireType.Stdout, new Uint8Array(scrollback))));
    }

    const unsubscribe = this.manager.subscribeOutput(sessionId, (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(Buffer.from(encodeTerminalFrame(TerminalWireType.Stdout, new Uint8Array(data))));
      }
    });

    ws.on("message", (data, isBinary) => {
      if (!isBinary) return;
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      const frame = decodeTerminalFrame(new Uint8Array(buf));
      if (!frame) {
        ws.close(4400, "invalid frame");
        return;
      }

      try {
        switch (frame.type) {
          case TerminalWireType.Stdin:
            this.manager.writeStdin(sessionId, Buffer.from(frame.payload));
            break;
          case TerminalWireType.Resize: {
            if (frame.payload.length >= 4) {
              const view = new DataView(frame.payload.buffer, frame.payload.byteOffset, frame.payload.byteLength);
              const cols = view.getUint16(0, false);
              const rows = view.getUint16(2, false);
              this.manager.resize(sessionId, cols, rows);
            }
            break;
          }
          case TerminalWireType.Ping:
            ws.send(Buffer.from(encodeTerminalFrame(TerminalWireType.Pong)));
            break;
          default:
            break;
        }
      } catch {
        ws.close(4409, "write failed");
      }
    });

    ws.on("close", () => {
      unsubscribe();
    });

    ws.on("error", () => {
      unsubscribe();
    });

    const checkExit = setInterval(() => {
      const current = this.manager.getLiveSession(sessionId);
      if (!current || current.summary.state !== "running") {
        clearInterval(checkExit);
        if (ws.readyState === WebSocket.OPEN) {
          const code = current?.summary.exitCode ?? 0;
          ws.send(Buffer.from(encodeTerminalExit(code)));
          ws.close(1000, "session exited");
        }
      }
    }, 500);
    ws.on("close", () => clearInterval(checkExit));
  }
}
