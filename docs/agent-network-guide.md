# Agent Network — Operator Guide

> **Who this is for:** anyone using EnvoyMesh who wants to understand what
> “Agent Network” means, how to join it, and how Team jobs work.
> **Status:** Current product behavior (as of 2026-07). Wire protocol and
> implementation detail live in the linked design docs below.
> **Languages:** [English](./agent-network-guide.md) · [简体中文](./agent-network-guide.zh-CN.md)

---

## 1. What “Agent Network” means

**Agent Network** is EnvoyMesh’s way for **bonded people** to let their local
AI agents work together — without a central cloud or account server.

It has three layers that people often mix up:

| Layer | What it is | Where you configure it |
|-------|------------|------------------------|
| **A. Bonds (who you trust)** | Cryptographic trust between owners (`direct` / `referred` / `public` / `blocked`) | Contacts, Discover, fleet onboarding |
| **B. Worker membership (opt-in)** | “My agent may be recruited for Team jobs” | **Settings → Agent Network → Join Agent Network** |
| **C. Team jobs (collaboration)** | Split a goal across several agents, get one report | Nav → **Team jobs** |

**Important:** Agent Network is **not** a public marketplace. Strangers on the
mesh cannot recruit your agent. Collaboration runs among people you have
**bonded** with, and only if those people **opted in**.

Your local agent still works for **you** either way. Joining only changes
whether **bonded peers** can ask it to help on their Team jobs.

---

## 2. Names you will see in the UI

| UI label | Older / code name | Meaning |
|----------|-------------------|---------|
| **Agent Network** (Settings tab) | Was briefly “Devices & Fleet” | Membership + fleet onboarding |
| **Join Agent Network** | Join Agent Network | Opt-in so peers can recruit your agent |
| **Team jobs** | “Chains” / multi-agent chains | Owner-facing collaboration view |
| **Team job defaults** | Chain Defaults | Award mode, bidding, stall policy (under **Settings → AI**) |
| **AI Engine** | Once mislabeled “Agent Network” | Which AI runs on *this* home node (EnvoyAI / Ext Agent) — **not** the same as joining Agent Network. For Team-job **worker** execution, this node defaults to Built-in OpenClaw; Ext Agent for Agent Network is a later owner-only choice (see [agent-network-engine.md](./agent-network-engine.md)). |

Protocol and source code still use names like `task.chain.*`, `ChainsView`,
and `agent-network-worker`. That is fine for engineers; the Social UI uses the
labels above.

---

## 3. Membership model (the core rule)

### 3.1 Two different questions

**“Did I join Agent Network?”**  
→ A setting on **your** node. No bonds required to flip it on.

**“Can Alice’s agent work on my Team job?”**  
→ Only if **all** of the following are true:

1. You and Alice are **bonded** (typically `direct` or `referred` trust).
2. Alice enabled **Join Agent Network** on her node.
3. Her **agent card** reached you (auto-fetched on bond for eligible trust tiers).
4. Her card advertises membership that includes `task.execute` **and**
   `agent-network-worker`, and her **skills** (domains / Agent Skills) are
   used to rank her for steps.

If Alice never opted in, her agent stays **private**. You will not see her as
a worker, even if you are friends.

### 3.2 Trust tiers (who can collaborate)

| Trust | Typical meaning | Agent Network / Team jobs |
|-------|-----------------|---------------------------|
| **blocked** | Explicit deny | No collaboration |
| **public** | Stranger / not bonded as a friend | Not treated as a Team jobs worker; agent cards are not auto-fetched |
| **referred** | Introduced / limited trust | May participate under policy; orchestrator-side chain traffic requires referred or higher |
| **direct** | Friend / fleet peer | Full worker path (bids / direct assign) |

Exact gates are enforced by the bond engine and chain inbound handlers. The
practical product rule: **Team jobs = bonded + opted-in peers.**

### 3.3 What “Join Agent Network” does on the wire

When you enable **Join Agent Network**:

1. Node config sets `capabilityProviderEnabled: true`.
2. Your agent card (and related advertisements) include capability
   `agent-network-worker`.
3. Bonded peers who sync your card can discover you via the capability index.
4. Your optional **Agent Network profile** (freshness, spend posture, context
   window, skills) is shared and used to **score** you when someone starts
   a Team job.

When you turn it **off**, the membership capability is removed from the card.
Peers stop treating you as a recruitable worker. Local chat with your own AI
is unchanged.

---

## 4. Agent Network profile (scoring)

Under **Settings → Agent Network**, after you join, you can set an
**owner-attested profile**:

