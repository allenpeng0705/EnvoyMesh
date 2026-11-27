/**
 * Native Context Memory recall arms:
 * lexical (TF–IDF + Jaccard) · FSRS activation · 2-hop graph diffusion.
 */
import {
  createBuiltinLexicon,
  type MemoryLexicon,
} from "./context-memory-dict.js";

const PIN_IMPORTANCE = 1;
const DAY_MS = 86400000;

/** Unicode-aware tokens length ≥ 2. */
export function tokenizeForMemory(text: string): string[] {
  const matches = String(text ?? "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]{2,}/gu);
  return matches ?? [];
}

function normalizeToken(raw: string, lexicon: MemoryLexicon): string {
  const t = raw.toLowerCase();
  return lexicon.typoMap[t] ?? t;
}

/** Expand tokens with typos + synonym peers (bounded). */
export function expandMemoryTokens(
  tokens: readonly string[],
  lexicon: MemoryLexicon = createBuiltinLexicon(),
  maxExtra = 12,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let extra = 0;
  for (const raw of tokens) {
    const t = normalizeToken(raw, lexicon);
    if (t.length < 2 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (extra >= maxExtra) continue;
    const peers = lexicon.synonymIndex.get(t);
    if (!peers) continue;
    for (const p of peers) {
      if (seen.has(p) || extra >= maxExtra) continue;
      seen.add(p);
      out.push(p);
      extra++;
    }
  }
  return out;
}

export function tokenSetExpanded(
  text: string,
  lexicon: MemoryLexicon = createBuiltinLexicon(),
): Set<string> {
  return new Set(expandMemoryTokens(tokenizeForMemory(text), lexicon));
}

export function jaccardTokens(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter++;
  }
  const union = a.size + b.size - inter;
  return union <= 0 ? 0 : inter / union;
}

export function buildDocFreq(
  docs: readonly string[],
  lexicon: MemoryLexicon = createBuiltinLexicon(),
): { df: Map<string, number>; n: number } {
  const df = new Map<string, number>();
  for (const doc of docs) {
    const uniq = tokenSetExpanded(doc, lexicon);
    for (const t of uniq) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  return { df, n: docs.length };
}

function idf(term: string, df: Map<string, number>, n: number): number {
  const d = df.get(term) ?? 0;
  return Math.log(1 + n / (1 + d));
}

export function tfidfCosine(
  queryTokens: readonly string[],
  docText: string,
  df: Map<string, number>,
  n: number,
  lexicon: MemoryLexicon = createBuiltinLexicon(),
): number {
  if (queryTokens.length === 0 || n <= 0) return 0;
  const docTokens = expandMemoryTokens(tokenizeForMemory(docText), lexicon);
  if (docTokens.length === 0) return 0;

  const qTf = new Map<string, number>();
  for (const t of queryTokens) {
    qTf.set(t, (qTf.get(t) ?? 0) + 1);
  }
  const dTf = new Map<string, number>();
  for (const t of docTokens) {
    dTf.set(t, (dTf.get(t) ?? 0) + 1);
  }

  let dot = 0;
  let qNorm = 0;
  let dNorm = 0;
  for (const [t, tf] of qTf) {
    const w = (tf / queryTokens.length) * idf(t, df, n);
    qNorm += w * w;
    const dtf = dTf.get(t);
    if (dtf) {
      const dw = (dtf / docTokens.length) * idf(t, df, n);
      dot += w * dw;
    }
  }
  for (const [t, tf] of dTf) {
    const w = (tf / docTokens.length) * idf(t, df, n);
    dNorm += w * w;
  }
  if (qNorm <= 0 || dNorm <= 0) return 0;
  return dot / (Math.sqrt(qNorm) * Math.sqrt(dNorm));
}

/** FSRS-style retention R = exp(-Δt / S). Pin → 1. */
export function memoryRetention(input: {
  importance: number;
  stability?: number;
  lastAccessAt?: string;
  createdAt: string;
  nowMs?: number;
}): number {
  if (input.importance >= PIN_IMPORTANCE) return 1;
  const S = Math.max(0.05, Math.min(3650, Number(input.stability ?? 1) || 1));
  const lastAccess = Date.parse(input.lastAccessAt || "");
  const created = Date.parse(input.createdAt);
  const last = Number.isFinite(lastAccess)
    ? lastAccess
    : Number.isFinite(created)
      ? created
      : NaN;
  // Untouched / unparseable timestamps: treat as never reviewed (low R) so
  // the first successful recall still strengthens stability.
  if (!Number.isFinite(last)) return 0.2;
  const now = input.nowMs ?? Date.now();
  const ageDays = Math.max(0, (now - last) / DAY_MS);
  return Math.max(0, Math.min(1, Math.exp(-ageDays / S)));
}

/** After a successful recall hit: bump stability (FSRS-lite touch). */
export function nextStabilityAfterTouch(input: {
  stability?: number;
  retention: number;
  /** First successful recall (no prior lastAccessAt). */
  firstTouch?: boolean;
}): number {
  const S = Math.max(0.05, Math.min(3650, Number(input.stability ?? 1) || 1));
  const R = Math.max(0, Math.min(1, input.retention));
  // Fresh facts (R≈1) still get a small first-review bump.
  const boost = input.firstTouch ? Math.max(1.15, 1 + 1.5 * (1 - R)) : 1 + 1.5 * (1 - R);
  return Math.max(0.05, Math.min(3650, S * boost));
}

export type Adjacency = Map<string, Map<string, number>>;

/** Build semantic adjacency from token overlap (Jaccard ≥ minW). Cap degree. */
export function buildSemanticAdjacency(
  facts: readonly { id: string; text: string }[],
  lexicon: MemoryLexicon,
  opts?: { minWeight?: number; maxDegree?: number },
): Adjacency {
  const minW = opts?.minWeight ?? 0.18;
  const maxDeg = opts?.maxDegree ?? 16;
  const tokenSets = facts.map((f) => ({
    id: f.id,
    tokens: tokenSetExpanded(f.text, lexicon),
  }));
  const adj: Adjacency = new Map();
  const ensure = (id: string) => {
    let m = adj.get(id);
    if (!m) {
      m = new Map();
      adj.set(id, m);
    }
    return m;
  };
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const a = tokenSets[i]!;
      const b = tokenSets[j]!;
      const w = jaccardTokens(a.tokens, b.tokens);
      if (w < minW) continue;
      ensure(a.id).set(b.id, w);
      ensure(b.id).set(a.id, w);
    }
  }
  return capAdjacencyDegree(adj, maxDeg);
}

