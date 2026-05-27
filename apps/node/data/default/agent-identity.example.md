# Agent identity (reference template)

Copy to your profile directory as `agent-identity.md`:

```bash
cp apps/node/data/default/agent-identity.example.md apps/node/data/default/agent-identity.md
```

**All local config files:** [docs/local-configuration.reference.md](../../../docs/local-configuration.reference.md)

Then edit the copy. `profileDir` comes from `node-config.json` (default: `./data/default` relative to `apps/node` when you run `npm run node:dev`).

| | |
|---|---|
| **Full path (default setup)** | `apps/node/data/default/agent-identity.md` |
| **Also editable in UI** | Settings → AI → Agent identity |
| **Used for** | Injected into every AI prompt (chat drafts, Envoy AI, knowledge queries) |
| **Not used for** | RAG / vector search — do not put this file in the vault knowledge folders |
| **Size limit** | 12,000 characters (longer content is truncated) |
| **Permissions** | File mode `0600` (owner read/write only) |

See also: [docs/knowledge-base-and-rag.md](../../../docs/knowledge-base-and-rag.md) (how this differs from vault RAG and human profile).

---

Delete everything below this line when you copy, or replace the section placeholders with your own text.

# Agent identity

## Role

Who your assistant is and what it helps with (e.g. personal assistant, research aide, drafting replies for contacts).

## Tone & style

How it should write: concise vs detailed, formal vs casual, language preferences.

## Boundaries

What it must not do: share private vault content, invent facts, speak for you without approval, etc.

## Capabilities

What it can help with on EnvoyMesh: knowledge base Q&A, reply drafts, file share proposals, and any limits you want.
