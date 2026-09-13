/**
 * The **engine spawn lock** (design §8 / S4).
 *
 * ## What it prevents
 *
 * The shared local model engine is `llama-server` on a fixed port, and its assets live in
 * `<root>/runtime/` so the whole family shares one binary and one set of weights. What is
 * *not* shared is the right to start it: two spawners that both decide the engine is down
 * will both start one, and the loser's port bind fails — or worse, both bind in sequence and
 * the first one's child is orphaned while the second one serves.
 *
 * The mesh already has a lock per home (`acquireNodeLock`), and under D2 that covers the
 * common case: one process owns the mesh, so only one process spawns the engine. This lock
 * covers the case the node lock cannot: two *nodes* on one machine (a standalone product next
 * to EnvoyMesh, both pointed at the same root) racing for one shared set of engine assets.
 *
 * It is deliberately a separate file with separate semantics rather than a second use of the
 * node lock:
 *
 *   * the node lock means "I own this identity and this mesh" and is held for the life of the
 *     process; the engine lock is held only while llama-server runs, and is released when the
 *     child exits — including a crash-restart cycle where the process stays up;
 *   * they live at different levels: `<home>/lock` is per home, `<root>/runtime/engine.lock`
 *     is per engine asset root, which is the thing actually being contended;
 *   * the loser's behaviour differs. A node-lock loser must **not** serve the mesh; an
 *     engine-lock loser should **wait for the winner's engine** and then use it.
 *
 * Same primitive as the node lock (`wx` create = the create either wins or fails with
 * `EEXIST`, so two processes starting in the same instant cannot both believe they won), and
 * the same takeover rule: a claim whose pid is gone is stale, because a crashed engine must
 * not lock the user out of their own model.
 */

import * as nodeFs from "node:fs";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { hostname as osHostname } from "node:os";
import * as path from "node:path";
import { isProcessAlive } from "./node-registry.js";
import { runtimeDirIn } from "./envoymesh-home.js";

/**
 * The engine **roles** that can each run one server. They are separate locks on purpose: the
 * chat engine (18790) and the embeddings engine (18791) are two processes, both legitimate at
 * the same time, so one shared claim would either serialize them or — worse — let the
 * embeddings runtime adopt the chat engine's port as its own.
 */
export type EngineRole = "chat" | "embed";

export function engineLockFileName(role: EngineRole): string {
  return `engine-${role}.lock`;
}

/** The lock file for the chat engine, kept for callers that predate the role split. */
export const ENGINE_LOCK_FILE = engineLockFileName("chat");

export interface EngineLockInfo {
  /** Which engine this claim is for — `chat` (18790) or `embed` (18791). */
  role?: EngineRole;
  /** The process that started the engine. */
  pid: number;
  /**
   * The machine that wrote the claim. A home on a network mount (or a copied directory) can
   * carry a claim whose pid means nothing locally, so a claim from another host is stale here.
   */
  host?: string;
  /**
   * When that process started, in ms since the epoch — the guard against **pid reuse**. A lock
   * whose pid is now an unrelated process would otherwise look like a live holder, and the next
   * start would wait out the whole startup timeout before failing. Recorded from the holder's
   * own clock (`Date.now() - process.uptime()`) and compared against the OS's answer when the
   * OS can give one.
   */
  pidStartedAt?: number;
  /** Which app did it, so the message can name the product rather than "a process". */
  app: string;
  /** The port the engine was started on. */
  port: number;
  /** The model id it was started with — an engine holding another model is a lease problem
   *  (§8), not a lock problem, but the holder is the only one who can report it. */
  modelId?: string;
  startedAt: string;
}

/**
 * Parse `ps -o etime=` output (`[[dd-]hh:]mm:ss`) into seconds, or `null` if it is not that.
 *
 * Exported because the format is the fiddly part: it is locale-independent (unlike
 * `ps -o lstart=`, whose date format follows the user's locale and would break parsing on a
 * non-English machine), and it is the reason macOS can answer this question at all.
 */
