#!/usr/bin/env node
// Polls both EnvoyMesh nodes' getSetupSponsorFriendStatus + getBonds over WS
// and prints a concise one-shot status report. Used by the cron self-reminder.
import WebSocket from "ws";

const NODES = [
  { name: "Allen Peng (sponsor, terminal)", port: 4030 },
  { name: "Emily (installer, DMG .app)",    port: 3030 },
];

const TIMEOUT_MS = 8000;

function rpc(port, method) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      handshakeTimeout: TIMEOUT_MS,
    });
    const deadline = setTimeout(() => {
      ws.terminate();
      reject(new Error("timeout"));
    }, TIMEOUT_MS);

    // The server sends {"event":"connected","data":{peerId,multiaddrs}} on
    // every new connection. We swallow it and only treat JSON-RPC-shaped
    // messages (those with `id` matching the request we sent) as the answer.
    let id = 1;
    let sent = false;
    ws.on("open", () => {
      ws.send(
        JSON.stringify({ jsonrpc: "2.0", id, method }),
      );
      sent = true;
    });
    ws.on("message", (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      // Skip the "connected" event — it's not the answer to our JSON-RPC.
      if (msg.event && msg.id === undefined) return;
      if (msg.id !== id) return;
      clearTimeout(deadline);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
      ws.close();
    });
    ws.on("error", (err) => { clearTimeout(deadline); reject(err); });
    ws.on("close", () => {
      if (sent) { /* request sent but no answer */ }
    });
  });
}

function fmtState(s) {
  if (!s) return "no state yet";
  if (s.completedAt) return `COMPLETED at ${s.completedAt}`;
  const parts = [];
  if (s.attempts != null) parts.push(`attempts=${s.attempts}`);
  if (s.lastErrorKind) parts.push(`lastErrKind=${s.lastErrorKind}`);
  if (s.lastError) parts.push(`lastErr="${String(s.lastError).slice(0, 100)}"`);
  if (s.cooldownUntil) parts.push(`cooldownUntil=${s.cooldownUntil}`);
  if (s.lastAttemptAt && !s.completedAt) parts.push(`lastTry=${s.lastAttemptAt}`);
  return parts.length ? parts.join(" ") : "running";
}

async function probeOne({ name, port }) {
  const out = [`[${name}] @ ws://127.0.0.1:${port}/ws`];
  try {
    const status = await rpc(port, "getSetupSponsorFriendStatus");
    const enabled = status?.config?.enabled;
    const tokenRequired = status?.sponsorProofTokenRequired;
    out.push(`  sponsor-friend.enabled=${enabled}, proofTokenRequired=${tokenRequired}`);
    out.push(`  state: ${fmtState(status?.state)}`);
    if (status?.config?.peerId) {
      out.push(`  target peer (sponsor): ${status.config.peerId}`);
    }
    if (status?.config?.displayName) {
      out.push(`  target name: ${status.config.displayName}`);
    }
  } catch (e) {
    out.push(`  getSetupSponsorFriendStatus FAILED: ${e.message}`);
  }
  try {
    const bonds = await rpc(port, "getBonds");
    const list = Array.isArray(bonds) ? bonds : bonds?.bonds ?? [];
    out.push(`  bonds: ${list.length}`);
    for (const b of list.slice(0, 5)) {
      const peer = (b.peerId ?? b.peer ?? "").slice(0, 20);
      const nm = b.displayName ?? b.name ?? "(no name)";
      const tier = b.tier ?? "?";
      out.push(`    - ${nm} [${tier}] ${peer}…`);
    }
  } catch (e) {
    out.push(`  getBonds FAILED: ${e.message}`);
  }
  return out.join("\n");
}

(async () => {
  const reports = await Promise.allSettled(NODES.map(probeOne));
  const ts = new Date().toISOString();
  console.log(`\n=== envoymesh monitor @ ${ts} ===`);
  for (let i = 0; i < NODES.length; i++) {
    const r = reports[i];
    console.log(r.status === "fulfilled" ? r.value : `[${NODES[i].name}] probe failed: ${r.reason}`);
  }
  console.log("");
})();
