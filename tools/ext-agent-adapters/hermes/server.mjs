#!/usr/bin/env node
/**
 * Hermes Ext Agent sidecar — Bridge Protocol v1 (envoymesh-message).
 *
 * POST /message  — inbound chat from EnvoyMesh bridge
 * GET  /status   — health probe ({ "status": "OK" })
 *
 * Env:
 *   PORT          — listen port (default 8020)
 *   BRIDGE_URL    — e.g. http://127.0.0.1:3031/bridge/send
 *   BRIDGE_SECRET — Bearer token for /bridge/send (optional)
 *   HERMES_CMD    — shell command template; placeholders: {text} {fromOwnerId} {from}
 *                   Example: hermes chat --stdin
 *                   When unset, uses echo backend (dev/CI only).
 */

import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT ?? 8020);
const BRIDGE_URL = process.env.BRIDGE_URL ?? "http://127.0.0.1:3031/bridge/send";
const BRIDGE_SECRET = process.env.BRIDGE_SECRET?.trim() ?? "";
const HERMES_CMD = process.env.HERMES_CMD?.trim() ?? "";

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function runHermes(msg) {
  if (!HERMES_CMD) {
    return `[Hermes echo] ${msg.text}`;
  }
  const cmd = HERMES_CMD
    .replaceAll("{text}", msg.text)
    .replaceAll("{fromOwnerId}", msg.fromOwnerId ?? "")
    .replaceAll("{from}", msg.from ?? "");
  const { stdout } = await execFileAsync("sh", ["-c", cmd], {
    timeout: 300_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout.trim() || "(empty reply from HERMES_CMD)";
}

async function replyToBridge(to, text) {
  const headers = { "Content-Type": "application/json" };
  if (BRIDGE_SECRET) headers.Authorization = `Bearer ${BRIDGE_SECRET}`;
  const res = await fetch(BRIDGE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ to, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`bridge/send ${res.status}: ${body}`);
  }
}

const server = http.createServer(async (req, res) => {
  const path = (req.url ?? "").split("?")[0] ?? "";

  if (req.method === "GET" && path === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "OK", backend: HERMES_CMD ? "hermes-cmd" : "echo" }));
    return;
  }

  if (req.method !== "POST" || path !== "/message") {
    res.writeHead(404).end();
    return;
  }

  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw);
    const from = body.from;
    const fromOwnerId = body.fromOwnerId;
    const text = body.text;
    if (typeof from !== "string" || typeof text !== "string" || !text.trim()) {
      res.writeHead(400).end(JSON.stringify({ ok: false, reason: "from and text required" }));
      return;
    }

    const replyText = await runHermes({
      from,
      fromOwnerId: typeof fromOwnerId === "string" ? fromOwnerId : "",
      text,
    });

    void replyToBridge(from, replyText).catch((err) => {
      console.error("[hermes-sidecar] bridge send failed:", err.message ?? err);
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error("[hermes-sidecar] error:", err);
    res.writeHead(500).end(JSON.stringify({ ok: false, reason: String(err) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[hermes-sidecar] http://127.0.0.1:${PORT}/message (bridge → ${BRIDGE_URL})`);
});