export function parsePsElapsedSeconds(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const dash = text.indexOf("-");
  const days = dash >= 0 ? Number(text.slice(0, dash)) : 0;
  const clock = dash >= 0 ? text.slice(dash + 1) : text;
  if (!Number.isFinite(days) || days < 0) return null;
  const parts = clock.split(":").map((piece) => Number(piece));
  if (parts.length < 2 || parts.length > 3) return null;
  if (parts.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const [a, b, c] = parts;
  const seconds = parts.length === 3 ? a * 3600 + b * 60 + c : a * 60 + b;
  return days * 86_400 + seconds;
}

function psElapsed(pid: number): string | null {
  try {
    const out = execFileSync("ps", ["-o", "etime=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out;
  } catch {
    return null;
  }
}

/**
 * When a process started, in ms since the epoch, or `null` when this OS cannot say.
 *
 * Three answers, in order of how much we can trust them:
 *
 *   * **Linux** — `/proc/<pid>/stat` field 22 (clock ticks since boot) plus `btime` from
 *     `/proc/stat`. Exact and cheap.
 *   * **macOS / BSD / other POSIX** — `ps -o etime=` (elapsed), subtracted from now. Good to a
 *     second, which is why the comparison tolerance is five. This is what makes the pid-reuse
 *     guard work on the platform this project is developed on, rather than only on CI.
 *   * **Windows** — `null`: there is no cheap, dependable equivalent, so there the guard falls
 *     back to plain pid liveness (documented, not silent).
 *
 * Returning `null` means "cannot tell", never "not alive".
 */
export function processStartedAt(
  pid: number,
  opts: {
    readFile?: (path: string) => string;
    elapsed?: (pid: number) => string | null;
    now?: number;
  } = {},
): number | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const readFile = opts.readFile ?? ((p: string) => readFileSync(p, "utf8"));
  if (process.platform === "linux") {
    try {
      const stat = readFile(`/proc/${pid}/stat`);
      // Field 22, 1-indexed, after the comm field — which itself may contain spaces and parens,
      // so everything up to the last ')' is stripped first.
      const afterComm = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      const startTicks = Number(afterComm[19]);
      if (!Number.isFinite(startTicks)) return null;
      const btime = /btime (\d+)/.exec(readFile("/proc/stat"))?.[1];
      if (!btime) return null;
      // CLK_TCK is 100 on every platform Linux supports in practice.
      return (Number(btime) + startTicks / 100) * 1000;
    } catch {
      return null;
    }
  }
  if (process.platform === "win32") return null;
  try {
    const raw = (opts.elapsed ?? psElapsed)(pid);
    if (raw === null) return null;
    const seconds = parsePsElapsedSeconds(raw);
    if (seconds === null) return null;
    return (opts.now ?? Date.now()) - seconds * 1000;
  } catch {
    return null;
  }
}

/** The calling process's own start time — portable, no syscalls. */
export function currentProcessStartedAt(now = Date.now(), uptimeSeconds = process.uptime()): number {
  return now - Math.round(uptimeSeconds * 1000);
}

/** How far two estimates of the same start time may differ before they are different processes. */
const START_TIME_TOLERANCE_MS = 5_000;

export interface EngineLockOptions {
  /** Injectable for tests: the OS's start time for a pid. */
  processStartTimeOf?: (pid: number) => number | null;
  /** Injectable for tests: this machine's name. */
  hostname?: string;
}

export type AcquireEngineLockResult =
  | {
      acquired: true;
      lock: EngineLockInfo;
      tookOverStale: boolean;
      /** True when the claim was already this process's (a restart, not a first start). */
      reacquired?: boolean;
    }
  | { acquired: false; holder: EngineLockInfo | null };

/** `<root>/runtime/engine-<role>.lock` — beside the assets it guards. */
export function engineLockPath(rootDir: string, role: EngineRole = "chat"): string {
  return path.join(runtimeDirIn(rootDir), engineLockFileName(role));
}

/** Read the current claim for a role, or `null` when there is none (or it is unreadable). */
export function readEngineLock(rootDir: string, role: EngineRole = "chat"): EngineLockInfo | null {
  try {
    const parsed = JSON.parse(nodeFs.readFileSync(engineLockPath(rootDir, role), "utf8")) as EngineLockInfo;
    if (typeof parsed?.pid !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The same, synchronously, for `process.on("exit")` — `exit` handlers cannot await. */
export function releaseEngineLockSync(
  rootDir: string,
  pid: number = process.pid,
  role: EngineRole = "chat",
): boolean {
  let existing: EngineLockInfo | null = null;
  try {
    existing = JSON.parse(readFileSync(engineLockPath(rootDir, role), "utf8")) as EngineLockInfo;
  } catch {
    return false;
  }
  if (!existing || existing.pid !== pid) return false;
  try {
    nodeFs.unlinkSync(engineLockPath(rootDir, role));
    return true;
  } catch {
    return false;
  }
}

/**
 * Claim the right to start the engine, or report who holds it.
 *
 * A stale claim (holder pid is gone) is taken over, and the caller is told — a takeover means
 * the previous engine did not stop cleanly, which is worth a log line.
 */
export async function acquireEngineLock(
  rootDir: string,
  info: Omit<EngineLockInfo, "startedAt" | "role"> & { startedAt?: string; role?: EngineRole },
  opts: EngineLockOptions = {},
): Promise<AcquireEngineLockResult> {
  const role: EngineRole = info.role ?? "chat";
  const hostname = opts.hostname ?? osHostname();
  const processStartTimeOf = opts.processStartTimeOf ?? ((pid: number) => processStartedAt(pid));
  const record: EngineLockInfo = {
    role,
    pid: info.pid,
    host: hostname,
    pidStartedAt: currentProcessStartedAt(),
    app: info.app,
    port: info.port,
    ...(info.modelId ? { modelId: info.modelId } : {}),
    startedAt: info.startedAt ?? new Date().toISOString(),
  };
  const file = engineLockPath(rootDir, role);
  await nodeFs.promises.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await nodeFs.promises.open(file, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
      await handle.close();
      return { acquired: true, lock: record, tookOverStale: attempt > 0 };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }

    const existing = readEngineLock(rootDir, role);
    if (existing && existing.pid === record.pid) {
      // **Our own claim.** A restart path (watchdog, failed start) re-acquires in the same
      // process, and reporting *ourselves* as the holder would send the caller into the
      // "wait for the holder's engine" loop with nothing to wait for — a self-deadlock that
      // ends in a confusing "another process (pid <us>) holds the lock". Re-take it instead.
      return { acquired: true, lock: record, tookOverStale: false, reacquired: true };
    }
    if (existing && existing.host && existing.host !== hostname) {
      // Written by a process on another machine (a home on a network mount, or a copied
      // directory). Its pid is meaningless here, so it cannot be our live holder.
      console.warn(
        `[engine-lock] a claim from ${existing.host} was found in ${rootDir} — treating it as stale`,
      );
    } else if (existing && existing.pid !== record.pid && isProcessAlive(existing.pid)) {
      // Alive — but is it the same process that wrote this? If the OS can tell us the pid's
      // start time and it disagrees with what the claim recorded, the pid was reused by an
      // unrelated process, and waiting for it would burn the whole startup timeout.
      const actualStart = existing.pidStartedAt ? processStartTimeOf(existing.pid) : null;
      const reused =
        actualStart !== null &&
        existing.pidStartedAt !== undefined &&
        Math.abs(actualStart - existing.pidStartedAt) > START_TIME_TOLERANCE_MS;
      if (reused) {
        console.warn(
          `[engine-lock] pid ${existing.pid} was reused by another process (claim says it started at ` +
            `${new Date(existing.pidStartedAt ?? 0).toISOString()}, the OS says ` +
            `${new Date(actualStart).toISOString()}) — treating the claim as stale`,
        );
      } else {
        return { acquired: false, holder: existing };
      }
    }
    // Stale or unreadable: remove and try once more. The second attempt can still lose to
    // another process doing the same thing, which is fine — the loser is told who won.
    await nodeFs.promises.unlink(file).catch(() => undefined);
  }

  return { acquired: false, holder: readEngineLock(rootDir, role) };
}

/** Release the claim — **only if this process holds it**. */
export async function releaseEngineLock(
  rootDir: string,
  pid: number = process.pid,
  role: EngineRole = "chat",
): Promise<boolean> {
  const existing = readEngineLock(rootDir, role);
  if (!existing || existing.pid !== pid) return false;
  return releaseEngineLockSync(rootDir, pid, role);
}

/** Is a lock file present at all for this role? Used by the probe/diagnostics paths. */
export function hasEngineLock(rootDir: string, role: EngineRole = "chat"): boolean {
  return existsSync(engineLockPath(rootDir, role));
}
