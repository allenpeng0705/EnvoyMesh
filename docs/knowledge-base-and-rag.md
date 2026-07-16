# Knowledge Base, Vault, and RAG

How EnvoyMesh stores documents, retrieves relevant snippets, and assembles LLM prompts
for chat drafts, knowledge queries, and Envoy AI.

## Architecture Overview

```
{profileDir}/
│
├── vault/                          ← EnvoyMesh Vault (core, always works)
│   │
│   ├── .envoy/                     ← Internal metadata (never shared)
│   │   ├── sensitivity.json        ← Per-item sensitivity overrides (persistent)
│   │   └── plugins/                ← Plugin working data (ephemeral)
│   │       └── obsidian/           ← Link graph cache, frontmatter cache
│   │
│   ├── notes/                      ← User-created notes (native editing)
│   │   ├── research/
│   │   │   ├── llm-benchmarks.md
│   │   │   └── rust-async-notes.md
│   │   ├── tutorials/
│   │   │   └── envoy-setup-guide.md
│   │   ├── personal/
│   │   │   └── journal.md
│   │   └── work/
│   │       └── project-plan.md
│   │
│   ├── documents/                  ← Imported files (PDF, Word, images, etc.)
│   │   ├── whitepaper.pdf
│   │   └── contract.docx
│   │
│   ├── inbox/                      ← Received files from peers (auto-import)
│   └── temp/                       ← Staging for imports
│
├── openclaw-workspace/             ← Agent workspace (separate from vault)
│   ├── SOUL.md
│   ├── ENVOYMESH_GUIDE.md
│   └── ...
│
└── node-config.json
```

For AI **modes, rules, and autonomy** (Manual / Assistant / Auto-Reply, document share
tiers), see [ai-response-settings-design.md](./ai-response-settings-design.md). For
**model provider setup** (Ollama, MiniMax, API keys), see
[run-local-model.md](./run-local-model.md).

---

## Core Principles

### 1. Vault is the Foundation

The EnvoyMesh vault is a **local-first file store** with RAG indexing. It works
standalone — no plugins required. Users can import files, create notes, search content,
and have the agent use it for context. Plugins only add extra capabilities on top.

### 2. Sensitivity is Per-Item, Not Per-Folder

Folders organize content. Sensitivity labels control access. The same folder can
contain public and private items side by side.

```
notes/research/
├── llm-benchmarks.md        ← sensitivity: public
└── internal-draft.md         ← sensitivity: private
```

This avoids:
- Breaking wiki-links when files move between public/private
- Requiring users to restructure their folders for sharing
- Granularity problems where a whole folder must be one sensitivity level

### 3. Plugins are Optional Guests

EnvoyMesh owns the vault. Plugins read/write content folders but never touch
`.envoy/` internal metadata. Removing a plugin never changes sensitivity labels or
breaks the vault.

### 4. Public Knowledge is Genuinely Public

Public items are discoverable and queryable by **all** EnvoyMesh peers, not just
bonded contacts. Private items never leave the node.

---

## Vault Core (Always Works)

### What the Vault Does

| Capability | Description |
|---|---|
| Import files | Any file type: MD, PDF, Word, images, etc. |
| Create notes | Native Markdown editor (no plugin needed) |
| RAG indexing | Vector + lexical + hybrid modes |
| Embedding search | Configurable embedding provider (OpenAI, Ollama, mock) |
| Sensitivity labels | Public / friends / private per item |
| Publish/share | Toggle items public for mesh-wide discovery |
| Agent context | Vault snippets injected into LLM prompts |
| Knowledge queries | Peers can query public items via `knowledge.query` |

### Sensitivity Levels

Three levels: `public`, `friends`, `private`. The protocol also defines `trusted` but
for knowledge base purposes `trusted` is treated as equivalent to `friends`.

                    Who can access?
                    ────────────────
Item                        Owner  Bonded  Stranger  Agent
──────────────────────────────────────────────────────
Public items            ✅      ✅       ✅       ✅
Friends items            ✅      ✅       ❌       ✅
Private items            ✅      ❌       ❌       ✅

**Sensitivity resolution chain** (first match wins):

1. **Per-item override** — `{profileDir}/vault-sensitivity-overrides.json` (persistent,
   written by Published toggle in Library UI or Obsidian plugin frontmatter sync).
   Stored outside the vault root to avoid polluting the vault index. Format:
   `{ "doc_abc123": "public", "doc_def456": "private" }`
