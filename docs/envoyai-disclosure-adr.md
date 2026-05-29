# ADR: EnvoyAI disclosure — presentation vs verification

**Status:** Accepted (design baseline 2026-05-28) · Phase **16D** · [US-AV9](./scenarios.md#us-av9-configurable-peer-facing-agent-disclosure-in-chat-ui) · [Story O](./UserStory.md#story-o-configurable-actor-disclosure).

**Related:** [EMP § disclosure planes](./protocol-standard.md#three-disclosure-planes) · [Phase 13 actor visibility](./a2a-actor-visibility-plan.md) · [chat-actor.ts](../packages/api/src/chat-actor.ts) · [Phase 16](./implementation-plan.md#phase-16-envoyai-standing-delegation--autonomous-postures)

---

## Context

EnvoyMesh separates **who sent a message** (cryptographic wire truth) from **how the Social UI presents it** (product choice). Phase 13 shipped honest `senderRole=agent` on the wire and **always-on** agent badges in chat (`formatChatActorBadge`, `ChatMessageBubble` `outgoing-agent` / `incoming-agent` variants).

Owners running **social proxy** want peers to experience natural conversation while:

- Peers can still **verify** automation if they choose (credential check).
- Owners always see **full truth** in Activity and audit.
- The system never **impersonates** a human on the wire (US-AV2).

`AiIdentityMode` (`invisible` / `transparent` / `defensive`) today affects **tone and optional text prefix only** — not badge visibility.

---

## Decision

Adopt **three disclosure planes** as normative EMP behavior (already in [protocol-standard](./protocol-standard.md#three-disclosure-planes)):

| Plane | Mutable by UI settings? | Rule |
|-------|-------------------------|------|
| **Wire** | **No** | Automated messages MUST use `senderRole=agent` + valid `agentCredential`. |
| **Protocol / audit** | **No** | Activity, audit JSONL, task journal always record true `actorRole`. |
| **Presentation** | **Yes (local only)** | Chat badges and bubble variants MAY collapse per owner preference. |

Add **local-only** settings under `NodeConfig.aiSettings.disclosure` (or top-level `disclosure` block):

```typescript
interface EnvoyDisclosureSettings {
  /** Show "Your agent" / "Bob's agent" badges in contact chat threads. Default: true. */
  showAgentBadges: boolean
  /**
   * When true, verified inbound agent messages render like the contact's thread
   * (no separate agent badge). Unverified agent → still show warning state.
   * Default: false.
   */
  collapsePeerAgentToContact: boolean
}
```

**Defaults:** `showAgentBadges: true`, `collapsePeerAgentToContact: false` — preserves Phase 13 behavior for existing users.

---

## Alternatives considered

### A. Wire-level anonymity (“invisible agent”)

Send `senderRole=human` for AI auto-reply so peers cannot detect automation.

**Rejected.** Violates US-AV2, Phase 13 security model, and EMP Appendix C. Enables undetectable impersonation.

### B. Per-message disclosure flag on envelope

Add `presentationHint: "as_human"` on outbound envelopes.

**Rejected.** Peers cannot trust a hint that contradicts verifiable `senderRole`. Shifts policy to honor-based rather than cryptographic.

### C. Peer broadcasts their disclosure preference

Sync `showAgentBadges` over the mesh so remote nodes adapt.

**Rejected for v1.** Presentation is a **local renderer** choice; wire stays identical. May revisit for federated UI themes later — not required for US-AV9.

### D. Hide agent only in social proxy sessions

Badge off only for pre-bond proxy threads.

**Deferred.** Simpler global setting first; per-session override can be 16D+ if needed.

---

## Presentation rules (normative for implementers)

### Outbound (owner's node)

1. Auto-send, approved drafts, bridge replies: **always** `sendAgentChat` / `senderRole=agent`.
2. `AiIdentityMode` MUST NOT change `senderRole` (existing invariant).
3. `showAgentBadges` affects **local** outgoing bubble variant only:
   - `true` → `outgoing-agent` + "Your agent"
   - `false` → render as `outgoing` visually but **retain** `actorRole: "agent"` in `ChatMessage` storage

### Inbound (peer messages)

1. Verify `agentCredential` **before** presentation (existing inbound guard).
2. Store full `actorRole`, `agentId`, `agentVerified` on `ChatMessage` regardless of display.
3. `collapsePeerAgentToContact`:
   - `false` → `incoming-agent` variant + badge via `formatChatActorBadge`
   - `true` + verified → `incoming-peer` visual variant; contact display name as label
   - `true` + unverified → `incoming-agent` + "(unverified)" — **never** fully collapse unverified

### Surfaces **unaffected** by disclosure settings

| Surface | Always shows true actor |
|---------|-------------------------|
| Activity feed | Yes |
| Audit JSONL | Yes |
| Approval queue ("AI drafted…") | Yes |
| Task journal | Yes |
| Digest A2A counts | Yes |
| Optional `a2aChatNotifications` system lines | Yes (already local) |

### Assistant lane (H2A)

Assistant view is **owner ↔ home agent** by definition — no collapse. Disclosure settings apply to **contact threads** only.

---

## Data model

### Persistence

```typescript
// packages/api/src/ws-protocol.ts — extend AiSettings or NodeConfig
aiSettings?: {
  identity?: AiIdentity
  rules?: AiRule[]
  disclosure?: EnvoyDisclosureSettings
}
```

Round-trip via `getNodeConfig` / `updateNodeConfig` (desktop + mobile).

### ChatMessage (unchanged wire/storage)

Keep `actorRole`, `agentId`, `agentVerified` on every stored message. Presentation is a **view** function:

```typescript
function resolveChatBubblePresentation(
  message: ChatMessage,
  disclosure: EnvoyDisclosureSettings,
  contactDisplayName: string,
): { variant: MessageVisualVariant; actorBadge?: string }
```

Implement in `@envoymesh/api` (pure, unit tested); Social `ChatThread` calls it when rendering.

---

## UI

**Settings → AI → Disclosure** (new subsection):

| Control | Copy |
|---------|------|
| Show agent badges | "Show when your agent or a contact's agent sent a message" |
| Collapse peer agents | "Show contact's agent messages like normal chat (verified agents only)" |

Include short note: "Messages are always cryptographically signed with the correct sender role. Activity and audit always show the true actor."

---

## Security implications

| Risk | Mitigation |
|------|------------|
| Owner hides AI from self | Activity still shows agent actions |
| Peer fooled by collapsed UI | Peer verifies `agentCredential`; unverified cannot collapse |
| Impersonation | Wire role cannot be downgraded by settings |
| Audit loss | Storage retains `actorRole`; only view layer changes |

---

## Migration

- Default settings = current Phase 13 UX (no user-visible change on upgrade).
- No protocol version bump — presentation is not on the wire.

---

## Implementation checklist (16D)

- [ ] `EnvoyDisclosureSettings` in `@envoymesh/api` + defaults
- [ ] `resolveChatBubblePresentation()` + tests
- [ ] Social Settings AI tab — Disclosure section
- [ ] `ChatThread` / `ChatMessageBubble` use resolver
- [ ] Mobile parity (`DirectCallClient` config round-trip)
- [ ] Document in EMP Appendix E (done) — no schema change

---

## Consequences

**Positive**

- Social proxy UX can feel human-paced without breaking trust model.
- Single EMP; no second protocol or envelope fields.
- Clear separation teaches implementers: verify wire, render locally.

**Negative**

- Users may forget their agent spoke — mitigated by Activity defaults (`agentVisibility` unchanged).
- Two visual modes increase UI test matrix — covered by unit tests on resolver.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-28 | ADR accepted — three planes, settings shape, presentation rules, rejected wire anonymity. |
