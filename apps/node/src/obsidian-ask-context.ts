/**
 * Phase 2: Ask-time wiki-link expansion + tag boost for linked Obsidian notes.
 */

import { readFile } from "node:fs/promises"
import { basename, join } from "node:path"
import type { VaultDocumentMetadata, VaultSearchResult } from "@envoymesh/vault"
import {
  frontmatterStringArray,
  loadLinkGraph,
  normalizeWikiTarget,
  parseFrontmatter,
} from "@envoymesh/kb-obsidian"
import { resolveDocumentSensitivityById } from "./ai-context.js"

export type AskContextHit = {
  documentId: string
  path: string
  title: string
  score: number
  snippet: string
  sensitivity: string
}

const LINKED_PREFIX = "linked-obsidian:"

function noteTitleFromPath(relativePath: string): string {
  const base = basename(relativePath)
  return base.toLowerCase().endsWith(".md") ? base.slice(0, -3) : base
}

/** Map wiki title → vault relative path from current index docs. */
export function buildTitleToVaultPathMap(docs: VaultDocumentMetadata[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const doc of docs) {
    const title = normalizeWikiTarget(noteTitleFromPath(doc.relativePath))
    if (!title) continue
    // Prefer linked-obsidian mirrors when duplicate titles exist.
    const prev = map.get(title)
    if (!prev || doc.relativePath.startsWith(LINKED_PREFIX) || doc.relativePath.includes("/imports/obsidian/")) {
      map.set(title, doc.relativePath)
    }
  }
  return map
}

/**
 * Expand top RAG hits with one hop of wiki-link neighbors (outgoing + incoming).
 * Adds neighbor snippets from vault files when under maxExtra neighbors.
 */
export async function expandWikiLinkNeighbors(params: {
  profileDir: string
  vaultRoot: string
  hits: AskContextHit[]
  docs: VaultDocumentMetadata[]
  sensitivityOverrides?: Map<string, "public" | "friends" | "private">
  maxExtra?: number
  maxCharsPerNeighbor?: number
}): Promise<AskContextHit[]> {
  const maxExtra = params.maxExtra ?? 3
  const maxChars = params.maxCharsPerNeighbor ?? 900
  if (maxExtra <= 0 || params.hits.length === 0) return params.hits

  let graph: Awaited<ReturnType<typeof loadLinkGraph>>
  try {
    graph = await loadLinkGraph(params.profileDir)
  } catch {
    return params.hits
  }
  if (Object.keys(graph).length === 0) return params.hits

  const titleToPath = buildTitleToVaultPathMap(params.docs)
  const pathToDoc = new Map(params.docs.map((d) => [d.relativePath, d]))
  const seen = new Set(params.hits.map((h) => h.path))
  const extras: AskContextHit[] = []

  const seedTitles = params.hits
    .slice(0, 5)
    .map((h) => normalizeWikiTarget(h.title || noteTitleFromPath(h.path)))

  for (const title of seedTitles) {
    if (extras.length >= maxExtra) break
    const entry = graph[title]
    if (!entry) continue
    const neighbors = [...new Set([...entry.outgoing, ...entry.incoming])]
    for (const neighborTitle of neighbors) {
      if (extras.length >= maxExtra) break
      const relPath = titleToPath.get(normalizeWikiTarget(neighborTitle))
      if (!relPath || seen.has(relPath)) continue
      const doc = pathToDoc.get(relPath)
      if (!doc) continue
      seen.add(relPath)
      try {
        const abs = join(params.vaultRoot, relPath)
        const text = await readFile(abs, "utf8")
        const body = text.slice(0, maxChars)
        const sensitivity = resolveDocumentSensitivityById(
          doc.documentId,
          relPath,
          params.sensitivityOverrides,
        )
        extras.push({
          documentId: doc.documentId,
          path: relPath,
          title: noteTitleFromPath(relPath),
          score: Math.max(0.05, (params.hits[0]?.score ?? 0.2) * 0.55),
          snippet: body,
          sensitivity,
        })
      } catch {
        // skip unreadable
      }
    }
  }

  return extras.length > 0 ? [...params.hits, ...extras] : params.hits
}

