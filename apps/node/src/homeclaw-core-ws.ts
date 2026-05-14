import WebSocket, { RawData } from "ws";

import { resolveHomeClawCoreHttpBase } from "./homeclaw-core-proxy.js";

interface Session {
  core: WebSocket | null;
}

const sessions = new Map<WebSocket, Session>();

function sessionFor(companionWs: WebSocket): Session {
  let s = sessions.get(companionWs);
  if (!s) {
    s = { core: null };
    sessions.set(companionWs, s);
  }
  return s;
}

/** Close node→Core WS for this Companion socket (idempotent). */
export function closeHomeClawCoreWsForCompanion(companionWs: WebSocket): void {
  const s = sessions.get(companionWs);
  sessions.delete(companionWs);
  if (!s?.core) {
    return;
  }
  try {
    if (s.core.readyState === WebSocket.OPEN || s.core.readyState === WebSocket.CONNECTING) {
      s.core.close();
    }
  } catch {
    //
  }
  s.core = null;
}

/** Open HomeClaw Core `/ws` from the home node LAN; forwards text frames as `homeclawCoreWs:rx` pushes. Returns error message or null. */
export async function rpcHomeClawCoreWsOpen(
  companionWs: WebSocket,
  params: { pathWithQuery: string },
  persistedCoreHttpBase: string | undefined,
  emitToCompanion: (event: string, data: unknown) => void,
): Promise<string | null> {
  const pqRaw = (params.pathWithQuery ?? "").trim();
  const pq = pqRaw.startsWith("/") ? pqRaw : `/${pqRaw}`;
  const pathOnly = pq.split("?")[0];
  if (pathOnly !== "/ws") {
    return "only /ws path is allowed for Core WebSocket tunnel";
  }

  closeHomeClawCoreWsForCompanion(companionWs);

  const httpBase = resolveHomeClawCoreHttpBase(persistedCoreHttpBase?.trim());
  let uhost: URL;
  try {
    uhost = new URL(httpBase);
  } catch {
    return "invalid HomeClaw Core base URL";
  }
  const wsProto = uhost.protocol === "https:" ? "wss:" : "ws:";
  const coreWsUrl = `${wsProto}//${uhost.host}${pq}`;

  const core = new WebSocket(coreWsUrl);
  sessionFor(companionWs).core = core;

  core.on("message", (data: RawData) => {
    const text =
      typeof data === "string"
        ? data
        : Buffer.isBuffer(data)
          ? data.toString("utf8")
          : Buffer.from(data as ArrayLike<number>).toString("utf8");
    emitToCompanion("homeclawCoreWs:rx", { text });
  });

  core.on("error", (err: unknown) => {
    console.error("[homeclaw-core-ws] Core WS error:", err);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Core WebSocket open timeout")), 25_000);
      core.once("open", () => {
        clearTimeout(t);
        resolve();
      });
      core.once("error", (err: Error) => {
        clearTimeout(t);
        reject(err);
      });
    });
  } catch (e: unknown) {
    closeHomeClawCoreWsForCompanion(companionWs);
    const msg = e instanceof Error ? e.message : String(e);
    return msg || "failed to connect Core WebSocket";
  }

  return null;
}

export function rpcHomeClawCoreWsSend(companionWs: WebSocket, params: { text: string }): string | null {
  const text = params.text ?? "";
  const s = sessions.get(companionWs);
  if (!s?.core || s.core.readyState !== WebSocket.OPEN) {
    return "Core WebSocket not connected";
  }
  try {
    s.core.send(text);
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
  return null;
}

export function rpcHomeClawCoreWsClose(companionWs: WebSocket): void {
  closeHomeClawCoreWsForCompanion(companionWs);
}
