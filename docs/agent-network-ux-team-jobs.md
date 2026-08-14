# Team jobs — Fleet readiness, live story & multi-node UX

> Design for making Team jobs understandable and operable across bonded homes
> **without** mixing chat recruitment into the default product.
>
> Status: **designed (Phase 58)** — not implemented yet.
>
> Related: [`agent-network-guide.md`](./agent-network-guide.md) ·
> [`agent-network-plan-assign.md`](./agent-network-plan-assign.md) ·
> [`agent-network-artifacts.md`](./agent-network-artifacts.md) ·
> [`agent-network-iteration.md`](./agent-network-iteration.md) ·
> [`agent-network-fleet.md`](./agent-network-fleet.md) ·
> [`agent-network-job-input-delivery.md`](./agent-network-job-input-delivery.md) (Phase 59, after this) ·
> [`implementation-plan.md`](./implementation-plan.md) Phase 58.

## 1. Problem

Team jobs already run a capable multi-home pipeline (plan+assign → DAG →
artifacts → iteration → report). Product friction is elsewhere:

1. **“No workers” / stale agent cards feel like dead ends** — copy mixes Join,
   bond, cards, and online without a checklist or one CTA per gap.
2. **Live assigner UI is weaker than the wire** — preview returns per-step
   `objective`s, but `chainGetState` does not expose a full `steps[]`; the
   detail tree is best-effort. Runtime `inputArtifacts` are invisible.
3. **Composer attachments ≠ cross-home delivery** — labeled vault files live on
   the Assigner home; workers get packed refs / text via the orchestrator, not
   a silent vault sync.
4. **RPC ahead of UI** — `chainCancel({ subtaskId })`, observed snapshots, and
   remote `assignerPeerId` / handoff exist; owners cannot use them from the
   default product.
5. **EnvoyGo** can start / monitor / cancel but cannot unblock
   `waitingForOwner` iteration or see “Jobs you’re on.”

## 2. Principles

1. **Team jobs live in Team jobs** — start, readiness, progress, worker view,
   Advanced. Chat stays chat.
2. **Opt-in is the norm** — most nodes leave Agent Network off. Never assume
   peers are recruitable; explain *who* is missing *what*.
3. **Progressive depth** — default: goal + pool + run. DAG / artifacts /
   per-step / Assigner only when a job exists or Advanced is opened.
4. **Honesty over magic** — attachments and artifact handoffs must not imply
   automatic vault **sync**. Byte delivery to workers is Phase 59
   ([job input delivery](./agent-network-job-input-delivery.md)), one-shot and
   job-scoped — not a standing mirror.

## 3. Explicitly out of scope (parked)

| Idea | Why park |
|------|----------|
| Always-on “Run as team job” in chat / EnvoyAI message chrome | Overflow; most members not AN-ready |
| 1:1 or group chat = automatic worker pool | Eligibility mismatch; awkward for non-Join members |
| Cross-home **vault sync** (standing mirror) | Wrong shape — see Phase 59 **job input delivery** instead |
| Competitive bid inbox on EnvoyGo | Desktop-first; mobile = unblock + observe |

**Future (separate design):** optional “Start team job with *these* bonded
peers” from a contact or group **only when** each selected peer is Join +
card-ready — never as default chat chrome. Phase 43B chat entry strings may
remain unused until that design lands.

## 4. Wave overview

| Wave | Outcome | Surfaces |
|------|---------|----------|
| **58A** | Fleet readiness before failure | Social start + Manage workers; EnvoyGo start |
| **58B** | Live job story + artifact / attachment honesty | `chainGetState.steps` + Social detail (+ EnvoyGo light) |
| **58C** | Per-step control + clearer worker UX | Social assigner tree + observed cards |
| **58D** | Mobile control when blocked | EnvoyGo: iteration resolve, observed |
| **58E** | Advanced Assigner picker | Social Advanced only |

