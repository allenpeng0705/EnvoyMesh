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
import { existsSync, readFileSync } from "node:fs";
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
  /** Which app did it, so the message can name the product rather than "a process". */
  app: string;
  /** The port the engine was started on. */
  port: number;
  /** The model id it was started with — an engine holding another model is a lease problem
   *  (§8), not a lock problem, but the holder is the only one who can report it. */
  modelId?: string;
  startedAt: string;
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
): Promise<AcquireEngineLockResult> {
  const role: EngineRole = info.role ?? "chat";
  const record: EngineLockInfo = {
    role,
    pid: info.pid,
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
    if (existing && isProcessAlive(existing.pid)) {
      return { acquired: false, holder: existing };
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
