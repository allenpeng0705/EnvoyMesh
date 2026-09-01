/**
 * Local Market Browse search history — Phase 63D (§7.6).
 * File: `{profileDir}/shop/search-history.json`
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const HISTORY_FILE = join("shop", "search-history.json");
const MAX_ENTRIES = 30;

export interface MarketSearchHistoryEntry {
  query: string;
  at: string;
}

interface HistoryFile {
  version: "0.1";
  entries: MarketSearchHistoryEntry[];
}

function isMissingFileError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const content = `${JSON.stringify(data, null, 2)}\n`;
  JSON.parse(content);
  const tmp = `${path}.tmp.${Date.now()}.${randomUUID().slice(0, 8)}`;
  await writeFile(tmp, content, { mode: 0o600 });
  await rename(tmp, path);
}

export interface MarketSearchHistoryStore {
  record(query: string): Promise<void>;
  list(limit?: number): Promise<MarketSearchHistoryEntry[]>;
  clear(): Promise<void>;
}

export function createMarketSearchHistoryStore(profileDir: string): MarketSearchHistoryStore {
  const path = join(profileDir, HISTORY_FILE);
  let queue: Promise<void> = Promise.resolve();

  async function read(): Promise<HistoryFile> {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as HistoryFile;
      if (parsed?.version !== "0.1" || !Array.isArray(parsed.entries)) {
        return { version: "0.1", entries: [] };
      }
      return parsed;
    } catch (err) {
      if (isMissingFileError(err)) return { version: "0.1", entries: [] };
      throw err;
    }
  }

  function enqueue(fn: () => Promise<void>): Promise<void> {
    queue = queue.then(fn, fn);
    return queue;
  }

  return {
    async record(query) {
      const q = query.trim();
      if (!q || q.length > 200) return;
      await enqueue(async () => {
        const file = await read();
        const next = file.entries.filter(
          (e) => e.query.trim().toLowerCase() !== q.toLowerCase(),
        );
        next.unshift({ query: q, at: new Date().toISOString() });
        await writeJsonAtomic(path, {
          version: "0.1",
          entries: next.slice(0, MAX_ENTRIES),
        } satisfies HistoryFile);
      });
    },
    async list(limit = 12) {
      const file = await read();
      return file.entries.slice(0, Math.max(1, Math.min(30, limit)));
    },
    async clear() {
      await enqueue(async () => {
        await writeJsonAtomic(path, { version: "0.1", entries: [] } satisfies HistoryFile);
      });
    },
  };
}