/** Keep strongest edges per node, then drop asymmetric leftovers. */
export function capAdjacencyDegree(adj: Adjacency, maxDeg: number): Adjacency {
  const capped: Adjacency = new Map();
  for (const [id, neighbors] of adj) {
    if (neighbors.size <= maxDeg) {
      capped.set(id, new Map(neighbors));
      continue;
    }
    const top = [...neighbors.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, maxDeg);
    capped.set(id, new Map(top));
  }
  // Symmetrize: keep edge only if both endpoints retained it.
  for (const [a, neighbors] of capped) {
    for (const [b] of [...neighbors]) {
      const back = capped.get(b)?.get(a);
      if (back == null) neighbors.delete(b);
    }
  }
  return capped;
}

/** Merge hebbian weights into adjacency (max with semantic), then re-cap. */
export function mergeHebbianEdges(
  adj: Adjacency,
  edges: readonly { a: string; b: string; w: number }[],
  opts?: { maxDegree?: number },
): Adjacency {
  const out: Adjacency = new Map();
  for (const [id, neighbors] of adj) {
    out.set(id, new Map(neighbors));
  }
  const bump = (from: string, to: string, w: number) => {
    if (!(w > 0) || from === to) return;
    let m = out.get(from);
    if (!m) {
      m = new Map();
      out.set(from, m);
    }
    m.set(to, Math.max(m.get(to) ?? 0, Math.min(1, w)));
  };
  for (const e of edges) {
    const w = Number(e.w);
    if (!Number.isFinite(w) || w <= 0) continue;
    bump(e.a, e.b, w);
    bump(e.b, e.a, w);
  }
  return capAdjacencyDegree(out, opts?.maxDegree ?? 16);
}

/**
 * 2-hop diffusion: A(v) = MAX over paths ∏(w · γ^hop) · seed.
 * Seeds are lexical scores (0..1).
 */
export function diffuseGraph(
  seeds: Map<string, number>,
  adj: Adjacency,
  opts?: { hops?: number; gamma?: number },
): Map<string, number> {
  const hops = Math.max(1, Math.min(2, opts?.hops ?? 2));
  const gamma = opts?.gamma ?? 0.55;
  const out = new Map<string, number>();
  let frontier = new Map<string, number>();
  for (const [id, s] of seeds) {
    const score = Math.max(0, Math.min(1, s));
    if (score <= 0) continue;
    out.set(id, score);
    frontier.set(id, score);
  }
  for (let hop = 1; hop <= hops; hop++) {
    if (frontier.size === 0) break;
    const next = new Map<string, number>();
    for (const [fromId, act] of frontier) {
      const neighbors = adj.get(fromId);
      if (!neighbors) continue;
      for (const [toId, w] of neighbors) {
        if (!(w > 0.001)) continue;
        const cand = act * w * Math.pow(gamma, hop);
        if (!(cand > 0)) continue;
        const prev = next.get(toId) ?? 0;
        if (cand > prev) next.set(toId, cand);
      }
    }
    for (const [id, act] of next) {
      const prev = out.get(id) ?? 0;
      if (act > prev) out.set(id, act);
    }
    frontier = next;
  }
  return out;
}

