import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DISCOVERY_SEED_FILE = "discovery-seeds.json";
const MAX_DISCOVERY_SEEDS = 256;

export type DiscoverySeedSource = "bootstrap-probe" | "peer.discovery" | "manual-bootstrap";

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
    },

    async upsertMany(addrs, source, at) {
      for (const addr of addrs) {
        await this.upsertSuccess(addr, source, at);
      }
    },
  };
}

async function readDiscoverySeedFile(path: string): Promise<DiscoverySeedFile> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as DiscoverySeedFile;
  } catch (error) {
    if (isMissingFileError(error)) {
      return { version: "0.1", records: [] };
    }
    throw error;
  }
}

async function writeDiscoverySeedFile(path: string, file: DiscoverySeedFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(file, null, 2), { mode: 0o600 });
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
