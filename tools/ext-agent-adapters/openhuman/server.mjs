#!/usr/bin/env node
/**
 * OpenHuman Ext Agent sidecar (spike) — envoymesh-message profile.
 *
 * OpenHuman exposes agent.chat via Tauri JSON-RPC, not loopback HTTP.
 * This sidecar documents the contract and returns a clear error until
 * OPENHUMAN_RPC_URL is wired (e.g. local helper shipped with OpenHuman).
 *
 * POST /message  GET /status
 */

import http from "node:http";

const PORT = Number(process.env.PORT ?? 8021);
const BRIDGE_URL = process.env.BRIDGE_URL ?? "http://127.0.0.1:3031/bridge/send";
const BRIDGE_SECRET = process.env.BRIDGE_SECRET?.trim() ?? "";
/** Future: http://127.0.0.1:<openhuman-helper>/rpc */
const OPENHUMAN_RPC_URL = process.env.OPENHUMAN_RPC_URL?.trim() ?? "";

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function callOpenHuman(text) {
  if (!OPENHUMAN_RPC_URL) {
    return `[OpenHuman echo] ${text}`;
  }
  const res = await fetch(OPENHUMAN_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "agent.chat_simple",
      params: { message: text },
    }),
  });
  const data = await res.json();
  const reply = data?.result?.text ?? data?.result?.message ?? data?.error?.message;
  if (typeof reply !== "string") throw new Error("unexpected OpenHuman RPC response");
  return reply;
}

async function replyToBridge(to, text) {
  const headers = { "Content-Type": "application/json" };
  if (BRIDGE_SECRET) headers.Authorization = `Bearer ${BRIDGE_SECRET}`;
  const res = await fetch(BRIDGE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ to, text }),
  });
  if (!res.ok) throw new Error(`bridge/send ${res.status}`);
}

const server = http.createServer(async (req, res) => {
  const path = (req.url ?? "").split("?")[0] ?? "";

  if (req.method === "GET" && path === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "OK",
        backend: OPENHUMAN_RPC_URL ? "rpc" : "echo",
        openhumanConnected: Boolean(OPENHUMAN_RPC_URL),
      }),
    );
    return;
  }

  if (req.method !== "POST" || path !== "/message") {
    res.writeHead(404).end();
    return;
  }

  try {
    const body = JSON.parse(await readBody(req));
    const from = body.from;
    const text = body.text;
    if (typeof from !== "string" || typeof text !== "string") {
      res.writeHead(400).end();
      return;
    }
    const replyText = await callOpenHuman(text);
    void replyToBridge(from, replyText).catch(console.error);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.writeHead(500).end(JSON.stringify({ ok: false, reason: String(err) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[openhuman-sidecar] http://127.0.0.1:${PORT}/message`);
});
