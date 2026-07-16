/**
 * Sensitivity-aware link resolution for the Obsidian plugin.
 *
 * When resolving wiki-links for a particular peer access level:
 * - `public` — include only links to public notes
 * - `friends` — include links to public + friends notes
 * - `private` — include all links (owner only)
 *
 * This is used both for:
 * 1. Rendering content for stranger/peer queries (strip private links)
 * 2. Agent link traversal during RAG context assembly (respect bounds)
 */

import type { LinkGraph } from "./wiki-links.js"
import { parseWikiLinks, stripPrivateWikiLinks, normalizeWikiTarget } from "./wiki-links.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The three sensitivity tiers used by the knowledge base. */
export type SensitivityLevel = "public" | "friends" | "private";

/**
 * Per-note sensitivity map. Keys are note titles (filename without .md),
 * values are the note's sensitivity level.
 */
export type NoteSensitivityMap = Map<string, SensitivityLevel>;

/** Sensitivity ordering: higher index = more restricted. */
const SENSITIVITY_ORDER: readonly SensitivityLevel[] = ["public", "friends", "private"]

function sensitivityRank(level: SensitivityLevel): number {
  return SENSITIVITY_ORDER.indexOf(level)
}

/**
 * Check if a note at a given sensitivity is accessible from a given access level.
 */
export function isAccessible(
  noteSensitivity: SensitivityLevel,
  accessLevel: SensitivityLevel,
): boolean {
  return sensitivityRank(noteSensitivity) <= sensitivityRank(accessLevel)
}

// ---------------------------------------------------------------------------
// Link resolution
// ---------------------------------------------------------------------------

/**
 * Filter outgoing links for a note based on the viewer's access level.
 *
 * Links to notes with higher sensitivity than `accessLevel` are excluded.
 *
 * @returns resolved titles that are accessible at the given level
 */
export function resolveLinksWithSensitivity(
  title: string,
  graph: LinkGraph,
  sensitivity: NoteSensitivityMap,
  accessLevel: SensitivityLevel,
): string[] {
  const entry = graph[title]
  if (!entry) return []

  return entry.outgoing.filter((target) => {
    const targetSensitivity = sensitivity.get(target) ?? "private"
    return isAccessible(targetSensitivity, accessLevel)
  })
}

/**
 * Filter backlinks for a note based on the viewer's access level.
 * Only returns backlinks from notes the viewer can see.
 */
export function resolveBacklinksWithSensitivity(
  title: string,
  graph: LinkGraph,
  sensitivity: NoteSensitivityMap,
  accessLevel: SensitivityLevel,
): string[] {
  const entry = graph[title]
  if (!entry) return []

  return entry.incoming.filter((source) => {
    const sourceSensitivity = sensitivity.get(source) ?? "private"
    return isAccessible(sourceSensitivity, accessLevel)
  })
}

/**
 * Filter Markdown content to remove wiki-links to notes above the
 * viewer's access level.
 *
 * Links to accessible notes are preserved. Links to restricted notes
 * are replaced with plain text (alias or target name).
 */
export function filterContentLinks(
  markdown: string,
  graph: LinkGraph,
  sensitivity: NoteSensitivityMap,
  accessLevel: SensitivityLevel,
): string {
  const links = parseWikiLinks(markdown)

  if (links.length === 0) return markdown

  const privateTitles = new Set<string>()
  for (const link of links) {
    const normalized = normalizeWikiTarget(link.target)
    const targetSensitivity = sensitivity.get(normalized) ?? "private"
    if (!isAccessible(targetSensitivity, accessLevel)) {
      privateTitles.add(normalized)
    }
  }

  if (privateTitles.size === 0) return markdown

  return stripPrivateWikiLinks(markdown, privateTitles)
}

// ---------------------------------------------------------------------------
// Agent traversal helpers
// ---------------------------------------------------------------------------

/**
 * Collect all notes reachable from a starting note via wiki-links,
 * respecting the access level bound.
 *
 * Performs BFS traversal. Returns a set of note titles (including the start).
 */
export function traverseLinks(
  startTitle: string,
  graph: LinkGraph,
  sensitivity: NoteSensitivityMap,
  accessLevel: SensitivityLevel,
  maxDepth = 3,
): Set<string> {
  const visited = new Set<string>()
  const queue: Array<{ title: string; depth: number }> = [{ title: startTitle, depth: 0 }]

  while (queue.length > 0) {
    const { title, depth } = queue.shift()!
    if (visited.has(title)) continue
    if (depth > maxDepth) continue

    const noteSensitivity = sensitivity.get(title) ?? "private"
    if (!isAccessible(noteSensitivity, accessLevel)) continue

    visited.add(title)

    if (depth < maxDepth) {
      const entry = graph[title]
      if (entry) {
        for (const target of entry.outgoing) {
          if (!visited.has(target)) {
            queue.push({ title: target, depth: depth + 1 })
          }
        }
      }
    }
  }

  return visited
}
