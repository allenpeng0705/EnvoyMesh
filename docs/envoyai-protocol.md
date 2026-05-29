# EnvoyAI (design guide)

**EnvoyAI is part of the [EnvoyMesh Protocol (EMP)](./protocol-standard.md)** — one protocol (`emp/0.1`), not a separate standard.

This document is a **readable design guide** for AI-mediated P2P social networking within EMP. **Normative definitions** (mandates, postures, disclosure, intent matrices) live in [protocol-standard.md](./protocol-standard.md#envoyai-ai-mediated-social-mesh).

---

## One protocol

EnvoyMesh Protocol covers:

| Concern | EMP section |
|---------|-------------|
| Identity, devices, bonds | [Identity model](./protocol-standard.md#identity-model) |
| Envelopes, intents, channels | [Envelope requirements](./protocol-standard.md#envelope-requirements) |
| Trust mode intros | [Appendix A](./protocol-standard.md#appendix-a-trust-mode-social-mediation-socialintro) |
| Honest actor roles | [Appendix C](./protocol-standard.md#appendix-c-actor-disclosure-and-owner-visibility) |
| H2A product lane | [Appendix D](./protocol-standard.md#appendix-d-h2a-product-channel--wire-semantics-phase-15c) |
| **Standing postures (EnvoyAI)** | **[EnvoyAI](./protocol-standard.md#envoyai-ai-mediated-social-mesh)** |
| Quick reference | [Appendix E](./protocol-standard.md#appendix-e-envoyai-quick-reference-part-of-emp01) |

There is **no `envoyai/0.1` version**. Nodes advertise optional capabilities (`social-proxy`, `document-acquisition`) under `emp/0.1`.

**Third-party implementers:** [emp-implementers-guide.md](./emp-implementers-guide.md) · JSON Schema: `packages/protocol/schemas/emp-0.1/`

---

## What EnvoyAI names

EnvoyAI is the product name for EMP's **AI-merged social mesh** capabilities:

1. **Standing delegation** — owner-signed posture mandates (`social_proxy`, `document_acquisition`).
2. **Honest wire** — `senderRole=agent` + `agentCredential` for all automated traffic.
3. **Configurable presentation** — local UI may hide badges; wire and audit stay truthful.
4. **Human commit boundaries** — `bond.accept` and high-risk shares stay human unless explicitly mandated.

---

## Postures (summary)

| Posture | User story | Scenarios |
|---------|------------|-----------|
| `social_proxy` | [Story M](./UserStory.md#story-m--delegated-social-presence) | [Epic SP](./scenarios.md#epic-sp--delegated-social-presence) |
| `document_acquisition` | [Story N](./UserStory.md#story-n--document-acquisition-agent) | [Epic DA](./scenarios.md#epic-da--document-acquisition) |

UI disclosure: [Story O](./UserStory.md#story-o-configurable-actor-disclosure) · US-AV9

---

## Implementation

Tracked as [Phase 16](./implementation-plan.md#phase-16-envoyai-standing-delegation--autonomous-postures):

| Track | Focus |
|-------|--------|
| 16A | `@envoymesh/protocol` — `mandate.posture`, `posturePolicy`, credential scopes |
| 16B | Social proxy runtime |
| 16C | Document acquisition orchestrator |
| 16D | UI disclosure settings |

Detail design docs:

- [social-proxy-delegation.md](./social-proxy-delegation.md) — session state machine, approval edges
- [document-acquisition-agent.md](./document-acquisition-agent.md) — job store, negotiation pipeline
- [envoyai-disclosure-adr.md](./envoyai-disclosure-adr.md) — presentation vs verification

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-28 | Merged into EMP as single protocol; this file is now a design guide pointing to [protocol-standard.md](./protocol-standard.md). Removed separate `envoyai/0.1` version line. |
| 2026-05-28 | Initial draft (superseded by EMP integration). |