2. **Path heuristic** — `inferDocumentSensitivity()` checks the relative path for
   keywords (`personal`, `private` → private; `work`, `office` → friends; default → public).
   This is the fallback when no override exists.
3. **Path defaults** — `kb.publicVaultPaths` / `kb.privateVaultPaths` in settings control
   *which vault subdirectories are indexed* for RAG, not the sensitivity label itself.

> Note: Steps 1–2 determine the *label*. Step 3 determines *whether the file is indexed at
> all* for a given scope (public = contact-facing, owner = full vault).

### Supported File Formats

**Native text** (read directly): `.txt`, `.md`, `.json`, `.csv`

**Extracted text** (parsed at index time): `.pdf`, `.docx`, `.doc`, `.pptx`, `.ppt`,
`.xlsx`, `.xls`, `.html`, `.htm`, `.rtf`

Implementation: `@envoymesh/vault` (`document-text-extract.ts`, `vault-formats.ts`).

### Where Files Live

| What | Path |
|------|------|
| **Vault root** | `ENVOYMESH_VAULT` env var or `{profileDir}/vault/` |
| **Notes** | `{vaultRoot}/notes/` (user-created Markdown) |
| **Documents** | `{vaultRoot}/documents/` (imported files) |
| **Inbox** | `{vaultRoot}/inbox/` (received from peers) |
| **Internal metadata** | `{vaultRoot}/.envoy/` (never shared) |
| **Vector DB** | `{profileDir}/rag-vectors.sqlite` |
| **HNSW index** | `{profileDir}/rag-hnsw/*.hnsw` |
| **Vault manifest** | `{profileDir}/rag-vault-manifest.json` |
| **Node config** | `{profileDir}/node-config.json` |

---

## Plugin Architecture

### Design

```
vault/
│
│  ┌─────────────────────────────────────────────────────────────┐
│  │              EnvoyMesh Vault Core (always runs)              │
│  │                                                             │
│  │  • Import any file (MD, PDF, Word, images)                  │
│  │  • Native note creation + Markdown editor                  │
│  │  • RAG indexing + embedding search                          │
│  │  • Sensitivity labels (public / friends / private)          │
│  │  • Serve public items to ALL mesh peers                     │
│  │  • Serve friends items to bonded contacts                   │
│  │  • Private items: owner + agent only                        │
│  │  • File watcher for re-index on change                      │
│  └─────────────────────────────────────────────────────────────┘
│
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  │   Obsidian   │  │ Future KB    │  │     MCP      │
│  │   Plugin     │  │   Plugin     │  │   Plugin     │
│  │              │  │              │  │              │
│  │ Opens same   │  │ Opens same   │  │ External KB  │
│  │ vault dir as │  │ vault dir    │  │ (Notion, web │
│  │ Obsidian     │  │ with its own │  │  APIs, etc.) │
│  │ vault. Adds: │  │ features     │  │              │
│  │              │  │              │  │ Queries are  │
│  │ • [[links]]  │  │ • ???        │  │ forwarded to │
│  │ • backlinks  │  │              │  │ external     │
│  │ • graph view │  │              │  │ server,      │
│  │ • tags       │  │              │  │ results      │
│  │ • templates  │  │              │  │ merged into   │
│  │ • frontmatter│  │              │  │ vault context│
│  │ • daily notes│  │              │  │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
│         │                 │                  │
│         └─────────────────┼──────────────────┘
│                           ▼
│              Plugin Metadata Hooks
│         (enrich vault index with tags,
│          links, aliases, etc.)
│                           │
└───────────────────────────┘
```

### Plugin Interface (Future)

Each KB plugin implements:

```typescript
interface KnowledgeBasePlugin {
  /** Unique plugin ID (e.g. "obsidian", "notion", "mcp-server"). */
  id: string;

  /** Human-readable name shown in Settings. */
  name: string;

  /** Called when the plugin is enabled. */
  activate(vaultRoot: string, config: Record<string, unknown>): Promise<void>;

  /** Called when the plugin is disabled or uninstalled. */
  deactivate(): Promise<void>;

  /** Return enriched metadata for a file (tags, links, aliases, etc.). */
  enrichMetadata(relativePath: string, content: string):
    Promise<Record<string, unknown>>;

  /** Called when a file changes. Return true if reindex is needed. */
  onFileChanged(relativePath: string): Promise<boolean>;

  /** Optional: provide UI extension components (graph view, backlinks, etc.). */
  getUiExtensions?(): KnowledgeBaseUiExtension[];
}
```

