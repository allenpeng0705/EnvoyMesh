/**
 * Obsidian-style `[[wiki-link]]` parser and link graph manager.
 *
 * Supports:
 * - `[[Note Name]]` — basic link
 * - `[[Note Name|Display Text]]` — link with alias
 * - `[[Folder/Note Name]]` — path-qualified link
 * - `#^block-id` and `#section` heading anchors (parsed but not resolved here)
 *
 * The link graph is a persisted JSON structure mapping note titles to
 * their outgoing and incoming links, stored at
 * `{profileDir}/plugins/obsidian/link-graph.json`.
 */

import { readFile, rename, unlink, writeFile } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"
import { mkdir } from "node:fs/promises"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WikiLink {
  /** The raw target text from the bracket (e.g. "Note Name", "Folder/Note"). */
  target: string;
  /** Optional display alias (e.g. "Display Text" in `[[Note|Display Text]]`). */
  alias?: string;
  /** Zero-indexed character offset of the opening `[[` in the source string. */
  start: number;
  /** Zero-indexed character offset *after* the closing `]]`. */
  end: number;
}

/** Entry in the link graph for a single note. */
export interface LinkGraphEntry {
  /** The note's title (derived from filename without extension). */
  title: string;
  /** Outgoing wiki-links from this note. */
  outgoing: string[];
  /** Incoming wiki-links to this note (computed during graph build). */
  incoming: string[];
}

/** The full persisted link graph. */
export type LinkGraph = Record<string, LinkGraphEntry>;

/** On-disk envelope for the link graph file. */
interface LinkGraphFile {
  version: 1;
  graph: LinkGraph;
}

// ---------------------------------------------------------------------------
// Wiki-link regex
// ---------------------------------------------------------------------------

/**
 * Matches `[[target]]` or `[[target|alias]]`.
 * Does NOT match `![[target]]` (embed syntax) — those are separate.
 *
 * Captures:
 *   [1] = target (may contain `/` for folder path, `#` for heading/block)
 *   [2] = optional alias (after `|`)
 */
const WIKI_LINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;

/**
 * Same as WIKI_LINK_RE but excludes embed syntax via negative lookbehind.
 * Used for string replacement where we can't check preceding character.
 */
const WIKI_LINK_STRIP_RE = /(?<!!)\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;

/**
 * Extract all wiki-links from a Markdown string.
 *
 * Returns an array of `WikiLink` objects sorted by position.
 * Excludes embed syntax (`![[...]]`).
 */
export function parseWikiLinks(markdown: string, baseOffset = 0): WikiLink[] {
  const links: WikiLink[] = [];

  // Reset lastIndex (regex has /g).
  WIKI_LINK_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = WIKI_LINK_RE.exec(markdown)) !== null) {
    // Check for embed prefix — skip `![[...]]`.
    const fullStart = match.index;
    if (fullStart > 0 && markdown[fullStart - 1] === "!") {
      continue;
    }

    links.push({
      target: match[1]!.trim(),
      alias: match[2]?.trim() || undefined,
      start: baseOffset + fullStart,
      end: baseOffset + fullStart + match[0].length,
    });
  }

  return links;
}

/**
 * Normalize a wiki-link target for graph lookup.
 * Strips heading/block anchors, directory path prefix, and `.md` extension.
 * e.g. `"notes/project-beta#Heading"` → `"project-beta"`.
 */
export function normalizeWikiTarget(target: string): string {
  let t = target.split("#")[0]!.trim()
  // Strip directory path — use the last segment only.
  const lastSep = Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\"))
  if (lastSep !== -1) t = t.slice(lastSep + 1)
  // Strip .md extension if present.
  if (t.endsWith(".md")) t = t.slice(0, -3)
  return t
}

/**
 * Strip wiki-links from Markdown content, replacing each `[[target|alias]]`
 * with just the alias (or target if no alias).
 *
 * Useful for rendering content for strangers where linked-to notes are private.
 */
export function stripWikiLinks(markdown: string): string {
  WIKI_LINK_STRIP_RE.lastIndex = 0;
  return markdown.replace(WIKI_LINK_STRIP_RE, (_full, target, alias) => alias?.trim() || target.trim());
}

