/**
 * Phase 70 — Envoy-native Context Memory fact store.
 * JSONL banks + FSRS touch + hebbian edges + user-dict lexicon.
 */
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import {
  loadMergedLexicon,
  type MemoryLexicon,
} from "./context-memory-dict.js";
import {
  CONTEXT_MEMORY_DEFAULT_NAMESPACE,
  CONTEXT_MEMORY_DIR,
  CONTEXT_MEMORY_EDGES_FILE,
  CONTEXT_MEMORY_FACTS_FILE,
  contextMemoryBankDir,
  contextMemoryEdgesPath,
  contextMemoryFactsPath,
  normalizeContextMemoryNamespace,
} from "./context-memory-paths.js";
import {
  memoryRetention,
  nextHebbianWeight,
  nextStabilityAfterTouch,
  rankMemoryFacts,
  tokenizeForMemory,
} from "./context-memory-recall.js";

export { tokenizeForMemory } from "./context-memory-recall.js";
export {
  buildContextMemoryExtractPrompt,
  extractDurableFactsFromTurn,
  isTransientFactSnippet,
  mergeExtractedFacts,
  parseLlmExtractedFacts,
  parseMemoryMdSeedLines,
  shouldTryLlmFactExtract,
} from "./context-memory-extract.js";
export {
  CONTEXT_MEMORY_DEFAULT_NAMESPACE,
  CONTEXT_MEMORY_DIR,
  CONTEXT_MEMORY_EDGES_FILE,
  CONTEXT_MEMORY_FACTS_FILE,
  contextMemoryBankDir,
  contextMemoryEdgesPath,
  contextMemoryFactsPath,
  isValidContextMemoryNamespace,
  normalizeContextMemoryNamespace,
} from "./context-memory-paths.js";
export {
  CONTEXT_MEMORY_USER_DICT_FILE,
  loadUserMemoryDict,
  userDictPath,
} from "./context-memory-dict.js";
export {
  expandMemoryTokens,
  memoryRetention,
  nextStabilityAfterTouch,
  rankMemoryFacts,
} from "./context-memory-recall.js";

/** Soft cap: drop oldest low-importance non-pinned after compact. */
export const CONTEXT_MEMORY_MAX_ACTIVE = 1500;
const COMPACT_TOMBSTONE_THRESHOLD = 24;
const COMPACT_OPS_THRESHOLD = 48;

const MAX_TEXT = 2000;
const DEFAULT_RENDER_CHARS = 1200;
const PIN_IMPORTANCE = 1;

export interface ContextMemoryFactRecord {
  id: string;
  text: string;
  tags: string[];
  importance: number;
  createdAt: string;
  updatedAt: string;
  source?: string;
  deleted?: boolean;
  /** FSRS-lite stability in days (default 1). */
  stability?: number;
  lastAccessAt?: string;
  accessCount?: number;
}

export interface RememberInput {
  text: string;
  tags?: string[];
  importance?: number;
  source?: string;
}

export interface RecallHit {
  fact: ContextMemoryFactRecord;
  score: number;
}

export interface CompactResult {
  rewritten: boolean;
  activeBefore: number;
  activeAfter: number;
  dropped: number;
}

export interface ContextMemoryHebbianEdge {
  a: string;
  b: string;
  w: number;
}

export interface ContextMemoryStore {
  namespace: string;
  ready(): boolean;
  open(): Promise<void>;
  remember(input: RememberInput): Promise<{ id: string; deduped: boolean }>;
  recall(query: string, limit?: number): Promise<RecallHit[]>;
  renderContext(query: string, maxChars?: number): Promise<string>;
  listFacts(): Promise<ContextMemoryFactRecord[]>;
  forget(id: string): Promise<boolean>;
  pin(id: string, pinned: boolean): Promise<boolean>;
  factCount(): number;
  compact(opts?: { force?: boolean }): Promise<CompactResult>;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function cleanText(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const s = String(t ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 48);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.slice(0, 16);
}

function parseFactLine(line: string): ContextMemoryFactRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const raw = JSON.parse(trimmed) as Partial<ContextMemoryFactRecord>;
    const text = cleanText(raw.text);
    if (!text || typeof raw.id !== "string" || !raw.id) return null;
    const createdAt =
      typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : new Date().toISOString();
    return {
      id: raw.id,
      text,
      tags: normalizeTags(raw.tags),
      importance: clamp01(Number(raw.importance ?? 0.5)),
      createdAt,
      updatedAt:
        typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : createdAt,
      source: typeof raw.source === "string" ? raw.source : undefined,
      deleted: raw.deleted === true,
      stability:
        typeof raw.stability === "number" && Number.isFinite(raw.stability)
          ? raw.stability
          : undefined,
      lastAccessAt: typeof raw.lastAccessAt === "string" ? raw.lastAccessAt : undefined,
      accessCount:
        typeof raw.accessCount === "number" && Number.isFinite(raw.accessCount)
          ? raw.accessCount
          : undefined,
    };
  } catch {
    return null;
  }
}

