/**
 * Who owns this EnvoyMesh home right now.
 *
 * ## Why this exists
 *
 * A home holds one identity: `libp2p-private.key` and the owner key inside
 * `profile.json`. Two processes using it at once is not sharing — both claim the
 * same PeerId (a relay sees one peer check in twice, peers hold ambiguous
 * connections to that id, a node can dial itself) and both write the same stores,
 * with no exclusion of any kind: before this module there was **no lock, no pid
 * file and no `O_EXCL` guard anywhere** in `apps/node/src` or under `packages/`
 * (verified by grep, 2026-09-12).
 *
 * (That sentence was first written with a wildcard package path, whose asterisk
 * and slash closed this comment early and broke the build — the same class of
 * mistake the comment stripper in `scripts/lib/source-files.mjs` exists to
 * survive. Documenting it here without repeating the two characters.)
 *
 * So: exactly one process owns the home at a time; the others find out and either
 * attach or stay away.
 *
 * Design: `docs/envoymesh-multi-product-design.md` §7.
 *
 * ## The three pieces
 *
 *   * `lock` — an exclusive-create file naming the owning pid. `wx` makes the
 *     claim atomic; a *stale* claim (pid gone) is taken over rather than blocking
 *     the user forever, which is the failure mode a naive lock file has.
 *   * `node.json` — what the owner is reachable at (port, path, token, identity),
 *     mode `0600`, written atomically. A second product reads it to attach, and
 *     `describeProfileSituation` reads it to say *who* is using the home.
 *   * `probeNodeEndpoint` — does the endpoint answer `/health`, and is it really
 *     the node we think it is? The transport's `/health` is identical in every
 *     product (`{"ok":true,"service":"envoymesh-home-ws",…}`), which is how the
 *     desktop guardian can be fooled into believing its own node is alive when a
 *     *different* product holds the port — so identity is checked when the payload
 *     carries it, and reported as unknown when it does not.
 */

import { readFileSync } from "node:fs";
import * as nodeFs from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { request } from "node:http";
import path from "node:path";

export const NODE_LOCK_FILE = "lock";
export const NODE_ENDPOINT_FILE = "node.json";

/** What the owning process records about itself in the lock file. */
export interface NodeLockInfo {
  pid: number;
  app: string;
  version: string;
  startedAt: string;
}

/**
 * Where the owning node can be reached, and who it is.
 *
 * `token` is a secret: file mode `0600`, and the design's attach flow exchanges it
 * rather than copying it into a product's own config.
 */
export interface NodeEndpoint {
  pid: number;
  app: string;
  version: string;
  startedAt: string;
  /** WebSocket port the product surfaces are served on. */
  port: number;
  /** WebSocket path, normally `/ws`. */
  path: string;
  token: string;
  peerId?: string;
  ownerId?: string;
  /** The home schema the owner wrote (§4.4). */
  schema?: number;
}

export type AcquireNodeLockResult =
  | { acquired: true; lock: NodeLockInfo; /** True when a dead owner's claim was taken over. */ tookOverStale: boolean }
  | { acquired: false; holder: NodeLockInfo; endpoint: NodeEndpoint | null };

function lockPath(home: string): string {
  return path.join(home, NODE_LOCK_FILE);
}

