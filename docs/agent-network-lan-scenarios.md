# Agent Network — LAN 3-node testing scenarios

> **Who this is for:** you have **three machines on the same LAN** and want to
> exercise Agent Network / Team jobs in the real world (not unit/E2E harnesses).
> **Companion docs:** product model [`agent-network-guide.md`](./agent-network-guide.md),
> fleet bonding [`agent-network-fleet.md`](./agent-network-fleet.md),
> plan+assign [`agent-network-plan-assign.md`](./agent-network-plan-assign.md),
> iteration [`agent-network-iteration.md`](./agent-network-iteration.md).

---

## 0. Lab topology

Give each machine a stable role so logs and screenshots stay comparable:

| Role | Machine | Typical job |
|------|---------|-------------|
| **Alice** | Laptop / desktop A | Assigner / Team job owner (starts most jobs) |
| **Bob** | Laptop / desktop B | Worker (coding / research strengths) |
| **Carol** | Laptop / desktop C | Worker + optional remote Assigner |

```text
 Alice ────── mDNS / direct LAN ────── Bob
   │                                    │
   └──────────── Carol ─────────────────┘
        (all three bonded; Join Agent Network on)
```

**Assumption:** same Wi‑Fi / Ethernet subnet; firewall allows local libp2p /
mDNS discovery. You do **not** need a public relay for these scenarios.

### Profile contract (keep this fixed)

Scenarios below assume these **Agent Network profiles**. If you change them,
expected assignees change too.

| Peer | Strengths | Freshness | Spend | Context | Also advertise capabilities |
|------|-----------|-----------|-------|---------|-------------------------------|
| **Alice** | `task.execute` | 5 | subscription | `128k` | `task.execute`, `capability-provider` |
| **Bob** | `coding`, `research.web` | 9 | metered | `1M+` | `task.execute`, `coding`, `research.web`, `capability-provider` |
| **Carol** | `task.execute`, `summarization` | 7 | subscription | `512k` | `task.execute`, `capability-provider` |

With **direct assign** + plan+assign scoring, the usual preference is:

| Required capability | Expected preferred worker |
|---------------------|---------------------------|
| `research.web` | **Bob** |
| `coding` | **Bob** |
| `task.execute` / merge | **Carol** (or Alice if she is eligible and scores higher as self) |

**Deterministic AI (optional):** On the Assigner, set AI mode to mock with
response text `__plan_assign_from_roster__`. That forces a fixed 3-step plan
(research → coding → merge) with named assignees from the roster. Live LLM
plans may word objectives differently but should still prefer Bob for
research/coding and Carol/Alice for merge-style `task.execute`.

---

## 1. Baseline setup (do this once)

Complete before Scenario A. Treat this as the “lab is ready” gate.

### 1.1 Install & identity

On each machine:

1. Install / run EnvoyMesh (Tauri app or `npm run node:dev` + Social UI).
2. Finish first-run setup with a **distinct display name** (`Alice`, `Bob`, `Carol`).
3. Confirm each node has its **own** owner identity (do not clone profile dirs
   across machines unless you intentionally test multi-device shared identity).

### 1.2 Bond all three (full mesh)

Pick **one** bonding path:

| Path | When to use |
|------|-------------|
| **Office LAN** (recommended) | All three on office Wi‑Fi — **Settings → Agent Network → Office LAN → Enable office LAN team**, share the **same fleet token** |
| **Company Invite** | If LAN Auto-Bond is flaky — Alice mints invites; Bob & Carol paste them |
| **Manual Discover** | Fallback — exchange pairing / invite links pairwise |

**Pass:** each machine’s **Contacts** shows the other two with **direct** (or
at least **referred**) trust.

### 1.3 Join Agent Network (all three)

On Alice, Bob, and Carol:

1. **Settings → Agent Network → Join Agent Network** → on.
2. Apply the **profile contract** in §0.
3. Alice: **Refresh workers** — expect Bob and Carol listed as recruitable.

**Pass:** Alice’s **Workers status** shows ≥2 bonded + joined peers.

### 1.4 AI Engine sanity

On each machine, **Settings → AI**: confirm a working model path. For mesh-only
wiring, Alice may use mock `__plan_assign_from_roster__`. From Scenario D onward,
prefer a real LLM on the Assigner so judge / scoring feel production-like.