function serializeFactLine(rec: ContextMemoryFactRecord): string {
  return `${JSON.stringify({
    id: rec.id,
    text: rec.text,
    tags: rec.tags,
    importance: rec.importance,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    source: rec.source,
    deleted: rec.deleted === true ? true : undefined,
    stability: rec.stability,
    lastAccessAt: rec.lastAccessAt,
    accessCount: rec.accessCount,
  })}\n`;
}

function parseEdgeLine(line: string): ContextMemoryHebbianEdge | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const raw = JSON.parse(trimmed) as Partial<ContextMemoryHebbianEdge>;
    if (typeof raw.a !== "string" || typeof raw.b !== "string") return null;
    const w = Number(raw.w);
    if (!Number.isFinite(w) || w <= 0) return null;
    return { a: raw.a, b: raw.b, w: Math.min(1, w) };
  } catch {
    return null;
  }
}

export function createContextMemoryStore(
  profileDir: string,
  opts?: { namespace?: string | null },
): ContextMemoryStore {
  const namespace = normalizeContextMemoryNamespace(opts?.namespace);
  const dir = contextMemoryBankDir(profileDir, namespace);
  const path = contextMemoryFactsPath(profileDir, namespace);
  const edgesPath = contextMemoryEdgesPath(profileDir, namespace);
  const byId = new Map<string, ContextMemoryFactRecord>();
  /** Canonical undirected edge key → weight. */
  const hebbian = new Map<string, number>();
  let lexicon: MemoryLexicon | null = null;
  let opened = false;
  let opChain: Promise<void> = Promise.resolve();
  let opsSinceCompact = 0;

  function edgeKey(a: string, b: string): string {
    return a < b ? `${a}\0${b}` : `${b}\0${a}`;
  }

  function hebbianList(): ContextMemoryHebbianEdge[] {
    const out: ContextMemoryHebbianEdge[] = [];
    for (const [key, w] of hebbian) {
      const [a, b] = key.split("\0");
      if (!a || !b) continue;
      const fa = byId.get(a);
      const fb = byId.get(b);
      if (!fa || fa.deleted || !fb || fb.deleted) continue;
      out.push({ a, b, w });
    }
    return out;
  }

  function snapshotFact(fact: ContextMemoryFactRecord): ContextMemoryFactRecord {
    return {
      ...fact,
      tags: [...fact.tags],
    };
  }

  function pruneHebbianForId(id: string): void {
    for (const key of [...hebbian.keys()]) {
      const [a, b] = key.split("\0");
      if (a === id || b === id) hebbian.delete(key);
    }
  }

  function activeFacts(): ContextMemoryFactRecord[] {
    return [...byId.values()].filter((f) => !f.deleted);
  }

  function tombstoneCount(): number {
    let n = 0;
    for (const f of byId.values()) {
      if (f.deleted) n++;
    }
    return n;
  }

  function enqueueOp<T>(fn: () => Promise<T>): Promise<T> {
    const run = opChain.then(fn, fn);
    opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function appendRecordUnlocked(rec: ContextMemoryFactRecord): Promise<void> {
    await mkdir(dir, { recursive: true });
    const line = serializeFactLine(rec);
    if (line.length > 12_000) {
      throw new Error("context-memory: fact line too large");
    }
    await appendFile(path, line, { mode: 0o600 });
    opsSinceCompact++;
  }

  async function rewriteEdgesUnlocked(): Promise<void> {
    await mkdir(dir, { recursive: true });
    const lines = hebbianList()
      .filter((e) => e.w >= 0.01)
      .map((e) => `${JSON.stringify({ a: e.a, b: e.b, w: Number(e.w.toFixed(4)), kind: "hebbian" })}\n`);
    const tmp = `${edgesPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, lines.join(""), { mode: 0o600 });
    await rename(tmp, edgesPath);
  }

  function shouldCompact(): boolean {
    if (tombstoneCount() >= COMPACT_TOMBSTONE_THRESHOLD) return true;
    if (opsSinceCompact >= COMPACT_OPS_THRESHOLD) return true;
    if (activeFacts().length > CONTEXT_MEMORY_MAX_ACTIVE) return true;
    return false;
  }

  function enforceActiveCapUnlocked(): number {
    let dropped = 0;
    while (activeFacts().length > CONTEXT_MEMORY_MAX_ACTIVE) {
      const nonPinned = activeFacts()
        .filter((f) => f.importance < PIN_IMPORTANCE)
        .sort(
          (a, b) =>
            a.importance - b.importance || a.updatedAt.localeCompare(b.updatedAt),
        );
      const victim =
        nonPinned[0] ??
        activeFacts().sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
      if (!victim) break;
      byId.delete(victim.id);
      dropped++;
    }
    return dropped;
  }

  async function rewriteFileUnlocked(): Promise<void> {
    await mkdir(dir, { recursive: true });
    const lines = activeFacts()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((rec) => serializeFactLine({ ...rec, deleted: undefined }));
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, lines.join(""), { mode: 0o600 });
    await rename(tmp, path);
    for (const [id, f] of [...byId.entries()]) {
      if (f.deleted) byId.delete(id);
    }
    // Drop hebbian edges pointing at missing ids.
    for (const [key] of [...hebbian.entries()]) {
      const [a, b] = key.split("\0");
      if (!a || !b || !byId.has(a) || !byId.has(b)) hebbian.delete(key);
    }
    await rewriteEdgesUnlocked();
    opsSinceCompact = 0;
  }

  async function compactUnlocked(force: boolean): Promise<CompactResult> {
    if (!opened) {
      return { rewritten: false, activeBefore: 0, activeAfter: 0, dropped: 0 };
    }
    const activeBefore = activeFacts().length;
    if (!force && !shouldCompact()) {
      return { rewritten: false, activeBefore, activeAfter: activeBefore, dropped: 0 };
    }
    const dropped = enforceActiveCapUnlocked();
    await rewriteFileUnlocked();
    return {
      rewritten: true,
      activeBefore,
      activeAfter: activeFacts().length,
      dropped,
    };
  }

  async function maybeAutoCompactUnlocked(): Promise<void> {
    if (shouldCompact()) {
      await compactUnlocked(true);
    }
  }

  async function touchHitsUnlocked(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const nowMs = Date.now();
    for (const id of ids) {
      const fact = byId.get(id);
      if (!fact || fact.deleted) continue;
      const firstTouch = !fact.lastAccessAt;
      const R = memoryRetention({
        importance: fact.importance,
        stability: fact.stability,
        lastAccessAt: fact.lastAccessAt,
        createdAt: fact.createdAt,
        nowMs,
      });
      fact.stability = nextStabilityAfterTouch({
        stability: fact.stability,
        retention: R,
        firstTouch,
      });
      fact.lastAccessAt = now;
      fact.accessCount = (fact.accessCount ?? 0) + 1;
      fact.updatedAt = now;
      await appendRecordUnlocked(fact);
    }
    // Hebbian co-activation among returned hits.
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        if (!byId.has(a) || !byId.has(b)) continue;
        const key = edgeKey(a, b);
        const prev = hebbian.get(key) ?? 0;
        hebbian.set(key, nextHebbianWeight(prev, 1));
      }
    }
    if (ids.length >= 2) {
      await rewriteEdgesUnlocked();
    }
  }

  return {
    namespace,

    ready(): boolean {
      return opened;
    },

    async open(): Promise<void> {
      await enqueueOp(async () => {
        byId.clear();
        hebbian.clear();
        lexicon = await loadMergedLexicon(profileDir);
        try {
          const raw = await readFile(path, "utf8");
          for (const line of raw.split("\n")) {
            if (line.length > 12_000) continue;
            const fact = parseFactLine(line);
            if (!fact) continue;
            byId.set(fact.id, fact);
          }
        } catch (error) {
          if (!isMissingFileError(error)) throw error;
          await mkdir(dir, { recursive: true });
        }
        try {
          const rawEdges = await readFile(edgesPath, "utf8");
          for (const line of rawEdges.split("\n")) {
            const e = parseEdgeLine(line);
            if (!e) continue;
            if (!byId.has(e.a) || !byId.has(e.b)) continue;
            const key = edgeKey(e.a, e.b);
            hebbian.set(key, Math.max(hebbian.get(key) ?? 0, e.w));
          }
        } catch (error) {
          if (!isMissingFileError(error)) throw error;
        }
        opened = true;
        opsSinceCompact = 0;
        if (shouldCompact()) {
          await compactUnlocked(true);
        }
      });
    },

    async remember(input: RememberInput): Promise<{ id: string; deduped: boolean }> {
      return enqueueOp(async () => {
        if (!opened) throw new Error("context-memory: store not open");
        const text = cleanText(input.text);
        if (!text) throw new Error("context-memory: empty text");
        const now = new Date().toISOString();
        const tags = normalizeTags(input.tags);
        const importance = clamp01(Number(input.importance ?? 0.6));
        const source = typeof input.source === "string" ? input.source : undefined;
        const incomingTokens = new Set(tokenizeForMemory(text));

        for (const existing of activeFacts()) {
          const existingTokens = new Set(tokenizeForMemory(existing.text));
          let inter = 0;
          for (const t of incomingTokens) {
            if (existingTokens.has(t)) inter++;
          }
          const union = incomingTokens.size + existingTokens.size - inter;
          const sim = union <= 0 ? 0 : inter / union;
          if (sim < 0.92) continue;
          existing.updatedAt = now;
          existing.importance = Math.max(existing.importance, importance);
          existing.tags = normalizeTags([...existing.tags, ...tags]);
          if (source) existing.source = source;
          await appendRecordUnlocked(existing);
          await maybeAutoCompactUnlocked();
          return { id: existing.id, deduped: true };
        }

        const rec: ContextMemoryFactRecord = {
          id: randomUUID(),
          text,
          tags,
          importance,
          createdAt: now,
          updatedAt: now,
          source,
          stability: 1,
          // lastAccessAt left unset until first successful recall touch
          // so FSRS retention is low enough for a first-review bump.
          accessCount: 0,
        };
        byId.set(rec.id, rec);
        await appendRecordUnlocked(rec);
        await maybeAutoCompactUnlocked();
        return { id: rec.id, deduped: false };
      });
    },

    async recall(query: string, limit = 8): Promise<RecallHit[]> {
      if (!opened) return [];
      const q = cleanText(query);
      // Rank + snapshot + touch all on the op chain so concurrent forget/compact
      // cannot mutate live objects returned to callers.
      return enqueueOp(async () => {
        const facts = activeFacts();
        if (facts.length === 0) return [];
        const ranked = rankMemoryFacts({
          query: q,
          facts,
          lexicon: lexicon ?? undefined,
          hebbianEdges: hebbianList(),
          limit: Math.max(1, limit),
        });
        const hits: RecallHit[] = [];
        const ids: string[] = [];
        for (const r of ranked) {
          const fact = byId.get(r.id);
          if (!fact || fact.deleted) continue;
          hits.push({ fact: snapshotFact(fact), score: r.score });
          ids.push(fact.id);
        }
        if (ids.length > 0) {
          await touchHitsUnlocked(ids);
          await maybeAutoCompactUnlocked();
        }
        return hits;
      });
    },

    async renderContext(query: string, maxChars = DEFAULT_RENDER_CHARS): Promise<string> {
      const hits = await this.recall(query, 12);
      if (hits.length === 0) return "";
      const lines: string[] = ["### Context memory"];
      let used = lines[0]!.length;
      for (const { fact } of hits) {
        const pin = fact.importance >= PIN_IMPORTANCE ? " (pinned)" : "";
        const line = `- ${fact.text}${pin}`;
        if (used + line.length + 1 > maxChars) break;
        lines.push(line);
        used += line.length + 1;
      }
      return lines.length > 1 ? lines.join("\n") : "";
    },

    async listFacts(): Promise<ContextMemoryFactRecord[]> {
      if (!opened) return [];
      return enqueueOp(async () =>
        activeFacts()
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map(snapshotFact),
      );
    },

    async forget(id: string): Promise<boolean> {
      return enqueueOp(async () => {
        if (!opened) return false;
        const existing = byId.get(id);
        if (!existing || existing.deleted) return false;
        existing.deleted = true;
        existing.updatedAt = new Date().toISOString();
        pruneHebbianForId(id);
        await appendRecordUnlocked(existing);
        await rewriteEdgesUnlocked();
        await maybeAutoCompactUnlocked();
        return true;
      });
    },

    async pin(id: string, pinned: boolean): Promise<boolean> {
      return enqueueOp(async () => {
        if (!opened) return false;
        const existing = byId.get(id);
        if (!existing || existing.deleted) return false;
        existing.importance = pinned ? PIN_IMPORTANCE : Math.min(existing.importance, 0.9);
        existing.updatedAt = new Date().toISOString();
        await appendRecordUnlocked(existing);
        await maybeAutoCompactUnlocked();
        return true;
      });
    },

    factCount(): number {
      return activeFacts().length;
    },

    async compact(opts?: { force?: boolean }): Promise<CompactResult> {
      return enqueueOp(async () => compactUnlocked(opts?.force === true));
    },
  };
}