/** Soft-boost hits whose vault path tags overlap query tokens. */
export function boostResultsByTagOverlap(
  hits: AskContextHit[],
  query: string,
  pathToTags: Map<string, string[]>,
): AskContextHit[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9_\u4e00-\u9fff]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
  if (tokens.length === 0) return hits

  return hits
    .map((hit) => {
      const tags = pathToTags.get(hit.path) ?? []
      if (tags.length === 0) return hit
      const tagSet = new Set(tags.map((t) => t.toLowerCase().replace(/^#/, "")))
      let boost = 0
      for (const tok of tokens) {
        if (tagSet.has(tok)) boost += 0.08
      }
      if (boost <= 0) return hit
      return { ...hit, score: hit.score + boost }
    })
    .sort((a, b) => b.score - a.score)
}

/** Load tags from frontmatter for a set of vault paths (best-effort). */
export async function loadTagsForVaultPaths(
  vaultRoot: string,
  relativePaths: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  for (const rel of relativePaths.slice(0, 40)) {
    try {
      const text = await readFile(join(vaultRoot, rel), "utf8")
      const { data } = parseFrontmatter(text)
      const tags = frontmatterStringArray(data, "tags")
      if (tags && tags.length > 0) {
        out.set(rel, tags)
      }
    } catch {
      // skip
    }
  }
  return out
}

export function formatWikiLinkNeighborSection(hits: AskContextHit[], maxSnippetChars = 220): string {
  if (hits.length === 0) return ""
  const lines = hits.map((h) => {
    const snippet = h.snippet.replace(/\s+/g, " ").trim().slice(0, maxSnippetChars)
    return `- ${h.title} (${h.path}) [wiki-link neighbor]: "${snippet}"`
  })
  return `## Related notes (wiki-links)\n${lines.join("\n")}`
}

/**
 * Owner Ask enrichment: tag boost on vault hits + 1-hop wiki-link neighbor section.
 */
export async function enrichOwnerVaultAskContext(params: {
  profileDir: string
  vaultRoot: string
  query: string
  vaultResults: VaultSearchResult[]
  docs: VaultDocumentMetadata[]
  sensitivityOverrides?: Map<string, "public" | "friends" | "private">
}): Promise<{ vaultResults: VaultSearchResult[]; wikiLinkSection: string }> {
  if (params.vaultResults.length === 0) {
    return { vaultResults: params.vaultResults, wikiLinkSection: "" }
  }

  const seedHits: AskContextHit[] = params.vaultResults.slice(0, 8).map((r) => ({
    documentId: r.document.documentId,
    path: r.document.relativePath,
    title: r.document.title || noteTitleFromPath(r.document.relativePath),
    score: r.score,
    snippet: r.chunk.text,
    sensitivity: "private",
  }))

  const pathToTags = await loadTagsForVaultPaths(
    params.vaultRoot,
    seedHits.map((h) => h.path),
  )
  const boosted = boostResultsByTagOverlap(seedHits, params.query, pathToTags)
  const scoreByPath = new Map(boosted.map((h) => [h.path, h.score]))
  const vaultResults = [...params.vaultResults]
    .map((r) => {
      const next = scoreByPath.get(r.document.relativePath)
      return next === undefined ? r : { ...r, score: next }
    })
    .sort((a, b) => b.score - a.score)

  const expanded = await expandWikiLinkNeighbors({
    profileDir: params.profileDir,
    vaultRoot: params.vaultRoot,
    hits: boosted,
    docs: params.docs,
    sensitivityOverrides: params.sensitivityOverrides,
  })
  const seedPaths = new Set(seedHits.map((h) => h.path))
  const neighbors = expanded.filter((h) => !seedPaths.has(h.path))
  return {
    vaultResults,
    wikiLinkSection: formatWikiLinkNeighborSection(neighbors),
  }
}
