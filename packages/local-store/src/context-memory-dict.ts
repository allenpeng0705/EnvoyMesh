/**
 * Context Memory user dictionary (typos + synonym groups) under
 * `{profileDir}/context-memory/user-dict.json`. Shared across namespaces.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONTEXT_MEMORY_DIR } from "./context-memory-paths.js";

export const CONTEXT_MEMORY_USER_DICT_FILE = "user-dict.json";

export interface ContextMemoryUserDict {
  /** typo → canonical token (lowercase keys preferred). */
  typoMap?: Record<string, string>;
  /** Groups of mutual synonyms (one-hop only, no transitive closure). */
  synonymGroups?: string[][];
}

export interface MemoryLexicon {
  typoMap: Record<string, string>;
  synonymIndex: Map<string, string[]>;
}

/** Builtin typo / concat fixes. */
const BUILTIN_TYPO: Record<string, string> = {
  prefered: "preferred",
  seperate: "separate",
  seperately: "separately",
  darkmode: "dark",
  lightmode: "light",
  timezones: "timezone",
  langauge: "language",
  remeber: "remember",
};

/** Builtin bidirectional synonym groups. */
const BUILTIN_GROUPS: readonly (readonly string[])[] = [
  ["dark", "theme", "night", "appearance"],
  ["light", "theme", "appearance"],
  ["timezone", "tz", "time", "zone"],
  ["language", "locale", "lang"],
  ["prefer", "preferred", "preference", "likes", "like"],
  ["name", "called", "call"],
  ["email", "mail"],
  ["password", "credentials", "secret"],
  ["concise", "brief", "short"],
  ["verbose", "detailed", "long"],
  ["deploy", "deployment", "docker", "compose", "kubernetes"],
];

function buildSynonymIndex(groups: readonly (readonly string[])[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const group of groups) {
    const cleaned = group
      .map((t) => String(t ?? "").trim().toLowerCase())
      .filter((t) => t.length >= 2);
    for (const t of cleaned) {
      const others = cleaned.filter((x) => x !== t);
      const prev = map.get(t) ?? [];
      map.set(t, [...new Set([...prev, ...others])]);
    }
  }
  return map;
}

export function createBuiltinLexicon(): MemoryLexicon {
  return {
    typoMap: { ...BUILTIN_TYPO },
    synonymIndex: buildSynonymIndex(BUILTIN_GROUPS),
  };
}

export function mergeUserDictIntoLexicon(
  base: MemoryLexicon,
  dict: ContextMemoryUserDict | null | undefined,
): MemoryLexicon {
  if (!dict) return base;
  const typoMap = { ...base.typoMap };
  if (dict.typoMap && typeof dict.typoMap === "object") {
    for (const [k, v] of Object.entries(dict.typoMap)) {
      const from = String(k ?? "")
        .trim()
        .toLowerCase();
      const to = String(v ?? "")
        .trim()
        .toLowerCase();
      if (!from || !to || from === to) continue;
      typoMap[from] = to;
    }
  }
  const userGroups = Array.isArray(dict.synonymGroups)
    ? dict.synonymGroups.filter((g) => Array.isArray(g) && g.length >= 2)
    : [];
  const synonymIndex = buildSynonymIndex([
    ...BUILTIN_GROUPS,
    ...userGroups.map((g) => g.map((x) => String(x))),
  ]);
  // Re-apply user typo targets already in typoMap; synonym index rebuilt from groups.
  return { typoMap, synonymIndex };
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

export function userDictPath(profileDir: string): string {
  return join(profileDir, CONTEXT_MEMORY_DIR, CONTEXT_MEMORY_USER_DICT_FILE);
}

/** Load user-dict.json; missing file → null. Malformed → null (soft). */
export async function loadUserMemoryDict(
  profileDir: string,
): Promise<ContextMemoryUserDict | null> {
  try {
    const raw = await readFile(userDictPath(profileDir), "utf8");
    const parsed = JSON.parse(raw) as ContextMemoryUserDict;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (err) {
    if (isMissingFileError(err)) return null;
    return null;
  }
}

export async function loadMergedLexicon(profileDir: string): Promise<MemoryLexicon> {
  const user = await loadUserMemoryDict(profileDir);
  return mergeUserDictIntoLexicon(createBuiltinLexicon(), user);
}
