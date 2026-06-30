/**
 * Local JSON-file persistence stores (Phases 23 / 25D).
 *
 * Extracted from `node-service-impl.ts`. The intent history and
 * published library share a pattern: a bounded in-memory cache
 * mirrored to a profile-scoped JSON file. Both are now modelled as
 * small store classes so the in-memory state lives with the code
 * that reads / writes / persists it, and can be unit-tested without
 * a NodeServiceImpl instance.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/* ---------- shared JSON-on-disk shape ---------- */

export interface FileBackedStoreDeps {
  /** Resolve the JSON file path under the local profile dir, or null if unavailable. */
  getFilePath(): string | null;
  /** Override the wall clock for tests. */
  now?: () => Date;
}

/** Append a value to a JSON file under a fixed schema version, best-effort. */
async function writeJsonFile(
  filePath: string,
  payload: { version: string; [key: string]: unknown },
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

/* ---------- Intent history (Phase 25D) ---------- */

export interface IntentHistoryEntry {
  intent: string;
  query: string;
  timestamp: string;
}

export interface IntentHistoryStoreOptions extends FileBackedStoreDeps {
  /** Cap on retained entries (oldest are evicted first). */
  maxEntries: number;
}

export class IntentHistoryStore {
  private readonly maxEntries: number;
  private readonly getFilePath: () => string | null;
  private readonly now: () => Date;
  private history: IntentHistoryEntry[] = [];

  constructor(opts: IntentHistoryStoreOptions) {
    this.maxEntries = opts.maxEntries;
    this.getFilePath = opts.getFilePath;
    this.now = opts.now ?? (() => new Date());
  }

  /** Record a recent intent event. Evicts oldest entries past the cap. */
  record(intent: string, query: string): void {
    this.history.push({ intent, query, timestamp: this.now().toISOString() });
    while (this.history.length > this.maxEntries) {
      this.history.shift();
    }
  }

  /** Best-effort persist to disk. In-memory state is updated regardless. */
  async persist(): Promise<void> {
    const path = this.getFilePath();
    if (!path) return;
    try {
      await writeJsonFile(path, { version: "0.1", history: this.history });
    } catch (err) {
      console.warn(
        "[intent-history] persist failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  /** Load intent history from disk. Silently no-ops when no file exists. */
  async loadFromDisk(): Promise<void> {
    const path = this.getFilePath();
    if (!path) return;
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as { history?: IntentHistoryEntry[] };
      if (Array.isArray(parsed.history)) {
        this.history = parsed.history.slice(-this.maxEntries);
      }
    } catch {
      // No persisted history yet.
    }
  }

  /** Return a snapshot of the in-memory history (defensive copy). */
  getHistory(): IntentHistoryEntry[] {
    return [...this.history];
  }

  /** Drop all in-memory entries. Does not touch disk. */
  clear(): void {
    this.history = [];
  }
}

/* ---------- Published library (Phase 23) ---------- */

export interface PublishedLibraryEntry {
  title: string;
  topicTags: string[];
  sensitivity: string;
  publishedAt: string;
}

export interface PublishedLibraryRecord {
  ownerId: string;
  entries: PublishedLibraryEntry[];
}

export class PublishedLibraryStore {
  private readonly getFilePath: () => string | null;
  private readonly now: () => Date;
  private readonly library = new Map<string, PublishedLibraryEntry[]>();

  constructor(opts: FileBackedStoreDeps) {
    this.getFilePath = opts.getFilePath;
    this.now = opts.now ?? (() => new Date());
  }

  /** Append a new document entry for the local owner. */
  publish(input: {
    title: string;
    topicTags: string[];
    sensitivity?: string;
  }): PublishedLibraryEntry {
    const entry: PublishedLibraryEntry = {
      title: input.title,
      topicTags: input.topicTags,
      sensitivity: input.sensitivity ?? "public",
      publishedAt: this.now().toISOString(),
    };
    const list = this.library.get("local") ?? [];
    list.push(entry);
    this.library.set("local", list);
    return entry;
  }

  /** Replace any prior entries for the given ownerId (idempotent). */
  setForPeer(
    ownerId: string,
    entries: Array<Omit<PublishedLibraryEntry, "publishedAt"> & { publishedAt?: string }>,
  ): void {
    this.library.set(
      ownerId,
      entries.map((e) => ({
        ...e,
        publishedAt: e.publishedAt ?? this.now().toISOString(),
      })),
    );
  }

  /** Return entries for a given ownerId, or all entries across all owners. */
  getEntries(ownerId?: string): PublishedLibraryEntry[] {
    if (ownerId !== undefined) {
      return [...(this.library.get(ownerId) ?? [])];
    }
    const all: PublishedLibraryEntry[] = [];
    for (const list of this.library.values()) all.push(...list);
    return all;
  }

  /** Aggregate topic tags for a given ownerId. Returns [] for unknown owners. */
  getTopicsForContact(ownerId: string): string[] {
    const entries = this.library.get(ownerId) ?? [];
    const tags = new Set<string>();
    for (const e of entries) {
      for (const t of e.topicTags) tags.add(t);
    }
    return Array.from(tags);
  }

  /** Persist the current library state to disk. */
  async persist(): Promise<void> {
    const path = this.getFilePath();
    if (!path) return;
    const snapshot: PublishedLibraryRecord[] = [];
    for (const [ownerId, entries] of this.library.entries()) {
      snapshot.push({ ownerId, entries });
    }
    await writeJsonFile(path, { version: "0.1", snapshot });
  }

  /** Load the library from disk. Silently no-ops when no file exists. */
  async loadFromDisk(): Promise<void> {
    const path = this.getFilePath();
    if (!path) return;
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as { snapshot?: PublishedLibraryRecord[] };
      if (Array.isArray(parsed.snapshot)) {
        for (const { ownerId, entries } of parsed.snapshot) {
          this.library.set(ownerId, entries);
        }
      }
    } catch {
      // No persisted library yet — that's fine.
    }
  }

  /** Drop all in-memory entries. Does not touch disk. */
  clear(): void {
    this.library.clear();
  }
}

/* ---------- file-path helpers (used by class to build the stores) ---------- */

export function buildIntentHistoryFilePath(profileDir: string | null): string | null {
  if (!profileDir) return null;
  return join(profileDir, "intent-history.json");
}

export function buildPublishedLibraryFilePath(profileDir: string | null): string | null {
  if (!profileDir) return null;
  return join(profileDir, "published-library.json");
}