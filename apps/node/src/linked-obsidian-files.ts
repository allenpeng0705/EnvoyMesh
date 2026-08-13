/**
 * Read-only listing of Markdown from optional linked Obsidian vault roots.
 * Does not move, rename, or write into those trees (import/export live in knowledge-hub).
 */

import { readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import type { LocalFileItem } from "@envoymesh/api";

const SKIP_DIR_NAMES = new Set([
  ".git",
  ".trash",
  "node_modules",
  ".envoy",
]);

export interface LinkedObsidianRoot {
  absRoot: string;
  label: string;
}

function assertInsideRoot(root: string, candidate: string): void {
  const rootResolved = resolve(root);
  const cand = resolve(candidate);
  const prefix = rootResolved.endsWith(sep) ? rootResolved : rootResolved + sep;
  if (cand !== rootResolved && !cand.startsWith(prefix)) {
    throw new Error("Path escapes linked Obsidian root");
  }
}

/** Public path-safety check for writes into a linked Obsidian root. */
export function assertPathInsideLinkedObsidianRoot(root: string, candidate: string): void {
  assertInsideRoot(root, candidate);
}

function disambiguateLabels(absoluteRoots: readonly string[]): LinkedObsidianRoot[] {
  const out: LinkedObsidianRoot[] = [];
  const seenLabels = new Set<string>();
  for (const raw of absoluteRoots) {
    const root = raw.trim();
    if (!root) continue;
    const absRoot = resolve(root);
    let label = basename(absRoot) || "obsidian";
    let n = 2;
    while (seenLabels.has(label)) {
      label = `${basename(absRoot)}-${n}`;
      n += 1;
    }
    seenLabels.add(label);
    out.push({ absRoot, label });
  }
  return out;
}

async function walkMarkdown(
  root: string,
  dir: string,
  vaultLabel: string,
  out: LocalFileItem[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name === ".obsidian" || SKIP_DIR_NAMES.has(ent.name)) continue;
    if (ent.name.startsWith(".")) continue;
    const abs = join(dir, ent.name);
    assertInsideRoot(root, abs);
    if (ent.isDirectory()) {
      await walkMarkdown(root, abs, vaultLabel, out);
      continue;
    }
    if (!ent.isFile()) continue;
    if (extname(ent.name).toLowerCase() !== ".md") continue;
    let st;
    try {
      st = await stat(abs);
    } catch {
      continue;
    }
    const relInside = relative(root, abs).split(sep).join("/");
    out.push({
      source: "linked-obsidian",
      relativePath: `linked-obsidian/${vaultLabel}/${relInside}`,
      title: basename(ent.name, ".md"),
      extension: ".md",
      byteLength: st.size,
      updatedAt: st.mtime.toISOString(),
    });
  }
}

/** Resolve a Browse path `linked-obsidian/<label>/…` to an absolute file path. */
export async function resolveLinkedObsidianAbsolutePath(
  absoluteRoots: readonly string[],
  browseRelativePath: string,
): Promise<string | null> {
  const p = browseRelativePath.trim().replace(/^\/+/, "").replace(/\\/g, "/");
  if (!p.startsWith("linked-obsidian/")) return null;
  const rest = p.slice("linked-obsidian/".length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const label = rest.slice(0, slash);
  const inside = rest.slice(slash + 1);
  if (!inside || inside.includes("..")) return null;

  for (const root of disambiguateLabels(absoluteRoots)) {
    if (root.label !== label) continue;
    const abs = resolve(root.absRoot, inside);
    assertInsideRoot(root.absRoot, abs);
    return abs;
  }
  return null;
}

/** Resolve a vault label (or first root when label omitted) to an absolute root. */
export async function resolveLinkedObsidianRootByLabel(
  absoluteRoots: readonly string[],
  label?: string,
): Promise<LinkedObsidianRoot | null> {
  const roots = disambiguateLabels(absoluteRoots);
  if (!roots.length) return null;
  if (!label?.trim()) return roots[0] ?? null;
  const want = label.trim();
  return roots.find((r) => r.label === want) ?? null;
}

/** List `.md` files from configured absolute Obsidian vault roots (read-only). */
export async function listLinkedObsidianMarkdownFiles(
  absoluteRoots: readonly string[],
): Promise<LocalFileItem[]> {
  const out: LocalFileItem[] = [];

  for (const root of disambiguateLabels(absoluteRoots)) {
    let st;
    try {
      st = await stat(root.absRoot);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    await walkMarkdown(root.absRoot, root.absRoot, root.label, out);
  }

  return out;
}
