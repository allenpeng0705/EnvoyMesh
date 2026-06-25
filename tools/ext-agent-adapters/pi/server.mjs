#!/usr/bin/env node
/**
 * Pi Ext Agent sidecar — envoymesh-message profile.
 *
 * Spawns `pi --mode rpc` and maps Bridge v1 chat to JSONL RPC.
 * Intended as a **coding assistant** backend, not default home chat.
 *
 * POST /message  GET /status
 *
 * Env: PI_BIN (default pi), PORT (8022), BRIDGE_URL, BRIDGE_SECRET
 */

import http from "node:http";
import { spawn } from "node:child_process";
import readline from "node:readline";

const PORT = Number(process.env.PORT ?? 8022);
const PI_BIN = process.env.PI_BIN ?? "pi";
const PI_ECHO = process.env.PI_ECHO === "1" || process.env.PI_ECHO === "true";
const BRIDGE_URL = process.env.BRIDGE_URL ?? "http://127.0.0.1:3031/bridge/send";
const BRIDGE_SECRET = process.env.BRIDGE_SECRET?.trim() ?? "";

let piProc = null;
let piReady = false;
const pending = [];

function ensurePi() {
  if (piProc) return;
  piProc = spawn(PI_BIN, ["--mode", "rpc"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  piProc.on("exit", () => {
    piProc = null;
    piReady = false;
  });
  const rl = readline.createInterface({ input: piProc.stdout });
  rl.on("line", (line) => {
    try {
      const evt = JSON.parse(line);
      if (evt.type === "ready" || evt.type === "session_ready") piReady = true;
      const waiter = pending.shift();
      if (waiter) waiter(evt);
    } catch {
      /* ignore non-json */
    }
  });
}

function askPi(message) {
  if (PI_ECHO) {
    return Promise.resolve(`[Pi echo] ${message}`);
  }
  ensurePi();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("pi rpc timeout")), 300_000);
    pending.push((evt) => {
      if (evt.type === "assistant_text" || evt.type === "message") {
        clearTimeout(timer);
        resolve(evt.text ?? evt.message ?? String(evt.content ?? ""));
        return;
      }
      if (evt.type === "error") {
        clearTimeout(timer);
        reject(new Error(evt.message ?? "pi error"));
      }
    });
    piProc.stdin.write(JSON.stringify({ type: "prompt", message }) + "\n");
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function replyToBridge(to, text) {
  const headers = { "Content-Type": "application/json" };
  if (BRIDGE_SECRET) headers.Authorization = `Bearer ${BRIDGE_SECRET}`;
  await fetch(BRIDGE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ to, text }),
  });
}

const server = http.createServer(async (req, res) => {
  const path = (req.url ?? "").split("?")[0] ?? "";

  if (req.method === "GET" && path === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "OK", piBin: PI_BIN, backend: PI_ECHO ? "echo" : "rpc" }));
    return;
  }

  if (req.method !== "POST" || path !== "/message") {
    res.writeHead(404).end();
    return;
  }

  try {
    const body = JSON.parse(await readBody(req));
    const { from, text } = body;
    if (typeof from !== "string" || typeof text !== "string") {
      res.writeHead(400).end();
      return;
    }
    let replyText;
    try {
      replyText = await askPi(text);
    } catch (err) {
      replyText = `Pi sidecar: ${err instanceof Error ? err.message : String(err)}. Install \`pi\` CLI or pick another Ext Agent backend.`;
    }
    void replyToBridge(from, replyText).catch(console.error);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.writeHead(500).end(JSON.stringify({ ok: false, reason: String(err) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[pi-sidecar] http://127.0.0.1:${PORT}/message (pi bin: ${PI_BIN})`);
});
