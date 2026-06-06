import WebSocket, { RawData } from "ws";

import { TERMINAL_WS_PORT } from "./service-ports.js";

const DEFAULT_TERMINAL_WS_PORT = TERMINAL_WS_PORT;

interface Session {
  terminal: WebSocket | null;
}

const sessions = new Map<object, Session>();

function sessionFor(companion: object): Session {
  let s = sessions.get(companion);
  if (!s) {
    s = { terminal: null };
    sessions.set(companion, s);
  }
  return s;
}

/** Close home→terminal WS for this companion channel (idempotent). */
export function closeHomeTerminalWsForCompanion(companion: object): void {
  const s = sessions.get(companion);
  sessions.delete(companion);
  if (!s?.terminal) return;
  try {
    if (s.terminal.readyState === WebSocket.OPEN || s.terminal.readyState === WebSocket.CONNECTING) {
      s.terminal.close();
    }
  } catch {
    //
  }
  s.terminal = null;
}

function normalizePathWithQuery(pathWithQuery: string): string {
  const pqRaw = (pathWithQuery ?? "").trim();
  return pqRaw.startsWith("/") ? pqRaw : `/${pqRaw}`;
}

/** Open loopback terminal PTY WS; forwards binary frames as `homeTerminalWs:rx` pushes. */
export async function rpcHomeTerminalWsOpen(
  companion: object,
  params: { pathWithQuery: string },
  terminalWsPort: number = DEFAULT_TERMINAL_WS_PORT,
  emitToCompanion: (event: string, data: unknown) => void,
): Promise<string | null> {
  const pq = normalizePathWithQuery(params.pathWithQuery ?? "");
  const pathOnly = pq.split("?")[0];
  if (!pathOnly.startsWith("/ws/terminal/")) {
    return "only /ws/terminal paths are allowed for terminal WebSocket tunnel";
  }

  closeHomeTerminalWsForCompanion(companion);

  const termWsUrl = `ws://127.0.0.1:${terminalWsPort}${pq}`;
  const terminal = new WebSocket(termWsUrl);
  sessionFor(companion).terminal = terminal;

  terminal.on("message", (data: RawData) => {
    const buf = Buffer.isBuffer(data)
      ? data
      : data instanceof ArrayBuffer
        ? Buffer.from(data)
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(String(data));
    emitToCompanion("homeTerminalWs:rx", { dataBase64: buf.toString("base64") });
  });

  terminal.on("error", (err: unknown) => {
    console.error("[home-terminal-ws] terminal WS error:", err);
  });

  terminal.on("close", () => {
    emitToCompanion("homeTerminalWs:closed", {});
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("terminal WebSocket open timeout")), 25_000);
      terminal.once("open", () => {
        clearTimeout(t);
        resolve();
      });
      terminal.once("error", (err: Error) => {
        clearTimeout(t);
        reject(err);
      });
    });
  } catch (e: unknown) {
    closeHomeTerminalWsForCompanion(companion);
    const msg = e instanceof Error ? e.message : String(e);
    return msg || "failed to connect terminal WebSocket";
  }

  return null;
}

export function rpcHomeTerminalWsSend(companion: object, params: { dataBase64: string }): string | null {
  const raw = params.dataBase64 ?? "";
  if (!raw) return "missing dataBase64";
  const s = sessions.get(companion);
  if (!s?.terminal || s.terminal.readyState !== WebSocket.OPEN) {
    return "terminal WebSocket not connected";
  }
  try {
    s.terminal.send(Buffer.from(raw, "base64"));
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
  return null;
}

export function rpcHomeTerminalWsClose(companion: object): void {
  closeHomeTerminalWsForCompanion(companion);
}
