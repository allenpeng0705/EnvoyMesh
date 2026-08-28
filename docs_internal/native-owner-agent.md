# Native owner agent — Assistant = Agent (Phase 18)

**Status:** Design baseline (2026-05-28) · Phase **18** · Stories M–O, Scenario 6 (H2A), Epic SP / DA / capability provider.

**Related:** [implementation-plan.md](./implementation-plan.md#phase-18-native-owner-agent-assistant--agent) · [emp-h2a-channel-adr.md](./emp-h2a-channel-adr.md) · [capability-route-executor.md](./capability-route-executor.md) · [social-proxy-delegation.md](./social-proxy-delegation.md) · [document-acquisition-agent.md](./document-acquisition-agent.md) · [ai-document-backbone-plan.md](./ai-document-backbone-plan.md)

---

## 1. Problem

EnvoyMesh ships a **full native agent runtime** on the home node (Phase 9 ToolRegistry, Phase 16 postures, Phase 16E capability routing). The Social **Assistant** (H2A channel) still behaves like a **thin LLM shell**:

| Today (Assistant) | Native node agent (already built) |
|-------------------|-----------------------------------|
| Regex `classifyDocumentIntent` + one LLM call | 40+ policy-gated `mesh.*` tools |
| No friend-making from chat | Social proxy + intro tools + autopilot |
| No async document hunts | Document acquisition worker + jobs |
| No capability/service orchestration from chat | Capability provider worker + route executor |
| Owner RPC only; not agent peer on wire | `sendAgentChat`, agent credential, Activity |

Owners expect the Assistant to **act on their behalf** across four domains:

1. **Make friends** — discover strangers, run Trust-mode intros, warm pre-bond chat; human commits bond.
2. **Find documents** — local vault, bonded published libraries, async acquisition jobs.
3. **Find capable peers** — match capabilities, DHT/discovery search, rank routes.
4. **Provide / request services** — mandate-bound tasks, capability provider jobs, approval-gated actions.

---

## 2. Design principles

1. **Reuse, don’t fork** — H2A calls the same `ToolRegistry`, route catalog, and workers as daemon/bridge paths. No parallel agent protocol.
2. **Policy before LLM** — Bond engine, mandates, approval queue, and kill switch gate every tool call before and after model planning.
3. **Honest roles** — Outbound mesh actions use `senderRole: "agent"` + owner-signed credential where EMP requires it; Activity records agent work.
4. **Sync turn + async jobs** — Chat returns immediately with plan/job id; long work continues in social-proxy / document-acquisition / capability-provider workers.
5. **Progressive autonomy** — Phase 18A: route-driven orchestration (deterministic). Phase 18B: bounded LLM tool loop. Phase 18C: full job UX in Assistant.

---

## 3. Architecture

### 3.1 Layered stack

```
┌─────────────────────────────────────────────────────────────┐
│ Social Assistant (AIChatPanel / H2AChannelView)              │
└───────────────────────────┬─────────────────────────────────┘
                            │ RPC runOwnerAgentTurn
┌───────────────────────────▼─────────────────────────────────┐
│ packages/api owner-agent-loop.ts                             │
│  • matchAgentCapabilityRoutes(goal)                          │
│  • domain handlers (social / document / service / knowledge) │
│  • delegates to document-agent-loop for explicit doc cmds    │
└───────────────────────────┬─────────────────────────────────┘
                            │ executeTool / job starters
┌───────────────────────────▼─────────────────────────────────┐
│ apps/node ToolRegistry + workers                             │
│  social-proxy · document-acquisition · capability-provider   │
└───────────────────────────┬─────────────────────────────────┘
                            │ signed EMP
┌───────────────────────────▼─────────────────────────────────┐
│ P2P mesh (discovery, intro, knowledge, share, task.*)        │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Entry point

**New RPC:** `runOwnerAgentTurn(message: string): Promise<OwnerAgentTurnResult>`

Replaces `runDocumentAgentTurn` as the **primary** Assistant backend. Document loop remains callable internally and as fallback during migration.

```typescript
interface OwnerAgentTurnResult {
  answer: string;
  domain: "social" | "document" | "service" | "knowledge";
  intent: string;           // routeId or document intent kind
  toolsUsed: string[];
  routeId?: string;
  jobId?: string;
  correlationId?: string;
  pendingApproval?: boolean;
  matchedRoutes?: MatchedAgentCapabilityRoute[];
}
```

### 3.3 Owner tool allowlist (Phase 18A)

Tools the owner agent may invoke (expanded in 18B):

| Domain | Tools |
|--------|-------|
| Knowledge | (via `knowledgeQuery` / document loop) |
| Document | `mesh.library_*`, `vault.search`, job: `startDocumentAcquisitionJob` |
| Social | `mesh.match_capability_route`, `mesh.intro.broadcast_search`, `mesh.intro.run_autopilot`, job: `runSocialProxyPass` |
| Service / discovery | `mesh.match_capability_route`, `mesh.capability_provider.start`, `discovery.search` (bonded), `mesh.task.propose` (18C) |

Tools requiring approval (`requiresApproval: true`) set `pendingApproval: true` in the turn result and surface Inbox / Activity links.

### 3.4 Domain routing (Phase 18A — deterministic)

```
Owner message
     │
     ├─ classifyDocumentIntent ≠ knowledge? ──► runDocumentAgentTurn (preserve regex cmds)
     │
     └─ matchAgentCapabilityRoutes(message)
            │
            ├─ top.domain = document ──► acquisition job OR document turn
            ├─ top.domain = social    ──► social proxy pass / intro tools
            ├─ top.domain = service   ──► capability provider job
            └─ no match / low score   ──► knowledge (document loop)
```

**Score threshold:** `score >= 5` (at least one keyword match) before non-knowledge domain handling.

### 3.5 Four owner goals (normative mapping)

| Owner goal | Route id | Posture | Primary actions |
|------------|----------|---------|-----------------|
| Make friends | `social.intro-bond` | `social_proxy` | `runSocialProxyPass`, `mesh.intro.broadcast_search`, intro proposals → Inbox |
| Find documents | `document.published-library` | `document_acquisition` | `runDocumentAgentTurn`, `startDocumentAcquisitionJob` |
| Find capable peer | `service.task-negotiation` / custom manifest routes | `capability_provider` | `mesh.match_capability_route`, `mesh.capability_provider.start` |
| Request/provide service | `service.task-negotiation` | `capability_provider` | Same + `mesh.task.propose` (18C), approvals |

Permission enforcement:

- Posture mandate must be enabled in Settings → AI (Phase 16).
- `autonomousKillSwitch` blocks job starts; turn explains why.
- Bond tier hints on route steps enforced on wire by Bond Engine (not bypassed by Assistant).

### 3.6 LLM tool loop (Phase 18B — deferred)

Phase 18B adds `runOwnerAgentToolLoop`:

1. Build prompt with agent identity markdown + matched routes + tool catalog JSON schema.
2. Call `routeModelRequest` with structured JSON output: `{ action: "tool"|"answer", toolName?, params?, text? }`.
3. Max **5** tool rounds; each round audits `tool.called`.
4. Stop on approval-required tools and return `pendingApproval: true`.

Reuse `@envoymesh/models` egress scanning on all tool params/results shown to the model.

### 3.7 Activity & wire semantics

| Event | Activity kind | Domain |
|-------|---------------|--------|
| Owner turn completed | `task_progress` / `knowledge_answered` | `home` / `knowledge` |
| Job started | `task_progress` with `jobId` | `social` / `home` / `research` |
| Approval needed | `approval_needed` | `home` |

Cross-peer H2A continues to use EMP intents on `/message` per [h2a-wire-semantics.md](./h2a-wire-semantics.md). Local Assistant turns use RPC only.

### 3.8 Mobile parity

`MobileNode.runOwnerAgentTurn` delegates to the same `owner-agent-loop.ts` with `_executeOwnerAgentTool` (mirrors document turn). Planner + audit wired via `mobile-owner-agent-planner.ts`. Full job stores on mobile remain stubbed until SQLite parity (Phase 11 follow-on).

---

## 4. Phased delivery

### 18A — Route-driven owner agent turn **`[x]`**

- `[x]` Design doc (this file) + implementation-plan Phase 18 section
- `[x]` `packages/api/src/owner-agent-loop.ts` + unit tests
- `[x]` `NodeServiceImpl.runOwnerAgentTurn` + RPC wiring
- `[x]` `AIChatPanel` uses `runOwnerAgentTurn`
- `[x]` Activity mapping for domain + jobId + routeId (`taskId`, `evidence`)
- `[x]` MobileNode inline adapter (`_executeOwnerAgentTool`; job postures stubbed)

**Exit:** Owner asks “help me find friends interested in hiking” → Assistant returns matched route + starts social proxy pass (if enabled) or clear enablement instructions. Owner asks “find the golden checklist on the mesh” → document acquisition job or discover turn. Owner asks “who can help with Rust” → capability provider job or route plan.

### 18B — LLM tool loop **`[x]`**

- `[x]` Structured planner prompt + JSON parse fallback
- `[x]` Owner tool allowlist registry in `@envoymesh/api`
- `[x]` Integration tests with mock model returning tool calls
- `[x]` Rate limit: max 5 rounds / turn
- `[x]` Per-round audit via `auditPlannerRound` → `tool.called`

### 18C — Assistant job UX **`[x]`**

- `[x]` Inline job status chips (link to Activity)
- `[x]` Approve/reject actions in Assistant (inline cards)
- `[x]` `mesh.task.propose` for bonded service requests
- `[x]` Live job stage chips via `agent:activity` WS push

### 18D — Deprecate regex-only path **`[x]`**

- `[x]` Assistant primary backend is `runOwnerAgentTurn`; explicit `classifyDocumentIntent` kept for model-off document commands
- `[x]` `runDocumentAgentTurn` RPC deprecated; internal `_runDocumentAgentTurnCore` only
- `[x]` Update [ai-document-backbone-plan.md](./ai-document-backbone-plan.md) + [emp-h2a-channel-adr.md](./emp-h2a-channel-adr.md)

### Phase 18 exit criteria **`[x]`**

- `[x]` **Friends** — social proxy pass + intro broadcast from Assistant; intros still Inbox-approved
- `[x]` **Documents** — acquisition jobs + library/discover fast paths; document hunt prefers document route over social keyword noise
- `[x]` **Capabilities** — capability-provider jobs from service routes
- `[x]` **Services** — bonded `mesh.task.propose` + inline approvals
- `[x]` **Security** — kill switch blocks autonomous starts; mesh I/O via `executeTool` only

Verified by `apps/node/test/phase-18-e2e.test.ts`.

---

## 5. Threat model

| Risk | Mitigation |
|------|------------|
| Assistant bypasses bond policy | All mesh I/O via `executeTool` + Bond Engine |
| LLM invents peer ids / paths | Tool results redacted; egress scan on 18B |
| Autonomous friend spam | Social proxy rate limits + intro approval queue |
| Document exfiltration | Acquisition mandate sensitivity ceilings + share approvals |
| Stranger service tasks | Route `minBond` hints; task mandates required on 18C |

---

## 6. Tests

| Suite | Covers |
|-------|--------|
| `packages/api/test/owner-agent-loop.test.ts` | Domain routing, route priority, job start mocks, fallback to knowledge |
| `packages/api/test/owner-agent-planner.test.ts` | Planner JSON, bounded loop, egress scan, audit callback |
| `apps/node/test/owner-agent-turn-integration.test.ts` | NodeServiceImpl + ToolRegistry (18A/18B) |
| `apps/node/test/phase-18-e2e.test.ts` | Phase 18 exit criteria (two-node E2E) |
| `apps/node/test/phase-18-multinode-e2e.test.ts` | Multi-node (2–3) acquisition completion, routing, combined postures |
| `apps/social/test/components/AIChatPanel.test.tsx` | RPC switch to `runOwnerAgentTurn` |

---

## 7. Open questions

| # | Question | Default |
|---|----------|---------|
| 1 | Should Assistant auto-run `runSocialProxyPass` without explicit owner confirmation? | Yes when posture enabled; intro proposals still need Inbox approval |
| 2 | Merge `runDocumentAgentTurn` into `runOwnerAgentTurn` entirely? | 18D — keep internal delegate until planner stable |
| 3 | Expose job progress via WS push to Assistant? | 18C — Activity deep-link first |
