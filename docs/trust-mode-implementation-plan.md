# Trust mode — implementation plan

This plan turns [trust-mode-social-protocol.md](./trust-mode-social-protocol.md) into **ordered work**. Protocol intents (`social.intro.*`), fragments, bonds tier rules, and design prose are already shipped; this file tracks **runtime, UI, and tools**.

**Related:** [implementation-plan.md § Phase 12](./implementation-plan.md#phase-12-trust-mode--bilateral-social-mediation-design-first)

---

## Phase A — Node runtime baseline (**shipped**)

**Goal:** Persist Trust-mode flags + friend-seeking brief; accept inbound `social.intro.*` when enabled; audit outcomes; block **`bond.request`** from **credential-bearing agents** unless **`ownerCommitmentRef`** is set.

**Verify:** `npm run typecheck`; `npx vitest run apps/node/test/social-intro-inbound.test.ts apps/node/test/bond-inbound.test.ts`.

---

## Phase B — Social UI & WebSocket events (**shipped**)

**Goal:** Owners can toggle Trust mode and edit friend preferences; optional **`social.intro:propose`** events for proposes (parity with **hello:request**).

| Deliverable | Notes |
|-------------|--------|
| Settings fields | Trust mode toggle + textarea / structured prefs |
| RPC already exposes config | `getNodeConfig` / `updateNodeConfig` |
| WS pushes | **`social.intro:propose`** + **`listPendingSocialIntroProposals`** / **`approveSocialIntroCommitment`** / **`declineSocialIntroProposal`** RPC |

**Verify:** Manual smoke or Social component tests; WS receives `social.intro:propose` when inbound propose passes policy.

---

## Phase C — Agent tools (matching only) (**shipped**)

**Goal:** Tools read **`friendMatchingPreferencesText`** + profile; emit **`discovery.request`** / **`broadcast.request`** / **`social.intro.sync`** — never **`bond.request`** without UI/approval queue (**`ownerCommitmentRef`**).

| Deliverable | Notes |
|-------------|--------|
| `mesh.intro_*` tools | Registered only when **`trustModeEnabled`** is passed into **`listAgentTools({ trustModeEnabled })`** / **`executeTool`** context **`trustIntro`** |
| Context injection | **`mesh.intro.matching_context`** returns prefs + optional **`humanProfileSummary`** supplied by caller |

**Verify:** Unit tests (`tool-registry.test.ts` trust-mode tool list); runtime callers must populate **`MeshToolContext.trustIntro`**.

---

## Phase D — Owner commitment UX (**shipped**)

**Goal:** Approving an intro generates **`ownerCommitmentRef`** (opaque id) consumed when sending **`bond.request`**.

| Deliverable | Notes |
|-------------|--------|
| Approval queue or dedicated intro inbox store | In-memory **`_pendingSocialIntroProposals`** + Social **Inbox** approve/send flow |
| Outbound **`bond.request`** | **`sendHello(..., { introProposalMessageId })`** attaches **`introCorrelationId`** + **`ownerCommitmentRef`** (desktop **`NodeServiceImpl`** + **`MobileNode`**) |

**Verify:** Approve → **`sendHello`** with linkage passes inbound credential-bearing gate when refs match pending row.

---

## Phase E — Documentation & scenarios (**shipped**)

**Goal:** EMP appendix + acceptance scenarios.

| Deliverable | Notes |
|-------------|--------|
| [protocol-standard.md](./protocol-standard.md) | Intent sections + **Appendix A** (`social.intro.*`, **`HumanProfileFragmentPayload`**, **`bond.request`** linkage, audit note) |
| [scenarios.md](./scenarios.md) / [alignment-review.md](./alignment-review.md) | Epic TM **`US-TM1`–`US-TM4`** + snapshot / traceability refresh |

**Verify:** Spot-check anchors in `protocol-standard.md` (Appendix A ↔ intent sections); **`grep US-TM`** in `scenarios.md`.

---

## Phase F — Hardening (**shipped**)

| Deliverable | Notes |
|-------------|--------|
| Signed **`FriendMatchingPreferences`** | **`FriendMatchingPreferencesPayloadSchema`** + **`friendMatchingPreferencesForSigning()`** in `@envoymesh/protocol`; **`signFriendMatchingPreferences`** / **`verifyFriendMatchingPreferences`** in `@envoymesh/identity`; optional **`friendMatchingPreferencesSigned`** on **`NodeConfig`** / **`PersistedNodeConfig`** — validated in **`updateNodeConfig`** (owner id + expiry + signature); **`friendMatchingPreferencesText`** synced from signed `.text` |
| Rate limits | Sliding window (**60s**) per **`remotePeerId`** on inbound **`social.intro.*`** (**`SOCIAL_INTRO_RATE_LIMIT_MAX_PER_PEER`** = 40); deny audit **`rate limit exceeded`**; counters + nonce registry are **in-memory per node process** (not persisted across restarts). Validation failures that return **`{ ok: false }`** roll back the rate slot so malformed traffic cannot exhaust the window. |
| **`social.intro.owner-ready`** semantics | **`duplicate nonce (replay)`** while nonce entry retained until payload **`expiresAt`**; prune expired nonce keys opportunistically; bounded map (**8192** entries) — deny **`nonce registry at capacity`** without evicting valid replay entries (rate slot rolled back on that deny). |
| **`bond.accept`** rejects | **`message.rejected`** audits for malformed payload (**Zod**) and **`requesterOwnerId`** mismatch (parity with other bond intents). |
| **bond.accept** audits | **`handleInboundBondIntent`** appends **`message.verified`** with **`correlationId`** for observability |
| Integration smoke | **`apps/node/test/trust-mode-intro-bond-flow.test.ts`** — discovery → **`social.intro.sync`** → **`social.intro.propose`** → credential-bearing **`bond.request`** → **`bond.accept`** with shared **`correlationId`**; **`npm run smoke:local`** runs this file via **`apps/node/src/local-two-node-smoke.ts`** |

**Verify:** `npm run typecheck`; `npx vitest run apps/node/test/trust-mode-intro-bond-flow.test.ts apps/node/test/social-intro-inbound.test.ts apps/node/test/bond-inbound.test.ts apps/node/test/bond-inbound-extended.test.ts packages/protocol/test/protocol.test.ts packages/identity/test/identity.test.ts`; `npm run smoke:local`.

---

## Dependency order

```text
A (runtime + audits + bond gate)
  → B (UI exposes A)
  → C (tools consume prefs + profile)
  → D (commitment refs enable safe agent-assisted bond.request if ever needed)
  → E (docs/scenarios)
  → F (hardening + integration smoke)
```
