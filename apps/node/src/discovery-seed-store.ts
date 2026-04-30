import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DISCOVERY_SEED_FILE = "discovery-seeds.json";
const MAX_DISCOVERY_SEEDS = 256;

export type DiscoverySeedSource =
  | "bootstrap-probe"
  | "peer.discovery"
  | "manual-bootstrap"
  | "capability-topic"
  | "relay-peers";

export interface DiscoverySeedRecord {
  addr: string;
  source: DiscoverySeedSource;
  lastSuccessAt: string;
}

interface DiscoverySeedFile {
  version: "0.1";
  records: DiscoverySeedRecord[];
}

export interface DiscoverySeedStore {
  listSeedRecords(): Promise<DiscoverySeedRecord[]>;
  listSeedAddrs(): Promise<string[]>;
  upsertSuccess(addr: string, source: DiscoverySeedSource, at?: string): Promise<void>;
  upsertMany(addrs: string[], source: DiscoverySeedSource, at?: string): Promise<void>;
}

export function createDiscoverySeedStore(profileDir: string): DiscoverySeedStore {
  const path = join(profileDir, DISCOVERY_SEED_FILE);
  /** Serialize read-modify-write so concurrent upserts cannot interleave torn truncates. */
  let writeChain = Promise.resolve<void>(undefined);

  function enqueueWrite(fn: () => Promise<void>): Promise<void> {
    const next = writeChain.then(fn);
    writeChain = next.catch(() => {});
    return next;
  }

  return {
    async listSeedRecords() {
      return (await readDiscoverySeedFile(path)).records.sort((left, right) =>
        right.lastSuccessAt.localeCompare(left.lastSuccessAt),
      );
    },

    async listSeedAddrs() {
      return (await this.listSeedRecords()).map((record) => record.addr);
    },

    async upsertSuccess(addr, source, at) {
      const trimmed = addr.trim();
      if (!trimmed) {
        return;
      }

      await enqueueWrite(async () => {
        const now = at ?? new Date().toISOString();
        const file = await readDiscoverySeedFile(path);
        const existing = file.records.find((record) => record.addr === trimmed);
        if (existing) {
          existing.lastSuccessAt = now;
          existing.source = source;
        } else {
          file.records.push({
            addr: trimmed,
            source,
            lastSuccessAt: now,
          });
        }
        file.records = file.records
          .sort((left, right) => right.lastSuccessAt.localeCompare(left.lastSuccessAt))
          .slice(0, MAX_DISCOVERY_SEEDS);
        await writeDiscoverySeedFile(path, file);
      });
    },

    async upsertMany(addrs, source, at) {
      for (const addr of addrs) {
        await this.upsertSuccess(addr, source, at);
      }
    },
  };
}

async function readDiscoverySeedFile(path: string): Promise<DiscoverySeedFile> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return { version: "0.1", records: [] };
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidDiscoverySeedFile(parsed)) {
      throw new Error("invalid discovery-seeds.json shape");
    }
    return parsed;
  } catch (cause) {
    await quarantineCorruptDiscoverySeedFile(path, raw, cause);
    return { version: "0.1", records: [] };
  }
}

function isValidDiscoverySeedFile(value: unknown): value is DiscoverySeedFile {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const file = value as Record<string, unknown>;
  if (file.version !== "0.1" || !Array.isArray(file.records)) {
    return false;
  }
  return file.records.every(
    (rec) =>
      rec !== null &&
      typeof rec === "object" &&
      typeof (rec as Record<string, unknown>).addr === "string" &&
      typeof (rec as Record<string, unknown>).source === "string" &&
      typeof (rec as Record<string, unknown>).lastSuccessAt === "string",
  );
}

async function quarantineCorruptDiscoverySeedFile(path: string, raw: string, cause: unknown): Promise<void> {
  const reason = cause instanceof Error ? cause.message : String(cause);
  console.warn(
    `[discovery-seeds] ${path} is unreadable (${reason}). Quarantining to a .bak file and starting with an empty seed list.`,
  );
  const backupPath = `${path}.corrupt.${Date.now()}.bak`;
  try {
    await writeFile(backupPath, raw, { mode: 0o600 });
  } catch {
    // best effort
  }
  try {
    await unlink(path);
  } catch {
    // next write may still overwrite
  }
}

/**
 * Replace `path` with the fully written `tmp`. On Windows, `rename(tmp, path)` often
 * returns EPERM when `path` already exists; delete the destination first (portable pattern).
 */
async function renameTempToPath(tmp: string, path: string): Promise<void> {
  if (process.platform === "win32") {
    try {
      await unlink(path);
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }
  }
  await rename(tmp, path);
}

async function writeDiscoverySeedFile(path: string, file: DiscoverySeedFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const payload = JSON.stringify(file, null, 2);
  const tmp = join(dirname(path), `.discovery-seeds.${randomUUID()}.tmp`);
  try {
    await writeFile(tmp, payload, { mode: 0o600 });
    await renameTempToPath(tmp, path);
  } catch (error) {
    try {
      await unlink(tmp);
    } catch {
      // best effort cleanup of orphaned temp
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
