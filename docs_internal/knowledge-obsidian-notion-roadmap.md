# Knowledge + Obsidian + Notion — roadmap (post–Phase 57)

**Status:** Phases 1–4 complete (connectors + write-back)  
**Related:** [knowledge-base-and-rag.md](./knowledge-base-and-rag.md) · Phase 57 in [implementation-plan.md](./implementation-plan.md)

## Goal

Make Knowledge feel powerful **without** a second vector DB or Notion OAuth.
Envoy vault + RAG stays the engine; Obsidian and Notion stay connectors.

**Default embed:** small keep-warm Envoy Local model (`qwen3-embedding-0.6b-q4_k_m`).

## Current gaps (why KB feels weak)

1. **Freshness** — ✅ vault watcher + note create/delete incremental reindex (Phase 1).
2. **Linked Obsidian at Ask** — lexical scan only (≤400 files); mirrors get vectors after import/Rebuild.
3. **Structure** — ✅ Ask uses wiki-link 1-hop + tag boost (Phase 2); graph still not full BFS.
4. **Notion depth** — MCP snippets; structured frontmatter + paged `offset` (Phase 3).
5. **Citations** — Ask marks Obsidian/MCP/blog paths; external MCP cites URL when present.
6. **Write-back** — ✅ agent/UI can create private vault notes and optionally export (Phase 4).

## Phases

### Phase 1 — Freshness & honesty ✅

| Item | Outcome |
|------|---------|
| Vault **fs.watch** (debounced) → incremental `reindexVault({ force: false })` | Edits under `vault/` update vectors without full Rebuild |
| **createNote / delete** schedule the same incremental pass | Notes appear in Ask soon after write |
| **Richer Ask citations** | Mark Obsidian/MCP/blog imports; linked vault hits labeled `linked-obsidian:…` |
| **Heading + frontmatter-aware MD chunking** | Better chunks for long Obsidian-style notes |

### Phase 2 — Obsidian retrieval depth ✅

- Incremental linked-Obsidian import (mtime vs mirror `importedAt`; `force` for explicit UI import)
- 1-hop wiki-link expansion at Ask
- Tag overlap boost on Ask hits
- Browse stale / indexed / live badges + cap transparency (400/100)

### Phase 3 — Notion / MCP corpus quality ✅

- Structured import frontmatter (`notion-url`, `mcp-page-id`, `mcp-edited-at`)
- Offset paging for MCP list/sync (when tool honors `offset`)
- Citations link out when URL present (Ask external section + note body)

### Phase 4 — Write-back ✅

- Agent tools: `mesh.notes_create`, `mesh.notes_export_obsidian`, `mesh.notes_export_mcp` (approval-gated)
- `createNote` defaults **private**; Publish for mesh
- Optional auto-export on create (Plugins toggles; default off)
- Obsidian layout: `envoymesh-export/` (default) or opt-in `mirror-source`
- MCP export requires `mcpWriteBackEnabled`
- Browse row menu: export one note to Obsidian / Notion

## Non-goals

- Second vector database / Elasticsearch  
- Notion official OAuth sync  
- Full bidirectional sync with conflict UI  
- Always-on heavy (4B+) embedder as default  

## Caps (honesty)

| Source | Cap (today) | Notes |
|--------|-------------|--------|
| Linked Obsidian sync / Ask scan | 400 files | Raise later with pagination + UI |
| MCP Rebuild import | 100 cards | Prefer real list tools over `"*"`; pages via `offset` |
| Linked file Ask read | 256 KiB | Truncate large notes |

## Success criteria

**Phase 1:** Edit `vault/notes/*.md` → within a few seconds, Ask retrieves the new text (vector mode); citations distinguish corpora; MD chunks on headings.

**Phase 2:** Unchanged linked notes skip re-import; Ask can include wiki-linked neighbors; Browse shows stale vs indexed and sync caps.

**Phase 4:** Agent or UI creates a private note; optional export lands under `envoymesh-export/` (or mirrors linked source); MCP push stays behind write-back toggle; mesh visibility still requires Publish.
