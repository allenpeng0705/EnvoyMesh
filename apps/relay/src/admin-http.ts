/**
 * Auth-gated admin API + static file serving for the relay HTTP server.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type AdminCredentials,
  checkBasicAuth,
  sendUnauthorized,
} from "./admin-auth.js";
import type { RelayLogBuffer, RelayLogLevel } from "./relay-log-buffer.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

export interface AdminHttpDeps {
  creds: AdminCredentials | null;
  logBuffer: RelayLogBuffer;
  adminUiRoot: string;
  buildStatus: () => Record<string, unknown> | Promise<Record<string, unknown>>;
  buildReservations: () => Record<string, unknown>;
  buildPeers: () => Record<string, unknown>;
  restartLibp2p: (reason: string) => Promise<void>;
  restartProcess: () => void;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (chunks.reduce((n, c) => n + c.length, 0) > 64 * 1024) {
      throw new Error("request body too large");
    }
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

function safeStaticPath(root: string, urlPath: string): string | null {
  const rel = urlPath.replace(/^\/admin\/?/, "") || "index.html";
  const candidate = normalize(join(root, rel));
  const rootNorm = normalize(root);
  if (candidate !== rootNorm && !candidate.startsWith(rootNorm + sep)) {
    return null;
  }
  return candidate;
}

function serveStatic(
  res: ServerResponse,
  adminUiRoot: string,
  pathname: string,
): void {
  const filePath = safeStaticPath(adminUiRoot, pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    // SPA fallback for /admin and /admin/
    const index = join(adminUiRoot, "index.html");
    if ((pathname === "/admin" || pathname === "/admin/") && existsSync(index)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      createReadStream(index).pipe(res);
      return;
    }
    sendText(res, 404, "Not found");
    return;
  }
  const ext = filePath.slice(filePath.lastIndexOf("."));
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

/**
 * Handle `/admin` and `/admin/*`. Returns true if the request was handled.
 * When credentials are not configured, returns 404 (admin disabled).
 */
export async function handleAdminRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  url: URL,
  deps: AdminHttpDeps,
): Promise<boolean> {
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) {
    return false;
  }

  if (!deps.creds) {
    sendText(
      res,
      404,
      "Admin UI disabled. Set ENVOYMESH_RELAY_ADMIN_USER and ENVOYMESH_RELAY_ADMIN_PASSWORD (or --admin-user / --admin-password).",
    );
    return true;
  }

  if (!checkBasicAuth(req, deps.creds)) {
    sendUnauthorized(res);
    return true;
  }

  if (pathname === "/admin") {
    res.writeHead(302, { Location: "/admin/" });
    res.end();
    return true;
  }

  // API routes
  if (pathname === "/admin/api/status" && req.method === "GET") {
    try {
      sendJson(res, 200, await deps.buildStatus());
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  if (pathname === "/admin/api/reservations" && req.method === "GET") {
    try {
      sendJson(res, 200, deps.buildReservations());
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  if (pathname === "/admin/api/peers" && req.method === "GET") {
    try {
      sendJson(res, 200, deps.buildPeers());
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  if (pathname === "/admin/api/logs" && req.method === "GET") {
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Math.min(2000, Math.max(1, Number(limitRaw) || 200)) : 200;
    const levelParam = (url.searchParams.get("level") ?? "all").toLowerCase();
    const level: RelayLogLevel | "all" =
      levelParam === "log" || levelParam === "warn" || levelParam === "error"
        ? levelParam
        : "all";
    sendJson(res, 200, {
      entries: deps.logBuffer.tail(limit, level),
      size: deps.logBuffer.size(),
    });
    return true;
  }

  if (pathname === "/admin/api/logs/clear" && req.method === "POST") {
    deps.logBuffer.clear({ truncateFile: true });
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === "/admin/api/restart" && req.method === "POST") {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      });
      return true;
    }
    const mode =
      body && typeof body === "object" && "mode" in body
        ? String((body as { mode: unknown }).mode)
        : "";
    if (mode === "libp2p") {
      try {
        await deps.restartLibp2p("admin UI soft restart");
        sendJson(res, 200, { ok: true, mode: "libp2p" });
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return true;
    }
    if (mode === "process") {
      sendJson(res, 200, { ok: true, mode: "process" });
      // Exit after the response flushes so the client sees success.
      setTimeout(() => deps.restartProcess(), 250);
      return true;
    }
    sendJson(res, 400, { error: 'body.mode must be "libp2p" or "process"' });
    return true;
  }

  if (pathname.startsWith("/admin/api/")) {
    sendJson(res, 404, { error: "not found" });
    return true;
  }

  serveStatic(res, deps.adminUiRoot, pathname);
  return true;
}
