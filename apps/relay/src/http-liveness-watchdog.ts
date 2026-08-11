/**
 * Sibling liveness watchdog for the standalone relay — stricter than home-node.
 *
 * Home-node watchdog only probes GET /health (still needs the main event loop
 * to accept+respond). Relays must be *more* stable: this sibling kills when
 * EITHER:
 *   1. heartbeat file goes stale (parent setInterval starved by a wedge), or
 *   2. GET /health fails / times out
 *
 * Defaults are tighter than home (5s interval, 2s timeout, 2 fails, 60s grace)
 * so a wedged community relay recovers in ~10–20s after grace, not ~30–90s.
 *
 * Pair with systemd Restart=always / ENVOYMESH_RELAY_SUPERVISE=1 (run-relay.sh).
 * Disable: ENVOYMESH_LIVENESS_WATCHDOG=0 or ENVOYMESH_RELAY_LIVENESS_WATCHDOG=0
 */

import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface RelayHttpLivenessWatchdogOptions {
  port: number;
  /** Absolute path to heartbeat file the parent refreshes. */
  heartbeatPath: string;
  parentPid?: number;
  /** Startup grace before probes count (default 60s — tighter than home 90s). */
  graceMs?: number;
  /** Probe interval (default 5s — tighter than home 10s). */
  intervalMs?: number;
  /** Per-probe HTTP timeout (default 2s — tighter than home 3s). */
  timeoutMs?: number;
  /** Consecutive failures before SIGKILL (default 2 — tighter than home 3). */
  maxFails?: number;
  /** Heartbeat older than this counts as a fail (default 8s). */
  heartbeatStaleMs?: number;
  /** How often the parent rewrites the heartbeat (default 1s). */
  heartbeatWriteMs?: number;
  enabled?: boolean;
}

