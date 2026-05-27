import { appendFile, mkdir, readFile } from "node:fs/promises";
import { basename, dirname } from "node:path";

const MAX_INDEX_LINE_CHARS = 64 * 1024;

export interface JsonlIndexEntry {
  id: string;
  createdAt: string;
  correlationId?: string;
  taskId?: string;
  /** Extra fields stored inline for query-without-full-jsonl-scan */
  payload: Record<string, unknown>;
}

export interface JsonlIndexQueryParams {
  since?: string;
  until?: string;
  correlationId?: string;
  taskId?: string;
  limit?: number;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function appendIndexLine(path: string, entry: JsonlIndexEntry): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const line = `${JSON.stringify(entry)}\n`;
  if (line.length > MAX_INDEX_LINE_CHARS) {
    throw new Error(`Index line too large for ${basename(path)}`);
  }
  await appendFile(path, line, { encoding: "utf8", mode: 0o600 });
}

export async function readJsonlIndex(path: string): Promise<JsonlIndexEntry[]> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }

  const out: JsonlIndexEntry[] = [];
  for (const line of contents.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as JsonlIndexEntry);
    } catch {
      /* skip corrupt index lines */
    }
  }
  return out;
}

export function queryJsonlIndex(
  rows: readonly JsonlIndexEntry[],
  params: JsonlIndexQueryParams,
): JsonlIndexEntry[] {
  let filtered = [...rows];

  if (params.since) {
    const sinceMs = new Date(params.since).getTime();
    filtered = filtered.filter((row) => new Date(row.createdAt).getTime() >= sinceMs);
  }
  if (params.until) {
    const untilMs = new Date(params.until).getTime();
    filtered = filtered.filter((row) => new Date(row.createdAt).getTime() < untilMs);
  }
  if (params.correlationId?.trim()) {
    const needle = params.correlationId.trim();
    filtered = filtered.filter((row) => row.correlationId === needle);
  }
  if (params.taskId?.trim()) {
    const needle = params.taskId.trim();
    filtered = filtered.filter((row) => row.taskId === needle);
  }

  filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const cap = Math.max(1, Math.min(params.limit ?? 200, 5000));
  return filtered.slice(0, cap);
}

export function createJsonlIndexAppender(indexPath: string): (entry: JsonlIndexEntry) => Promise<void> {
  let tail: Promise<unknown> = Promise.resolve();
  return (entry: JsonlIndexEntry) => {
    const done = tail.then(() => appendIndexLine(indexPath, entry));
    tail = done.then(
      () => {},
      () => {},
    );
    return done;
  };
}

export async function rebuildJsonlIndex<T extends { eventId?: string; activityId?: string; createdAt: string }>(
  sourceRows: readonly T[],
  indexPath: string,
  toEntry: (row: T) => JsonlIndexEntry,
): Promise<number> {
  await mkdir(dirname(indexPath), { recursive: true });
  const lines = sourceRows.map((row) => `${JSON.stringify(toEntry(row))}\n`).join("");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(indexPath, lines, { mode: 0o600 });
  return sourceRows.length;
}
