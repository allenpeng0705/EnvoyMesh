# Family harness alignment — design & phased plan

**Status:** Draft (2026-11-24)  
**Audience:** Product + engineering (EnvoyMesh, with pointers to EnvoyHome / EnvoyCoder / envoy-harness)  
**Scope:** Ext Agent, Coding tab (Tier A/B), in-node envoy-harness (ACP + chain worker), cross-runtime mesh jobs.

**Sibling references (read-only during implementation):**

| Repo | Role |
|------|------|
| `../envoy-harness` | Agent runtime, ACP server, `Agent.run`, tools |
| `../EnvoyHome` | In-process embed + `harness-host` + `home-harness-bridge` |
| `../EnvoyCoder` | Daemon ACP host, `agent-catalog` (asking / mode / features) |
| `../paseo` | UX patterns (composer, permissions) — per `product_coding_tab_design.md` |

**Implementation checklist (flip `[ ]` → `[x]` when shipping):** [`implementation-plan.md` Phase 68 — 68-FH](./implementation-plan.md#68-fh--family-harness-alignment-envoyhome--envoycoder)

**Related EnvoyMesh docs:**

- [`envoy-harness-integration-EnvoyMesh.md`](./envoy-harness-integration-EnvoyMesh.md) — dev/release bundling
- [`agent-harness-integration.md`](./agent-harness-integration.md) — cooperation with OpenClaw
- [`product_coding_tab_design.md`](../product_coding_tab_design.md) — Coding IA (Phase 68)
- [`Ext_Agent_guide.md`](./Ext_Agent_guide.md) — HTTP bridge agents

---

## 1. Executive summary

EnvoyMesh already hosts **envoy-harness** correctly for Coding (in-process ACP) and **Ext Agent** (HTTP + catalog ACP). EnvoyHome and EnvoyCoder solved adjacent problems: **embedding** the agent in a product daemon vs **cataloguing** every external harness with honest composer controls.

This plan **does not** merge repos or port EnvoyHome’s full `harness-host` turn loop into Mesh. It **does**:

1. **Align** catalog / composer semantics with EnvoyCoder (truth on wire).
2. **Document** the two harness host patterns so implementers stop mixing Ext Agent and Coding EH.
3. **Close UX gaps** EnvoyHome proved matter (long-turn continuation, permission vs mode).
4. **Optionally converge** shared catalog types and, later, a work-engine control plane.

**Priority thesis:** Ship **correctness and clarity (P0)** before **EH polish (P1)** before **platform extraction (P2)**. Phase 68 Coding tab work should consume P0 items as gates; P1 as same-release polish where cheap.

---

## 2. Goals and non-goals

### Goals

| ID | Goal |
|----|------|
| G1 | One mental model: **Coding EH** = full ACP session + EHUI; **Ext Agent** = bridge or one-shot catalog agents unless user is in Coding. |
| G2 | Composer controls (mode, permissions, plan/fast) match **what each agent’s ACP surface actually supports** (EnvoyCoder `agent-catalog` rules). |
| G3 | Long EH coding turns degrade gracefully (continuation / user-visible “keep going”) like EnvoyHome attended chat. |
| G4 | Chain worker / cross-runtime path stays compatible with harness sub-agent model; caps documented. |
| G5 | Family repos stay **peers** — sync via contracts and tests, not vendoring EnvoyHome daemon code. |

### Non-goals (this plan)

- Porting EnvoyHome smart-home tools, workflows engine, or `runTurn` fallback into Mesh.
- Bundling EnvoyCoder desktop or superagent GitHub Sources into Mesh node.
- Unifying monorepos (Option A link/vendor from harness integration guide remains).
- Replacing OpenClaw default routing or Phase 63/64 agent-network scope.

---

## 3. Current state (refined)

### 3.1 Integration matrix

| Surface | Mechanism | Key modules |
|---------|-----------|-------------|
| Coding Tier A `envoy-harness` | In-process ACP (`attachAcpServer`) | `persistent-acp-host.ts`, `node-service-impl` EH RPCs, `ehui/` |
| Coding Tier A `pi` | Pi terminal / adapter path | `node-service-pi.ts` |
| Coding Tier B | Catalog ACP or sidecar one-shot | `packages/harness`, `ExtAgentCodingPanel.tsx` |
| Ext Agent contact | HTTP `/bridge/send` + sidecars | `external-agent-gateway`, `packages/harness` backends |
| Team jobs / AN worker | In-process `Agent.run` + `LocalCrossRuntimeSubmitter` | `agent-runtime-envoy/runtime.ts` |
| OpenClaw ↔ harness skill | `bridge-to-envoy-harness-skill` | `agent-runtime-envoy/` |

### 3.2 What EnvoyHome adds (reference only)

- `stripHarnessAutoTools`, parent `maxIterations` 48, `maxContinuationPhases` 2 (attended).
- Child `task` via `LocalMeshSubmitter` with explicit caps (`TASK_MAX_*`).
- Product-owned compact/flush, workflow route separate from harness.

### 3.3 What EnvoyCoder adds (reference only)

- `asking-control.ts`, `mode-delivery.ts`, `features.ts` — **normative per `HarnessId`**.
- Daemon as sole ACP host; superagent **control plane** design (future).
- Visual system for docks / permissions (Mesh `ehui/` is cousin, not identical).

### 3.4 Known gaps in Mesh (inputs to backlog)

| Gap | Severity | Notes |
|-----|----------|-------|
| No written “ACP host vs embed” guide in Mesh docs | Medium | Causes wrong fixes in PRs |
| `coding-composer-capabilities.ts` duplicated Coder rules | Medium | Drift risk when Coder adds agents |
| EH long-turn continuation not aligned with Home | Medium | Harness may support via ACP; UI cue unclear |
| Tier B “permissions disabled” UX vs EH real policy | Low | Honest but needs user-facing copy |
| EnvoyGo mode/permission parity vs Social | Medium | Phase 68 shared contract |
| Chain worker tool surface not stripped like Home | Low | Only affects AN jobs, not Coding ACP |
| Superagent / proactive coding | None today | P2 optional |

---

## 4. Design principles

1. **ACP host for product UI** — Coding EH and EHUI talk to harness through ACP; do not fork the tool loop into Mesh except chain worker (batch jobs).
2. **Honest UI** — If `permissionPolicy` is not read on the wire path, hide or disable the control (already pattern in `coding-composer-capabilities.ts`).
3. **Permission ≠ collaboration mode** — Never send `read-only` / `workspace-write` to `session/set_mode` (EnvoyCoder `mode-delivery.ts`).
4. **Peer sync over copy-paste** — Prefer shared tests or a thin shared package over duplicating Coder catalog tables.
5. **Surgical diffs** — EnvoyHome patterns are **cherry-picked** (continuation, caps), not wholesale `harness-host` import.

---

## 5. Work packages (P0 / P1 / P2)

Each item: **ID**, priority, **rationale**, design, deliverables, files, deps, acceptance, size.

### Legend

- **Size:** S (&lt;3d), M (3–7d), L (&gt;1w)
- **Gate:** must complete before marked dependents

---

## P0 — Correctness, clarity, gates (do first)

P0 items are **prerequisites** for Phase 68 catalog expansion and for avoiding user-trust bugs. Total ≈ **2–3 engineer-weeks** if done serially; P0-A and P0-B can parallelize.

### P0-A — Harness host patterns doc (Mesh)

| Field | Value |
|-------|-------|
| **ID** | `FH-P0-A` |
| **Rationale** | Highest leverage, zero runtime risk; stops architecture regressions. |
| **Design** | Add §“Family harness integration patterns” to `envoy-harness-integration-EnvoyMesh.md` (or link new appendix): (1) ACP-in-process host, (2) embedded `Agent.run`, (3) catalog spawn, (4) HTTP Ext Agent; decision tree for implementers; explicit “EnvoyHome embed is not Coding EH”. |
| **Deliverables** | Doc section + diagram; cross-link from `product_coding_tab_design.md` §6 backend + `Ext_Agent_guide.md` opener. |
| **Files** | `docs/envoy-harness-integration-EnvoyMesh.md`, `docs/Ext_Agent_guide.md`, `product_coding_tab_design.md` (pointer only). |
| **Deps** | None |
| **Acceptance** | New contributor can answer “where do I add Codex vs EH mode?” without reading three repos. |
| **Size** | S |

### P0-B — Agent catalog drift process + baseline audit

| Field | Value |
|-------|-------|
| **ID** | `FH-P0-B` |
| **Rationale** | Mesh `packages/harness` + `coding-provider-catalog` must not diverge from EnvoyCoder `agent-catalog` on spawn argv, `askingControl`, `sessionSetModeId`. Wrong argv = broken Tier B. |
| **Design** | (1) Manual audit table: every `CODING_FEATURED_HARNESSES` id vs Coder `HARNESS_CATALOG` — transport, mode delivery, asking control, launch args. (2) Add script or CI check **optional v1**: `scripts/check-family-catalog-drift.mjs` comparing a **committed JSON snapshot** exported from Coder (or hand-maintained manifest). v1 can be doc + spreadsheet; v2 automated diff. (3) Process: when Coder changes catalog, Mesh updates snapshot in same release week. |
| **Deliverables** | `docs/family-catalog-drift-audit.md` (initial matrix); optional check script + snapshot under `scripts/family-catalog-snapshot.json`. |
| **Files** | `packages/api/src/coding-provider-catalog.ts`, `packages/harness/src/*`, `apps/social/src/lib/coding-composer-capabilities.ts` |
| **Deps** | None |
| **Acceptance** | Audit lists every featured harness; gaps filed as P1 tickets; zero unknown transports for shipped Tier B agents. |
| **Size** | M (audit S; automation M) |

**Gate:** P0-C composer tests should use audit outputs.

### P0-C — Composer capability tests aligned with Coder rules

| Field | Value |
|-------|-------|
| **ID** | `FH-P0-C` |
| **Rationale** | Locks P0-B into CI; prevents “permissions shown but ignored” regressions. |
| **Design** | Extend `apps/social/test/lib/coding-composer.test.ts` (and optionally `packages/harness/test/`) with table-driven cases mirroring Coder `asking-control.test.ts` / `mode-delivery.test.ts` for each featured harness: `canSetMode`, `permissions`, `permissionDisabledReason`, EH `agentModes` ids. Do **not** import EnvoyCoder package in v1 (peer dep); copy **fixture rows** from audit doc. |
| **Deliverables** | Test matrix; fix any mismatches found (spawn args docs only if no code bug). |
| **Files** | `coding-composer-capabilities.ts`, tests |
| **Deps** | P0-B |
| **Acceptance** | CI fails if EH gains fake “fast” without wire; Codex plan maps to `collaboration_mode` when sidecar supports it. |
| **Size** | M |

### P0-D — EH long-turn continuation (attended)

| Field | Value |
|-------|-------|
| **ID** | `FH-P0-D` |
| **Rationale** | Coding sessions hit iteration limits; Home solved with `maxContinuationPhases` + continue cue. Mesh users see hard failures today. |
| **Design** | **Investigate** harness ACP / `ProtocolSessionBackend` for continuation (peer `envoy-harness` changelog around `4d2905f`). **Target behavior:** (1) Node passes continuation budget on turn start when harness supports it (env `ENVOYMESH_EH_CONTINUATION_PHASES`, default **2**, clamp 0–3 — mirror Home). (2) On max-iteration end state, append user-readable footer to assistant text or emit `eh:turn_incomplete` timeline event with CTA “Send **continue**” (reuse Home copy tone, end-user language). (3) Schedule/cron EH paths pass **0** phases. Unattended ≠ Coding composer defaults. |
| **Deliverables** | Node wiring in `_executeEhTurn`; optional Social/EnvoyGo banner on incomplete; tests with mock harness. |
| **Files** | `node-service-impl.ts`, `persistent-acp-host.ts`, `ehui` still-working indicator, EnvoyGo EH screens |
| **Deps** | Confirm harness API in peer repo (spike ≤1d) |
| **Acceptance** | Multi-step refactor turn completes without user manually restarting session when within phase budget; documented env override. |
| **Size** | M (spike S + impl M) |

**P0 sequencing**

```text
Week 1:  P0-A (parallel) P0-B audit
Week 2:  P0-C tests + fixes from audit
Week 2–3: P0-D spike then impl
```

**Phase 68 gate:** Do not add new Tier B agents to featured list without P0-B row + P0-C test row.

---

## P1 — Product quality on hot paths

P1 assumes P0-A/C done. Total ≈ **3–5 engineer-weeks**; can stagger across Phase 68 UI waves.

### P1-A — EH tool surface policy (ACP path)

| Field | Value |
|-------|-------|
| **ID** | `FH-P1-A` |
| **Rationale** | Home strips misleading harness auto-tools; ACP path may expose tools EHUI doesn’t implement (`todo_write`, duplicate orchestration). |
| **Design** | Prefer **harness-side** or **ACP `session/set_policy`** constraints over reimplementing `stripHarnessAutoTools` in Mesh. Steps: (1) Inventory tools visible in EH Coding sessions vs EHUI handlers. (2) Propose allow/deny list with harness maintainers. (3) Mesh node applies policy on `session/new` or documented harness config flag. **Non-goal:** jail filesystem like Home. |
| **Deliverables** | Short ADR in this doc’s changelog; config or policy call in `persistent-acp-host` / turn start. |
| **Deps** | P0-D (same touchpoints) optional |
| **Acceptance** | No advertised tool that always errors or hangs in standard Coding cwd. |
| **Size** | M |

### P1-B — User-facing Ext Agent vs Coding distinction

| Field | Value |
|-------|-------|
| **ID** | `FH-P1-B` |
| **Rationale** | Support burden: users expect Codex Ext Agent = full Coding permissions. |
| **Design** | Copy + light UI: Ext Agent settings card links to Coding tab; install guide mentions Tier B limitations (`SIDECAR_PERMS_REASON`). EnvoyGo mirror strings in `ext_agent_presets.dart`. No wire change. |
| **Deliverables** | i18n strings; `ExtAgentInstallGuideCard` / Settings AI tab one-liner. |
| **Acceptance** | Usability review: user can find “full Envoy harness” path in ≤2 clicks from Ext Agent. |
| **Size** | S |

### P1-C — EnvoyGo composer parity (mode / permissions)

| Field | Value |
|-------|-------|
| **ID** | `FH-P1-C` |
| **Rationale** | Phase 68 shared contract §3c requires phone = same semantics as Social. |
| **Design** | Map `CodingComposerCapabilities` rules to Dart: EH `default|plan|review` via `collaborationMode` on turn RPC; permissions via existing EH policy RPCs; deepseek-harness **env** permission not `set_mode` (Coder `mode-delivery`). |
| **Deliverables** | Flutter composer widgets + tests mirroring P0-C matrix subset. |
| **Files** | `apps/envoygo/lib/screens/coding/*`, RPC client |
| **Deps** | P0-C fixtures |
| **Acceptance** | Wire compat test or golden list: Social and EnvoyGo send same mode ids for EH + deepseek-harness. |
| **Size** | M |

### P1-D — Chain worker sub-agent caps (document + tune)

| Field | Value |
|-------|-------|
| **ID** | `FH-P1-D` |
| **Rationale** | `agent-runtime-envoy` embeds `Agent.run` for jobs; Home caps prevent runaway `task` fanout. |
| **Design** | Document current harness defaults + Mesh cost ceilings. If gaps: align env knobs with Home `TASK_MAX_*` **where team jobs spawn task children** (not Coding UI). Optional code: pass `maxParallel` / account concurrency into harness submitter config if API exists. |
| **Deliverables** | Section in `agent-harness-integration.md`; optional runtime config. |
| **Acceptance** | Fleet job test cannot spawn &gt;N parallel mesh subagents without deny. |
| **Size** | S–M |

### P1-E — `askingControl` mapping for new catalog agents

| Field | Value |
|-------|-------|
| **ID** | `FH-P1-E` |
| **Rationale** | Ongoing maintenance after P0-B. |
| **Design** | Any new harness in `coding-provider-catalog`: must add row to drift audit + composer tests + `packages/harness` backend implements matching `permissionPolicy` delivery (see Coder `askingOffLaunchArgs`). |
| **Deliverables** | Checklist in Phase 68 implementation-plan subsection. |
| **Acceptance** | PR template checkbox for new coding provider. |
| **Size** | S (process) |

**P1 priority order:** P1-B (quick win) → P1-C (Phase 68) → P1-A → P1-D → P1-E (ongoing).

---

## P2 — Platform and strategic (defer until P0 ship + Phase 68 C0–C2)

P2 is **optional capacity**; do not block Coding tab MVP.

### P2-A — Shared `agent-catalog` contract package

| Field | Value |
|-------|-------|
| **ID** | `FH-P2-A` |
| **Rationale** | Eliminate duplicate tables; single source for EnvoyCoder + EnvoyMesh consumers. |
| **Design** | New package in **envoy-harness monorepo** or neutral `envoy-family-catalog` repo: export types + `askingControl`, `mode-delivery`, `harnessDefinition` JSON. Mesh `packages/harness` imports published or `link:` peer. **Rejected v0:** vendoring full EnvoyCoder daemon. |
| **Deps** | P0-B stable audit; agreement with Coder maintainers |
| **Size** | L |

### P2-B — Cherry-pick harness-host utilities (no full port)

| Field | Value |
|-------|-------|
| **ID** | `FH-P2-B` |
| **Rationale** | If Mesh exposes `task` children in **mesh chat** (not just AN), need caps/parsers without 1700-line `turn.ts`. |
| **Design** | Extract minimal modules from EnvoyHome (with license/attribution): `parseTaskChildren`, `filterChildAllowTools`, continuation env parsing — into `packages/harness` or `apps/node/src/agent-runtime-envoy/home-patterns.ts`. **Only if product commits to parent `task` in EH chat.** |
| **Deps** | Product decision; P1-D |
| **Size** | M–L |

### P2-C — Superagent / work engine for Mesh (proactive coding)

| Field | Value |
|-------|-------|
| **ID** | `FH-P2-C` |
| **Rationale** | EnvoyCoder design for Issues → ticket → ACP session; Mesh could tie **team jobs** or **Coding tasks** to external triggers (bond inbox, cron). |
| **Design** | Follow Coder `superagent-control-plane-design.md` layering: Engine in node **or** separate worker; daemon/ACP unchanged; no harness authorization of tickets. MVP: manual ticket → `startEnvoyHarnessTurn` with `chatId`. |
| **Deps** | Phase 65/68 stability |
| **Size** | L (multi-phase epic) |

### P2-D — Memory compact / flush ownership (Mesh EH sessions)

| Field | Value |
|-------|-------|
| **ID** | `FH-P2-D` |
| **Rationale** | Home owns compact in daemon; EH JSONL sessions may grow unbounded in long Coding projects. |
| **Design** | Define thresholds on `{profile}/envoy-harness/sessions`; node triggers harness compact RPC if exists, else document manual reset. Coordinate with harness peer. |
| **Size** | M |

**P2 order:** P2-A (if drift pain recurring) → P2-D → P2-B (product-gated) → P2-C (new epic doc).

---

## 6. Priority matrix (what blocks what)

| Item | Blocks | Blocked by |
|------|--------|------------|
| P0-A | Onboarding, safe refactors | — |
| P0-B | P0-C, new Tier B agents | — |
| P0-C | Phase 68 provider rollout | P0-B |
| P0-D | Long-session Coding UX | Harness API spike |
| P1-C | Phase 68 EnvoyGo exit | P0-C |
| P1-A | — | Harness policy API |
| P2-A | — | P0-B, maintainer agreement |
| P2-C | — | Product epic approval |

**Critical path for Phase 68:** P0-A → P0-B → P0-C → P1-C (parallel P0-D, P1-B).

---

## 7. Alignment with Phase 68 (Coding tab)

| Phase 68 theme | Harness alignment work |
|----------------|------------------------|
| Unified composer | P0-C, P1-C |
| Tier A EH native | P0-D, P1-A |
| Tier B catalog | P0-B, P1-E |
| Shared contract Social/Go | P1-C |
| Mesh differentiator (review, bonds) | unchanged; P1-D for AN jobs |

Checklist lives in **`implementation-plan.md` → [68-FH](./implementation-plan.md#68-fh--family-harness-alignment-envoyhome--envoycoder)** (maintain checkboxes there, narrative here).

---

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Harness API for continuation differs from Home embed | P0-D spike first; ACP-only path |
| Catalog automation couples CI to sibling repo | Start manual audit; snapshot JSON |
| Tool policy breaks power users | Opt-in “full harness tools” setting later |
| P2-A package politics slow Coder | Keep Mesh duplicates until package exists |
| Ext Agent scope creep into Coding | P1-B messaging + IA guardrails |

---

## 9. Verification summary

| ID | Verify |
|----|--------|
| P0-A | Doc review + link check from three entry docs |
| P0-B | Audit covers 100% featured harnesses |
| P0-C | `npm run test:dev -- --filter coding-composer` |
| P0-D | Integration test: mock harness iteration limit → continue succeeds |
| P1-A | Manual EH turn: no broken tool in default policy |
| P1-B | Copy review |
| P1-C | EnvoyGo widget tests + manual parity spot check |
| P1-D | `agent-runtime-envoy` test or doc sign-off |
| P2-A | `npm run check:family-catalog` green |
| P2-B | `EhSubagentsDock.test.tsx`; manual EH parent `task` row |
| P2-C | `eh-mesh-work-store.test.ts`, `CodingView` mesh-work deep-links, EnvoyGo mesh-work sheet + `eh_mesh_work_ref_test.dart` |
| P2-D | `eh-session-compact.test.ts`; env `ENVOYMESH_EH_AUTO_COMPACT_*` documented in implementation-plan |

---

## 10. Recommended execution waves

### Wave 0 (prep, 2–3 days) — **`[x]` shipped (2026-11-24)**

- P0-A documentation
- P0-B audit spreadsheet
- P0-D harness continuation spike (read peer ACP + Home env names)

### Wave 1 (P0 complete, ~2 weeks) — **`[x]` shipped (2026-11-24)**

- P0-C tests + fix drift
- P0-D implementation
- P1-B copy

### Wave 2 (Phase 68 core, parallel) — **`[x]` shipped (2026-11-24)**

- P1-C EnvoyGo
- P1-E process in PR template
- Phase 68 UI per `product_coding_tab_design.md`

### Wave 3 (hardening) — **`[x]` shipped (2026-11-24)**

- P1-A tool policy
- P1-D chain worker caps
- Re-run P0-B audit

### Wave 4 (strategic) — **`[x]` shipped (2026-11-24)**

- **P2-A** — `@envoymesh/agent-catalog` peer package; Mesh export + `check:family-catalog` CI
- **P2-B** — EH Coding `task` subagent UX (caps, allow-tools, Subagents dock Social + EnvoyGo)
- **P2-C** — Mesh-lite work store/RPC; bond chat invite + `openCoding` (`meshWorkQueue` / `runMeshWorkId` / `meshWorkEnqueue`); Social queue panel; EnvoyGo Coding mesh-work sheet
- **P2-D** — Post-turn EH `session/compact` via `ENVOYMESH_EH_AUTO_COMPACT_AFTER_MSGS` / `_KEEP`

---

## 11. Open decisions (need owner input)

| # | Question | Status |
|---|----------|--------|
| Q1 | Automate catalog drift CI in v1? | **Decided: B** — committed snapshot JSON in Mesh + `check-family-catalog-drift.mjs`; refresh snapshot when aligning with EnvoyCoder; CI fails after FH-P0-C lands (no live sibling clone in CI) |
| Q2 | Default EH continuation phases = 2? | **Decided: B** — attended default **2** (`ENVOYMESH_EH_CONTINUATION_PHASES`, clamp 0…3); schedules / heartbeats / unattended **0** (hard-coded, not env) |
| Q3 | Expose `task` subagents in EH Coding UI? | **Decided: C** — Home-like UX: `task` children visible in Coding EH (tracks/caps/allow-lists aligned with EnvoyHome `harness-subagents`); implement via **FH-P2-B** (cherry-pick patterns + EH timeline/docks), not `harness-host` port |
| Q4 | Shared catalog package owner repo? | **Decided: A** — `envoy-harness` monorepo (`packages/agent-catalog` or equivalent); EnvoyMesh + EnvoyCoder consume published or `link:` peer; start **FH-P2-A** after Q1 snapshot proves stable |
| Q5 | Superagent in Mesh vs Coder-only? | **Decided: B (Mesh-lite)** — full superagent Sources/triage stays **EnvoyCoder**; Mesh **FH-P2-C**: mesh-native triggers only (bond chat, coding deep-link, mandate/cron already via 68-C6/C7) → `startEnvoyHarnessTurn` / ticket façade; no GitHub/Source v1 |

### Decided summary (2026-11-24)

| Q | Choice | Primary work item |
|---|--------|-------------------|
| Q1 | B | FH-P0-B/C — snapshot + drift script |
| Q2 | B | FH-P0-D — continuation 2 / unattended 0 |
| Q3 | C | FH-P2-B — EH `task` subagent UI |
| Q4 | A | FH-P2-A — catalog in `envoy-harness` |
| Q5 | B | FH-P2-C — mesh-lite triggers (not Coder superagent clone) |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-11-24 | Initial design: P0/P1/P2 packages, sequencing, Phase 68 alignment |
| 2026-11-24 | Linked `implementation-plan.md` §68-FH checklist |
| 2026-11-24 | **Q1 decided: B** — Mesh snapshot + drift check script for catalog alignment |
| 2026-11-24 | **Q2 decided: B** — continuation phases 2 (attended), 0 (unattended) |
| 2026-11-24 | **Q3 decided: C** — Home-like EH `task` subagent UI (FH-P2-B) |
| 2026-11-24 | **Q4 decided: A** — shared agent-catalog owned by envoy-harness monorepo (FH-P2-A) |
| 2026-11-24 | **Q5 decided: B** — Mesh-lite triggers (FH-P2-C); EnvoyCoder owns full superagent |
| 2026-11-24 | **FH-P1-A shipped** — Mesh EH ACP path strips harness auto-tools after `Agent` construction; `applySessionAutoRunPolicy` → `session/set_policy` on host start / policy change |
| 2026-11-24 | **FH-P1-D shipped** — `agent-harness-integration.md` §9; `ENVOYMESH_CHAIN_MAX_*` on chain embed `Agent` |
| 2026-11-24 | **FH-P1-E shipped** — implementation-plan checklist + PR template Coding provider box |
| 2026-11-24 | **FH-P2-C follow-up** — `openCoding` mesh-work deep-link (`meshWorkQueue` / `runMeshWorkId` / `meshWorkEnqueue`); Social sidebar handlers + tests; EnvoyGo mesh-work sheet + list/dismiss/enqueue RPC |
| 2026-11-24 | **Waves 0–3 status** — section 10 headers marked shipped (parity with Wave 4 closeout + implementation-plan §68-FH). |
| 2026-11-24 | **Wave 4 closeout** — P2-A–P2-D verification table + wave checklist; EnvoyGo `coding_mesh_work` unit tests |