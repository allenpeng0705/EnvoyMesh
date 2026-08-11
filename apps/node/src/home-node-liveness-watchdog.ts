/**
 * External liveness watchdog for home-node CLI (and any run without Tauri guardian).
 *
 * In-process health / lag monitors run on the same event loop they watch. A
 * microtask storm can peg CPU at 100% while timers and GET /health handlers
 * never run — audit logs go silent and Social/EnvoyGo freeze, but the process
 * stays "alive". Tauri already kills on /health timeout; `npm run node:dev`
 * had no equivalent.
 *
 * This module spawns a tiny sibling Node process that probes
 * `GET http://127.0.0.1:<socialWsPort>/health`. After a startup grace, N
 * consecutive failures SIGKILL the parent. Disable with
 * `ENVOYMESH_LIVENESS_WATCHDOG=0`.
 */

import { spawn, type ChildProcess } from "node:child_process";

export interface HomeNodeLivenessWatchdogOptions {
  port: number;
  parentPid?: number;
  /** Startup grace before probes count (default 90s). */
  graceMs?: number;
  /** Probe interval (default 10s). */
  intervalMs?: number;
  /** Per-probe HTTP timeout (default 3s). */
  timeoutMs?: number;
  /** Consecutive failures before SIGKILL (default 3). */
  maxFails?: number;
  /** Override enable; default respects env (on unless `=0`). */
  enabled?: boolean;
}

export function isHomeNodeLivenessWatchdogEnabled(
  env: NodeJS.ProcessEnv = process.env,
  explicit?: boolean,
): boolean {
  if (explicit === false) return false;
  if (explicit === true) return true;
  const raw = env.ENVOYMESH_LIVENESS_WATCHDOG?.trim().toLowerCase();
  if (!raw) return true;
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

/** Build the inline sibling script (exported for unit tests). */
export function buildLivenessWatchdogScript(input: {
  port: number;
  parentPid: number;
  graceMs: number;
  intervalMs: number;
  timeoutMs: number;
  maxFails: number;
}): string {
  // Keep this CommonJS + no deps so `node -e` works under tsx/production alike.
  return `
const http = require("node:http");
const port = ${JSON.stringify(input.port)};
const parentPid = ${JSON.stringify(input.parentPid)};
const graceMs = ${JSON.stringify(input.graceMs)};
const intervalMs = ${JSON.stringify(input.intervalMs)};
const timeoutMs = ${JSON.stringify(input.timeoutMs)};
const maxFails = ${JSON.stringify(input.maxFails)};
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
    "[liveness-watchdog] home node /health unresponsive (" +
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
    console.error("[liveness-watchdog] SIGKILL failed:", err && err.message ? err.message : err);
  }
  process.exit(1);
}

function probe() {
  if (!parentAlive()) process.exit(0);
  if (Date.now() - started < graceMs) return;
  const req = http.get(
    { host: "127.0.0.1", port, path: "/health", timeout: timeoutMs },
    (res) => {
      res.resume();
      if (res.statusCode === 200) {
        fails = 0;
        return;
      }
      fails += 1;
      maybeKill("status=" + res.statusCode);
    },
  );
  req.on("error", (err) => {
    fails += 1;
    maybeKill(err && err.message ? err.message : "error");
  });
  req.on("timeout", () => {
    req.destroy();
    fails += 1;
    maybeKill("timeout");
  });
}

console.error(
  "[liveness-watchdog] started port=" +
    port +
    " parent=" +
    parentPid +
    " graceMs=" +
    graceMs +
    " failKill=" +
    maxFails,
);
setInterval(probe, intervalMs);
probe();
`.trim();
}

/**
 * Start the sibling watchdog. Returns a stop fn that kills the child (best-effort).
 * No-op when disabled.
 */
export function startHomeNodeLivenessWatchdog(
  options: HomeNodeLivenessWatchdogOptions,
): (() => void) | undefined {
  if (!isHomeNodeLivenessWatchdogEnabled(process.env, options.enabled)) {
    return undefined;
  }
  const port = options.port;
  if (!Number.isFinite(port) || port <= 0) {
    console.warn("[liveness-watchdog] skipped: invalid port", port);
    return undefined;
  }

  const parentPid = options.parentPid ?? process.pid;
  const graceMs = options.graceMs ?? 90_000;
  const intervalMs = options.intervalMs ?? 10_000;
  const timeoutMs = options.timeoutMs ?? 3_000;
  const maxFails = options.maxFails ?? 3;

  const script = buildLivenessWatchdogScript({
    port,
    parentPid,
    graceMs,
    intervalMs,
    timeoutMs,
    maxFails,
  });

  let child: ChildProcess;
  try {
    child = spawn(process.execPath, ["-e", script], {
      detached: true,
      stdio: ["ignore", "ignore", "inherit"],
      env: process.env,
    });
  } catch (err) {
    console.warn(
      "[liveness-watchdog] spawn failed:",
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }

  child.unref();
  console.log(
    `[liveness-watchdog] sibling pid=${child.pid ?? "?"} probing http://127.0.0.1:${port}/health (disable: ENVOYMESH_LIVENESS_WATCHDOG=0)`,
  );

  return () => {
    if (child.pid == null) return;
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  };
}
