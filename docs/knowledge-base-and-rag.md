# Knowledge Base, Context, and RAG

How EnvoyMesh stores documents, retrieves relevant snippets, and assembles LLM prompts for chat drafts, knowledge queries, and Envoy AI.

For AI **modes, rules, and autonomy** (Manual / Assistant / Auto-Reply, document share tiers), see [ai-response-settings-design.md](./ai-response-settings-design.md). For **model provider setup** (Ollama, MiniMax, API keys), see [run-local-model.md](./run-local-model.md).

---

## Mental model

EnvoyMesh separates four kinds of “what the AI knows”:

| Source | Purpose | Indexed for RAG? |
|--------|---------|------------------|
| **Vault knowledge base** | Your documents (PDF, Markdown, …) | Yes (vector and/or keyword) |
| **Chat history** | Past messages with a contact | Yes (vector and/or keyword, per thread) |
| **Human profile** | Public social identity (bio, hobbies) | No — injected as text each prompt |
| **Agent identity** (`agent-identity.md`) | Private operating instructions | No — injected as text each prompt |

The **chat LLM** (`modelProviders` in `node-config.json`) generates replies. A **separate embedding API** (`aiSettings.knowledgeBase.embedding`) powers vector search when `ragMode` is `vector` or `hybrid`.

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
│ 7. User query or inbound message                                │
└─────────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
   always injected      chat log store      shared_vault + vectors