### 1.5 Team job defaults (start simple)

On Alice (and later Carol if she assigns):

| Knob | Value until noted otherwise |
|------|-----------------------------|
| Award mode | **Direct assign** |
| Show cost UI | off |
| `iterationMaxRounds` | **1** (one-shot) |
| `extendMaxStepsPerRound` | **0** |
| Judge mode | n/a until Scenario E |

---

## 2. Scenario ladder (simple → complex)

| # | Scenario | Task theme | Effort |
|---|----------|------------|--------|
| **A** | Bond + Join only | No Team job | 5 min |
| **B** | One-shot (Alice → Bob) | Single research→code→merge DAG | 10–15 min |
| **C** | Fan-out Bob + Carol | Same DAG; prove two homes work | 15–20 min |
| **D** | Profile scoring | Coding-heavy goal prefers Bob | 15 min |
| **E** | Multi-round iteration | Brief → refine once → one publish | 20–30 min |
| **F** | Owner Accept / Continue | Same as E with human gate | 20–30 min |
| **G** | Remote Assigner | Alice triggers; Carol assigns | 20–30 min |
| **H** | Stall / offline | Kill Bob mid-award | 20–40 min |
| **I** | Competitive bidding | Same DAG under bidding mode | 20 min |

Each scenario below has: **Task** (paste into New team job) → **Expected
assigning** → **Expected workflow** → **Pass**.

---

### Scenario A — Bonds & workers visible

**Goal:** Substrate only — no Team job yet.

**Task:** none (settings / Contacts only).

**Expected assigning:** n/a.

**Expected workflow**

```text
Alice                          Bob                         Carol
  │                             │                            │
  │  Office LAN / invites       │                            │
  │◄──────── bond direct ──────►│                            │
  │◄──────────────── bond direct ───────────────────────────►│
  │                             │◄────── bond direct ───────►│
  │                             │                            │
  │  Join Agent Network + profiles (all three)               │
  │  Refresh workers ───────────────────────────────────────►│
  │  Workers list: Bob, Carol                                │
```

**Pass**

- Alice **Workers status** lists Bob and Carol.
- **Team jobs → New** is not blocked solely by `no_workers`.

---

### Scenario B — One-shot Team job (Alice assigns, Bob does research+code)

**Goal:** Smallest full collaboration path on the LAN.

**Knobs (Alice):** `iterationMaxRounds=1`, direct assign, Assigner = **local (Alice)**.

**Task** (paste):

```text
Research why mDNS helps LAN P2P discovery, then draft a short coded outline
of the steps, then merge into one final answer for an engineer.
```

**Expected plan & assigning** (mock roster or typical live plan+assign):

| Step | Objective (approx.) | Capability | Expected worker |
|------|---------------------|------------|-----------------|
| 1 | Gather source facts | `research.web` | **Bob** |
| 2 | Draft structured / coded outline | `coding` | **Bob** |
| 3 | Combine into one final deliverable | `task.execute` | **Carol** (or Alice) |

> Steps 1–2 may run in parallel (no mutual dependsOn). Step 3 waits on both.

**Expected workflow**

```text
Alice (Assigner)                    Bob (worker)                 Carol (worker)
  │                                    │                            │
  │ New team job + Task above          │                            │
  │ plan+assign                        │                            │
  │ propose/award research ───────────►│                            │
  │ propose/award coding ─────────────►│                            │
  │ propose/award merge ───────────────────────────────────────────►│
  │                                    │ partial (research) ───────►│
  │◄───────────────────────────────────│ partial (coding)           │
  │◄────────────────────────────────────────────────────────────────│ partial (merge)
  │ synthesize + publishChainReport    │                            │
  │ Team jobs → report visible         │                            │
```

Wire path (names): `task.chain.mandate` → `propose` → `bid`/`accept` (direct) →
`partial` → synthesize → `report`.

**Pass**

- Preview shows ≥2 steps; research/coding preferred worker is Bob.
- Job **published** once; executive summary non-empty.
- Job state shows awards/partials for Bob (and merge peer).

**Fail hints:** `no_workers` → Scenario A; stuck planning → Assigner AI; no
partials → Bob offline / Join off.

---

### Scenario C — Three-home fan-out (Bob and Carol both execute)

**Goal:** Prove two remote homes contribute in one DAG.