| Field | Purpose |
|-------|---------|
| **Model freshness** (1–10) | How new / capable the models you run feel |
| **Spend posture** | `subscription` / `metered` / `unknown` — long jobs prefer subscription |
| **Context window** | `128k` / `256k` / `512k` / `1M+` |
| **Skills** | Tags such as research, coding, summarization |

When an orchestrator looks for workers, EnvoyMesh scores candidates roughly as:

**capability match ≫ context window ≫ freshness ≫ spend posture**

Direct-assign mode picks the best available scored worker (no bidding UI).
Competitive mode still uses bids / cost, with score as supporting signal.

These traits are **self-declared**. Peers trust them because they come from an
owner they already bonded with — not from a central rating bureau.

---

## 5. Team jobs (how collaboration works)

### 5.1 What a Team job is

A **Team job** is a multi-agent workflow owned by you:

1. You state a goal (“research X, then summarize”).
2. Your home-node agent **plans** subtasks.
3. Subtasks are offered to **bonded, opted-in** workers.
4. Workers run locally on *their* nodes (their models, their vaults, their policy).
5. Results return; your orchestrator **merges** them into one report.

You watch progress under the **Team jobs** nav item (active list + reports).

### 5.2 Prerequisites before “New team job”

You need **at least one** bonded contact who:

- Enabled **Join Agent Network**, and  
- Has a fresh agent card visible to you.

A solo node **cannot** complete a multi-agent Team job alone. The UI blocks
start and explains this (`no_workers` / “Waiting for workers”).

### 5.3 Award modes (Settings → AI → Team job defaults)

| Mode | Behavior | Cost / bid UI |
|------|----------|----------------|
| **Direct assign** (default) | Pick first / best available worker; award immediately | Hidden by default |
| **Competitive bidding** | Collect bids, rank, award | Optional show cost UI |

Most personal / small-team use should stay on **direct assign**.

### 5.4 End-to-end picture

```
You (owner)                Your home node                 Bonded peer (opted in)
─────────────              ──────────────                 ─────────────────────
Write goal ──►  Plan subtasks
               Find workers (bonded + agent-network-worker)
               Direct-assign or bid  ───────────────►  Agent runs subtask
               ◄────────────── partial / result
               Synthesize report
Team jobs UI ◄── published report
```

Relays (if used) only help **connectivity**. They do not run LLMs or read
Team job payloads as a trusted brain.

---

## 6. Settings map

### Settings → Agent Network

Primary place for network membership and growing your bonded fleet:

1. **Office LAN** — same-Wi-Fi happy path: Join + LAN Auto-Bond + shared token  
2. **Workers status** — bonded / Join / visible workers + **Refresh workers**  
3. **Join Agent Network** — worker opt-in + profile editor  
4. **Bond Autonomy / Setup Sponsor Friend** — installer auto-hello pairing  
5. **Company Invites** — shareable `envoy://invite?…` links  
6. **LAN Auto-Bond** — same Wi-Fi + shared token (off by default; power users)  
7. **Pairing Kiosk** — one-button invite minting (off by default)  
8. **Fleet Manifest** — signed roster import for larger teams  

Fleet paths create **bonds**. Bonds are the substrate; membership opt-in is
what makes those bonds usable for Team jobs. A LAN bond without Join leaves a
peer trusted but not recruitable — the UI shows a soft nudge in that case.
When dial hints show a direct private LAN path, Assigner ranks that worker
higher (`sameLan` soft score).

Operator playbook: [`agent-network-fleet.md`](./agent-network-fleet.md)  
Wire-level onboarding: [`fleet-onboarding.md`](./fleet-onboarding.md)  
Headless config + script: [`fleet-bootstrap.md`](./fleet-bootstrap.md) (`npm run fleet:apply`)

### Settings → AI

- **AI Engine** — EnvoyAI vs Ext Agent on *this* machine  
- **Team job defaults** — direct vs competitive, stall / rebalance policy  
- Postures such as social proxy / document acquisition  

AI Engine is **local engine selection**. It is **not** “Join Agent Network.”

Deep dive on engines: [`agent-network-config.md`](./agent-network-config.md)
(historical Phase 32 title; content is AI Engine membership).

### Nav → Team jobs

- Active jobs, reports, cancel / manage  
- Mobile (EnvoyGo) shows a **read-only** mirror of recent / active jobs  

Protocol design: [`agent_network.md`](./agent_network.md)

---

## 7. Common questions

### Only bonded contacts can be in the Agent Network?

- **Opt in:** anyone can enable Join Agent Network on their own node.  
- **Collaborate:** yes — only **bonded** (eligible-trust) contacts who also
  opted in appear as workers for Team jobs.  