function normalizeScores(raw: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const v of raw.values()) {
    if (v > max) max = v;
  }
  const out = new Map<string, number>();
  if (max <= 0) return out;
  for (const [k, v] of raw) {
    out.set(k, v / max);
  }
  return out;
}

export interface RankableFact {
  id: string;
  text: string;
  importance: number;
  stability?: number;
  lastAccessAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RankedHit {
  id: string;
  score: number;
  lexical: number;
  activation: number;
  graph: number;
}

/**
 * Multi-arm recall ranker. Does not mutate facts (touch is caller's job).
 */
export function rankMemoryFacts(input: {
  query: string;
  facts: readonly RankableFact[];
  lexicon?: MemoryLexicon;
  hebbianEdges?: readonly { a: string; b: string; w: number }[];
  nowMs?: number;
  limit?: number;
}): RankedHit[] {
  const lexicon = input.lexicon ?? createBuiltinLexicon();
  const facts = input.facts;
  const limit = Math.max(1, input.limit ?? 8);
  const nowMs = input.nowMs ?? Date.now();
  if (facts.length === 0) return [];

  const q = String(input.query ?? "").trim();
  // Empty query → no automatic inject (callers use listFacts for browse).
  if (!q) return [];

  const qTokens = expandMemoryTokens(tokenizeForMemory(q), lexicon);
  const qSet = new Set(qTokens);
  const { df, n } = buildDocFreq(
    facts.map((f) => f.text),
    lexicon,
  );

  const lexRaw = new Map<string, number>();
  const actRaw = new Map<string, number>();
  for (const fact of facts) {
    const jac = jaccardTokens(qSet, tokenSetExpanded(fact.text, lexicon));
    const tfidf = tfidfCosine(qTokens, fact.text, df, n, lexicon);
    const lexical = 0.65 * tfidf + 0.35 * jac;
    if (lexical > 0.02) lexRaw.set(fact.id, lexical);

    const R = memoryRetention({
      importance: fact.importance,
      stability: fact.stability,
      lastAccessAt: fact.lastAccessAt,
      createdAt: fact.createdAt,
      nowMs,
    });
    // Activation requires some lexical signal so sticky prefs do not flood
    // unrelated queries (pin still wins via high lexical when relevant).
    if (lexical > 0.01) {
      actRaw.set(fact.id, fact.importance * R);
    }
  }

  const lexNorm = normalizeScores(lexRaw);
  const actNorm = normalizeScores(actRaw);

  // Graph: seed from top lexical, diffuse 2 hops.
  const seedEntries = [...lexNorm.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const seeds = new Map(seedEntries);
  let semantic = buildSemanticAdjacency(
    facts.map((f) => ({ id: f.id, text: f.text })),
    lexicon,
  );
  if (input.hebbianEdges?.length) {
    semantic = mergeHebbianEdges(semantic, input.hebbianEdges, { maxDegree: 16 });
  }
  const graphRaw = diffuseGraph(seeds, semantic, { hops: 2, gamma: 0.55 });
  // Drop pure seeds from graph contribution? Keep them; fusion handles weight.
  const graphNorm = normalizeScores(graphRaw);

  const ids = new Set<string>([
    ...lexNorm.keys(),
    ...actNorm.keys(),
    ...graphNorm.keys(),
  ]);
  const hits: RankedHit[] = [];
  for (const id of ids) {
    const lexical = lexNorm.get(id) ?? 0;
    const activation = actNorm.get(id) ?? 0;
    const graph = graphNorm.get(id) ?? 0;
    // Keep lexical / activation hits, and graph neighbors (even weak hop-1).
    if (lexical <= 0 && activation <= 0 && graph <= 0) continue;
    const score = 0.5 * lexical + 0.3 * activation + 0.2 * graph;
    if (score <= 0.015) continue;
    hits.push({ id, score, lexical, activation, graph });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/** Hebbian bump for co-activated pair (η=0.02, saturating). */
export function nextHebbianWeight(prev: number, strength = 1): number {
  const w = Math.max(0, Math.min(1, prev));
  const eta = 0.02;
  const a = Math.max(0, Math.min(1, strength));
  return Math.max(0, Math.min(1, w + eta * a * a * (1 - w)));
}

/** @deprecated Prefer rankMemoryFacts — kept for older call sites. */
export function scoreMemoryFact(input: {
  query: string;
  factText: string;
  importance: number;
  updatedAt: string;
  createdAt: string;
  df: Map<string, number>;
  n: number;
  nowMs?: number;
  lexicon?: MemoryLexicon;
  stability?: number;
  lastAccessAt?: string;
}): number {
  const ranked = rankMemoryFacts({
    query: input.query,
    facts: [
      {
        id: "x",
        text: input.factText,
        importance: input.importance,
        stability: input.stability,
        lastAccessAt: input.lastAccessAt,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      },
    ],
    lexicon: input.lexicon,
    nowMs: input.nowMs,
    limit: 1,
  });
  return ranked[0]?.score ?? 0;
}
