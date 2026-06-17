# Phase 34 — Render typed Artifacts + cached AgentCard in Social/EnvoyGo

**Status:** `[~]` design (not yet implemented)
**Owner:** TBD
**Slices:** A–D

## Why

Phase 33 made the A2A surface wire-ready:
- `ArtifactSchema` (discriminated union: `text` / `file` / `structured`) replaces the old `string[]` in `TaskResultPayloadSchema`.
- `AgentCardAutoFetcher` auto-caches peer `AgentCard` on `bond:established` (24h freshness, public/blocked skip, silent failure).
- The mobile-node stores the same artifacts and cached cards in SQLite.
- The `home:agent-cards-updated` event already broadcasts new card state.

But **the Social UI / EnvoyGo consumes none of it today**:
- No React component imports `Artifact`, `TextArtifact`, `FileArtifact`, or `StructuredArtifact` (grep confirms zero matches).
- No React component imports `CachedAgentCardSummary` (the hook + client expose it, but no view calls it).
- `home:agent-cards-updated` has zero subscribers in `apps/social/src`.
- The Activity drill-down for a task shows the audit summary (which already contains `artifactCount` + `artifactKinds` from Phase 33B) — but the user has no way to *see* the artifacts themselves.

Phase 34 closes the loop: the data lands on the wire, the home node stores it, the user finally sees it.

## What ships

Four small slices, each testable in isolation. **No new wire intents, no new dependencies, no schema changes** — this is pure UI + one new read-only persistence file + one new RPC.

### Slice A — Persist + retrieve full TaskResultPayload (the data plumbing)

The current audit journal stores a **summary** for each `task.result` (with `artifactCount` + `artifactKinds`), but the full `TaskResultPayload` (with actual artifact content) is discarded. We need a way to fetch it back for the UI.

**Add `packages/local-store/src/task-results-store.ts`** (new file, ~80 lines):
- JSON state file `task-results.json` (one record per `taskId`, atomic rename like every other store).
- Public surface:
  ```ts
  interface LocalTaskResultsStore {
    recordTaskResult(payload: TaskResultPayload): Promise<void>;  // upsert by taskId
    getTaskResult(taskId: string): Promise<TaskResultPayload | undefined>;
    listTaskResults(): Promise<TaskResultPayload[]>;
  }
  ```
- `recordTaskResult` is best-effort idempotent: writing the same `taskId` twice keeps the latest payload and updates `receivedAt`.

**Wire into `daemon-task-inbound.ts`:**
When the inbound handler processes a `task.result` and decides `handled`, **after** it appends the artifact-audit event (Phase 33B), also call `taskResultsStore.recordTaskResult(parsedPayload)`. The `taskResultsStore` joins the existing `LocalTaskStore` interface.

**Expose new RPC `getTaskResult(taskId)` on `NodeService`:**
- `apps/node/src/node-service-impl.ts`: thin wrapper over `taskResultsStore.getTaskResult`.
- `apps/node/src/ws-server.ts`: register `getTaskResult` handler.
- `packages/api/src/node-service.ts`: add to the `NodeService` interface + `WsServerRpcMap` (the existing `ws-protocol.ts` registry).
- `apps/social/src/lib/direct-call-client.ts` + `useNodeService.tsx`: expose `getTaskResult(taskId)`.

**Mobile parity:** `packages/mobile-node/src/index.ts` already has `MobileNode` storing task results. Add an in-memory `taskResultsByTaskId: Map<string, TaskResultPayload>` on the mobile node that the inbound `task.result` handler populates, and expose `getTaskResult(taskId)` over the same in-process `NodeService` surface (no SQLite — the mobile-node treats it as ephemeral since it pulls from the home node anyway).

### Slice B — ArtifactRenderer + its three branches (the UI component)