- Fleet onboarding exists to create those bonds safely — not to open an
  anonymous worker pool.

### Is my agent public if I join?

No. Joining advertises recruitability to **peers who already trust you**,
via agent cards synced over bonds. It does not publish your vault or make
strangers your workers.

### Do both sides need to join?

To run a Team job **across** two people: the **workers** you recruit must
have joined. Your node acts as orchestrator; workers need
`agent-network-worker`. If nobody else joined, you get “no workers.”

### What about my phone?

A phone can be a full mesh node (Phase 11) or a thin client (EnvoyGo). Fleet
management UI for invites / manifests is **desktop Social**-oriented.
EnvoyGo can show Team job reports published on the home node.

### Why did we rename Chains / Devices & Fleet?

“Chains” sounded like blockchain. “Devices & Fleet” sounded like MDM and hid
membership. UI now says **Team jobs** and **Agent Network**. Code may still
say `chain`.

---

## 8. Security summary

- **No central account server** — identity is Ed25519 / DIDs.  
- **Bond Engine** gates intents by trust tier.  
- **Opt-in membership** — private by default.  
- **Signed envelopes** — workers and orchestrators verify peers.  
- **Mandates / budgets** — Team jobs carry owner-authorized bounds.  
- **Audit JSONL** — collaboration is inspectable on your node.  
- **Relays stay dumb** — connectivity only; no LLM on the relay path.

---

## 9. Related documents

| Doc | Role |
|-----|------|
| [agent-network-vocabulary.md](./agent-network-vocabulary.md) | **Canonical naming:** membership vs skills vs roles |
| [agent-network-roles.md](./agent-network-roles.md) | Collaboration roles + Role/Skill assignment modes |
| [agent-network-fleet.md](./agent-network-fleet.md) | Day-by-day fleet rollout playbook |
| [agent-network-lan-scenarios.md](./agent-network-lan-scenarios.md) | **3 machines on one LAN** — simple→complex real-world test scenarios |
| [fleet-onboarding.md](./fleet-onboarding.md) | Fleet path schemas and threat model |
| [agent_network.md](./agent_network.md) | Team jobs / chain protocol & runtime design |
| [agent-network-config.md](./agent-network-config.md) | AI Engine (EnvoyAI / Ext Agent) config — Phase 32 |
| [implementation-plan.md](./implementation-plan.md) | Phase checklists (32, 35–36, 40–43, 47) |
| [agent-network-plan-assign.md](./agent-network-plan-assign.md) | Assigner plan+assign + merge (shipped) |
| [agent-network-artifacts.md](./agent-network-artifacts.md) | Parent→child artifact handoff + thread stickiness (Phase 53) |
| [agent-network-ux-team-jobs.md](./agent-network-ux-team-jobs.md) | Fleet readiness + live job story UX (Phase 58 shipped) |
| [agent-network-job-input-delivery.md](./agent-network-job-input-delivery.md) | Job input delivery to workers — one-shot bytes, not vault sync (Phase 59, after 58) |
| [agent-network-iteration.md](./agent-network-iteration.md) | Multi-round Team job iteration A ∩ B (Phase 47, shipped) |

---

## 10. Quick start checklist

1. Same office Wi-Fi: both machines use **Office LAN → Enable office LAN team**
   (shared token). Remote teammates: bond via invite / manifest, then enable
   **Join Agent Network** on each node.  
2. Optionally fill the **profile** (skills, freshness, context) and a
   **collaboration role** (e.g. programmer / tester) for role-based Team jobs.  
3. Leave **Team job defaults** on **direct assign** unless you need bidding.  
4. Open **Team jobs → New team job**, enter a goal, preview, start.  
5. Open the report when synthesis finishes.  
6. If workers look empty, click **Refresh workers** on the Agent Network tab.

**Three machines on one LAN?** Use the scenario ladder in
[`agent-network-lan-scenarios.md`](./agent-network-lan-scenarios.md)
(bond → one-shot Team job → fan-out → iteration → remote Assigner → stall).

---

## Related: plan + assign design

See [`agent-network-plan-assign.md`](./agent-network-plan-assign.md) for the Assigner LLM plan+assign flow, soft skill matching, throughput scoring, merge-as-final-result, remote `assignerPeerId` handoff, and MCP roster/probe tools.

Multi-round refinement (draft → judge → replan / capped extend) is **shipped** as Phase 47 — see [`agent-network-iteration.md`](./agent-network-iteration.md). Defaults keep today’s one-shot Team jobs (`iterationMaxRounds=1`); opt in via Settings / Start dialog. Remote Assigner handoff carries iteration knobs (+ optional wire blob); Assigner UIs get `chain:iteration` progress events.
