import WebSocket, { RawData } from "ws";

import { TERMINAL_WS_PORT } from "./service-ports.js";

const DEFAULT_TERMINAL_WS_PORT = TERMINAL_WS_PORT;

/** Max raw bytes per outbound `homeTerminalWs:rx` push event.
 *  Caps memory + WebSocket text-frame size on the relay hop. */
const MAX_RX_CHUNK_BYTES = 64 * 1024;

interface Session {
  terminal: WebSocket | null;
  sessionId: string;
}

/** Per-companion map of sessionId → Session.
 *  Multiple terminal sessions can be open simultaneously for the
 *  same JSON-RPC companion (e.g. multiple tabs in the social UI,
 *  or a single EnvoyGo session toggling between terminals). */
const sessionsByCompanion = new Map<object, Map<string, Session>>();

function sessionsFor(companion: object): Map<string, Session> {
  let map = sessionsByCompanion.get(companion);
  if (!map) {
    map = new Map();
    sessionsByCompanion.set(companion, map);
  }
  return map;
}

function extractSessionIdFromPath(pathOnly: string): string | null {
  // Expected: /ws/terminal/{sessionId}
  const m = /^\/ws\/terminal\/([^/?#]+)/.exec(pathOnly);
  if (!m) return null;
  const id = m[1]?.trim() ?? "";
  if (!id) return null;
  // Reject path-traversal attempts and any non-UUID-ish input.
  if (id.includes("..") || id.includes("/") || id.includes("\\")) {
    return null;
  }
  return id;
}

/** Close all home→terminal WS for this companion channel (idempotent). */
export function closeHomeTerminalWsForCompanion(companion: object): void {
  const map = sessionsByCompanion.get(companion);
  sessionsByCompanion.delete(companion);
  if (!map) return;
  for (const session of map.values()) {
    if (!session.terminal) continue;
    try {
      if (
        session.terminal.readyState === WebSocket.OPEN ||
        session.terminal.readyState === WebSocket.CONNECTING
      ) {
        session.terminal.close();
      }
    } catch {
      //
    }
    session.terminal = null;
  }
}

/** Close one specific session for this companion (idempotent). */
function closeSession(companion: object, sessionId: string): void {
  const map = sessionsByCompanion.get(companion);
  if (!map) return;
  const session = map.get(sessionId);
  map.delete(sessionId);
  if (map.size === 0) sessionsByCompanion.delete(companion);
  if (!session?.terminal) return;
  try {
    if (
      session.terminal.readyState === WebSocket.OPEN ||
      session.terminal.readyState === WebSocket.CONNECTING
    ) {
      session.terminal.close();
    }
  } catch {
    //
  }
  session.terminal = null;
}

function normalizePathWithQuery(pathWithQuery: string): string {
  const pqRaw = (pathWithQuery ?? "").trim();
  return pqRaw.startsWith("/") ? pqRaw : `/${pqRaw}`;
}

/** Open loopback terminal PTY WS; forwards binary frames as
 *  `homeTerminalWs:rx` pushes.  Each open creates a new
 *  per-session sub-channel identified by `sessionId` (extracted
 *  from the path).  Push events now carry `sessionId` so the
 *  client can demux multiple open sessions on a single companion. */
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
  const sessionId = extractSessionIdFromPath(pathOnly);
  if (!sessionId) {
    return "terminal WebSocket path must include a sessionId";
  }

  // If this companion already has a tunnel for this sessionId,
  // tear it down before opening a new one (re-attach semantics).
  closeSession(companion, sessionId);

  const termWsUrl = `ws://127.0.0.1:${terminalWsPort}${pq}`;
  const terminal = new WebSocket(termWsUrl);
  const map = sessionsFor(companion);
  const session: Session = { terminal, sessionId };
  map.set(sessionId, session);

  terminal.on("message", (data: RawData) => {
    // Ownership check: if a newer `rpcHomeTerminalWsOpen` replaced this
    // session in the map (re-attach for the same companion+sessionId),
    // this `terminal` ws is stale and its events should not be emitted
    // to the companion. The new session's `terminal.on("message")` is
    // the one that's authoritative.
    if (sessionsFor(companion).get(sessionId) !== session) return;
    const buf = Buffer.isBuffer(data)
      ? data
      : data instanceof ArrayBuffer
        ? Buffer.from(data)
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(String(data));
    if (buf.length === 0) return;
    // Cap each push to MAX_RX_CHUNK_BYTES to avoid ballooning the
    // JSON envelope / WebSocket text frame on the relay hop. For a
    // rapid-output pty (e.g. `claude` printing a large diff) the
    // client will see multiple sequential events that it must
    // concatenate — i.e. the chunking is transparent to the client
    // because frames are in-order on a single companion+session.
    for (let offset = 0; offset < buf.length; offset += MAX_RX_CHUNK_BYTES) {
      const slice = buf.subarray(offset, Math.min(offset + MAX_RX_CHUNK_BYTES, buf.length));
      emitToCompanion("homeTerminalWs:rx", {
        sessionId,
        dataBase64: slice.toString("base64"),
      });
    }
  });

  terminal.on("error", (err: unknown) => {
    // Same ownership check as `message` — suppress errors from a stale
    // session that has been replaced in the map.
    if (sessionsFor(companion).get(sessionId) !== session) return;
    console.error("[home-terminal-ws] terminal WS error:", err);
  });

  terminal.on("close", () => {
    // Only emit `homeTerminalWs:closed` if THIS session is still the
    // current owner. If a newer session has taken over the slot, the
    // client's expected `closed` event will come from the new owner's
    // close handler — emitting it here would be a phantom close for
    // the new session.
    if (sessionsFor(companion).get(sessionId) !== session) return;
    emitToCompanion("homeTerminalWs:closed", { sessionId });
    // Clean up the dead terminal ref from the session entry. We do NOT
    // delete the session entry here — the caller is expected to
    // call `closeSession` if it wants the slot freed. This just
    // prevents the dead ws from being kept alive via `session.terminal`.
    session.terminal = null;
  });

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const t = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error("terminal WebSocket open timeout")); }
      }, 25_000);
      terminal.once("open", () => {
        clearTimeout(t);
        // Wait a short grace period to detect immediate server-side close
        // (e.g. PTY server rejecting the attach token).  If the socket
        // closes within 500 ms of opening, treat it as a failure.
        let graceTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
          graceTimer = null;
          if (!settled) { settled = true; resolve(); }
        }, 500);
        terminal.once("close", () => {
          if (graceTimer) {
            clearTimeout(graceTimer);
            graceTimer = null;
            if (!settled) {
              settled = true;
              reject(new Error("terminal WebSocket closed immediately after opening"));
            }
          }
        });
      });
      terminal.once("error", (err: Error) => {
        if (!settled) { settled = true; clearTimeout(t); reject(err); }
      });
    });
  } catch (e: unknown) {
    closeSession(companion, sessionId);
    const msg = e instanceof Error ? e.message : String(e);
    return msg || "failed to connect terminal WebSocket";
  }

  // After successful open + grace period, ensure the terminal is still open.
  if (terminal.readyState !== WebSocket.OPEN) {
    closeSession(companion, sessionId);
    return "terminal WebSocket is no longer open after handshake";
  }
  return null;
}