Order is intentional: unblocking hire (58A) before deepening the story (58B),
then operability (58C–E).

---

## 5. Wave 58A — Fleet readiness checklist

### 5.1 Problem today

`ChainStartDialog` shows title + paragraph + optional “Open Discover.” Bid
inbox has a similar dead end (`chains.bidInbox.noWorkers*`). Phase 43 exit
still open: *“Zero-worker and stale-agent-card errors are user-actionable.”*

### 5.2 `FleetReadinessPanel`

One shared panel (Social component; EnvoyGo mirror), reused:

- **Before Preview** when the selectable pool is empty (skip a useless LLM plan
  when local Join is off and no peers are ready).
- **After Preview** when `noWorkers` / zero selectable.
- **Manage workers** / Team jobs empty contacts strip (compact variant).

**Checklist rows** (each: ✓ / ! / ✗ + **one** CTA):

| Check | Pass | Fail CTA |
|-------|------|----------|
| Join Agent Network (local) | `capabilityProviderEnabled` | Open Manage workers / toggle Join |
| Local engine ready | Configured worker engine up | Settings → AI (`engineOfflineReason`) |
| ≥1 bonded contact | bonds exist | Open Discover |
| Contact joined AN | opted-in | Plain “ask them to Join” (+ fleet invite link if already in product) |
| Fresh agent card | card ready (not stale/missing) | Refresh cards / reopen Team jobs |
| Online now | `chainProbeReachability` online | Retry probe / “offline — can’t join this job” |
| Other ready peer | ≥1 selectable besides “need multi-agent” rule | Same as today: need another ready peer |

**Rules**

- Stale card ≠ offline — separate rows.
- Do not duplicate the full fleet wizard inside Preview; deep-link into
  existing Manage workers / Discover.
- Close Phase 43’s open diagnostics criterion when this ships.

### 5.3 Copy tone

Prefer verbs and status over protocol jargon. Keep i18n under `chains.start.*`
/ `chains.readiness.*` (new keys as needed).

---

## 6. Wave 58B — Live job story + artifacts / attachments

### 6.1 API: assigner `steps` on `chainGetState`

Align assigner live state with `ChainObservedStatus.steps` (today the worker
view is richer than the assigner view).

Add optional:

```ts
steps?: Array<{
  subtaskId: string
  objective: string
  state: "pending" | "offered" | "awarded" | "running" | "done" | "failed" | "cancelled"
  dependsOn?: string[]
  workerPeerId?: string
  requiredRole?: string
  threadId?: string
  expects?: string[]
  produces?: string[]
  /** What this step is waiting on from parents (refs / keys — not bytes). */
  waitingOn?: Array<{
    fromSubtaskId: string
    key: string
    kind: "text" | "file" | "structured"
    label?: string
  }>
  /** After done: named outputs available to children. */
  produced?: Array<{ key: string; kind: string; label?: string }>
}>
```

Populate from orchestrator runtime (plan + awards + partials +
`buildInputArtifacts` bookkeeping). Omit bulky content; keys and short labels
only. Keep field optional for older clients.

### 6.2 Social detail UI

Replace best-effort tree with:

- Order / indent by `dependsOn`
- Line 1: objective (truncate + expand)
- Line 2: worker · state · role
- Line 3: **Waiting on:** `Step 1 → summary` / **Produced:** `result (text)`

Job header: **Inputs on this home** for composer attachments
(`[brief] vault/relative/path`) — distinct from runtime handoff.

### 6.3 Attachment honesty (composer vs Phase 53)

In start + detail, short note:

> Files you attach live on **this home’s vault**. Workers receive **references
> or packed artifacts** the Assigner passes between steps — not an automatic
> copy of your vault.

Cross-home byte sync remains a non-goal (see
[`agent-network-artifacts.md`](./agent-network-artifacts.md) §2).

### 6.4 EnvoyGo

Show step list + waiting-on one-liners; skip heavy tree chrome.

---