**Knobs:** same as B (`iterationMaxRounds=1`, Alice = Assigner).

**Task** (paste):

```text
Research recent practical notes on LAN peer discovery for P2P apps, then write
a short code-oriented summary a developer can follow, then merge research and
code notes into one final paragraph.
```

**Expected plan & assigning**

| Step | Capability | Expected worker | Why |
|------|------------|-----------------|-----|
| Research | `research.web` | **Bob** | strength + cap |
| Code summary | `coding` | **Bob** | strength + cap |
| Merge paragraph | `task.execute` | **Carol** | summarization / task.execute profile |

**Expected workflow**

```text
1. Alice plans 3 steps; preview names Bob for research+coding, Carol for merge.
2. Alice launches — Bob receives two proposes (or sequential if DAG serializes).
3. Bob returns final partials for research + coding.
4. Only then Carol receives merge propose (dependsOn research+coding).
5. Carol returns merge partial.
6. Alice synthesizes concatenate report and publishes once.
```

**What you should see**

| Machine | During run |
|---------|------------|
| Alice | Active Team job; awards to Bob + Carol; then report |
| Bob | Inbound chain work for research and/or coding |
| Carol | Inbound chain work for merge **after** parents finish |

**Pass**

- At least **two distinct worker homes** appear in awards/partials (Bob and Carol).
- Report body reflects both research-ish and code-ish content, then a merge.

**Fail hints:** Only Bob works → Carol not joined / not in roster; only one
subtask planned → richer goal / enable LLM decompose / use mock roster token.

---

### Scenario D — Profile scoring (coding-heavy → Bob)

**Goal:** Changing profiles changes who wins coding steps.

**Knobs:** `iterationMaxRounds=1`, direct assign, Alice = Assigner.

**Prep**

1. Bob: strengths `coding` + freshness 9 + `1M+` (as in §0).
2. Carol: remove `coding` / leave coding-related strengths empty; keep `task.execute`.
3. Alice: Refresh workers.

**Task** (paste):

```text
Implement a tiny TypeScript helper that picks the best peer for a "coding"
capability from a scored roster, then explain the function in three bullets.
Do not spend the job on web research — focus on coding and a short explanation.
```

**Expected plan & assigning**

| Step | Capability | Expected worker |
|------|------------|-----------------|
| Implement helper | `coding` | **Bob** (must beat Carol) |
| Explain / wrap up | `task.execute` | **Carol** or Alice |

**Expected workflow**

```text
Alice plans → prefers Bob on any coding step → award Bob → Bob partial →
optional merge on Carol/Alice → Alice publishes.
```

**Pass**

- Preview / awards show **Bob** on the coding step.
- Flip Bob’s freshness down to 2 and Carol’s coding strength on; Refresh;
  next job’s coding step should move toward Carol (or at least change ranking).

---

### Scenario E — Multi-round iteration (two drafts, one publish)

**Goal:** Outer iteration loop on the LAN (Phase 47).

#### E1 — Sanity: always_stop (loop gated)

**Knobs:** `iterationMaxRounds=2`, `iterationJudgeMode=always_stop`, extend `0`.

**Task** (paste):

```text
Research then draft a coded summary of LAN P2P discovery, then merge into one
final engineer-facing answer.
```

**Expected assigning:** same as Scenario B/C (Bob research+coding, Carol merge).

**Expected workflow**

```text
Round 1: plan → award → partials → synthesize DRAFT 1
Judge: always_stop → publish FINAL (even though maxRounds=2)
Drafts on chain: 1    Publishes: 1
```

**Pass:** one draft worth of work + **one** publish; not stuck on owner UI.

#### E2 — Continue then stop (two drafts)

**Knobs:** `iterationMaxRounds=2`, judge = **`llm`** (or a path that continues once),
extend `0`. If your LLM always stops, use Scenario **F Continue** instead.

**Task** (paste):

```text
Write a short brief on why office LAN helps Agent Network Team jobs. Prefer
concrete steps. If the first draft is thin, refine once with more operational
detail, then stop.
```

**Expected assigning (each round):** Bob-heavy research/coding; Carol/Alice merge
(replan may rename steps; same preference rules).

**Expected workflow**

```text
Round 1 DAG → DRAFT 1 → judge continue
  → replan with prior draft in goal
Round 2 DAG → DRAFT 2 → judge stop / maxRounds
  → single publish with Draft 1 + Final (round 2) sections
Drafts: 2    Publishes: 1
```

