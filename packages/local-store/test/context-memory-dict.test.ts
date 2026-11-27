import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONTEXT_MEMORY_USER_DICT_FILE,
  createBuiltinLexicon,
  loadMergedLexicon,
  loadUserMemoryDict,
  mergeUserDictIntoLexicon,
  userDictPath,
} from "../src/context-memory-dict.js";
import { CONTEXT_MEMORY_DIR } from "../src/context-memory-paths.js";
import { expandMemoryTokens, tokenizeForMemory } from "../src/context-memory-recall.js";

describe("context-memory-dict", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("createBuiltinLexicon has core prefs", () => {
    const lex = createBuiltinLexicon();
    expect(lex.typoMap.darkmode).toBe("dark");
    expect(lex.synonymIndex.get("dark")?.length).toBeGreaterThan(0);
  });

  it("mergeUserDictIntoLexicon merges typos and groups", () => {
    const lex = mergeUserDictIntoLexicon(createBuiltinLexicon(), {
      typoMap: { fooo: "foo", same: "same" },
      synonymGroups: [["widget", "gadget", "device"]],
    });
    expect(lex.typoMap.fooo).toBe("foo");
    expect(lex.typoMap.same).toBeUndefined();
    expect(lex.synonymIndex.get("widget")).toEqual(
      expect.arrayContaining(["gadget", "device"]),
    );
  });

  it("loadUserMemoryDict returns null for missing or corrupt", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-dict-"));
    dirs.push(profile);
    expect(await loadUserMemoryDict(profile)).toBeNull();
    await mkdir(join(profile, CONTEXT_MEMORY_DIR), { recursive: true });
    await writeFile(userDictPath(profile), "{not-json", "utf8");
    expect(await loadUserMemoryDict(profile)).toBeNull();
  });

  it("loadMergedLexicon applies user-dict on disk", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-dict-ok-"));
    dirs.push(profile);
    await mkdir(join(profile, CONTEXT_MEMORY_DIR), { recursive: true });
    await writeFile(
      join(profile, CONTEXT_MEMORY_DIR, CONTEXT_MEMORY_USER_DICT_FILE),
      JSON.stringify({
        typoMap: { kubernets: "kubernetes" },
        synonymGroups: [["kubernetes", "k8s", "kube"]],
      }),
      "utf8",
    );
    const lex = await loadMergedLexicon(profile);
    const expanded = expandMemoryTokens(tokenizeForMemory("kubernets"), lex);
    expect(expanded).toContain("kubernetes");
    expect(expanded.some((t) => t === "k8s" || t === "kube")).toBe(true);
  });
});
