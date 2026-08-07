# Plan: Select Team Members for Team Jobs

## Context

The Team Jobs UI refinement (remove duplicate button, bonded contacts list, dialog redesign) is complete. The user now wants to make the worker candidates **selectable** — so users can explicitly pick which bonded contacts participate in a team job. If none are selected, the system uses all valid workers (current behavior).

Currently the worker candidates in `ChainStartDialog` are display-only. The backend auto-discovers workers via `findAgentNetworkWorkersRanked` with no user filtering. The `preferredWorkerPeerId` concept exists per-subtask in the orchestration code but is not exposed through the `chainStartFromGoal` API.

## Approach

Add `preferredWorkerPeerIds?: string[]` to the chain API params, filter worker discovery by this set when non-empty, and add checkbox UI to the dialog. Track selection by agent peer ID (`card.sourceAgentPeerId`), not owner ID.

## Changes

### 1. API types — `packages/api/src/ws-protocol.ts`
- Add `preferredWorkerPeerIds?: string[]` to `ChainPreviewGoalParams` (L2052) and `ChainStartFromGoalParams` (L2076)
- Doc comment: agent peer IDs, empty = use all discovered workers

### 2. Worker discovery filter — `apps/node/src/node-service-chain-orchestration.ts`
- `findAgentNetworkWorkersRanked` (L863): add optional `preferredWorkerPeerIds?: readonly string[]` arg. Filter the scored results **after** scoring (preserves ranking among allowed set), right before `return rankWorkersByScore(...)`:
  ```ts
  const filtered = preferredWorkerPeerIds?.length
    ? scored.filter((w) => preferredWorkerPeerIds.includes(w.peerId))
    : scored;
  return rankWorkersByScore(filtered);
  ```
- `_runChainGoal` input (L1175): add `preferredWorkerPeerIds?: string[]`; pass to `findAgentNetworkWorkersRanked` at L1339
- `buildChainContext` (L222): forward the new arg through the wrapper
- `_handoffChainGoalToAssigner` (L1596): add to input; forward to wire payload (after schema change below). Receiving handler (L557) forwards into `_runChainGoal`

### 3. Handoff wire schema — `packages/protocol/src/agent-network-handoff.ts`
- Add `preferredWorkerPeerIds: z.array(z.string().min(1)).max(64).optional()` to `ChainHandoffRequestPayloadSchema` (L90) and the `ChainHandoffRequest` interface (L133). Forward-compatible (older receivers strip it)

### 4. Preview/start runtime — `apps/node/src/node-service-chains.ts`
- `chainPreviewGoalViaRuntime` (L732): pass `params.preferredWorkerPeerIds` to `ctx.findAgentNetworkWorkersRanked`
- `chainStartFromGoalViaRuntime`: pass `params.preferredWorkerPeerIds` to both the preview call (L809) and `ctx.runChainGoal` calls (L780, L832)

### 5. Wrapper plumbing — `apps/node/src/node-service-impl-service-deps.ts` (L742) + `apps/node/src/node-service-contexts.ts` (L1314)
- Forward the new optional arg through `findAgentNetworkWorkersRanked` wrappers

### 6. Dialog UI — `apps/social/src/components/ChainStartDialog.tsx`
- Add `selectedPeerIds: Set<string>` state (track `card.sourceAgentPeerId`)
- `toggleWorker(peerId)` helper (mirror `InviteMembersModal.tsx:38-45` pattern)
- `useEffect` to prune stale selections when `workerCandidates` changes
- Replace worker candidates block (L183-222):
  - Heading → "Select team members"
  - Hint → "Pick which contacts join this team job. Leave empty to use all valid workers."
  - Each card: checkbox (selectable when `health.status === "ready" || "stale"` and `card.sourceAgentPeerId` exists; disabled otherwise)
  - Selected count pill: "{selected} of {selectable} selected"
- `handleStart` (L94): pass `preferredWorkerPeerIds: selectedPeerIds.size > 0 ? [...selectedPeerIds] : undefined`
- Do NOT pass `preferredWorkerPeerIds` to `chainPreviewGoal` (avoid expensive LLM re-fetch on toggle). Preview shows full pool; selection applies on launch only

### 7. i18n — `apps/social/src/i18n/messages/en-chains.ts` + `zh-chains.ts`
New keys in `chains.start`:
- `selectTeamTitle` — "Select team members" / "选择团队成员"
- `selectTeamDesc` — "Pick which contacts join this team job. Leave empty to use all valid workers." / "选择参与此协作任务的联系人。留空将使用所有可用工作代理。"
- `selectTeamCount` — "{selected} of {selectable} selected" / "已选 {selected} / {selectable}"
- `selectTeamPreviewNote` — "Worker counts reflect all discovered contacts; your selection applies on launch." / "工作节点数量反映所有已发现的联系人；您的选择在启动时生效。"
- `contactNotSelectable` — "Not selectable" / "不可选"

### 8. CSS — `apps/social/src/styles.css` (near L10570)
- `.chain-worker-card--selectable` — `cursor: pointer`
- `.chain-worker-card--disabled` — `opacity: 0.55; cursor: not-allowed`
- `.chain-worker-card--selected` — `border-color: var(--color-primary); background: var(--color-primary-subtle)`
- `.chain-worker-card__checkbox` — 18×18 checkbox, `flex-shrink: 0`

## Edge cases
- **Selected worker lacks required capability**: filtered out for that subtask → subtask may have 0 workers → existing "no workers" diagnostic covers it
- **Empty selection**: pass `undefined` (not `[]`) → no filter → current behavior
- **Iteration rounds** (`_continueIterationRound` L1458): selection does NOT carry into mid-job replanning in v1 (documented limitation, TODO)
- **Remote assigner handoff**: carried on wire after schema change; remote worker pool may differ

## Verification
1. `npm run typecheck` — confirms types thread through
2. Browser preview: Team Jobs → New team job → dialog shows checkboxes; toggle selection; start job passes selected IDs
3. Switch to Chinese — verify localized strings
4. Empty selection → start → backend uses all workers (unchanged behavior)
5. Select specific contacts → start → only those are proposed as workers