**Pass:** iteration UI / report shows two drafts; exactly one published report.

---

### Scenario F — Owner judge (Accept vs Continue)

**Goal:** Human gate after draft 1.

**Knobs:** `iterationMaxRounds=2`, `iterationJudgeMode=owner`, extend `0`,
Alice = Assigner.

**Task** (paste) — use for **both** runs:

```text
Research LAN discovery for P2P, draft a coded checklist, merge into one short
runbook for three desk machines (Alice/Bob/Carol).
```

**Expected assigning (round 1):** Bob research+coding; Carol merge (as B/C).

#### F1 — Accept (stop)

**Expected workflow**

```text
Round 1 DAG → DRAFT 1 → waitingForOwner=true
Alice clicks Accept / stop
→ publish once (1 draft) → done
```

**Pass:** published; not waiting; `drafts.length === 1`.

#### F2 — Continue (then auto-finish round 2)

**Expected workflow**

```text
Round 1 DAG → DRAFT 1 → waitingForOwner=true
Alice clicks Continue
→ round advances; new plan+assign on mesh (Bob/Carol again)
Round 2 DAG → DRAFT 2 → canContinue=false (maxRounds)
→ auto-stop + publish once
Drafts: 2    Publishes: 1
```

**Pass:** leaves ask_owner after Continue; ends published with two drafts;
no second owner prompt required after round 2.

---

### Scenario G — Remote Assigner handoff (Alice triggers, Carol assigns)

**Goal:** Trigger home ≠ Assigner home.

**Knobs (on Alice start dialog):**

| Knob | Value |
|------|-------|
| Assigner | **Carol** (remote agent peer) |
| `iterationMaxRounds` | `1` (or `2` if also testing knob inheritance) |
| Award mode on **Carol** | Direct assign |

**Task** (paste on Alice):

```text
Research then draft a coded summary of "three-home Agent Network on one LAN",
then merge into one final answer.
```

**Expected assigning (on Carol’s node after handoff):**

| Step | Capability | Expected worker |
|------|------------|-----------------|
| Research | `research.web` | **Bob** |
| Coding draft | `coding` | **Bob** |
| Merge | `task.execute` | **Alice** and/or Carol (Carol may self-assign merge) |

Alice is a worker on Carol’s roster only if Alice **Joined** and Carol has her card.

**Expected workflow**

```text
Alice                              Carol (Assigner)                 Bob
  │                                   │                              │
  │ Start job, Assigner=Carol         │                              │
  │ task.chain.handoff (goal+knobs) ─►│                              │
  │ handedOff=true, local awards≈0    │                              │
  │                                   │ plan+assign                  │
  │                                   │ propose research/coding ────►│
  │                                   │◄──────── partials ───────────│
  │                                   │ merge (+ maybe Alice)        │
  │                                   │ synthesize + publish         │
  │ (optional) sees same chainId      │ report on Carol              │
```

**Pass**

- Alice start result: `handedOff` / no (or empty) local subtask awards.
- Carol: same `chainId`, subtasks ≥1, then published report.
- If `iterationMaxRounds=2` was set on Alice, Carol’s iteration.maxRounds is 2.

**Fail hints:** Carol never runs → mesh/bond Alice↔Carol; Carol `no_workers` →
Carol must see Bob (and optionally Alice) as joined workers.

---

### Scenario H — Stall / Bob offline mid-job

**Goal:** Behavior when the preferred worker disappears after award.

**Knobs:** `iterationMaxRounds=1`, direct assign; note stall timeout in Team job
defaults (or wait several minutes).

**Task** (paste):

```text
Research LAN mDNS for P2P, then draft a coded recovery checklist for a stalled
worker, then merge into one final paragraph.
```

**Expected assigning (before fault):** research+coding → **Bob**; merge → **Carol**.

**Expected workflow**

```text
1. Alice starts; Bob awarded research (and/or coding).
2. Immediately quit EnvoyMesh on Bob OR disconnect Bob Wi‑Fi.
3. Alice tracker hits stall timeout for Bob’s open subtask(s).
4. Expect one of:
   a) Reassign / backup propose to Carol (if backup workers in workersBySubtask), or
   b) Clear stall / failure / cancel surfaced in Team jobs UI + audit
5. If Carol can finish remaining work, job may still publish; else failure is explicit.
```