### Plugin Rules

1. Plugins **never write** to `.envoy/` — that's EnvoyMesh internal metadata only
2. Plugins **read + write** content folders (`notes/`, `documents/`, etc.)
3. Plugins **notify** EnvoyMesh of changes (via file watcher or plugin API) → vault re-indexes
4. If a plugin is uninstalled, content stays — only extra features disappear
5. Sensitivity labels are stored in `.envoy/sensitivity.json`, not plugin metadata
6. The vault works fully without any plugin installed

### Plugin Working Data

Each plugin stores its own data under `.envoy/plugins/{pluginId}/`:

```
.envoy/plugins/
├── obsidian/
│   ├── link-graph.json       ← Bidirectional link index
│   ├── frontmatter-cache.json ← Parsed frontmatter per file
│   └── config.json           ← Plugin-specific settings
└── mcp/
    └── config.json
```

This data is ephemeral — safe to delete. If deleted, the plugin rebuilds it on
next activation. The vault index and sensitivity labels are unaffected.

---

## Obsidian Plugin (Detailed Design)

### Purpose

Add Obsidian-style knowledge management to the vault without requiring users to
switch apps. Users who already use Obsidian can point the plugin at their vault.
Users who don't can use the native vault features.

### How It Works

1. **Vault directory is shared** — EnvoyMesh vault root is also the Obsidian vault
2. **Obsidian plugin detects** `.obsidian/` folder (created by Obsidian on first open)
   or creates a minimal config if the user wants native wiki-link support without Obsidian
3. **File watcher** monitors changes → triggers re-index
4. **Frontmatter parsing** extracts metadata → enriches vault index
5. **Link graph** built from `[[wiki-links]]` → exposed to agent and optional UI

### Frontmatter Integration

Obsidian notes can declare sensitivity in frontmatter:

```markdown
---
title: LLM Benchmarks 2025
tags: [ai, llm, benchmarks]
aliases: [AI Model Comparison]
published: true
date: 2025-06-15
---

# LLM Benchmarks
...
```

| Frontmatter Field | Maps To |
|---|---|
| `published: true/false` | Sensitivity override (synced to `.envoy/sensitivity.json`) |
| `tags: [...]` | Enriches vault index metadata for tag-based search |
| `aliases: [...]` | Alternative titles for search/discovery |
| `date:` | Creation date for sorting |

If the user doesn't use Obsidian, they can still set sensitivity via the Library UI
Published toggle — no frontmatter needed.

### Wiki-Link Resolution

When the agent encounters `[[rust-async-notes]]` in a note:

| Scenario | Behavior |
|---|---|
| Link target is public, reader is owner | ✅ Full resolution + content |
| Link target is private, reader is owner | ✅ Full resolution + content |
| Link target is public, reader is stranger | ✅ Full resolution + content |
| Link target is private/friends, reader is stranger | ❌ Link shown as plain text `[[rust-async-notes]]`, not resolved |
| Link target is friends, reader is bonded | ✅ Full resolution + content |
| Link target doesn't exist | Shown as broken link `[[???]]` |

This means the **public knowledge graph** is a traversable sub-graph of the owner's
full graph. Strangers see public notes and links between public notes, but never
know private notes exist.

### Agent Link Traversal

The agent can traverse the link graph:

```
Agent reads "envoy-setup-guide.md"
  → sees [[llm-benchmarks]], [[network-architecture]]
  → follows links (if sensitivity allows)
  → builds broader context for answering queries
```

This is powered by the link graph index in `.envoy/plugins/obsidian/link-graph.json`.

### What Happens When Obsidian Is Uninstalled

| After Uninstall | Effect |
|---|---|
| All notes | Still in vault, fully indexed, sensitivity unchanged |
| `[[wiki-links]]` in content | Become plain text (not resolved by agent) |
| Tags / frontmatter | No longer parsed, but existing index metadata stays |
| Graph view UI | Removed from Social UI |
| Sensitivity labels | Unchanged (stored in `.envoy/sensitivity.json`, not plugin data) |
| RAG search | Still works (based on content, not links) |

---

## MCP Plugin (External Knowledge)

