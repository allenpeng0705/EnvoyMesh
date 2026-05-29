# EMP implementer's guide (`emp/0.1`)

Short guide for **third-party nodes and apps** implementing the [EnvoyMesh Protocol](./protocol-standard.md). Normative detail stays in `protocol-standard.md`; machine-readable shapes live in `@envoymesh/protocol` and the [JSON Schema bundle](../packages/protocol/schemas/emp-0.1/).

---

## 1. One protocol

- **Version line:** `emp/0.1` only (EnvoyAI postures are optional capability flags, not a fork).
- **Source of truth:** Zod schemas in `packages/protocol/src/index.ts`.
- **JSON Schema:** `packages/protocol/schemas/emp-0.1/` (regenerate: `npm run export-schemas -w @envoymesh/protocol`; Zod 4 draft **2020-12**).

Third-party implementers need **signed EMP envelopes** on the three libp2p application streams. Orchestration helpers (`mesh.*` tools, route planners, local job stores) are EnvoyMesh reference implementation — not required for wire interop.

---

## 2. Envelope signing

Every message is an **EnvoyEnvelope** (`version: "0.1"`).

### 2.1 Build unsigned envelope

Strip `signature`. Required fields include `messageId`, `createdAt` (ISO 8601), `senderPeerId`, `senderPublicKey` (PEM), `senderRole`, `recipientRole`, `intent`, `payload`.

When `senderRole` is `agent` for `chat.message`, include **`agentCredential`**. For standing delegation, optional **`postureRef`** links to the active mandate id.

### 2.2 Canonical JSON

Sign the **canonical JSON** of the unsigned object:

1. Sort object keys lexicographically (recursive).
2. Omit `undefined` values.
3. Sign UTF-8 bytes with Ed25519 (sender device or agent key).
4. Attach base64 signature to form the full envelope.

Reference: `canonicalJson()` + `signCanonicalPayload()` in `@envoymesh/identity` (desktop) or `@envoymesh/mobile-identity` (pure JS).

### 2.3 Verify inbound

1. Parse with `EnvoyEnvelopeSchema` (role policy is enforced).
2. Verify signature over unsigned fields.
3. Confirm `senderPublicKey` hashes to `senderPeerId`.
4. If `senderRole=agent`, verify `agentCredential` and intent ∈ credential `scope`.
5. Apply trust tier + mandate checks before side effects.

---

## 3. Channel matrix (hard split)

| libp2p stream | Protocol id | Allowed intents |
|---------------|-------------|-----------------|
| Chat | `/envoymesh/chat/0.1.0` | **`chat.message` only** |
| Message | `/envoymesh/message/0.1.0` | System, bond, discovery, knowledge, task, share control, intros, relay, … **not** `chat.message` |
| Data | `/envoymesh/data/0.1.0` | Chunked transfer bodies + vouchers only |

Sending on the wrong channel MUST be rejected before send; inbound violations SHOULD audit as `message.rejected`.

---

## 4. Role policy table

Normative rules enforced in `EnvoyEnvelopeSchema` (subset — see [protocol-standard § Envelope](./protocol-standard.md#envelope-requirements)):

| Intent group | `senderRole` | `recipientRole` | Notes |
|--------------|--------------|-----------------|-------|
| `chat.message` | human or agent | human or agent | `agentCredential` required when sender is agent |
| `task.*`, `report.create` | agent | agent | Mandate / PoI as applicable |
| `social.intro.sync` | agent | agent | Trust-mode coordination |
| `social.intro.propose` | agent | human | Signed profile fragment |
| `social.intro.owner-ready` | human | agent or human | Owner commitment signal |
| `bond.accept` | **human** | human or agent | Not delegatable in emp/0.1 |
| `knowledge.query` | human or agent | human or agent | Policy + sensitivity |
| `knowledge.response` | human or agent | human or agent | See §5 |
| `discovery.request` / `discovery.response` | per bonds | per bonds | Bounded matches |
| `share.request` / `share.preview` / `share.accept` | per policy | per policy | Metadata ≠ bytes |

---

## 5. Document acquisition interop (`knowledge.response`)

For document hunt negotiation, responders MAY identify a vault item without putting raw bytes on the message stream:

| Field | Type | Purpose |
|-------|------|---------|
| `answer` | string | Human-readable summary (required) |
| `suggestedRelativePath` | string (optional) | Vault-relative path, e.g. `shared/report.pdf` |
| `matchScore` | 0–1 (optional) | Responder confidence |
| `refused` / `refusalReason` | optional | Explicit deny |

**Preferred:** set `suggestedRelativePath` when a published library item matches.

**Legacy convention:** first line of `answer` may still be a path; parsers SHOULD prefer `suggestedRelativePath` when present.

Requester then issues `share.request` with that path — metadata discovery does not imply transfer consent.

---

## 6. Capability namespaces

Do not mix these (see [Appendix B](./protocol-standard.md#appendix-b-canonical-capability-vocabularies)):

| Namespace | Example | Use |
|-----------|---------|-----|
| Device certificate | `mesh.listen`, `message.send` | What the **device** may do |
| Agent credential `scope` | `knowledge.query`, `emp.document_acquisition` | What the **agent** may send |
| Discovery tags | `{ "tag": "document-search" }` | Matching / rendezvous |
| Agent Card strings | `knowledge.query` | Advertisement (free-form but should be stable) |

---

## 7. Standing postures (optional)

Owners MAY sign standing mandates with `posture` ∈ `social_proxy` | `document_acquisition` | `capability_provider`. Advertise support via Agent Card / `system.signal` `supportedCapabilities`:

- `standing-delegation`
- `social-proxy`
- `document-acquisition`
- `capability-provider`

Peers that do not implement a posture ignore the capability flag; core intents still work peer-to-peer without EnvoyMesh job orchestration.

---

## 8. Minimal interop checklist

- [ ] Sign and verify `EnvoyEnvelope` with canonical JSON
- [ ] Respect channel split (chat / message / data)
- [ ] Enforce role policy for intents you handle
- [ ] Implement trust tiers before executing sensitive intents
- [ ] Use `correlationId` across multi-hop flows for audit
- [ ] Validate payloads with per-intent Zod / JSON Schema
- [ ] For file bytes: `share.*` control plane + `/envoymesh/data` transfer

**CI fixtures:** Signed envelope vectors live in `packages/protocol/test/fixtures/emp-conformance/` with tests in `emp-conformance-vectors.test.ts`. Regenerate: `npm run generate-conformance-vectors -w @envoymesh/protocol`.

---

## 9. Reference implementation map

| Concern | Package / app |
|---------|----------------|
| Schemas | `@envoymesh/protocol` |
| Signing | `@envoymesh/identity` |
| Policy | `@envoymesh/bonds` |
| Transport | `@envoymesh/network` |
| Desktop node | `apps/node` |
| Mobile node | `packages/mobile-node` |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-28 | Initial guide; JSON Schema bundle; `knowledge.response.suggestedRelativePath`. |
| 2026-05-29 | Signed envelope conformance vectors (`emp-conformance/` fixtures). |