export function isRelayLivenessWatchdogEnabled(
  env: NodeJS.ProcessEnv = process.env,
  explicit?: boolean,
): boolean {
  if (explicit === false) return false;
  if (explicit === true) return true;
  const raw = (env.ENVOYMESH_RELAY_LIVENESS_WATCHDOG ?? env.ENVOYMESH_LIVENESS_WATCHDOG)
    ?.trim()
    .toLowerCase();
  if (!raw) return true;
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

/** Build the inline sibling script (exported for unit tests). */
export function buildRelayLivenessWatchdogScript(input: {
  port: number;
  parentPid: number;
  graceMs: number;
  intervalMs: number;
  timeoutMs: number;
  maxFails: number;
  heartbeatPath: string;
  heartbeatStaleMs: number;
}): string {
  return `
const http = require("node:http");
const fs = require("node:fs");
const port = ${JSON.stringify(input.port)};
const parentPid = ${JSON.stringify(input.parentPid)};
const graceMs = ${JSON.stringify(input.graceMs)};
const intervalMs = ${JSON.stringify(input.intervalMs)};
const timeoutMs = ${JSON.stringify(input.timeoutMs)};
const maxFails = ${JSON.stringify(input.maxFails)};
const heartbeatPath = ${JSON.stringify(input.heartbeatPath)};
const heartbeatStaleMs = ${JSON.stringify(input.heartbeatStaleMs)};
const started = Date.now();
let fails = 0;

function parentAlive() {
  try {
    process.kill(parentPid, 0);
    return true;
  } catch {
    return false;
  }
}

function maybeKill(reason) {
  if (fails < maxFails) return;
  console.error(
    "[relay-liveness-watchdog] unresponsive (" +
      fails +
      "/" +
      maxFails +
      ") — " +
      reason +
      "; SIGKILL pid=" +
      parentPid,
  );
  try {
    process.kill(parentPid, "SIGKILL");
  } catch (err) {
    console.error(
      "[relay-liveness-watchdog] SIGKILL failed:",
      err && err.message ? err.message : err,
    );
  }
  process.exit(1);
}

function heartbeatStale() {
  try {
    const raw = fs.readFileSync(heartbeatPath, "utf8").trim();
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return "heartbeat-invalid";
    const age = Date.now() - ts;
    if (age > heartbeatStaleMs) return "heartbeat-stale ageMs=" + age;
    return null;
  } catch (err) {
    return "heartbeat-missing:" + (err && err.code ? err.code : "error");
  }
}

function probeHttp() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/health", timeout: timeoutMs },
      (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(null);
        else resolve("status=" + res.statusCode);
      },
    );
    req.on("error", (err) => {
      resolve(err && err.message ? err.message : "error");
    });
    req.on("timeout", () => {
      req.destroy();
      resolve("timeout");
    });
  });
}

async function probe() {
  if (!parentAlive()) process.exit(0);
  if (Date.now() - started < graceMs) return;

  const hb = heartbeatStale();
  if (hb) {
    fails += 1;
    maybeKill(hb);
    return;
  }

  const httpErr = await probeHttp();
  if (httpErr) {
    fails += 1;
    maybeKill("http:" + httpErr);
    return;
  }
  fails = 0;
}

console.error(
  "[relay-liveness-watchdog] started port=" +
    port +
    " parent=" +
    parentPid +
    " heartbeat=" +
    heartbeatPath +
    " graceMs=" +
    graceMs +
    " failKill=" +
    maxFails,
);
setInterval(() => {
  void probe();
}, intervalMs);
void probe();
`.trim();
}

/**
 * Start parent heartbeat writer + sibling killer.
 * Returns a stop fn that clears the interval and SIGTERMs the child.
 */
export function startRelayHttpLivenessWatchdog(
  options: RelayHttpLivenessWatchdogOptions,
): (() => void) | undefined {
  if (!isRelayLivenessWatchdogEnabled(process.env, options.enabled)) {
    return undefined;
  }
  const port = options.port;
  if (!Number.isFinite(port) || port <= 0) {
    console.warn("[relay-liveness-watchdog] skipped: invalid port", port);
    return undefined;
  }
  const heartbeatPath = options.heartbeatPath?.trim();
  if (!heartbeatPath) {
    console.warn("[relay-liveness-watchdog] skipped: missing heartbeatPath");
    return undefined;
  }

  const parentPid = options.parentPid ?? process.pid;
  const graceMs = options.graceMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 5_000;
  const timeoutMs = options.timeoutMs ?? 2_000;
  const maxFails = options.maxFails ?? 2;
  const heartbeatStaleMs = options.heartbeatStaleMs ?? 8_000;
  const heartbeatWriteMs = options.heartbeatWriteMs ?? 1_000;

  try {
    mkdirSync(dirname(heartbeatPath), { recursive: true });
    writeFileSync(heartbeatPath, `${Date.now()}\n`, { mode: 0o600 });
  } catch (err) {
    console.warn(
      "[relay-liveness-watchdog] heartbeat init failed:",
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }

  const heartbeatTimer = setInterval(() => {
    try {
      writeFileSync(heartbeatPath, `${Date.now()}\n`, { mode: 0o600 });
    } catch {
      /* best-effort — sibling will notice stale/missing */
    }
  }, heartbeatWriteMs);
  // Don't keep the process alive solely for heartbeat when shutting down.
  heartbeatTimer.unref?.();

  const script = buildRelayLivenessWatchdogScript({
    port,
    parentPid,
    graceMs,
    intervalMs,
    timeoutMs,
    maxFails,
    heartbeatPath,
    heartbeatStaleMs,
  });

  let child: ChildProcess;
  try {
    child = spawn(process.execPath, ["-e", script], {
      detached: true,
      stdio: ["ignore", "ignore", "inherit"],
      env: process.env,
    });
  } catch (err) {
    clearInterval(heartbeatTimer);
    console.warn(
      "[relay-liveness-watchdog] spawn failed:",
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }

  child.unref();
  console.log(
    `[relay-liveness-watchdog] sibling pid=${child.pid ?? "?"} ` +
      `heartbeat+http://127.0.0.1:${port}/health ` +
      `(stricter than home; disable: ENVOYMESH_LIVENESS_WATCHDOG=0)`,
  );

  return () => {
    clearInterval(heartbeatTimer);
    if (child.pid == null) return;
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  };
}
