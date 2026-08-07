# Agent Network vocabulary — membership + skills

> **Status:** Canonical naming for Agent Network / Team jobs (2026-08).
> **Audience:** engineers and doc authors. Operator-facing guide:
> [agent-network-guide.md](./agent-network-guide.md).

## Glossary

| Term | Meaning | Wire / code |
|------|---------|-------------|
| **Membership** | Whether a bonded peer’s agent may be recruited for Team jobs, and basic execute rights advertised on the Agent Card | Agent Card `membership[]` (e.g. `task.execute`, `agent-network-worker`) |
| **Skills** | What the orchestrator uses to prefer / match workers — owner domain tags **and** Agent Skills from Built-in OpenClaw or Ext Agent | `agentNetworkProfile.skills[]` as `{ id, kind, source }` (legacy strings coerce) |
| **AI Engine** | Which local engines run on *this* home node (EnvoyAI / Ext Agent) | Phase 32 config — **not** Agent Network membership |
| **Team job** | Multi-agent collaboration (protocol: chains) | Social **Team jobs** |

**Do not say “capabilities”** for assignment or worker specialty. That word historically meant mesh membership tags and caused confusion with skills.

Human Profile interest chips may still say “capabilities” in Profile UI; that surface is **out of scope** here and is not used for Team job scoring.

## Old → new mapping

| Old | New |
|-----|-----|
| Agent Card `capabilities[]` (membership tags) | `membership[]` |
| Emp tag `capability-provider` | `agent-network-worker` |
| `agentNetworkProfile.strengths` | `agentNetworkProfile.skills` |
| Subtask `requiredCapability` | `requiredSkill` (specialty / skill hint) |
| UI “Capability Provider” | **Join Agent Network** |
| Score weight / breakdown `strength` | `skill` |
| `isAgentNetworkWorker` | `isAgentNetworkMember` |
| `CapabilityIndex` / `findCapabilityProviders*` | `AgentNetworkMembershipIndex` / `findAgentNetworkWorkers*` |

## Orchestrator rules

1. **Pool** = bonded + online + `membership` includes Agent Network worker tag (`agent-network-worker`) and can execute (`task.execute` or equivalent).
2. **Rank / assign** = soft-match step `requiredSkill` against `agentNetworkProfile.skills` (plus freshness, context, spend, throughput, LAN).
3. **Never** treat membership tags as specialty factors (they look identical across opted-in workers).

```text
Filter by membership  →  Rank by skills + profile factors  →  Assign
```

## Skill sources (ingestion)

One list on the card: `skills[]` as structured entries:

```ts
{ id: "coding", kind: "domain", source: "owner" }
{ id: "tavily", kind: "skill", source: "openclaw" }
{ id: "pi",     kind: "skill", source: "ext" }
```

Legacy plain strings still parse as `{ id, kind: "domain", source: "owner" }`.
Matching stays on `id`. Settings only edits owner domain chips — kind/source are
stamped automatically (never a user picker).

| Source | Examples | `kind` | `source` |
|--------|----------|--------|----------|
| Owner domain tags | `coding`, `research`, `writing` | `domain` | `owner` |
| Built-in OpenClaw | `SKILL.md` dirs under `openclaw-workspace/skills/` | `skill` | `openclaw` |
| Ext Agent | enabled Ext Agent ids/names | `skill` | `ext` |

**Implementation:** `apps/node/src/agent-network-skills-aggregate.ts` merges owner
tags with discovered OpenClaw skill dirs (and optional Ext labels) when building
the local Agent Card for Join Agent Network peers.

Still later (not this pass): `requireKinds`, namespaced ids, per-skill advertise toggles.

## Related

- [agent-network-guide.md](./agent-network-guide.md) — operator guide
- [agent-network-plan-assign.md](./agent-network-plan-assign.md) — Assigner plan+assign
- [agent-network-config.md](./agent-network-config.md) — AI Engine (Built-in + Ext)