export function rpcHomeTerminalWsSend(
  companion: object,
  params: { dataBase64: string; sessionId?: string },
): string | null {
  const raw = params.dataBase64 ?? "";
  if (!raw) return "missing dataBase64";
  const map = sessionsByCompanion.get(companion);
  if (!map || map.size === 0) {
    return "terminal WebSocket not connected";
  }
  // Resolve the target session. Older clients (pre-I1) didn't pass
  // sessionId and assumed a single tunnel per companion — accept
  // that for backward compatibility by routing to the only open
  // session.
  const sessionId = params.sessionId?.trim() || "";
  const session = sessionId
    ? map.get(sessionId)
    : map.size === 1
      ? map.values().next().value
      : undefined;
  if (!session?.terminal || session.terminal.readyState !== WebSocket.OPEN) {
    return sessionId
      ? `terminal WebSocket not connected for session ${sessionId}`
      : "terminal WebSocket not connected (multiple sessions open; sessionId required)";
  }
  try {
    session.terminal.send(Buffer.from(raw, "base64"));
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
  return null;
}

export function rpcHomeTerminalWsClose(
  companion: object,
  params: { sessionId?: string } = {},
): void {
  const sessionId = params.sessionId?.trim() || "";
  if (sessionId) {
    closeSession(companion, sessionId);
    return;
  }
  // Backward compat: no sessionId → close all sessions for this companion.
  closeHomeTerminalWsForCompanion(companion);
}
