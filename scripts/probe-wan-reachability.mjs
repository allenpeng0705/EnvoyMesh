#!/usr/bin/env node
/**
 * Standalone WAN reachability probe (Windows 5G / Mac / Linux).
 *
 * Zero dependencies — only Node built-ins. Copy this ONE file to the Win
 * machine; no git pull, no EnvoyMesh node, no npm install.
 *
 *   node probe-wan-reachability.mjs
 *
 * Exit 0 = community relay TCP reachable (WAN path usable).
 * Exit 1 = relay unreachable (auto-bond / relay search cannot work).
 */
import net from "node:net";
import dns from "node:dns/promises";
import http from "node:http";

const RELAY_HOST = process.env.ENVOY_PROBE_RELAY_HOST || "47.93.11.212";
const RELAY_TCP_PORT = Number(process.env.ENVOY_PROBE_RELAY_TCP || 4001);
const RELAY_HTTP_PORT = Number(process.env.ENVOY_PROBE_RELAY_HTTP || 15432);
const LAN_HOST = process.env.ENVOY_PROBE_LAN_HOST || "192.168.3.85";
const LAN_PORT = Number(process.env.ENVOY_PROBE_LAN_PORT || 4001);
const TIMEOUT_MS = Number(process.env.ENVOY_PROBE_TIMEOUT_MS || 5000);

function tcpProbe(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port });
    let done = false;
    const finish = (ok, detail) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve({ ok, ms: Date.now() - started, detail });
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(true, "connected"));
    socket.on("timeout", () => finish(false, `timeout ${timeoutMs}ms`));
    socket.on("error", (err) => finish(false, err.message || String(err)));
  });
}

function httpProbe(host, port, path, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const req = http.get(
      { host, port, path, timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve({
          ok: res.statusCode != null && res.statusCode < 500,
          ms: Date.now() - started,
          detail: `HTTP ${res.statusCode}`,
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, ms: Date.now() - started, detail: `timeout ${timeoutMs}ms` });
    });
    req.on("error", (err) => {
      resolve({ ok: false, ms: Date.now() - started, detail: err.message || String(err) });
    });
  });
}

function line(name, result, hint) {
  const status = result.ok ? "OK  " : "FAIL";
  const hintPart = hint ? `  — ${hint}` : "";
  console.log(`  [${status}] ${name}  (${result.ms}ms)  ${result.detail}${hintPart}`);
}

async function main() {
  console.log("EnvoyMesh WAN reachability probe");
  console.log(`  time=${new Date().toISOString()}`);
  console.log(`  relay=${RELAY_HOST}:${RELAY_TCP_PORT}  http=${RELAY_HTTP_PORT}`);
  console.log("");

  const relayTcp = await tcpProbe(RELAY_HOST, RELAY_TCP_PORT, TIMEOUT_MS);
  line(
    `TCP  ${RELAY_HOST}:${RELAY_TCP_PORT}  (community relay / libp2p)`,
    relayTcp,
    relayTcp.ok ? "required for WAN search + circuit dial" : "WAN mesh cannot work from this network",
  );

  const relayHttp = await httpProbe(RELAY_HOST, RELAY_HTTP_PORT, "/info", TIMEOUT_MS);
  line(
    `HTTP ${RELAY_HOST}:${RELAY_HTTP_PORT}/info`,
    relayHttp,
    "optional (relay HTTP / client-proxy)",
  );

  const lanTcp = await tcpProbe(LAN_HOST, LAN_PORT, Math.min(TIMEOUT_MS, 2500));
  line(
    `TCP  ${LAN_HOST}:${LAN_PORT}  (Allen home LAN — should FAIL on 5G)`,
    lanTcp,
    lanTcp.ok
      ? "unexpected on mobile 5G (same LAN?)"
      : "expected on 5G — installer must not dial this first",
  );

  let dnsResult = { ok: false, ms: 0, detail: "skipped" };
  const dnsStarted = Date.now();
  try {
    const records = await Promise.race([
      dns.resolveSrv("_dnsaddr.bootstrap.libp2p.io"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
      ),
    ]);
    dnsResult = {
      ok: Array.isArray(records) && records.length > 0,
      ms: Date.now() - dnsStarted,
      detail: Array.isArray(records) ? `${records.length} SRV` : String(records),
    };
  } catch (err) {
    dnsResult = {
      ok: false,
      ms: Date.now() - dnsStarted,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  line(
    "DNS  _dnsaddr.bootstrap.libp2p.io",
    dnsResult,
    dnsResult.ok
      ? "public DHT bootstrap reachable"
      : "common on mobile/CN — DHT empty; relay.lookup must carry search",
  );

  console.log("");
  if (relayTcp.ok) {
    console.log("RESULT: SUCCEED — community relay is reachable from this network.");
    console.log("         Step 1/4 (reach relay) PASS.");
    if (!dnsResult.ok) {
      console.log("         Note: public DHT bootstrap DNS failed (expected on many 5G links).");
    }
    if (lanTcp.ok) {
      console.log("         Note: home LAN also reachable — you may be on the same Wi‑Fi.");
    }
    console.log("");
    console.log("Bonding still needs 3 more steps (this script cannot do them without EnvoyMesh):");
    console.log("  2/4  Allen Mac holds a live circuit-relay RESERVATION on this relay");
    console.log("       (Settings → Network = RESERVED — hop=live checkin alone is NOT enough)");
    console.log("  3/4  Win dials /ip4/47.93.11.212/.../p2p-circuit/p2p/<AllenPeerId>");
    console.log("       (needs EnvoyMesh node — not plain TCP)");
    console.log("  4/4  Win sends bond.request; Allen auto-accepts (bond autonomy + proof token)");
    console.log("");
    console.log("Next on Win (shortest real bond test, still no DMG/EXE):");
    console.log("  npm run node:dev -- --discovery-profile wan-default --bootstrap-preset cn-relay --relay");
    console.log("  + npm run social:dev  → wait for:");
    console.log("      [node-service] relay client cycle deps bound for searchPeers");
    console.log("      dialTargets…47.93.11.212…/p2p-circuit/…  (no 192.168 first)");
    console.log("      Hello sent successfully / bond:established");
    process.exit(0);
  }

  console.log("RESULT: FAIL — cannot reach community relay TCP.");
  console.log("         Step 1/4 FAIL. Fix network/firewall/VPN before any bond test.");
  process.exit(1);
}

main().catch((err) => {
  console.error("RESULT: FAIL — probe crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
