import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONTEXT_MEMORY_DIR,
  CONTEXT_MEMORY_FACTS_FILE,
  CONTEXT_MEMORY_MAX_ACTIVE,
  CONTEXT_MEMORY_USER_DICT_FILE,
  createContextMemoryStore,
  extractDurableFactsFromTurn,
  mergeExtractedFacts,
  normalizeContextMemoryNamespace,
  parseLlmExtractedFacts,
  parseMemoryMdSeedLines,
  shouldTryLlmFactExtract,
} from "../src/context-memory-store.js";
import {
  expandMemoryTokens,
  memoryRetention,
  nextStabilityAfterTouch,
  tokenizeForMemory,
} from "../src/context-memory-recall.js";
import {
  createBuiltinLexicon,
  loadMergedLexicon,
  mergeUserDictIntoLexicon,
} from "../src/context-memory-dict.js";

describe("context-memory-store", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  async function tempProfile(): Promise<string> {
    const d = await mkdtemp(join(tmpdir(), "cm-"));
    dirs.push(d);
    return d;
  }

  it("remembers, recalls, and renders context", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    await store.remember({
      text: "I prefer dark mode in the editor",
      importance: 0.8,
      tags: ["preference"],
    });
    const hits = await store.recall("dark mode preference");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.fact.text).toMatch(/dark mode/i);
    const rendered = await store.renderContext("editor theme");
    expect(rendered).toContain("### Context memory");
    expect(rendered).toMatch(/dark mode/i);
  });

  it("recall hits via synonym expand (theme → dark)", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    await store.remember({ text: "User prefers dark appearance for the UI" });
    const hits = await store.recall("theme preference");
    expect(hits.some((h) => /dark/i.test(h.fact.text))).toBe(true);
  });

  it("2-hop graph surfaces a related neighbor", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    await store.remember({ text: "Prefers dark theme in VS Code" });
    await store.remember({ text: "VS Code extensions: eslint prettier" });
    const hits = await store.recall("dark theme preference");
    expect(hits.some((h) => /dark theme/i.test(h.fact.text))).toBe(true);
    expect(hits.some((h) => /eslint/i.test(h.fact.text))).toBe(true);
  });

  it("invalid namespace throws instead of aliasing to default", () => {
    expect(() => normalizeContextMemoryNamespace("../x")).toThrow(/invalid namespace/);
  });

  it("FSRS first touch bumps stability on fresh facts", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    const { id } = await store.remember({
      text: "I prefer concise replies in every chat",
      importance: 0.7,
    });
    const beforeStability =
      (await store.listFacts()).find((f) => f.id === id)?.stability ?? 1;
    await store.recall("concise replies preference");
    const after = (await store.listFacts()).find((f) => f.id === id);
    expect(after?.accessCount ?? 0).toBeGreaterThan(0);
    expect(after?.stability ?? 0).toBeGreaterThan(beforeStability);
  });

  it("FSRS touch raises stability after recall on aged facts", async () => {
    const profile = await tempProfile();
    await mkdir(join(profile, CONTEXT_MEMORY_DIR), { recursive: true });
    const agedAt = new Date(Date.now() - 86400000 * 45).toISOString();
    const id = "00000000-0000-4000-8000-0000000000aa";
    await writeFile(
      join(profile, CONTEXT_MEMORY_DIR, CONTEXT_MEMORY_FACTS_FILE),
      `${JSON.stringify({
        id,
        text: "My timezone is Asia/Shanghai permanently",
        tags: [],
        importance: 0.7,
        createdAt: agedAt,
        updatedAt: agedAt,
        stability: 1,
        lastAccessAt: agedAt,
        accessCount: 0,
      })}\n`,
      "utf8",
    );
    const store = createContextMemoryStore(profile);
    await store.open();
    const before = (await store.listFacts()).find((f) => f.id === id);
    const beforeStability = before?.stability ?? 1;
    expect(beforeStability).toBeCloseTo(1, 5);
    await store.recall("timezone Asia Shanghai");
    const after = (await store.listFacts()).find((f) => f.id === id);
    expect(after?.accessCount ?? 0).toBeGreaterThan(0);
    expect(after?.stability ?? 0).toBeGreaterThan(beforeStability);
  });

  it("namespaces isolate banks on disk", async () => {
    const profile = await tempProfile();
    const def = createContextMemoryStore(profile);
    const work = createContextMemoryStore(profile, { namespace: "work" });
    await def.open();
    await work.open();
    await def.remember({ text: "Personal hobby is woodworking on weekends" });
    await work.remember({ text: "Work prefers Kubernetes for production deploys" });
    expect(def.factCount()).toBe(1);
    expect(work.factCount()).toBe(1);
    expect(
      (await def.recall("woodworking")).some((h) => /woodworking/i.test(h.fact.text)),
    ).toBe(true);
    expect((await def.recall("Kubernetes")).length).toBe(0);
    expect(
      (await work.recall("Kubernetes")).some((h) => /Kubernetes/i.test(h.fact.text)),
    ).toBe(true);
    expect(normalizeContextMemoryNamespace("Work")).toBe("work");
  });

  it("loads user-dict.json into lexicon", async () => {
    const profile = await tempProfile();
    await mkdir(join(profile, CONTEXT_MEMORY_DIR), { recursive: true });
    await writeFile(
      join(profile, CONTEXT_MEMORY_DIR, CONTEXT_MEMORY_USER_DICT_FILE),
      JSON.stringify({
        typoMap: { bonefilm: "periosteum" },
        synonymGroups: [["periosteum", "bone", "membrane"]],
      }),
      "utf8",
    );
    const lex = await loadMergedLexicon(profile);
    expect(lex.typoMap.bonefilm).toBe("periosteum");
    const expanded = expandMemoryTokens(tokenizeForMemory("bonefilm"), lex);
    expect(expanded).toContain("periosteum");
    expect(expanded.some((t) => t === "bone" || t === "membrane")).toBe(true);

    const store = createContextMemoryStore(profile);
    await store.open();
    await store.remember({ text: "User studies periosteum membrane carefully" });
    const hits = await store.recall("bonefilm tissue");
    expect(hits.some((h) => /periosteum/i.test(h.fact.text))).toBe(true);
  });

  it("dedupes near-duplicate facts", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    const a = await store.remember({ text: "User prefers dark mode theme" });
    const b = await store.remember({ text: "User prefers dark mode theme" });
    expect(b.deduped).toBe(true);
    expect(b.id).toBe(a.id);
    expect(store.factCount()).toBe(1);
  });

  it("persists across reopen", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    await store.remember({ text: "Never auto-send email without asking" });
    const store2 = createContextMemoryStore(profile);
    await store2.open();
    const hits = await store2.recall("auto-send email");
    expect(hits.some((h) => /auto-send/i.test(h.fact.text))).toBe(true);
  });

  it("forget and pin work", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    const { id } = await store.remember({ text: "My timezone is Asia/Shanghai" });
    expect(await store.pin(id, true)).toBe(true);
    const listed = await store.listFacts();
    expect(listed[0]!.importance).toBe(1);
    expect(await store.forget(id)).toBe(true);
    expect(store.factCount()).toBe(0);
  });

  it("compact rewrites file without tombstones", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    const a = await store.remember({ text: "Keep this durable preference forever" });
    const b = await store.remember({ text: "Forget this temporary note soon after" });
    await store.forget(b.id);
    const result = await store.compact({ force: true });
    expect(result.rewritten).toBe(true);
    expect(result.activeAfter).toBe(1);
    expect(store.factCount()).toBe(1);
    const raw = await readFile(
      join(profile, CONTEXT_MEMORY_DIR, CONTEXT_MEMORY_FACTS_FILE),
      "utf8",
    );
    expect(raw).toContain(a.id);
    expect(raw).not.toContain(b.id);
    expect(raw).not.toMatch(/"deleted":true/);
  });

  it("extractDurableFactsFromTurn catches prefer / remember, not transient want", () => {
    expect(
      extractDurableFactsFromTurn({ userText: "I prefer dark mode please" }).length,
    ).toBeGreaterThan(0);
    expect(
      extractDurableFactsFromTurn({ userText: "Remember that my name is Alex" }).some((f) =>
        /alex/i.test(f),
      ),
    ).toBe(true);
    expect(extractDurableFactsFromTurn({ userText: "I want pizza tonight" })).toEqual([]);
    expect(extractDurableFactsFromTurn({ userText: "I never said that" })).toEqual([]);
    expect(extractDurableFactsFromTurn({ userText: "Remember that I want pizza tonight" })).toEqual(
      [],
    );
  });

  it("parseLlmExtractedFacts and mergeExtractedFacts", () => {
    expect(parseLlmExtractedFacts(`["User prefers dark mode","I want pizza"]`)).toEqual([
      "User prefers dark mode",
    ]);
    expect(
      mergeExtractedFacts(["I prefer concise replies"], ["User timezone is UTC"]),
    ).toEqual(["I prefer concise replies", "User timezone is UTC"]);
  });

  it("shouldTryLlmFactExtract gates cost", () => {
    expect(
      shouldTryLlmFactExtract({
        userText: "I prefer dark mode please and always use it",
        heuristicFacts: ["I prefer dark mode please and always use it"],
      }),
    ).toBe(false);
    expect(
      shouldTryLlmFactExtract({
        userText: "Please remember my deployment preference is Docker Compose not Kubernetes",
        heuristicFacts: [],
      }),
    ).toBe(true);
  });

  it("FSRS retention helpers", () => {
    const now = Date.now();
    expect(
      memoryRetention({
        importance: 1,
        createdAt: new Date(now - 86400000 * 400).toISOString(),
        nowMs: now,
      }),
    ).toBe(1);
    const r = memoryRetention({
      importance: 0.5,
      stability: 1,
      createdAt: new Date(now - 86400000).toISOString(),
      lastAccessAt: new Date(now - 86400000).toISOString(),
      nowMs: now,
    });
    expect(r).toBeGreaterThan(0.3);
    expect(r).toBeLessThan(0.5);
    expect(nextStabilityAfterTouch({ stability: 1, retention: 0.5 })).toBeGreaterThan(1);
  });

  it("mergeUserDictIntoLexicon ignores identity typos", () => {
    const lex = mergeUserDictIntoLexicon(createBuiltinLexicon(), {
      typoMap: { same: "same", foo: "bar" },
    });
    expect(lex.typoMap.foo).toBe("bar");
    expect(lex.typoMap.same).toBeUndefined();
  });

  it("parseMemoryMdSeedLines skips headings short noise", () => {
    const lines = parseMemoryMdSeedLines(`# MEMORY.md\n\n- I like concise answers\n- x\n`);
    expect(lines).toEqual(["I like concise answers"]);
  });

  it("active cap constant is positive", () => {
    expect(CONTEXT_MEMORY_MAX_ACTIVE).toBeGreaterThan(100);
  });

  it("empty query recall returns no hits", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    await store.remember({ text: "Pinned preference should not auto inject", importance: 1 });
    expect(await store.recall("")).toEqual([]);
    expect(await store.recall("   ")).toEqual([]);
    expect(await store.renderContext("")).toBe("");
  });

  it("listFacts returns immutable snapshots", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    await store.remember({ text: "Snapshot immutability check for listed facts" });
    const listed = await store.listFacts();
    listed[0]!.text = "mutated";
    listed[0]!.tags.push("x");
    const again = await store.listFacts();
    expect(again[0]!.text).toMatch(/Snapshot immutability/);
    expect(again[0]!.tags).not.toContain("x");
  });

  it("concurrent remember serializes without losing facts", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    await Promise.all([
      store.remember({ text: "Concurrent fact alpha unique string one" }),
      store.remember({ text: "Concurrent fact beta unique string two" }),
      store.remember({ text: "Concurrent fact gamma unique string three" }),
    ]);
    expect(store.factCount()).toBe(3);
  });

  it("forget then recall does not return forgotten text", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    const { id } = await store.remember({ text: "Forgettable secret preference zebra" });
    await store.forget(id);
    expect(await store.recall("Forgettable secret preference zebra")).toEqual([]);
  });

  it("pin survives unpin importance clamp", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    const { id } = await store.remember({ text: "Pin clamp preference for timezone UTC" });
    await store.pin(id, true);
    expect((await store.listFacts())[0]!.importance).toBe(1);
    await store.pin(id, false);
    expect((await store.listFacts())[0]!.importance).toBeLessThan(1);
  });

  it("hebbian edges persist across reopen after multi-hit recall", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    await store.remember({ text: "Prefers dark theme in VS Code" });
    await store.remember({ text: "VS Code extensions: eslint prettier" });
    await store.recall("dark theme preference");
    const store2 = createContextMemoryStore(profile);
    await store2.open();
    const hits = await store2.recall("dark theme preference");
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("remember rejects empty text when open", async () => {
    const profile = await tempProfile();
    const store = createContextMemoryStore(profile);
    await store.open();
    await expect(store.remember({ text: "   " })).rejects.toThrow(/empty text/);
  });
});
