# Phase 33 — A2A Tool Exposure (Built-in OpenClaw)

**Status:** `[~]` design (2026-06-16)
**Date:** 2026-06-16
**Author:** EnvoyMesh core team
**Implements:** US-A2A-1 (OpenClaw-side tool surface), US-A2A-2 (Agent card auto-fetch), US-A2A-3 (Typed Artifact)
**Related:** [agent-network-config.md §9](./agent-network-config.md#9-out-of-scope-forward-references) (the previous forward-reference split into Phase 33/34/35 is collapsed into this phase), [implementation-plan.md#phase-33](./implementation-plan.md#phase-33--a2a-tool-exposure-built-in-openclaw), [flutter-thin-client-design.md](./flutter-thin-client-design.md) (EnvoyGo thin-client), Phase 32 (Agent Network Membership — `openclawEnabled` precondition).

---

## 1. Problem

EnvoyMesh's A2A wire is mostly in place. The dispatcher (`packages/api/src/task-dispatcher.ts`) parses **nine** A2A task intents (`task.mandate`, `task.propose`, `task.negotiate`, `task.accept`, `task.reject`, `task.cancel`, `task.heartbeat`, `task.result`, `report.create`), the inbound daemon handles `agent.card.request` / `agent.card.response` (`apps/node/src/daemon-agent-card-inbound.ts`, `agent-card-inbound.ts`), and the role policy gates them by sender/recipient role. But three gaps remain:

1. **No tool layer for the built-in OpenClaw agent.** The user asked for "register `propose_task`, `await_task_result`, `cancel_task`, `request_agent_card` as OpenClaw tools." Today the registry has `mesh.task.propose` and `mesh.agent_card.request` / `mesh.get_agent_card`, but **`await_task_result` does not exist** and **`mesh.task.cancel` does not exist**. The built-in agent cannot easily reach into a peer's running task or cancel one it sent.
2. **Agent cards are not auto-fetched on bond.** The user asked for "auto-fetch agent cards on bond establishment." Today, an OpenClaw agent has no idea what its peer's agent can do until something explicitly calls `mesh.agent_card.request`. Bond events are emitted (`bond:established`), but no hook fetches the card.
3. **The Artifact payload is under-typed.** `TaskResultPayloadSchema.artifacts` is `z.array(z.string().min(1))` — a stringly-typed array. Phase 30 reports, file transfers, and structured AI outputs all collide in the same field with no way to distinguish a text reply from a vault document citation from a structured data blob. The user asked for "type the Artifact payload properly."

This phase closes all three gaps in one pass.

---

## 2. Goals & non-goals

### Goals

- **G1.** Add **`mesh.task.await_result`** and **`mesh.task.cancel`** tools to `ToolRegistry`. Verify `mesh.task.propose` and `mesh.agent_card.request` are reachable from the LLM prompt and end-to-end exercised. Final OpenClaw surface for A2A = `{ propose, await_result, cancel, agent_card.request }`.
- **G2.** Type the Artifact payload as a **Zod discriminated union of three variants** — `text` (plain text reply), `file` (vault document with path + content hash + optional mime type), `structured` (JSON blob with schema ref). Update `TaskResultPayloadSchema.artifacts` accordingly. Update `createTaskResultPayload` constructor. Update `parseTaskResultPayload` (no signature change — callers consume typed artifacts now).
- **G3.** **Auto-fetch agent cards on bond establishment.** When `bond:established` fires (both `bond.request` and `bond.accept` paths), the home node sends `agent.card.request` to the peer's agent peer ID, awaits the response, caches it via the existing `AgentCardStore.upsert`. Idempotent on re-bond (no-op if a fresh-enough card is already cached).
- **G4.** A single E2E test that exercises the round trip: `mesh.task.propose` → wire `task.mandate` + `task.propose` → inbound daemon → journal entry → `mesh.task.await_result` polls inbound → `task.result` arrives with typed Artifacts. Plus a unit test for each new tool.
- **G5.** Audit events for every new outbound intent + every auto-fetch attempt (success + failure). No new wire intents; the A2A envelope set is unchanged.
- **G6.** Plan and design docs reflect the merged Phase 33-35 scope: drop the previous §9 forward-reference that split this into three sub-phases.

### Non-goals

- **NG1.** No new wire intents. The A2A wire is final.
- **NG2.** No changes to the inbound dispatcher or the runtime-guard logic. We are surface-layer only.
- **NG3.** No UI work for A2A on the social app or EnvoyGo. This phase is daemon + tool registry + typed schema. The UI can render `AgentCard` details and `await_result` status in a later phase.
- **NG4.** No reputation / ranking work on the auto-fetched cards. We cache the card verbatim; ranking / trust-tier matching is a follow-up.
- **NG5.** No speculative "A2A chat history" surface. The existing `TaskJournalStore` is the source of truth for A2A history; `await_result` returns a `TaskResultPayload` summary and does not introduce a new journal.
- **NG6.** No changes to `bond:request` semantics, mandate signing, or trust-tier policy. We only **observe** the bond event.

---

## 3. Current state (verified 2026-06-16)

| Concern | Location | Today |
|---------|----------|-------|
| A2A wire dispatch | `packages/api/src/task-dispatcher.ts` | All 9 A2A intents parsed + dispatched to handler map. |
| Role policy gate | `apps/node/src/role-policy.ts:47` | `isA2ATaskIntent` → `senderRole === "agent"`. |
| Runtime guard (TTL, hop count) | `apps/node/src/task-runtime-guard.ts` | Mandate expiry, ttl decrement, peer tracking. |
| Inbound daemon | `apps/node/src/daemon-task-inbound.ts`, `daemon-agent-card-inbound.ts` | Task intents + agent card intents fully handled. |
| Outbound task propose | `apps/node/src/tool-registry.ts:842` (`mesh.task.propose`) | Sends `task.mandate` + `task.propose` envelopes. |
| Outbound agent card request | `apps/node/src/tool-registry.ts:763` (`mesh.agent_card.request`) | Sends `agent.card.request`. Caches on response via `AgentCardStore.upsert`. |
| Outbound agent card read | `apps/node/src/tool-registry.ts:778` (`mesh.get_agent_card`) | Returns cached card for `ownerId`. |
| `mesh.task.cancel` tool | — | **Does not exist.** Cancel today is wired only as a relay helper (`relayTaskCancelIfNeeded` in `node-service-impl.ts:2571`). |
| `mesh.task.await_result` tool | — | **Does not exist.** No polling primitive for a peer's `task.result`. |
| Auto-fetch on bond | — | **Does not exist.** `bond:established` is emitted but no hook in `index.ts` sends `agent.card.request`. |
| Artifact typing | `packages/protocol/src/index.ts:1616` | `artifacts: z.array(z.string().min(1))` — untyped string array. |
| Bond event handler | `apps/node/src/index.ts:2443` | `bond:established` is consumed for wsServer emit + peer-directory upsert. **Auto-fetch hook goes here.** |

---

## 4. Proposed design

### 4.1 Tool layer (sub-phase 33A)

Three additions + one verification to `apps/node/src/tool-registry.ts`:

**`mesh.task.propose`** — already registered at line 842. Verify:
- Sensitivity ceiling `"friends"` and `requiresApproval: false` are correct (the agent auto-routes per Phase 30D rule; bond level gates via inbound policy, not outbound approval).
- Audit `task.tool.propose` fired with `toolName: "mesh.task.propose"`, `correlationId` matching outbound `task.mandate.messageId`.
- Wire is `task.mandate` + `task.propose` envelopes in a single `mesh.task.propose` call. Confirm both are sent and not just one.
- LLM prompt description is updated to call out the Artifact-typed `task.result` it should expect.

**`mesh.task.cancel`** — new. Wraps the `task.cancel` envelope:
- Params: `{ taskId: string; reason?: string; targetOwnerId: string }`.
- Outbound: signed `task.cancel` envelope to `targetOwnerId`'s runtime peer.
- Sensitivity ceiling `"friends"`, `requiresApproval: true` (cancel is a state-mutating action; want explicit owner approval).
- Audit `task.tool.cancel`.
- Idempotent: re-cancelling a cancelled task is a no-op (the peer's `daemon-task-inbound.ts` rejects with `action: "ignored" reason: "task already terminal"`).

**`mesh.task.await_result`** — new. Polls until `task.result` arrives:
- Params: `{ taskId: string; timeoutMs?: number; pollIntervalMs?: number }` (defaults `timeoutMs: 30_000`, `pollIntervalMs: 1_000`).
- Returns the `TaskResultPayload` summary (status, summary string, typed Artifacts) on success.
- Returns `{ ok: false, reason: "timeout" }` if the timeout elapses.
- Implementation: subscribes to a one-shot internal "task-result-arrived" event keyed by `taskId` (we already have `TaskJournalStore`; a cheap indexed lookup + a notifier callback is enough — no new pubsub infra).
- Sensitivity ceiling `"public"` (this is a read of in-memory state, not a wire send).
- `requiresApproval: false`.
- Audit `task.tool.await_result` with `outcome: "ok"` or `outcome: "timeout"`.

**`mesh.agent_card.request`** — already registered at line 763. Verify:
- Re-fetches when `maxAgeMs` is provided and the cached card is older; otherwise returns the cache.
- The auto-fetch on bond (4.3) reuses this tool path (no duplication).

**Tool ordering rationale:** `propose` → `await_result` is the canonical "send a task to a peer and wait for the answer" loop. `cancel` is the escape hatch. `agent_card.request` is the discovery primitive. The LLM prompt sees these four together.

### 4.2 Typed Artifact (sub-phase 33B)

Replace `artifacts: z.array(z.string().min(1))` in `TaskResultPayloadSchema` (`packages/protocol/src/index.ts:1616`) with a Zod discriminated union:

```typescript
export const TextArtifactSchema = z.object({
  kind: z.literal("text"),
  content: z.string().min(1).max(64_000),
  mimeType: z.string().min(1).optional(), // e.g. "text/markdown"
});

export const FileArtifactSchema = z.object({
  kind: z.literal("file"),
  vaultPath: z.string().min(1),           // local or canonical reference (e.g. "/shared/foo.pdf")
  contentHash: z.string().min(1).max(128), // sha256 hex
  mimeType: z.string().min(1).optional(), // e.g. "application/pdf"
  sizeBytes: z.number().int().nonnegative().optional(),
  displayName: z.string().min(1).optional(),
});

export const StructuredArtifactSchema = z.object({
  kind: z.literal("structured"),
  schemaRef: z.string().min(1).max(256), // e.g. "https://schemas.envoymesh.org/task-report-1.json"
  data: z.record(z.unknown()),
});

export const ArtifactSchema = z.discriminatedUnion("kind", [
  TextArtifactSchema,
  FileArtifactSchema,
  StructuredArtifactSchema,
]);

// In TaskResultPayloadSchema:
artifacts: z.array(ArtifactSchema).default([]),
```

Update `createTaskResultPayload` constructor at `packages/protocol/src/index.ts:3213` — its signature already accepts `artifacts`; the input type narrows from `string[]` to `Artifact[]`. Add a sibling `createTextArtifact` / `createFileArtifact` / `createStructuredArtifact` helpers next to `parseTaskResultPayload` for ergonomics.

**Backward compatibility:** any existing `task.result` payload with `artifacts: string[]` is **breaking** at the protocol level. Since this is the EnvoyMesh-internal protocol and we have no out-of-tree senders we need to interop with, breaking the schema is acceptable. Bump `EnvoyEnvelope.version` consideration: not needed — `artifacts` is a payload field, not an envelope field. Document the break in the Phase 33 changelog.

**Phased callers (will need a one-time audit when this lands):**
- `apps/node/src/daemon-task-inbound.ts` — default decision reads `result.artifacts`; type now `Artifact[]` instead of `string[]`. Update audit summary to include `artifactCount`.
- `mesh.task.result` display in any UI — refresh once schema lands.
- The home node's `terminal-assist-prompt.ts` / `terminal-agent-assist.ts` use `task.result` payloads for terminal AI displays; refresh once.

### 4.3 Auto-fetch agent card on bond (sub-phase 33C)

Hook into `apps/node/src/index.ts:2443` (`bond:established` callback):

```text
bond:established fired by NodeServiceImpl
  ↓
  index.ts: bond:established handler (existing)
    ├─ wsServerForEvents.emitEvent("bond:established", ...)        (existing)
    ├─ peerDirectoryStore.ensurePeerFromInboundChat(...)            (existing)
    └─ ✨ NEW: agentCardAutoFetcher.onBondEstablished({
         peerOwnerId, remotePeerId,
       })
         ├─ check AgentCardStore.getByOwnerId(peerOwnerId)
         │   if cachedAt < now - 24h → reuse
         │   else → skip auto-fetch
         ├─ send signed agent.card.request via mesh.dialProtocol(remotePeerId)
         │   intent: "agent.card.request"
         │   payload: parseAgentCardRequestPayload({})
         │   senderRole: "agent"  (uses agent identity, not owner)
         ├─ await response with 5s timeout
         └─ on success: AgentCardStore.upsert + audit agent.card.auto_fetched
            on timeout/failure: audit agent.card.auto_fetch_failed (silent — don't retry eagerly)
```

Implementation: `apps/node/src/agent-card-auto-fetcher.ts` — small new module, ~80 lines. Keeps `index.ts` clean.

**Sender role:** must be `"agent"` (not `"human"`), because the wire is agent-to-agent. Use `bridgeIdentity.agentPeerId` + `bridgeIdentity.agentPublicKey` from the existing `BridgeIdentity` — already loaded by `agent-card-inbound.ts`. The fetcher can be constructed with `{ mesh, bridgeIdentity, agentCardStore, taskStore }` at startup; the index wires it once.

**Idempotency:**
- Skip if a card was cached within the last 24h (configurable via `agentCardAutoFetchMaxAgeMs` on `NodeConfig`, default `86_400_000`).
- Skip if bond-level for the peer is `"public"` (don't fetch cards from strangers).
- Skip if the peer has no `agentPeerId` resolvable (relay-only bonds may not expose one).

**No retry storm:** if the fetch fails (timeout, peer offline), audit `agent.card.auto_fetch_failed` with `reason: "timeout" | "no-agent-peer" | "denied"` and **don't retry on the same bond event**. The `mesh.agent_card.request` tool remains available for explicit re-fetches.

### 4.4 Tests + docs (sub-phase 33D)

- **Unit tests** (new file `apps/node/test/a2a-tool-exposure.test.ts`):
  - `mesh.task.cancel` sends `task.cancel` with `requiresApproval: true`.
  - `mesh.task.await_result` resolves when a matching `task.result` arrives within `timeoutMs`.
  - `mesh.task.await_result` returns `{ ok: false, reason: "timeout" }` after the timeout.
  - `mesh.task.await_result` returns the typed `Artifact` shape (text/file/structured discrimination).
  - `mesh.task.propose` round-trip: tool invocation → `task.mandate` + `task.propose` envelopes sent with correct correlation IDs and audit events.
  - `agentCardAutoFetcher.onBondEstablished` skips when card is fresh (< maxAgeMs).
  - `agentCardAutoFetcher.onBondEstablished` calls mesh.dialProtocol when card is stale.
  - `agentCardAutoFetcher.onBondEstablished` audit `agent.card.auto_fetch_failed` on timeout.
- **Protocol tests** (`packages/protocol/test/`):
  - `ArtifactSchema` rejects malformed payloads (missing `kind`, wrong shape for `kind: "file"`, etc.).
  - `TaskResultPayloadSchema` rejects old `string[]` artifacts (backward-compat test, documents the break).
  - `createTextArtifact` / `createFileArtifact` / `createStructuredArtifact` round-trip through `parseTaskResultPayload`.
- **End-to-end A2A test** (`apps/node/test/a2a-task-roundtrip.test.ts`):
  - Spin up two `NodeServiceImpl` instances in the same process.
  - Node A: `mesh.task.propose` tool fires envelopes.
  - Node B: inbound daemon handles them, journals the propose, eventually returns a `task.result` with one `text` artifact and one `file` artifact.
  - Node A: `mesh.task.await_result` polls and resolves with the typed payload.
- **Auto-fetch integration test** (`apps/node/test/agent-card-auto-fetch.test.ts`):
  - Set up two bonded nodes. Bond event fires. Verify Node A's `AgentCardStore` contains Node B's card within 6s.
- **Docs:**
  - Update `docs/agent-network-config.md` §9 forward-references: drop the Phase 33 / 34 / 35 split; consolidate into "Phase 33 — A2A Tool Exposure (shipped)".
  - Update `docs/implementation-plan.md`: replace the bare "Phase 33 forward reference" mention with a proper Phase 33 sub-phase checklist (33A-33D).
  - Add Phase 33 to the TOC.
- **No UI work.** The UI hooks (social app + EnvoyGo) will read the typed Artifacts and the cached AgentCard in a follow-up.

### 4.5 Audit + observability

New `AuditEventType` values in `@envoymesh/local-store`:
- `"task.tool.propose"` — outbound `mesh.task.propose`.
- `"task.tool.cancel"` — outbound `mesh.task.cancel`.
- `"task.tool.await_result"` — completed (ok / timeout).
- `"agent.card.auto_fetched"` — auto-fetch on bond succeeded.
- `"agent.card.auto_fetch_failed"` — auto-fetch on bond failed (timeout / no agent peer / denied).

No changes to wire `audit.*` types. No new RPCs.

### 4.6 Data flow summary

```text
┌─────────────────────┐  tool invocation                  ┌─────────────────────┐
│  Built-in OpenClaw  │ ─────────────────────────────►   │   ToolRegistry      │
│  (LLM prompt)       │                                   │   (apps/node)       │
│                     │  ◄─── typed Artifact / card ──── │                     │
└─────────────────────┘                                   └────────┬────────────┘
                                                                  │
                                              propose / await / cancel / agent_card.request
                                                                  │
                                                                  ▼
                                              ┌───────────────────────────────┐
                                              │   mesh.dialProtocol           │
                                              │   → signed envelope           │
                                              └────────┬──────────────────────┘
                                                       │
                                                       ▼
                                              ┌───────────────────────────────┐
                                              │   peer daemon-task-inbound    │
                                              │   peer agent-card-inbound     │
                                              │   → journal / AgentCardStore  │
                                              └────────┬──────────────────────┘
                                                       │  (on bond:established only)
                                              ┌────────┴──────────────────────┐
                                              │   agent-card-auto-fetcher     │
                                              │   → agent.card.request → cache │
                                              └────────────────────────────────┘
```

The tool layer is the only new surface. Wire, role policy, runtime guard, inbound daemon are untouched.

---

## 5. Files to change

| File | Type | What |
|------|------|------|
| `packages/protocol/src/index.ts` | edit | Add `TextArtifactSchema` / `FileArtifactSchema` / `StructuredArtifactSchema` / `ArtifactSchema` (discriminated union). Replace `artifacts` in `TaskResultPayloadSchema`. Add `createTextArtifact` / `createFileArtifact` / `createStructuredArtifact` helpers. Update `createTaskResultPayload` constructor typing. |
| `packages/local-store/src/...` | edit | Add 5 new `AuditEventType` values. |
| `apps/node/src/tool-registry.ts` | edit | Add `mesh.task.cancel` + `mesh.task.await_result` tools; update `mesh.task.propose` description to mention typed Artifacts; verify `mesh.agent_card.request` cache-freshness path. |
| `apps/node/src/agent-card-auto-fetcher.ts` | new | Eager auto-fetch on `bond:established`. ~80 lines. |
| `apps/node/src/index.ts` | edit | Construct `AgentCardAutoFetcher` at startup; call `onBondEstablished` from the existing `bond:established` handler at line 2443. |
| `apps/node/src/daemon-task-inbound.ts` | edit | Default decision: include `artifactCount` + a brief `artifactKinds` array in the audit summary (no logic change). |
| `apps/social/src/...` | (no changes this phase) | UI work deferred. |
| `apps/envoygo/lib/...` | (no changes this phase) | UI work deferred. |
| `packages/protocol/test/artifact.test.ts` | new | Unit tests for `ArtifactSchema` + helpers + backward-incompat test for old `string[]`. |
| `packages/local-store/test/audit-event-types.test.ts` | edit (if exists) | Add the 5 new event types to the union. |
| `apps/node/test/a2a-tool-exposure.test.ts` | new | Unit tests for the three tool entries + auto-fetcher. |
| `apps/node/test/a2a-task-roundtrip.test.ts` | new | End-to-end A2A round trip. |
| `apps/node/test/agent-card-auto-fetch.test.ts` | new | Auto-fetch on bond. |
| `docs/agent-network-config.md` | edit | §9: drop the Phase 33/34/35 forward references; consolidate into a single line pointing at the Phase 33 design doc. |
| `docs/implementation-plan.md` | edit | Replace the bare "Phase 33 forward reference" with a proper Phase 33 sub-phase checklist (33A-33D) + exit criteria + changelog. Add to TOC. |

**Net new code:** ~600 lines (most in tests + the typed-Artifact union). **Net new dependencies:** zero.

---

## 6. Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Artifact schema break trips a downstream consumer | Medium | The protocol has no external consumers (we own all senders). Changelog entry + a single one-time audit pass of every `task.result` payload producer. |
| `mesh.task.await_result` poll impl grows a leak (forgotten listeners) | Medium | The poll subscribes to a per-`taskId` notifier that is `clear()`-ed in a `finally` block. A 30s default timeout caps the leak window. Add a vitest that subscribes 1000 times and asserts the notifier map returns to baseline. |
| Auto-fetch on every bond hammers peers that bond frequently | Low | Idempotency check (24h max-age) + skip-on-public-bond + no-retry-on-failure. |
| Agent-card auto-fetch reads a stale card after a peer rotates keys | Low | The card contains the agent's public key; rotation changes the `sourceAgentPeerId` we cache under, so a new card replaces the old. |
| Tool prompt change breaks the LLM | Low | We update descriptions in a single PR with regression test coverage of each tool's parameters. |
| `task.cancel` audit collides with the existing relay-cancel audit | Low | Different `type` strings (`"task.tool.cancel"` vs `"message.sent"`); journal queryable by type. |

---

## 7. Test plan

| Test | File | What |
|------|------|------|
| `ArtifactSchema` truth table | `packages/protocol/test/artifact.test.ts` | text / file / structured accept + reject. |
| Old `string[]` artifacts now rejected | `packages/protocol/test/artifact.test.ts` | Documents the break. |
| `mesh.task.cancel` happy path | `apps/node/test/a2a-tool-exposure.test.ts` | Tool invocation → `task.cancel` envelope signed with `requiresApproval: true`. |
| `mesh.task.await_result` resolves on inbound `task.result` | `apps/node/test/a2a-tool-exposure.test.ts` | Notifier subscribe + manual journal append → resolve. |
| `mesh.task.await_result` timeout | `apps/node/test/a2a-tool-exposure.test.ts` | No inbound within timeout → `{ ok: false, reason: "timeout" }`. |
| `mesh.task.await_result` notifier leak | `apps/node/test/a2a-tool-exposure.test.ts` | 1000 calls; notifier map returns to empty. |
| `mesh.task.propose` round-trip | `apps/node/test/a2a-task-roundtrip.test.ts` | Propose → inbound → journal entry → result → await returns typed Artifacts. |
| Auto-fetch on bond | `apps/node/test/agent-card-auto-fetch.test.ts` | Two bonded nodes; card cached within 6s. |
| Auto-fetch idempotency | `apps/node/test/agent-card-auto-fetch.test.ts` | Second bond within 24h does not re-fetch. |
| Auto-fetch fail is silent | `apps/node/test/agent-card-auto-fetch.test.ts` | Peer offline → audit `agent.card.auto_fetch_failed`, no retry. |

**Smoke test (manual, on live hardware before Phase 34 lands):**

1. Start two home nodes (Node A + Node B). Pair them via QR / hello.
2. Verify Node A's `AgentCardStore` contains Node B's card within 5s.
3. From Node A's assistant chat, ask EnvoyAI: *"Ask Node B's agent to summarize the latest vault document."* Verify `mesh.task.propose` fires, Node B's journal records the propose, Node B's agent returns `task.result` with one `file` artifact, Node A's `mesh.task.await_result` returns the typed Artifact.
4. Mid-flight, cancel the task from Node A. Verify `mesh.task.cancel` fires and Node B's journal records the cancel.
5. Inspect the audit log on both nodes — every step has an `AuditEvent` with the right `type` + `intent`.

---

## 8. Out-of-scope (forward references)

These are mentioned so reviewers know the seams are intentional, not oversights.

- **Phase 34 — A2A UI on the social app and EnvoyGo.** Render `AgentCard` details (capabilities, public topics) in the bonded-contact card. Render `task.result` typed Artifacts (`text` as chat reply, `file` as vault document with download link, `structured` as collapsible JSON tree). Render `task.cancel` and `await_result` status in a per-task timeline. **Does not require new wire; reads from local stores.**
- **Phase 35 — A2A reputation + ranking.** Use the auto-fetched `AgentCard` to rank peers by capability match. Stored in `AgentCardStore` already; just needs a consumer.
- **Phase 36 — Multi-agent task chains.** `task.negotiate` / `task.accept` between more than two peers (Phase 30 ships 2-party only).
- **MCP bridge for these tools.** Expose `propose_task` / `await_task_result` / `cancel_task` / `request_agent_card` to MCP-compatible clients (Phase 9 ADR). Not in Phase 33.
- **`agent.card.update` intent.** Today `agent.card.response` is sent only as a reply to `agent.card.request`. A `agent.card.update` push (for capability rotation) is a wire addition, deferred.
- **Trust-tier matching on cards.** Cards carry a `trustPolicy` field; matching by tier is deferred.

---

## 9. Decision log

| Date | Decision | Why |
|------|----------|-----|
| 2026-06-16 | Collapse the previous Phase 33 / 34 / 35 split into a single Phase 33 | The three sub-areas (4 tools, auto-fetch on bond, typed Artifact) all touch the same `TaskResultPayloadSchema` + `ToolRegistry` + inbound hook. Slicing them into 3 phases would force 3 separate breaking changes to the protocol. One phase, one breaking schema bump. |
| 2026-06-16 | Artifact = `text` + `file` + `structured` (not two variants) | Phase 30 `report.create` payloads are structured JSON blobs today; collapsing them into `text` would lose the type info. Keeping `structured` as a first-class variant covers reports, tool results, and any future schema-typed payloads. |
| 2026-06-16 | Tool names match `mesh.*` namespace | Consistency with the rest of the registry (`mesh.task.propose`, `mesh.agent_card.request`, etc.). The user's literal names (`propose_task`, etc.) are documented in the tool description so the LLM can match either. |
| 2026-06-16 | Auto-fetch is eager (on `bond:established`), with 24h cache + no retry | Matches the literal "auto-fetch on bond establishment" wording. 24h cache prevents hammering peers that re-bond (e.g. reconnect storms). No-retry-on-failure: a failed fetch is silent in the audit log; explicit `mesh.agent_card.request` tool remains available for re-tries. |
| 2026-06-16 | `mesh.task.cancel` requires owner approval (`requiresApproval: true`) | Cancel is a state-mutating action; want the owner to be in the loop. Audit shows the cancel + the approval flow. |
| 2026-06-16 | `mesh.task.await_result` polls via in-process notifier, not over the wire | No wire poll primitive; the agent would have to send `task.heartbeat` queries which is overkill. The in-process notifier is keyed by `taskId` and fires when the inbound daemon journals the matching `task.result`. |
| 2026-06-16 | Bumping `artifacts: string[] → Artifact[]` is a breaking change | No external consumers of the EnvoyMesh-internal protocol. Documented in changelog + a one-time audit pass. Alternative (forward-compat shim) would force every consumer to handle `unknown` shape, defeating the typing goal. |
| 2026-06-16 | No UI work in Phase 33 | The tool layer + schema are the bottleneck. UI work (rendering typed Artifacts, AgentCard details, task timelines) is best done after the schema stabilizes. |
| 2026-06-16 | `mesh.task.propose` keeps `requiresApproval: false` | Outbound proposal is policy-gated by the inbound `bond:request` / role-policy chain; the per-action `requiresApproval` flag is for owner-side human-in-the-loop. Approval happens when the peer runs `task.negotiate` with `requiresOwnerApproval: true`. |