**Add `apps/social/src/components/ArtifactRenderer.tsx`** (~120 lines):
- Discriminated by `kind: "text" | "file" | "structured"`.
- `<TextArtifactRenderer>` — markdown, supports the same `Markdown` component `AnswerRenderer` uses; respects `mimeType` (e.g. `text/markdown` → markdown, `text/plain` → `<pre>`, `application/json` → pretty-printed `<pre>`). 64KB cap from the schema is already enforced upstream; trust it.
- `<FileArtifactRenderer>` — card with `displayName`, size, hash, and an "Open" button that calls the existing `onOpenLocalFile` callback (same shape `AnswerRenderer`'s `onOpenFile` uses — `OpenLocalFileParams { relativePath }`). The `vaultPath` is server-side; the UI just passes the hash to a future `chatAttachmentOpen` or `vaultOpen` RPC. **For Phase 34, the Open button is a stub** that toasts "File open not wired yet" — we get the display right, and wire the open path in a follow-up phase (this keeps the slice small and avoids over-promising).
- `<StructuredArtifactRenderer>` — pretty-prints `data` as collapsible `<details>`/`<summary>` JSON (since `schemaRef` is just a string identifier we don't have schema metadata for). For known `schemaRef` values (start with `mesh.task.*` and `mesh.artifact.*`), we add tiny formatters later; for v1, JSON pretty-print is the honest answer.

**CSS** (`apps/social/src/styles.css`):
- Reuse the `.answer-block-card` / `.answer-block-paragraph` design vocabulary.
- Add three new classes: `.artifact-text`, `.artifact-file`, `.artifact-structured` that compose with the existing pattern. No new design language — same surface as `AnswerRenderer`.

**i18n** (`apps/social/src/i18n/messages/en-misc.ts` + 6 locale mirrors):
- `artifactRenderer.text`, `artifactRenderer.file`, `artifactRenderer.structured`
- `artifactRenderer.openFile`, `artifactRenderer.fileNotWired`
- `artifactRenderer.openFileToast`

### Slice C — Surface the renderer in the Activity drill-down (where owners look)

The Activity view already has a "Trace" drill-down for each task (uses `listTaskJournalEntries` + `listAuditEvents`). We extend that drill-down:

- After the existing journal/audit panel, **if the audit summary contains `task.result` with `artifactCount > 0`**, render the full artifacts via a new `<ArtifactList>` component.
- `<ArtifactList>` calls `getTaskResult(taskId)` once on mount (it returns `undefined` for tasks that never received a `task.result` — that path stays quiet and the existing audit summary still shows).
- The drill-down becomes the *one place* an owner goes to read what their agent received from a peer task.

This is the smallest user-visible payoff: it doesn't add a new view, it enriches the existing one.

### Slice D — Cached AgentCard in peer details (the card is finally shown)

**Extend `CachedAgentCardSummary`** in `packages/api/src/node-service.ts` with four optional rich fields (all additive, all `?`):
```ts
nodeProfile?: "owner-only" | "full" | "thin" | "relay";
publicTopics?: string[];
trustPolicySummary?: {
  acceptsDirectBondRequests?: boolean;
  acceptsReferralRequests?: boolean;
  requiresHumanApprovalForRawFiles?: boolean;
};
supportedProtocolVersions?: string[];
```

**Update the producers** in `apps/node/src/node-service-impl.ts` (and `packages/mobile-node/src/index.ts`) to populate these from `row.card` — no extra fetches, just stop dropping them.

**Subscribe to `home:agent-cards-updated` in `NodeStateContext`** (the existing event-bus that already drives `home:config-updated`, `home:bonds-updated`):
- Cache `CachedAgentCardSummary[]` in state.
- Expose `getAgentCard(ownerId)` derived from the cache (or fall back to a one-shot RPC).

**Add `<AgentCardPanel>` to the existing peer detail surface** (the one that renders bonded contacts — currently `profile/ProfileAboutTab.tsx` or its sibling):
- Show: `displayName`, `nodeProfile` chip, capability tags, public topics, trust-policy summary, supported protocol versions, `cachedAt` with relative time ("3 minutes ago").
- "Refresh" button that calls the existing `requestAgentCard(targetOwnerId)` RPC (forces a re-fetch that bypasses the 24h cache on the home node).
- Empty state: "Agent card not cached yet — bonded peers auto-fetch on bond."

**i18n**: new `agentCard.*` block in `en-misc.ts` + 6 mirrors.

**EnvoyGo parity**: EnvoyGo is a Flutter app. Phase 34's UI changes are Social-UI-only for v1; the mobile WebView reuses the Social UI directly (Phase 31). The mobile-node's `getAgentCard` parity comes from Slice A. EnvoyGo-native widget work is a separate, larger task and out of scope.

## Data flow (end to end)

```
mesh.task.propose  ─►  peer agent  ─►  task.result (typed Artifacts)
                                              │
                                              ▼
                                  daemon-task-inbound (Slice A)
                                              │
                              ┌───────────────┴────────────────┐
                              ▼                                ▼
              appendAuditEvent (summary)        taskResultsStore.recordTaskResult (full)
                              │                                │
                              ▼                                ▼
                       audit-journal.jsonl            task-results.json (Slice A)
                                                              │
                                                              ▼
                                                 getTaskResult(taskId) RPC (Slice A)
                                                              │
                                                              ▼
                                                 ArtifactRenderer (Slice B)
                                                              │
                                                              ▼
                                                 Activity drill-down (Slice C)

bond:established  ─►  AgentCardAutoFetcher (Phase 33C)  ─►  agent-card-store
                                                              │
                                                              ▼
                                                 home:agent-cards-updated event
                                                              │
                                                              ▼
                                                 NodeStateContext (Slice D)
                                                              │
                                                              ▼
                                                 AgentCardPanel in peer details
```

## Exit criteria

- [ ] **P34A-1**: `task-results-store.ts` written, atomic, tested with the same `tempStore` helper pattern as `chat-room-store.ts`.
- [ ] **P34A-2**: `daemon-task-inbound.ts` populates the store for `task.result` envelopes; if parsing fails it does **not** abort the inbound (the audit event is still the source of truth).
- [ ] **P34A-3**: `getTaskResult(taskId)` RPC registered in `ws-protocol.ts`, `ws-server.ts`, and exposed on `DirectCallClient` + the React hook.
- [ ] **P34A-4**: Mobile parity — `MobileNode.getTaskResult(taskId)` returns the in-memory payload (or `undefined`).
- [ ] **P34B-1**: `<ArtifactRenderer>` dispatches on `kind`; exhaustive `never` check in the switch.
- [ ] **P34B-2**: `TextArtifactRenderer` uses the existing `Markdown` component (no double-import of markdown libs).
- [ ] **P34B-3**: `FileArtifactRenderer` renders the card with `Open` button (button is a no-op toast for v1).
- [ ] **P34B-4**: `StructuredArtifactRenderer` renders JSON in `<details>`/`<summary>`; 32KB truncation if `JSON.stringify` exceeds that.
- [ ] **P34C-1**: Activity drill-down shows `<ArtifactList>` below journal/audit when the task had a `task.result`.
- [ ] **P34C-2**: `<ArtifactList>` is lazy (`useEffect` on mount) and does not refetch on re-render.
- [ ] **P34D-1**: `CachedAgentCardSummary` extended with the four rich fields; producers populate them; typecheck clean.
- [ ] **P34D-2**: `NodeStateContext` subscribes to `home:agent-cards-updated` and caches the array.
- [ ] **P34D-3**: `<AgentCardPanel>` renders in peer details with the new fields, "Refresh" button, and empty state.
- [ ] **P34D-4**: All 6 i18n locale files updated with `artifactRenderer.*` and `agentCard.*` blocks.
- [ ] **P34T-1**: `apps/social/test/components/ArtifactRenderer.test.tsx` covers each `kind` + unknown-kind fallback.
- [ ] **P34T-2**: `apps/social/test/components/AgentCardPanel.test.tsx` covers empty / cached / refresh states.
- [ ] **P34T-3**: `apps/node/test/task-results-store.test.ts` covers upsert / get / list / atomic write.
- [ ] **P34T-4**: `apps/node/test/daemon-task-inbound.test.ts` extended to assert `recordTaskResult` was called (or gracefully skipped on parse failure).
- [ ] `tsc -b` clean. `npx vitest run` full suite green (Phase 33 baseline restored). No regressions in pre-existing tests.

## Anti-goals (v1)

- **No "open file" wiring.** `FileArtifact`'s `Open` button toasts and is wired in a follow-up phase. We prove the display, not the vault fetch.
- **No structured-artifact schema-aware renderers.** Pretty-printed JSON is the honest answer for unknown `schemaRef`. Add formatters as we get real `schemaRef` values.
- **No new EnvoyGo native widgets.** The Flutter app reuses the Social UI through its WebView; native widgets are out of scope.
- **No new wire intents / schemas / breaking changes.** This phase is purely additive on the storage and UI sides.

## Test plan

| Test | What it asserts |
|------|-----------------|
| `task-results-store.test.ts` | upsert overwrites; get returns latest; list returns all; atomic write survives crash mid-write |
| `daemon-task-inbound.test.ts` (extend) | `task.result` with valid payload → `recordTaskResult` called once; invalid payload → `recordTaskResult` **not** called, audit event still appended |
| `ArtifactRenderer.test.tsx` | `text` → markdown; `file` → card with Open button; `structured` → `<details>`; unknown `kind` → null + console.warn (exhaustive `never` fires in TS check) |
| `AgentCardPanel.test.tsx` | empty / cached-5min / refresh-clicked states render correctly; rich fields shown when present |
| (component) `ActivityTracePanel` integration | drilling into a `task.result` audit row shows the artifact list with the actual payload fetched |
| `tsc -b` | 0 errors (full project references) |
| `vitest run` | full suite green; +4 new test files; ~25 new test cases |
| `npm run smoke:local` | no change (no protocol change) |

## Risk register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Forgetting to populate the new `CachedAgentCardSummary` fields on the mobile-node side | Low | Same producer function, one-line change; add a test for both producers |
| File Open button is a stub → user confusion | Low | Toast says "File open is coming in the next release" + tooltip on the button |
| Adding 4 optional fields to `CachedAgentCardSummary` breaks an old `home:agent-cards-updated` consumer | Low | Optional + additive; consumers that don't read them are unaffected. Mobile-node rebuild needed but not breaking. |
| `task-results.json` grows unbounded | Low | Phase 34 v1 keeps all results; cap with a 100-record LRU in a follow-up if it becomes an issue. Document the cap decision in the implementation. |
| The Activity drill-down re-fetches on every render | Low | `useEffect` with empty deps; cache at the context level if needed |

## Out of scope (parked for future phases)

- File-vault open wiring (needs a `vaultOpen` or `chatAttachmentOpen` RPC + permissions).
- Structured-artifact schema-aware formatters.
- EnvoyGo native widgets (Flutter side).
- Caching the rich card fields beyond what `AgentCard` already carries.
