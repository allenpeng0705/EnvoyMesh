import { describe, expect, it } from "vitest";
import { createBuiltinLexicon } from "../src/context-memory-dict.js";
import {
  buildDocFreq,
  buildSemanticAdjacency,
  capAdjacencyDegree,
  diffuseGraph,
  expandMemoryTokens,
  jaccardTokens,
  memoryRetention,
  mergeHebbianEdges,
  nextHebbianWeight,
  nextStabilityAfterTouch,
  rankMemoryFacts,
  tfidfCosine,
  tokenizeForMemory,
  tokenSetExpanded,
} from "../src/context-memory-recall.js";

describe("context-memory-recall", () => {
  const lexicon = createBuiltinLexicon();

  it("tokenizeForMemory keeps unicode letters/numbers length ≥ 2", () => {
    expect(tokenizeForMemory("I like VS Code 中文测试")).toEqual(
      expect.arrayContaining(["like", "vs", "code", "中文测试"]),
    );
    expect(tokenizeForMemory("a b")).toEqual([]);
  });

  it("expandMemoryTokens applies typos and synonyms", () => {
    const tokens = expandMemoryTokens(tokenizeForMemory("darkmode prefered"), lexicon);
    expect(tokens).toContain("dark");
    expect(tokens).toContain("preferred");
    expect(tokens.some((t) => t === "theme" || t === "preference")).toBe(true);
  });

  it("tfidfCosine ranks overlapping docs higher", () => {
    const docs = ["User prefers dark mode theme", "Totally unrelated cooking recipe"];
    const { df, n } = buildDocFreq(docs, lexicon);
    const q = expandMemoryTokens(tokenizeForMemory("dark theme preference"), lexicon);
    const a = tfidfCosine(q, docs[0]!, df, n, lexicon);
    const b = tfidfCosine(q, docs[1]!, df, n, lexicon);
    expect(a).toBeGreaterThan(b);
  });

  it("memoryRetention: pin=1, invalid dates low, aged decays", () => {
    const now = Date.now();
    expect(
      memoryRetention({
        importance: 1,
        createdAt: "not-a-date",
        nowMs: now,
      }),
    ).toBe(1);
    expect(
      memoryRetention({
        importance: 0.5,
        createdAt: "not-a-date",
        lastAccessAt: "also-bad",
        nowMs: now,
      }),
    ).toBe(0.2);
    const aged = memoryRetention({
      importance: 0.5,
      stability: 1,
      createdAt: new Date(now - 86400000 * 10).toISOString(),
      lastAccessAt: new Date(now - 86400000 * 10).toISOString(),
      nowMs: now,
    });
    expect(aged).toBeLessThan(0.01);
  });

  it("nextStabilityAfterTouch firstTouch bumps even when R≈1", () => {
    expect(nextStabilityAfterTouch({ stability: 1, retention: 1 })).toBe(1);
    expect(
      nextStabilityAfterTouch({ stability: 1, retention: 1, firstTouch: true }),
    ).toBeGreaterThan(1);
  });

  it("buildSemanticAdjacency is symmetric after degree cap", () => {
    const facts = Array.from({ length: 8 }, (_, i) => ({
      id: `f${i}`,
      text: `shared token alpha beta gamma unique${i} extra${i}`,
    }));
    const adj = buildSemanticAdjacency(facts, lexicon, { minWeight: 0.1, maxDegree: 2 });
    for (const [a, neighbors] of adj) {
      for (const [b] of neighbors) {
        expect(adj.get(b)?.has(a)).toBe(true);
      }
      expect(neighbors.size).toBeLessThanOrEqual(2);
    }
  });

  it("capAdjacencyDegree drops one-sided edges", () => {
    const adj = new Map<string, Map<string, number>>([
      ["a", new Map([["b", 0.9], ["c", 0.8], ["d", 0.7]])],
      ["b", new Map([["a", 0.9]])],
      ["c", new Map([["a", 0.8]])],
      ["d", new Map([["a", 0.7]])],
    ]);
    const capped = capAdjacencyDegree(adj, 1);
    // a keeps only strongest neighbor b; b keeps a → edge a↔b survives
    expect(capped.get("a")?.has("b")).toBe(true);
    expect(capped.get("b")?.has("a")).toBe(true);
    expect(capped.get("a")?.has("c")).toBeFalsy();
  });

  it("diffuseGraph spreads 2 hops with gamma decay", () => {
    const adj = new Map<string, Map<string, number>>([
      ["a", new Map([["b", 1]])],
      ["b", new Map([["a", 1], ["c", 1]])],
      ["c", new Map([["b", 1]])],
    ]);
    const out = diffuseGraph(new Map([["a", 1]]), adj, { hops: 2, gamma: 0.55 });
    expect(out.get("a")).toBe(1);
    expect(out.get("b")).toBeCloseTo(0.55, 5);
    // hop-2: frontierAct(b) * w * γ^2
    expect(out.get("c")).toBeCloseTo(0.55 * Math.pow(0.55, 2), 5);
  });

  it("mergeHebbianEdges raises weight then re-caps", () => {
    const semantic = buildSemanticAdjacency(
      [
        { id: "a", text: "alpha beta shared" },
        { id: "b", text: "alpha beta other" },
      ],
      lexicon,
      { minWeight: 0.1, maxDegree: 16 },
    );
    const merged = mergeHebbianEdges(semantic, [{ a: "a", b: "b", w: 0.99 }], {
      maxDegree: 16,
    });
    expect(merged.get("a")?.get("b")).toBeGreaterThanOrEqual(0.99);
    expect(merged.get("b")?.get("a")).toBeGreaterThanOrEqual(0.99);
  });

  it("nextHebbianWeight saturates toward 1", () => {
    let w = 0;
    for (let i = 0; i < 200; i++) w = nextHebbianWeight(w, 1);
    expect(w).toBeGreaterThan(0.9);
    expect(w).toBeLessThanOrEqual(1);
  });

  it("rankMemoryFacts returns empty for blank query", () => {
    expect(
      rankMemoryFacts({
        query: "   ",
        facts: [
          {
            id: "1",
            text: "Pinned preference dark mode",
            importance: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        lexicon,
      }),
    ).toEqual([]);
  });

  it("rankMemoryFacts prefers lexical match over unrelated high importance", () => {
    const now = new Date().toISOString();
    const ranked = rankMemoryFacts({
      query: "dark theme editor",
      facts: [
        {
          id: "dark",
          text: "User prefers dark theme in the editor",
          importance: 0.6,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "pin",
          text: "API key location is under vault secrets folder",
          importance: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
      lexicon,
      limit: 5,
    });
    expect(ranked[0]?.id).toBe("dark");
    expect(ranked.some((h) => h.id === "pin")).toBe(false);
  });

  it("rankMemoryFacts surfaces graph neighbor of lexical seed", () => {
    const now = new Date().toISOString();
    const ranked = rankMemoryFacts({
      query: "dark theme preference",
      facts: [
        {
          id: "seed",
          text: "Prefers dark theme in VS Code",
          importance: 0.7,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "nbr",
          text: "VS Code extensions: eslint prettier",
          importance: 0.5,
          createdAt: now,
          updatedAt: now,
        },
      ],
      lexicon,
      limit: 5,
    });
    expect(ranked.some((h) => h.id === "seed")).toBe(true);
    expect(ranked.some((h) => h.id === "nbr")).toBe(true);
  });

  it("jaccardTokens and tokenSetExpanded basics", () => {
    const a = tokenSetExpanded("dark theme", lexicon);
    const b = tokenSetExpanded("theme appearance", lexicon);
    expect(jaccardTokens(a, b)).toBeGreaterThan(0);
    expect(jaccardTokens(new Set(), b)).toBe(0);
  });
});