export function endpointPath(home: string): string {
  return path.join(home, NODE_ENDPOINT_FILE);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Is that process still running?
 *
 * `EPERM` means it exists but belongs to another user — still alive, and still
 * holding the lock. Only `ESRCH` means gone.
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Read the lock file, or `null` when it is absent, unreadable or corrupt. */
export async function readNodeLock(home: string): Promise<NodeLockInfo | null> {
  let raw: string;
  try {
    raw = await nodeFs.promises.readFile(lockPath(home), "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A half-written or corrupted lock must read as "no usable claim" so the
    // caller takes it over. Throwing here crashed startup on a file the node
    // itself could not parse — the opposite of what a lock is for.
    return null;
  }
  const record = asRecord(parsed);
  const pid = num(record?.["pid"]);
  if (!record || pid === undefined) return null;
  return {
    pid,
    app: str(record["app"]) ?? "unknown",
    version: str(record["version"]) ?? "unknown",
    startedAt: str(record["startedAt"]) ?? new Date(0).toISOString(),
  };
}

/** Read the endpoint descriptor, or `null` when it is absent or unreadable. */
export async function readNodeEndpoint(home: string): Promise<NodeEndpoint | null> {
  let raw: string;
  try {
    raw = await readFileSync(endpointPath(home), "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const record = asRecord(parsed);
  const pid = num(record?.["pid"]);
  const port = num(record?.["port"]);
  if (!record || pid === undefined || port === undefined) return null;
  const endpoint: NodeEndpoint = {
    pid,
    port,
    app: str(record["app"]) ?? "unknown",
    version: str(record["version"]) ?? "unknown",
    startedAt: str(record["startedAt"]) ?? new Date(0).toISOString(),
    path: str(record["path"]) ?? "/ws",
    token: str(record["token"]) ?? "",
  };
  const peerId = str(record["peerId"]);
  const ownerId = str(record["ownerId"]);
  const schema = num(record["schema"]);
  if (peerId) endpoint.peerId = peerId;
  if (ownerId) endpoint.ownerId = ownerId;
  if (schema !== undefined) endpoint.schema = schema;
  return endpoint;
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(tmp, file);
}

/** Publish where this process can be reached. */
export async function writeNodeEndpoint(home: string, endpoint: NodeEndpoint): Promise<void> {
  await writeJsonAtomic(endpointPath(home), endpoint);
}

/**
 * Claim the home, or report who holds it.
 *
 * `wx` is the whole mechanism: the create either wins or fails with `EEXIST`, so
 * two processes starting in the same instant cannot both believe they own it. A
 * claim whose pid is gone is **taken over** — a crashed node must not lock the
 * user out of their own profile — and the caller is told that it happened, because
 * a takeover means the previous owner did not shut down cleanly.
 */
export async function acquireNodeLock(
  home: string,
  info: Omit<NodeLockInfo, "startedAt"> & { startedAt?: string },
): Promise<AcquireNodeLockResult> {
  const record: NodeLockInfo = {
    pid: info.pid,
    app: info.app,
    version: info.version,
    startedAt: info.startedAt ?? new Date().toISOString(),
  };
  await mkdir(home, { recursive: true, mode: 0o700 });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await nodeFs.promises.open(lockPath(home), "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
      await handle.close();
      return { acquired: true, lock: record, tookOverStale: attempt > 0 };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }

    const existing = await readNodeLock(home);
    if (existing && isProcessAlive(existing.pid)) {
      return { acquired: false, holder: existing, endpoint: await readNodeEndpoint(home) };
    }
    // Stale (or unreadable) claim: remove it and try once more. The second attempt
    // can still lose to another process doing the same thing, which is fine — the
    // loser returns `acquired: false` and reports the winner.
    await unlink(lockPath(home)).catch(() => undefined);
  }

  const holder = await readNodeLock(home);
  return {
    acquired: false,
    holder: holder ?? { pid: 0, app: "unknown", version: "unknown", startedAt: new Date(0).toISOString() },
    endpoint: await readNodeEndpoint(home),
  };
}

/**
 * Release the claim — **only if this process holds it**.
 *
 * Without the pid check a node that lost the race, or a stale cleanup, could
 * delete the live owner's lock and let a third process in.
 */
export async function releaseNodeLock(home: string, pid: number = process.pid): Promise<boolean> {
  const existing = await readNodeLock(home);
  if (!existing || existing.pid !== pid) return false;
  await unlink(lockPath(home)).catch(() => undefined);
  await unlink(endpointPath(home)).catch(() => undefined);
  return true;
}

/**
 * The same thing, synchronously, for `process.on("exit")`.
 *
 * `exit` handlers cannot await anything, so the async version never finished there
 * — a clean shutdown still left a lock file behind and the next start reported it
 * as stale. Stale claims are handled (they are taken over), so this was never
 * fatal; it just made every clean exit look like a crash.
 */
export function releaseNodeLockSync(home: string, pid: number = process.pid): boolean {
  let existing: NodeLockInfo | null = null;
  try {
    existing = JSON.parse(readFileSync(lockPath(home), "utf8")) as NodeLockInfo;
  } catch {
    return false;
  }
  if (!existing || existing.pid !== pid) return false;
  for (const file of [lockPath(home), endpointPath(home)]) {
    try {
      nodeFs.unlinkSync(file);
    } catch {
      // already gone
    }
  }
  return true;
}

export interface NodeProbeResult {
  /** The endpoint answered `/health` with a healthy payload. */
  reachable: boolean;
  /** True when the payload named this node's peer id / owner id and they match. */
  identityVerified: boolean;
  /** True when the endpoint does not report identity at all (older build). */
  identityUnknown: boolean;
  peerId?: string;
  ownerId?: string;
  service?: string;
  error?: string;
}

/**
 * Ask a candidate endpoint who it is.
 *
 * Two questions, deliberately separate: *is something serving there* and *is it the
 * node we mean*. The transport's `/health` body is identical across products, so
 * `reachable` alone proves nothing about ownership — the same reason the desktop
 * liveness probe can be satisfied by a different product holding the port.
 */
export async function probeNodeEndpoint(
  endpoint: Pick<NodeEndpoint, "port"> & Partial<Pick<NodeEndpoint, "peerId" | "ownerId">>,
  opts: { timeoutMs?: number; host?: string } = {},
): Promise<NodeProbeResult> {
  const timeoutMs = opts.timeoutMs ?? 2_000;
  const host = opts.host ?? "127.0.0.1";
  return await new Promise<NodeProbeResult>((resolve) => {
    let settled = false;
    const finish = (result: NodeProbeResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const req = request(
      { host, port: endpoint.port, path: "/health", method: "GET", timeout: timeoutMs },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
          if (body.length > 16_384) req.destroy();
        });
        res.on("end", () => {
          let parsed: Record<string, unknown> | null = null;
          try {
            parsed = asRecord(JSON.parse(body));
          } catch {
            parsed = null;
          }
          if (res.statusCode !== 200 || !parsed || parsed["ok"] !== true) {
            finish({ reachable: false, identityVerified: false, identityUnknown: false, error: `status ${res.statusCode}` });
            return;
          }
          const peerId = str(parsed["peerId"]);
          const ownerId = str(parsed["ownerId"]);
          const service = str(parsed["service"]);
          if (!peerId && !ownerId) {
            finish({
              reachable: true,
              identityVerified: false,
              identityUnknown: true,
              ...(service ? { service } : {}),
            });
            return;
          }
          const matches =
            (!endpoint.peerId || !peerId || endpoint.peerId === peerId) &&
            (!endpoint.ownerId || !ownerId || endpoint.ownerId === ownerId);
          finish({
            reachable: true,
            identityVerified: matches,
            identityUnknown: false,
            ...(peerId ? { peerId } : {}),
            ...(ownerId ? { ownerId } : {}),
            ...(service ? { service } : {}),
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      finish({ reachable: false, identityVerified: false, identityUnknown: false, error: "timed out" });
    });
    req.on("error", (err) => {
      finish({
        reachable: false,
        identityVerified: false,
        identityUnknown: false,
        error: (err as NodeJS.ErrnoException).code ?? err.message,
      });
    });
    req.end();
  });
}