**Pass:** no silent forever-hang; audit/UI mentions stall or reassign; outcome
understandable. (Exact reassign policy depends on defaults — tune before filing bugs.)

---

### Scenario I — Competitive bidding (optional)

**Goal:** Bid path instead of silent direct assign.

**Knobs (Alice):** award mode **Competitive bidding**; show cost UI on; raise
`maxChainCostUsd` / ceiling enough for a small job (e.g. 20 / 5).

**Task** (paste): same as Scenario B.

**Expected assigning**

| Phase | Who |
|-------|-----|
| Propose | Bob + Carol (and maybe Alice) receive proposes for matching caps |
| Bid | Workers bid; Alice sees bids by subtask if UI exposes inbox |
| Award | Auto-evaluate or manual pick → usually still Bob for coding/research |
| Merge | Carol / Alice after parents |

**Expected workflow**

```text
Alice plan → propose to candidates → bids in → evaluate/accept →
partials → synthesize → publish
```

**Pass:** bids observed (or competitive config still completes); one published
report; budget fields look sane.

---

## 3. Quick reference — who does what

| Scenario | Assigner | Research | Coding | Merge | Extra |
|----------|----------|----------|--------|-------|-------|
| B | Alice | Bob | Bob | Carol/Alice | one-shot |
| C | Alice | Bob | Bob | Carol | prove 2 homes |
| D | Alice | — | **Bob** | Carol/Alice | scoring |
| E1 | Alice | Bob | Bob | Carol/Alice | always_stop |
| E2 / F2 | Alice | Bob | Bob | Carol/Alice | 2 rounds |
| F1 | Alice | Bob | Bob | Carol/Alice | owner Accept |
| G | **Carol** | Bob | Bob | Alice/Carol | handoff |
| H | Alice | Bob† | Bob† | Carol | †Bob killed mid-flight |
| I | Alice | bid→Bob | bid→Bob | bid→Carol | competitive |

---

## 4. Suggested half-day schedule

| Time | Block |
|------|-------|
| 0:00–0:20 | Baseline setup (§1) + Scenario A |
| 0:20–0:40 | B + C |
| 0:40–0:55 | D |
| 0:55–1:25 | E + F |
| 1:25–1:50 | G |
| 1:50–2:20 | H (optional I) |

If A–C fail, **stop** — later scenarios assume mesh + Join + one-shot DAG work.

---

## 5. What to capture when something breaks

1. Scenario id + which **Task** you pasted  
2. Machine (Alice / Bob / Carol)  
3. Screenshot: Team jobs state, Workers status, preview assignees  
4. Whether Contacts still show direct bonds  
5. Logs around `task.chain.*` / `chain.inbound`  
6. Whether Alice↔Bob **chat** still works (mesh vs Team-job-only)

| Symptom | Likely layer |
|---------|--------------|
| No contacts | Bond / Office LAN token / Wi‑Fi |
| Contacts but no workers | Join / agent card sync |
| Wrong assignee vs §3 table | Profiles differ from §0 / no Refresh |
| Awards stuck | Worker offline / firewall |
| Draft then hang | Owner judge — Accept/Continue (F) |
| Handoff never lands | Alice↔Carol mesh / Assigner peer id |

---

## 6. Out of scope for this LAN lab

- WAN / relay-only paths (add after LAN is green)
- Mobile EnvoyGo as full mesh node vs thin client
- Public stranger recruitment (Team jobs stay bonded + opted-in)
- Replacing CI E2E harnesses — this doc is **operator** validation

---

## 7. Related documents

| Doc | Role |
|-----|------|
| [agent-network-guide.md](./agent-network-guide.md) | Product model & settings map |
| [agent-network-fleet.md](./agent-network-fleet.md) | Office LAN / invites / fleet rollout |
| [agent-network-plan-assign.md](./agent-network-plan-assign.md) | Assigner plan+assign + remote Assigner |
| [agent-network-iteration.md](./agent-network-iteration.md) | Draft / judge / continue loop |
| [fleet-bootstrap.md](./fleet-bootstrap.md) | Headless `fleet.yaml` apply (optional) |

*Last updated: 2026-07-23 — scenarios include paste-ready tasks, expected assignees, and workflows.*