/**
 * Strip only wiki-links whose targets are in the given set of private titles.
 * Links to non-private notes are kept as-is.
 */
export function stripPrivateWikiLinks(
  markdown: string,
  privateTitles: Set<string>,
): string {
  WIKI_LINK_STRIP_RE.lastIndex = 0;
  return markdown.replace(WIKI_LINK_STRIP_RE, (_full, target, alias) => {
    const normalized = normalizeWikiTarget(target)
    if (privateTitles.has(normalized)) {
      // Replace with plain text (alias or normalized target).
      return alias?.trim() || normalized;
    }
    // Keep the link — target is accessible.
    return _full;
  });
}

// ---------------------------------------------------------------------------
// Link graph persistence
// ---------------------------------------------------------------------------

/**
 * Path-safe storage location for the link graph.
 * Uses `assertSafeProfileDir` to ensure the path doesn't escape.
 */
export function linkGraphFilePath(profileDir: string): string {
  const dir = join(profileDir, "plugins", "obsidian")
  const resolved = resolve(dir)
  if (!resolved.startsWith(resolve(profileDir) + sep)) {
    throw new Error("link-graph path resolves outside profile dir")
  }
  return join(dir, "link-graph.json")
}

/**
 * Load the persisted link graph, or return an empty graph if missing/corrupt.
 */
export async function loadLinkGraph(profileDir: string): Promise<LinkGraph> {
  try {
    const raw = await readFile(linkGraphFilePath(profileDir), "utf8")
    const parsed = JSON.parse(raw) as LinkGraphFile
    if (parsed.version !== 1 || typeof parsed.graph !== "object" || parsed.graph === null) {
      return {}
    }
    return parsed.graph
  } catch {
    return {}
  }
}

/**
 * Persist the link graph atomically (tmp + rename).
 */
export async function saveLinkGraph(profileDir: string, graph: LinkGraph): Promise<void> {
  const filePath = linkGraphFilePath(profileDir)
  await mkdir(dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp.${process.pid}`
  await writeFile(
    tmp,
    `${JSON.stringify({ version: 1, graph }, null, 2)}\n`,
    { mode: 0o600 },
  )
  await rename(tmp, filePath)
}

/**
 * Delete the persisted link graph (used during plugin deactivation cleanup).
 */
export async function deleteLinkGraph(profileDir: string): Promise<void> {
  try {
    await unlink(linkGraphFilePath(profileDir))
  } catch {
    // file may not exist
  }
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

/**
 * Build a link graph from a set of notes.
 *
 * @param notes — map of `title → markdown content` (title = filename without .md)
 * @returns the completed link graph with outgoing + incoming links
 */
export function buildLinkGraph(
  notes: Map<string, string>,
): LinkGraph {
  const graph: LinkGraph = {}

  // First pass: collect outgoing links for each note (deduplicated).
  for (const [title, content] of notes) {
    const links = parseWikiLinks(content)
    const outgoingSet = new Set<string>()
    for (const l of links) {
      const t = normalizeWikiTarget(l.target)
      if (t.length > 0) outgoingSet.add(t)
    }
    const outgoing = [...outgoingSet]

    graph[title] = {
      title,
      outgoing,
      incoming: [],  // filled in second pass
    }
  }

  // Second pass: compute incoming links.
  for (const [title, entry] of Object.entries(graph)) {
    for (const target of entry.outgoing) {
      if (graph[target]) {
        graph[target].incoming.push(title)
      }
    }
  }

  return graph
}

/**
 * Resolve wiki-links for a note given the current link graph.
 * Returns the list of resolved note titles (only notes that exist in the graph).
 */
export function resolveLinksForNote(
  title: string,
  graph: LinkGraph,
): string[] {
  const entry = graph[title]
  if (!entry) return []
  // Only return links to notes that actually exist in the graph.
  return entry.outgoing.filter((t) => graph[t] !== undefined)
}

/**
 * Get backlinks (incoming links) for a note.
 */
export function getBacklinks(
  title: string,
  graph: LinkGraph,
): string[] {
  const entry = graph[title]
  if (!entry) return []
  return entry.incoming
}