### Purpose

Connect to external knowledge sources (Notion, web APIs, custom search engines)
and merge their results into the vault context for LLM prompts.

### How It Works

Already partially implemented via `kb.externalProvider = "mcp"`:

```json
"aiSettings": {
  "knowledgeBase": {
    "externalProvider": "mcp",
    "mcpServerUrl": "http://localhost:3000",
    "mcpSearchTool": "search",
    "mcpApiKey": "optional-key"
  }
}
```

When enabled, the context injector calls the MCP server's search tool and merges
results alongside vault RAG hits. This is a **read-only bridge** — MCP results are
not stored in the vault, just included in prompts.

### Future: MCP Write-Back

Allow the agent to write discovered knowledge back into the vault:

```
Agent receives MCP search result → deems it valuable
→ creates note in vault/notes/ with source attribution
→ sets sensitivity based on policy
```

---

## Public Knowledge Mesh

### Design

Public vault items are not just for bonded contacts — they're discoverable and
queryable by **all EnvoyMesh peers.

### Discovery Flow

```
Node A (publisher)                Mesh                    Node B (any peer)
      │                            │                            │
      │  1. Publish item to        │                            │
      │     vault catalog          │                            │
      │  2. Advertise via          │                            │
      │     discovery.response      │                            │
      │  ───────────────────────► │                            │
      │                            │  3. B discovers item via    │
      │                            │     mDNS / DHT / relay      │
      │                            │  ───────────────────────►  │
      │                            │                            │
      │  4. B sends                │                            │
      │     knowledge.query        │                            │
      │  ◄───────────────────────│  ◄───────────────────────  │
      │                            │                            │
      │  5. A serves public items  │                            │
      │     (private items excluded)│                            │
      │  ───────────────────────► │  ───────────────────────►  │
```

### Access Control for Public Knowledge

| Peer Type | Can Query | Can Discover | Items Returned |
|---|---|---|---|
| Owner | ✅ | N/A | Public + friends + private |
| Bonded contact | ✅ | ✅ | Public + friends |
| Stranger (known EnvoyMesh peer) | ✅ | ✅ | Public only |
| Unknown | ❌ | ❌ | None |

### Rate Limiting for Public Queries

To prevent abuse from strangers:

| Peer Type | Rate Limit |
|---|---|
| Bonded contact | Standard (per-contact) |
| Stranger | Strict (e.g. 5 queries/minute, 50/hour) |
| Unknown | Rejected |

### Implementation Changes (from Current)

**Current state:**
- `knowledge.query` requires bond (trust tier gate)
- `library_discover` requires `friends` sensitivity ceiling
- Public items only accessible by bonded contacts

**Target state:**
- New or relaxed intent for public knowledge queries (no bond required)
- Public discovery catalog advertised via mDNS/DHT/relay
- Sensitivity filtering: public items served to anyone, friends items to bonded only
- Per-stranger rate limiting
- `mesh.library_discover` works across all peers, not just bonded

### Protocol Changes

| Change | Details |
|---|---|
| Public knowledge intent | New `knowledge.query` variant that accepts any peer (rate-limited) or relax the existing intent's trust tier requirement for public-scope queries |
| Discovery advertisement | Publish catalog of public items in DHT/relay for mesh-wide discovery |
| Rate limiting per stranger | Track query counts per unknown peerId, enforce limits |

---

## Document Indexing (Vault)

### Chunking

When `buildVaultIndex` runs, each document is split into overlapping chunks:

| Setting | Default | Config Key |
|---------|---------|------------|
| Chunk size | 800 characters | `chunkSizeChars` |
| Overlap | 120 characters | `chunkOverlapChars` |
| Max file size | 25 MiB | `maxFileBytes` |

Chunking is **sentence/paragraph-aware** with soft breaks. Overlap is capped at
half the chunk size.

**Embedding token limits:** If `embedding.maxInputTokens` is set, chunk size is
capped so a single chunk fits the embed API.

### Retrieval Modes

| Mode | Vault search | Chat history search |
|------|--------------|---------------------|
| **vector** | Embed query → nearest chunks in HNSW; fallback to keywords if no hits | Same pattern |
| **hybrid** | Vector first, keyword fallback | Same |
| **lexical** | Keyword overlap only | Keyword overlap only |

---

## RAG Pipeline

### Prompt Assembly