## 7. Wave 58C — Per-step control + worker-side UX

### 7.1 Per-step (RPC already: `chainCancel({ subtaskId })`)

Assigner-only actions on each step:

| Action | When | Behavior |
|--------|------|----------|
| **Cancel step** | offered / running / stalled | Cancel that subtask; dependents marked failed/cancelled with reason |
| **Reassign** | stalled / failed (or owner-forced) | One-click path through existing stall-reassign (respect reassign cap) |

v1: no free-form “pick any peer” picker unless ranking UI already exists.

### 7.2 Worker-side (“Jobs you’re on”)

Refine observed cards:

| State | Meaning | CTA |
|-------|---------|-----|
| **Assigned to you** | Executing | None (or local activity if any) |
| **Waiting on Assigner** | Bid / award / iteration owned elsewhere | “Only {name} can manage this job” |
| **Blocked on prior step** | Pending deps | Show `waitingOn` |
| **Done / failed** | Terminal for your steps | Read-only |

Never show Cancel / Award on observed cards.

---

## 8. Wave 58D — EnvoyGo control surface

Minimal, high value:

1. Banner when `iteration.waitingForOwner` → Approve / Continue / Stop via
   `chainResolveIteration`.
2. Prefer WS `chain:state` / `chain:iteration` when the thin client already
   receives them; else shorten poll while any job is awaiting owner.
3. **Observed list** (second screen or section): same read-only semantics as
   Social.
4. No competitive bid inbox on mobile in this phase.

---

## 9. Wave 58E — Assigner picker (Advanced)

After 58A–58B feel solid:

- Collapsed **Advanced** on start: “Orchestrate on: This node | Bonded peer
  (Join + ready)”
- Uses existing `assignerPeerId` / `task.chain.handoff`
- Surface handoff status: pending → accepted / rejected / expired
- Default remains **this node**
- No chat entry point

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `chainGetState` payload grows | Caps; labels only; no artifact bodies |
| Checklist spams Manage workers | One component; deep-link, don’t fork fleet UX |
| Cancel step orphans dependents | Explicit dependent terminal state + reason |
| Users expect attachment sync | Copy in 58B; no fake progress |

## 11. Success criteria (product)

- Cold start: Join → bond → refresh → see ≥1 selectable worker without guessing.
- Running job: owner can answer “what’s stuck and why?” from the detail view.
- Worker: never believes they can cancel the whole job.
- Phone: owner can unblock `waitingForOwner` without opening Social.
- Advanced: remote Assigner is optional and discoverable, not the default path.

## 12. Code map (expected touch points)

| Area | Paths |
|------|-------|
| Readiness | `apps/social/src/components/ChainStartDialog.tsx`, `ChainsView.tsx`, `chain-bond-health.ts` |
| State API | `packages/api/src/ws-protocol.ts` (`ChainGetStateResult`), `apps/node/src/node-service-chains.ts`, orchestrator |
| Detail | `apps/social/src/components/ChainDetailPanel.tsx` (+ tree if revived) |
| Observed | `ChainsView.tsx` observed section; EnvoyGo chains screens |
| Attachments copy | Social + EnvoyGo start screens; `chain-goal-attachments` |
| Mobile iteration | `apps/envoygo/lib/screens/chains/*`, `node_service_client.dart` |
| Handoff UI | Social Advanced only; API already on `chainStartFromGoal` |

## 13. Test plan (per wave)

- **58A:** unit/component — checklist CTAs when Join off / no bonds / stale /
  offline; skip-preview when pool empty.
- **58B:** unit — `steps` populated with `waitingOn` from parent
  `namedArtifacts`; Social/EnvoyGo render fixtures.
- **58C:** unit — cancel-by-subtask leaves siblings; observed card has no
  manage actions.
- **58D:** widget/RPC — resolve iteration from active detail; observed list.
- **58E:** UI + existing handoff E2E reuse (`chain-assigner-handoff-e2e`).
