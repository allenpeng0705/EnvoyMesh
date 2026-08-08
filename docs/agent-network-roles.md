# Agent Network — Roles & assignment modes

> **Status:** **Phase 52 — implemented** (52A–52D).  
> **Related:** [vocabulary](./agent-network-vocabulary.md) · [plan+assign](./agent-network-plan-assign.md) · [operator guide](./agent-network-guide.md) · [iteration](./agent-network-iteration.md) · [implementation plan §Phase 52](./implementation-plan.md#phase-52--agent-network-collaboration-roles--assignment-modes)

## 1. Goals

1. Let an owner **manually** set a **primary collaboration role** on their home agent (with schema room for multi-role later).
2. When creating a Team job, choose **Role based** or **Skill based** assignment.
3. Let the **Assigner LLM** decide the DAG, per-step seats, substitutes, and skill fallbacks — not a hard-coded matrix in the orchestrator.
4. Always **tell the human** what was missing and what was used (preview + active job).
5. Stay backward compatible: peers without roles behave as today’s skill-based workers.

## 2. Non-goals (v1)

- Job-scoped cast overrides (“force Bob = tester for this job only”) — later.
- Hard wire enforcement that a programmer cannot receive a test step — LLM + transparency only in v1.
- Rich artifact handoff / `produces`/`expects` contracts — separate design (see conversation notes); roles do not depend on it.
- EnvoyGo Team jobs UI — Social first.
- Automatic role inference from OpenClaw skills.

## 3. Vocabulary (extends agent-network-vocabulary)

| Term | Meaning | Owner of truth |
|------|---------|----------------|
| **Membership** | May join Team jobs | Agent Card `membership[]` |
| **Skills** | What the agent can do (domains + OpenClaw) | `agentNetworkProfile.skills[]` |
| **Roles** | Collaboration seat on a team (PM / programmer / …) | `agentNetworkProfile.roles[]` (manual) |
| **Assignment mode** | How the Assigner ranks seats for this job | Per-job (+ default): `skill` \| `role` |

**Rules:**

- Membership filters the roster. Roles and skills never grant membership.
- Roles are **not** skills. Do not put `programmer` into `skills[]`.
- Skill-based mode **ignores roles for ranking** (roles may still appear in roster JSON for display).
- Role-based mode: **exact role first**; LLM decides substitutes and skill fallback; orchestrator only validates roster membership and surfaces decisions.

## 4. Data model

### 4.1 Roles on the agent profile

Extend `AgentNetworkProfile` (protocol):

```ts
/** Well-known collaboration seats. Extensible via custom:<id>. */
type AgentNetworkRoleId =
  | "product_manager"
  | "programmer"
  | "tester"
  | "researcher"
  | "writer"
  | "generalist"
  | `custom:${string}`; // max length bounded

roles: AgentNetworkRoleId[]  // max 8; default []
// Convention: roles[0] = primary. Multi-role later = additional entries.
// UI v1: edit primary only (writes roles = [primary] or []).
```

- Empty `roles` → agent has **no role** (skill-only peer).
- Zod: array of strings with refine (`known enum | /^custom:[a-z0-9_-]{1,32}$/`).
- Card announce already ships full `agentNetworkProfile` — no new intent.

**Primary helper (API):**

```ts
function agentNetworkPrimaryRole(profile): AgentNetworkRoleId | undefined
function agentNetworkRoleIds(profile): AgentNetworkRoleId[]
```

### 4.2 Assignment mode

```ts
type ChainAssignmentMode = "skill" | "role";
```

- Default on `ChainDefaultsConfig.assignmentMode` (default `"skill"` — preserves today’s behavior).
- Per-job override on `chainPreviewGoal` / `chainStartFromGoal` / Assigner handoff payload.
- Stored on chain side-state (like `awardMode`) for UI + status: `assignmentMode`.

### 4.3 Plan output (LLM → materializer)

Extend plan+assign JSON (prompted + **parsed**):

```json
{
  "assignmentMode": "role",
  "steps": [
    {
      "objective": "...",
      "requiredRole": "tester",
      "requiredSkill": "coding",
      "depth": 1,
      "dependsOn": [1],
      "assignedPeerId": "envoy_agent_…",
      "assignKind": "exact_role" | "role_substitute" | "skill_fallback" | "generalist",
      "missingRole": "tester",
      "reason": "No tester on roster; programmer Bob can run light QA",
      "constraints": []
    }
  ],
  "aggregation": "llm_merge",
  "warnings": [
    {
      "code": "role_missing",
      "role": "tester",
      "usedPeerId": "envoy_agent_…",
      "assignKind": "role_substitute",
      "message": "No Tester — used Programmer (Bob) for QA step"
    }
  ],
  "notes": "optional free-text summary for the owner"
}
```

**Wire on `ChainSubtask` (optional, additive):**

| Field | Purpose |
|-------|---------|
| `requiredRole?: string` | Seat this step wants |
| `preferredWorkerPeerId` | Unchanged — named assignee |
| `constraints` | Keep embedding `Assign reason: …` for workers |
| (side-state, not subtask) `planWarnings[]` | Structured warnings for UI |

Do **not** require old peers to understand `requiredRole` — unknown fields ignored by older Zod if we add `.passthrough()` carefully; prefer explicit optional fields on schema.

### 4.4 Preview / start RPC

```ts
// ChainPreviewGoalParams / ChainStartFromGoalParams
assignmentMode?: "skill" | "role";

// Results
assignmentMode: "skill" | "role";
planWarnings: Array<{
  code: "role_missing" | "role_substitute" | "skill_fallback" | "no_role_peers" | "ambiguous_role";
  role?: string;
  stepIndex?: number;
  usedPeerId?: string;
  assignKind?: string;
  message: string;
}>;
diagnostics: string[]; // keep existing human strings; also mirror warnings
```

## 5. Assigner behavior (LLM owns decisions)

### 5.1 Principle

The **orchestrator does not encode** “programmer may cover tester.”  
It provides:

1. Roster facts (peerId, displayName, **roles**, skills, soft factors).
2. Mode-specific **policy text** in the prompt (guidance, not hard reject).
3. Schema for `assignKind` + `warnings[]`.
4. Light **post-parse hygiene** (ids must be on roster; fill missing `assignKind` heuristically; never invent peers).

### 5.2 Extensible prompt modules

Structure `buildPlanAssignPrompt` as composable sections (string builders), so modes stay maintainable:

```text
[SYSTEM_CORE]           — Assigner identity, JSON-only, DAG rules, roster-only peerIds
[MODE_SKILL] | [MODE_ROLE]  — ranking policy for this job
[SUBSTITUTE_GUIDANCE]   — only in MODE_ROLE; advisory examples, not a closed world
[ROSTER_JSON]           — eligibleWorkers including roles[] + primaryRole
[GOAL + ITERATION]
[OUTPUT_SCHEMA]         — steps + warnings + notes
```

**MODE_SKILL (today, clarified):**

- Rank by `requiredSkill` vs `skills`, soft factors.
- Ignore `roles` for assignment (may list them for owner readability).
- `requiredRole` omitted or null; `assignKind` usually `skill_fallback` or omit.

**MODE_ROLE:**

- Every non-trivial step SHOULD set `requiredRole`.
- Prefer peer whose **primary** role (`roles[0]`) equals `requiredRole`. If multi-role later, any listed role counts as exact.
- If **2+ exact** matches → break ties with skills + soft factors; set `assignKind: "exact_role"`; optional warning `ambiguous_role` if close.
- If **0 exact** → LLM chooses among:
  1. **Role substitute** — another role that can reasonably cover (examples below).
  2. **Skill fallback** — best skill match.
  3. **Generalist** — best remaining peer.
- Always emit a `warnings[]` entry when not `exact_role`.
- **Assume exact-role peers can execute** that seat’s work (do not require skill ∩ for exact match).

**SUBSTITUTE_GUIDANCE (advisory examples in prompt — LLM may deviate with reason):**

```text
Common substitutes (examples, not exhaustive):
- missing tester → programmer often OK for light QA
- missing writer → product_manager or researcher sometimes OK for docs/notes
- missing programmer → do NOT assign tester as coder; prefer skill_fallback (coding) or generalist
- missing product_manager → prefer researcher/writer via skills for spec steps; do not invent authority
Always explain in reason + warnings[].message.
```

Guidance is versioned in code (`ROLE_SUBSTITUTE_GUIDANCE_VERSION = 1`) so we can evolve without breaking parsers.

### 5.3 Post-parse hygiene (deterministic, thin)

| Check | Action |
|-------|--------|
| `assignedPeerId` ∉ roster | Replace via existing `assignWorkersToSteps` / materializer logic; add warning `skill_fallback` |
| Role mode + missing `requiredRole` | Infer from `requiredSkill` map (coding→programmer, …) or leave unset |
| Role mode + `assignKind` missing | Infer: peer primary role === requiredRole → `exact_role`; else if peer has any role → `role_substitute`; else `skill_fallback` |
| Role mode + claimed `exact_role` but peer role ≠ required | Downgrade `assignKind` + add warning (LLM honesty check) |
| `warnings` empty but any non-exact | Synthesize warning from step fields |

Orchestrator **never** blocks launch for missing roles.

### 5.4 Materialize + launch

Unchanged DAG path:

1. `materializePlanAssignSubtasks` — resolve ids, `preferredWorkerPeerId`, embed assign reason + optional `requiredRole`.
2. Persist `planWarnings` + `assignmentMode` on chain side-state.
3. `launchChain` / `advanceReadySubtasks` — dependency schedule unchanged.
4. Stall reassign — prefer another peer with **same requiredRole** when mode is `role` and backups exist; else today’s backup list. (Small deterministic hint; still no hard substitute matrix.)

## 6. Human visibility

| Surface | What to show |
|---------|----------------|
| **Agent Network profile** | Primary role picker (None / PM / Programmer / Tester / …). Multi-role UI later. |
| **Roster chips (ChainsView)** | Role badge beside skill chips when set. |
| **ChainStartDialog** | Toggle **Skill based** \| **Role based** (default from chainDefaults). |
| **Preview** | Per-step: assignee, `requiredRole`, `assignKind` badge; banner list of `planWarnings`. |
| **Active job (detail)** | Same warnings (read-only) + mode badge. |
| **Observed worker card** | Optional: show role of assigned worker if known from card cache — not required for v1. |

Copy examples:

- “No Tester on roster — Assigner used Programmer (Bob) (`role_substitute`).”
- “No Programmer — Assigner used skill match `coding` on Carol (`skill_fallback`).”

## 7. End-to-end flows

### 7.1 Configure role (manual)

```text
Owner opens Agent Network profile
  → sets Primary role = programmer
  → persist agentNetworkProfile.roles = ["programmer"]
  → if Join AN on → announce Agent Card to bonded peers
```

### 7.2 Role-based Team job

```text
Owner selects Role based + goal
  → preview: roster includes roles
  → Assigner LLM returns steps + warnings
  → UI shows substitutes / missing roles
  → owner starts (or edits preferred workers, then start)
  → DAG runs as today; warnings retained on chain state
```

### 7.3 Skill-based Team job

```text
Same as today; roles on roster ignored for ranking.
assignmentMode stored as "skill" for clarity.
```

## 8. Compatibility & migration

| Case | Behavior |
|------|----------|
| Old node, no `roles` on card | Treat as `roles: []` |
| Old Social, no mode toggle | Server default `skill` |
| New Assigner, old worker | Worker ignores `requiredRole` on subtask; still executes |
| Keyword decomposer (no LLM) | Skill path only; if mode=`role`, still keyword+score but attach diagnostic `no_llm_role_planning` (returned from `planChain`, persisted on chain side-state) |
| Preview → Start | Social passes `planWarnings` with `plannedSubtasks` (not a process-global latch) |
| Concurrent previews | `assignmentMode` is request-scoped via `planChain` → `llmDecompose(goal, { assignmentMode })` |

## 9. Testing plan (design-level)

| Layer | Cases |
|-------|-------|
| Protocol | roles coerce/parse; primary helper; optional `requiredRole` on subtask |
| Prompt unit | MODE_ROLE roster includes `primaryRole`; output schema strings stable |
| Materialize | infer assignKind; reject invented peerIds; synthesize warnings |
| Mock LLM | `__plan_assign_from_roster__` gains role-aware fixture when mode=role |
| Social | role picker persist; start dialog mode + warning list |
| E2E (optional) | 3 homes: PM / programmer / tester roles → role mode plan uses exact seats; kill tester role → substitute warning |

## 10. Design review

### 10.1 What looks solid

- Matches the “easy start”: manual primary role + mode toggle + LLM decisions + transparency.
- Extensible: `roles[]`, `custom:*`, prompt modules, warning codes.
- No launch dead-ends; DAG / handoff / iteration unchanged.
- Preserves skill-based as default — low regression risk.

### 10.2 Risks & mitigations

| Risk | Mitigation |
|------|------------|
| LLM ignores guidance (tester codes) | Post-parse honesty check + visible warnings; owner can re-pick workers in preview |
| Empty roles on whole roster in role mode | Warning `no_role_peers`; automatic effective skill ranking inside same prompt (“degrade mode”) |
| Prompt bloat | Modular sections; keep substitute guidance short |
| Confusing “role presets” in UI today (researcher/coder skill packs) | Rename/disambiguate: **skill presets** vs **collaboration role** |
| Multi-role later breaks primary convention | Document `roles[0]` primary; matching uses any entry once multi-role UI ships |

### 10.3 Open decisions (defaults proposed)

| Question | Proposal |
|----------|----------|
| Default assignment mode | `skill` |
| Primary-only UI vs multi | Primary-only UI; schema `roles[]` |
| Store warnings on observed status wire? | **No** in v1 — assigner-local state + preview/start RPC only |
| Should role mode require LLM? | Prefer LLM; without LLM, degrade to skill scoring + diagnostic |
| Enum closed vs open | Closed well-known + `custom:` |

### 10.4 Review verdict

**Approve for implementation** with the above defaults. Do **not** encode a hard substitute matrix in TypeScript; keep it in prompt guidance + structured `warnings` / `assignKind`. Revisit hard guards only if live Assigner quality is poor.

---

## 11. Implementation plan (phased)

### Phase A — Profile roles (manual, announce)

**Verify:** card to peer includes `roles`; Social picker saves primary.

1. Protocol: `roles` on `AgentNetworkProfile` + helpers + tests.  
2. Settings UI: primary role select; i18n; disambiguate skill presets label.  
3. Card build/announce: pass through profile (already does) — add unit assert.  
4. Roster chips: show primary role badge.

### Phase B — Assignment mode plumbing

**Verify:** preview/start accept `assignmentMode`; defaults persist.

1. `ChainDefaultsConfig.assignmentMode` + `ChainDefaultsPanel`.  
2. `ChainPreviewGoalParams` / `ChainStartFromGoalParams` + handoff field.  
3. Chain side-state store `assignmentMode` + `planWarnings`.  
4. ChainStartDialog toggle (default from defaults).

### Phase C — Prompt + parse + materialize

**Verify:** unit tests for role-mode prompt modules + warning parse; mock plan+assign.

1. Refactor `buildPlanAssignPrompt` into core + mode modules.  
2. Parse `warnings`, `notes`, `requiredRole`, `assignKind`.  
3. Thin hygiene in `materializePlanAssignSubtasks`.  
4. Extend mock `__plan_assign_from_roster__` for role mode.  
5. Thread mode into `createLlmDecomposer` / `_runChainGoal`.

### Phase D — Transparency UI

**Verify:** preview shows warnings + assignKind; active detail retains them.

1. ChainStartDialog warning banner + per-step badges.  
2. ChainDetailPanel / state snapshot fields.  
3. Diagnostics mirror for older UI clients.

### Phase E — Polish & soak

**Verify:** three-home E2E optional; docs/guide update.

1. Stall reassign prefers same `requiredRole` when mode=role.  
2. Update `agent-network-vocabulary.md`, `plan-assign.md`, operator guide.  
3. Live-LLM smoke (gated) for substitute warning quality.  
4. (Later) multi-role editor; job-scoped cast; artifact contracts.

### Suggested sequencing

```text
A → B → C → D → E
```

A/B can overlap (schema + defaults). C is the critical path. D can ship with C in the same PR if scoped tightly; otherwise C then D.

### Success criteria (v1 done)

- [ ] Owner can set one primary role; peers see it on cards.  
- [ ] Team job create offers Role based / Skill based.  
- [ ] Role-based plans emit structured warnings when substituting or falling back.  
- [ ] Skill-based behavior unchanged when mode=skill.  
- [ ] Missing roles never block launch.  
- [ ] Docs updated; unit tests green; mock E2E covers exact + substitute paths.

---

## 12. Code map (implementation anchors)

| Concern | Anchor |
|---------|--------|
| Profile schema | `packages/protocol/src/agent-network-profile.ts` |
| Scoring (optional role tie-break later) | `packages/api/src/agent-network-score.ts` |
| Prompt / materialize | `apps/node/src/chain-plan-assign.ts` |
| Decomposer / roster | `apps/node/src/chain-decomposer.ts`, `node-service-chain-orchestration.ts` |
| Defaults | `apps/node/src/chain-defaults.ts`, `ChainDefaultsConfig` |
| RPCs | `packages/api/src/ws-protocol.ts`, `node-service-chains.ts` |
| Profile UI | `AgentNetworkProfilePanel.tsx` |
| Start UI | `ChainStartDialog.tsx`, `ChainsView.tsx` |
| Mock LLM | `packages/models/src/mock-plan-assign.ts` |