```
┌─────────────────────────────────────────────────────────────────┐
│                        LLM prompt (one call)                       │
├─────────────────────────────────────────────────────────────────┤
│ 1. Agent identity (agent-identity.md)                           │
│ 2. AI identity mode (invisible / transparent / defensive)       │
│ 3. Rules / status / bond permissions                            │
│ 4. Relationship + human profile context                         │
│ 5. Recent chat messages + RAG hits from older chat              │
│ 6. Vault knowledge snippets (RAG)                               │
│ 7. External MCP knowledge (if configured)                       │
│ 8. User query or inbound message                                │
└─────────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
   always injected      chat log store      vault + vectors + MCP
```

### Context Injection Paths

**Path A: Inbound Chat Assist** (ext agent / bridge)
1. Load agent identity
2. Search vault RAG (scope = contact ceiling)
3. Inject recent + RAG chat history
4. Inject relationship + profile context
5. Optional external MCP knowledge

**Path B: OpenClaw EnvoyAI Gateway**
1. Load agent identity
2. Search vault RAG (full owner scope)
3. External MCP knowledge (if configured)
4. Bond thread context (up to 8 contacts)
5. Truncate to 20k chars max

### Knowledge Query Prompt Assembly

| Caller | Vault Scope | Items Returned |
|--------|-------------|---------------|
| Owner (local) | Full (public + friends + private) | Everything |
| Bonded contact (inbound) | Public + friends | Contact-sensitivity items |
| Stranger (inbound) | Public only | Public items only |

---

## Embeddings (Separate from Chat)

Chat and embeddings use **different** config blocks:

```json
"modelProviders": { "mode": "openai-compatible", "modelName": "gpt-4o", ... },
"aiSettings": {
  "knowledgeBase": {
    "embedding": {
      "mode": "openai-compatible",
      "endpoint": "https://api.openai.com/v1",
      "modelName": "text-embedding-3-small",
      "maxInputTokens": 8191
    }
  }
}
```

| Field | Options |
|---|---|
| `embedding.mode` | `mock` \| `ollama` \| `openai-compatible` \| `inherit` |
| `inherit` | Copies chat endpoint + apiKey, default model `text-embedding-3-small` |
| `apiKey` | Optional; if omitted, uses `modelProviders.apiKey` |
| `maxInputTokens` | Per-request cap for embedding API |

---

## Chat History RAG

Every persisted chat message can be embedded into a **per-thread collection**
(`chat:{threadOwnerId}`).

| Window | Default | Description |
|--------|---------|-------------|
| Recent | 20 messages | Always included (not duplicated in RAG) |
| RAG | 5 messages | Older messages ranked by similarity to query |

### Deleting Chat vs RAG

| `purgeChatRagOnDelete` | Chat UI | Chat log | Vector RAG |
|---|---|---|---|
| `false` (default) | Hidden | Removed | **Kept** — AI can still retrieve |
| `true` | Hidden | Removed | **Removed** — AI forgets |

---

## Agent Identity vs Human Profile vs Vault

| | Human profile | Agent identity | Vault KB |
|---|---------------|----------------|----------|
| **File** | Signed JSON in profile dir | `agent-identity.md` | Files under `vault/` |
| **Edited in** | Profile tab | Settings → AI | Filesystem / Library / Notes |
| **Audience** | Contacts (hello, discovery) | LLM system context only | RAG snippets + mesh queries |
| **RAG indexed** | No | No | Yes |
| **Shared on mesh** | Yes (discovery) | No | Public items only |

---

## Configuration Reference

All under `aiSettings.knowledgeBase` in `node-config.json` (or Settings → AI → Knowledge Base):

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Master toggle for vault snippet injection |
| `ragMode` | `vector` | `vector` \| `hybrid` \| `lexical` |
| `recentMessageLimit` | 20 | Recent chat messages in context |
| `ragMessageLimit` | 5 | Extra older messages from RAG |
| `vaultSnippetLimit` | 5 | Max vault snippets per prompt |
| `maxFileBytes` | 25 MiB | Skip larger files at index time |
| `chunkSizeChars` | 800 | Target chunk size |
| `chunkOverlapChars` | 120 | Overlap between chunks |
| `publicVaultPaths` | (all paths) | Paths defaulting to public sensitivity |
| `privateVaultPaths` | (empty) | Paths defaulting to private sensitivity |
| `purgeChatRagOnDelete` | `false` | Also remove chat vectors when deleting |
| `externalProvider` | `none` | `none` \| `mcp` |
| `mcpServerUrl` | — | MCP server URL (when external=mcp) |
| `mcpSearchTool` | — | MCP tool name for search |
| `mcpApiKey` | — | Optional MCP auth key |
| `embedding.*` | see below | Embedding provider config |