```

---

## Where files live

| What | Path |
|------|------|
| **Knowledge documents** | `{vaultRoot}/knowledge/public/` and `.../private/` (default; configurable) |
| **Vault root** | `ENVOYMESH_VAULT` or `apps/node/shared_vault/` |
| **Node config** | `{profileDir}/node-config.json` (gitignored) |
| **Config reference (all local files)** | [docs/local-configuration.reference.md](./local-configuration.reference.md) |
| **Config template** | `apps/node/data/default/node-config.example.jsonc` (committed) |
| **Agent instructions** | `{profileDir}/agent-identity.md` |
| **Agent identity template** | `apps/node/data/default/agent-identity.example.md` (committed) |
| **Vector DB (SQLite)** | `{profileDir}/rag-vectors.sqlite` |
| **HNSW index files** | `{profileDir}/rag-hnsw/*.hnsw` |
| **Vault index manifest** | `{profileDir}/rag-vault-manifest.json` (tracks indexed file hashes) |

First-time config:

```bash
cp apps/node/data/default/node-config.example.jsonc apps/node/data/default/node-config.json
cp apps/node/data/default/agent-identity.example.md apps/node/data/default/agent-identity.md
```

---

## Knowledge base partitions

Configured under `aiSettings.knowledgeBase` in `node-config.json`:

```json
"publicVaultPaths": ["knowledge/public/"],
"privateVaultPaths": ["knowledge/private/"]
```

| Partition | Typical use | Who can search it |
|-----------|-------------|-------------------|
| **public** | FAQs, product docs safe for auto-reply | Contacts (within their `knowledgeAccess` ceiling), auto-reply drafts |
| **private** | Personal notes, internal runbooks | Owner only — Envoy AI tab, local `knowledgeQuery`, owner-scoped flows |

Paths are **relative to the vault root**, not `profileDir`. Do not put `agent-identity.md` in the vault if you want it private and non-RAG — use `{profileDir}/agent-identity.md` instead.

---

## Document indexing (vault)

### Supported formats

**Native text** (read directly): `.txt`, `.md`, `.json`, `.csv`

**Extracted text** (parsed at index time): `.pdf`, `.docx`, `.doc`, `.pptx`, `.ppt`, `.xlsx`, `.xls`, `.html`, `.htm`, `.rtf`

Implementation: `@envoymesh/vault` (`document-text-extract.ts`, `vault-formats.ts`).

### Chunking

When `buildVaultIndex` runs, each document is split into overlapping chunks:

| Setting | Default | Config key |
|---------|---------|------------|
| Chunk size | 800 characters | `chunkSizeChars` |
| Overlap | 120 characters | `chunkOverlapChars` |
| Max file size | 25 MiB | `maxFileBytes` |

Chunking is **sentence/paragraph-aware** with soft breaks. Overlap is capped at half the chunk size to avoid infinite loops.

**Embedding token limits:** If `embedding.maxInputTokens` is set (or inferred for models like `embo-01` → 4096), chunk size is capped so a single chunk fits the embed API, and text is truncated at embed time if needed.

### Lexical index vs vector index

Every node build produces a **lexical vault index** in memory (keyword search via `@envoymesh/vault`).

When `ragMode` is `vector` or `hybrid`, the **RAG service** additionally:

1. Embeds each chunk via the configured embedding provider
2. Stores vectors in SQLite + HNSW (`@envoymesh/rag`)
3. Records file hash + chunk metadata in `rag-vault-manifest.json`

**Incremental reindex:** On startup (and when config changes), only **new or changed** files are embedded; unchanged files are skipped; deleted files are removed from the vector store. Progress is emitted as `rag:reindex` events (visible in Settings → AI → Vector index status).

---

## Retrieval modes (`ragMode`)

| Mode | Vault search | Chat history search |
|------|--------------|---------------------|
| **vector** | Embed query → nearest chunks in HNSW; fallback to keywords if no hits or embed error | Same pattern |
| **hybrid** | Same as vector today (vector first, keyword fallback) | Same |
| **lexical** | Keyword overlap only | Keyword overlap only |

Lexical search tokenizes the query, scores chunk/message text by term overlap, and returns top matches.

Vector search embeds the query, finds nearest vectors per collection, then applies **sensitivity filtering** (see below).

---

## Embeddings (separate from chat)

Chat and embeddings use **different** config blocks:

```json
"modelProviders": { "mode": "openai-compatible", "modelName": "MiniMax-M2.7", ... },
"aiSettings": {
  "knowledgeBase": {
    "embedding": {
      "mode": "openai-compatible",
      "endpoint": "https://api.minimaxi.com/v1",
      "modelName": "embo-01",
      "maxInputTokens": 4096
    }
  }
}
```

| Field | Behavior |
|-------|----------|
| `embedding.mode` | `mock` \| `ollama` \| `openai-compatible` \| `inherit` |
| `inherit` | Copies chat **endpoint + apiKey**, but default embed model is `text-embedding-3-small` — usually wrong for MiniMax; prefer explicit `modelName` |
| `apiKey` | Optional; if omitted, uses `modelProviders.apiKey` |
| `maxInputTokens` | Per-request cap; `embo-01` defaults to **4096** when omitted |

Ollama example for local embeddings while using cloud chat: see [run-local-model.md](./run-local-model.md).

---

## Sensitivity and access control

Vault snippets are filtered before injection:

1. **Path inference** — e.g. paths containing `private` → `personal` sensitivity
2. **Contact `knowledgeAccess`** — `public` \| `professional` \| `personal` (per contact in `contactAiPreferences`)
3. **Bond policy** — strangers only get public-tier content on inbound `knowledge.query`
4. **`knowledgeScope`** — `public` (contact flows) vs `owner` (public + private paths)

Order of sensitivity: `public` < `friends` < `professional` < `personal`.

A contact with `knowledgeAccess: "public"` never receives private-vault snippets, even if they have `aiAccessLevel: "full"` for chat.

---

## How prompts are assembled

### 1. Chat draft (`generateChatDraft`)

Triggered for inbound `chat.message` when chat assist / auto-reply is enabled.

**Prompt layers (in order):**

1. Base instructions + **AI identity mode** (invisible / transparent / defensive)
2. **`agent-identity.md`** section
3. Matched **AI rule** template / identity override (if any)
4. Online/offline status + contact **AI access** + **knowledge access**
5. **Context injection** (`buildContextInjection`):
   - Recent thread messages (default 20)
   - RAG hits from older messages (default 5, query = inbound message text)
   - Relationship (bond level, display name)
   - Human profile (bio, hobbies, knowledge tags)
6. **Vault knowledge** snippets (query = message, scope = `public`, sensitivity = contact ceiling)
7. Optional external MCP knowledge (if configured)
8. The inbound message text

Vault RAG uses the **public** partition only for contact-facing drafts.

### 2. Knowledge query (`handleInboundKnowledgeQuery`)

Used for peer `knowledge.query` intents and local owner queries (Envoy AI / RPC).

**Prompt layers:**

1. **`agent-identity.md`**
2. Vault snippets (lexical and/or vector, scoped by caller)
3. Context injection (recent + RAG chat history, profile, relationship)
4. External MCP context (owner scope only)
5. The query string

**Scope:**

| Caller | `knowledgeScope` | Vault paths searched |
|--------|------------------|----------------------|
| Contact (inbound) | `public` | `publicVaultPaths` only |
| Owner (local / approved) | `owner` | public + private |

### 3. Envoy AI / document agent

`runDocumentAgentTurn` routes “knowledge” intents through `knowledgeQuery()` above. Tool calls (library list, share, publish) use separate agent context; see [ai-document-backbone-plan.md](./ai-document-backbone-plan.md).

---

## Chat history RAG

Every persisted chat message can be embedded into a **per-thread collection** (`chat:{threadOwnerId}`).

At prompt time:

- **Recent window** — last N messages always included (not duplicated in RAG section)
- **RAG window** — older messages ranked by similarity to the current query (message text or knowledge question)

Defaults: `recentMessageLimit: 20`, `ragMessageLimit: 5` (Settings → AI → Knowledge Base).

New messages are indexed incrementally via `scheduleChatRagIndex` after append to the chat log.

### Deleting chat vs RAG

When you delete a message or clear a thread in the Social UI, the **chat log** (`chat-messages.jsonl`) is always updated on your node. Whether **vector RAG** is updated too is controlled by `purgeChatRagOnDelete`:

| `purgeChatRagOnDelete` | Chat UI | Chat log | Vector RAG (`chat:{thread}`) |
|------------------------|---------|----------|------------------------------|
| **`false` (default)** | Hidden | Removed | **Kept** — AI can still retrieve deleted text for drafts / knowledge |
| **`true`** | Hidden | Removed | **Removed** — AI forgets those messages |

Set in **Settings → AI → Knowledge Base → Purge RAG when deleting chat**, or in config:

```json
"purgeChatRagOnDelete": false
```

Lexical-only mode (`ragMode: lexical`) does not store chat vectors; deleting from the log is enough to drop those messages from lexical RAG.

---

## Agent identity vs human profile vs vault

| | Human profile | Agent identity | Vault KB |
|---|---------------|----------------|----------|
| **File** | Signed JSON in profile dir | `agent-identity.md` | Files under `shared_vault/knowledge/` |
| **Edited in** | Profile tab | Settings → AI | Filesystem / Library |
| **Audience** | Contacts (hello, discovery) | LLM system context only | RAG snippets in prompts |
| **RAG indexed** | No | No | Yes |

Use **agent identity** for tone, boundaries, and capabilities. Use **vault** for factual documents. Use **human profile** for how you present yourself socially.

---

## Configuration reference

All under `aiSettings.knowledgeBase` in `node-config.json` (or Settings → AI):

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
| `publicVaultPaths` | `knowledge/public/` | Contact-safe corpus |
| `privateVaultPaths` | `knowledge/private/` | Owner-only corpus |
| `purgeChatRagOnDelete` | `false` | Also remove chat vectors when deleting/clearing chat |
| `embedding.*` | see example | Embedding provider (separate from chat) |

Field-level comments: `apps/node/data/default/node-config.example.jsonc`.

---

## Operations

### Add documents

1. Copy files into `shared_vault/knowledge/public/` and/or `.../private/`
2. Restart the node **or** wait for the next RAG refresh — changed files are picked up incrementally
3. Check **Settings → AI → Vector index status** for progress

### Change embedding model or chunk settings

After saving config, the node re-runs vault reindex. Files whose hash or chunk settings changed are re-embedded; unchanged files are skipped.

### Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Vector index stuck / errors | Embedding API misconfigured (wrong model, endpoint, or token limit) |
| No vault snippets in replies | `enabled: false`, empty paths, or sensitivity filter excludes all hits |
| Only keyword-like matches | Vector embed failed → lexical fallback (check node logs for `[rag]` warnings) |
| Private docs in contact replies | Should not happen — verify `knowledgeScope` is `public` for drafts; check contact `knowledgeAccess` |

### Logs

Watch for `[rag]`, `[vault]`, and `[knowledge-query]` lines in the node process output.

---

## Code map

| Component | Location |
|-----------|----------|
| KB settings types | `packages/api/src/ai-knowledge-base.ts` |
| Embedding token limits | `packages/api/src/ai-embedding-limits.ts` |
| Vault chunk + extract | `packages/vault/` |
| Vector store + embed | `packages/rag/` |
| RAG orchestration | `apps/node/src/rag-service.ts` |
| Vault + chat search helpers | `apps/node/src/ai-context.ts` |
| Profile/relationship/chat context | `apps/node/src/context-injector.ts` |
| Agent identity injection | `apps/node/src/agent-identity-context.ts` |
| Chat draft prompts | `apps/node/src/chat-draft-inbound.ts` |
| Knowledge query prompts | `apps/node/src/knowledge-query-inbound.ts` |
| Startup reindex | `apps/node/src/index.ts` (`refreshRagService`) |

---

## Related docs

- [ai-response-settings-design.md](./ai-response-settings-design.md) — AI modes, rules, contact permissions
- [run-local-model.md](./run-local-model.md) — Ollama / LiteLLM / provider setup
- [ai-document-backbone-plan.md](./ai-document-backbone-plan.md) — Envoy AI document agent and library tools