---

## Operations

### Add Documents

1. **Import files**: Library tab → Import (or drag & drop)
2. **Create notes**: Notes section → New note (native Markdown editor)
3. Files are indexed incrementally — no restart needed
4. Check **Settings → AI → Vector index status** for progress

### Change Embedding Model or Chunk Settings

After saving config, the node re-runs vault reindex. Files whose hash or chunk
settings changed are re-embedded; unchanged files are skipped.

### Enable a KB Plugin

1. Settings → AI → Knowledge Base → Plugins
2. Enable plugin (e.g. Obsidian)
3. Configure plugin settings (vault path if different, features to enable)
4. Plugin activates → enriches metadata → vault re-indexes

### Share Public Knowledge

1. Library tab → select item → toggle Published
2. Public items are advertised to the mesh for discovery
3. Any peer can query your public items (rate-limited for strangers)

### Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| Vector index stuck / errors | Embedding API misconfigured |
| No vault snippets in replies | `enabled: false`, empty vault, or sensitivity filter |
| Only keyword-like matches | Vector embed failed → lexical fallback |
| Private docs in stranger queries | Should not happen — check sensitivity config |
| Stranger queries rejected | Rate limit exceeded or trust policy |
| Plugin metadata not updating | Plugin not activated or file watcher not running |

---

## Code Map

| Component | Location |
|-----------|----------|
| KB settings types | `packages/api/src/ai-knowledge-base.ts` |
| Embedding token limits | `packages/api/src/ai-embedding-limits.ts` |
| Vault core (index, chunk, extract) | `packages/vault/` |
| Vector store + embed | `packages/rag/` |
| RAG orchestration | `apps/node/src/rag-service.ts` |
| Vault + chat search helpers | `apps/node/src/ai-context.ts` |
| Profile/relationship/chat context | `apps/node/src/context-injector.ts` |
| Agent identity injection | `apps/node/src/agent-identity-context.ts` |
| Chat draft prompts | `apps/node/src/chat-draft-inbound.ts` |
| Knowledge query handler | `apps/node/src/knowledge-query-inbound.ts` |
| Document acquisition worker | `apps/node/src/document-acquisition-worker.ts` |
| OpenClaw turn context | `apps/node/src/openclaw-turn-context.ts` |
| Startup reindex | `apps/node/src/index.ts` (`refreshRagService`) |
| Library UI | `apps/social/src/components/views/LibraryView.tsx` |
| KB settings UI | `apps/social/src/components/views/SettingsAITab.tsx` |
| RAG index status panel | `apps/social/src/components/views/SettingsAITab.tsx` |

---

## Future Work

### Phase 1: Native Note Creation
- Basic Markdown editor in Library UI (create, edit, preview)
- Note organization (folder navigation in UI)

### Phase 2: Public Knowledge Mesh
- Relax `knowledge.query` trust tier for public-scope queries
- Public discovery catalog advertisement via DHT/relay
- Per-stranger rate limiting
- Cross-peer `library_discover` for all peers

### Phase 3: Obsidian Plugin
- Plugin interface (registry, lifecycle, metadata hooks)
- Frontmatter parsing → sensitivity auto-sync
- `[[wiki-link]]` resolution and link graph index
- Agent link traversal
- Optional graph view + backlinks UI extension

### Phase 4: Future KB Plugins
- Plugin SDK for third-party integrations
- MCP write-back (agent saves discovered knowledge to vault)
- Notion, Logseq, or other KB tool plugins

---

## Related Docs

- [ai-response-settings-design.md](./ai-response-settings-design.md) — AI modes, rules, contact permissions
- [run-local-model.md](./run-local-model.md) — Ollama / LiteLLM / provider setup
- [ai-document-backbone-plan.md](./ai-document-backbone-plan.md) — Envoy AI document agent and library tools
- [document-acquisition-agent.md](./document-acquisition-agent.md) — Autonomous document acquisition worker
- [openclaw-extension.md](./openclaw-extension.md) — OpenClaw channel plugin
