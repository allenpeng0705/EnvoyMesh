# Trust mode & bilateral social mediation

This document specifies **product intent** and **EMP extensions** so agents can help humans meet peers **without** delegating final trust decisions to the model. It is the design reference for **[Phase 12 in the implementation plan](./implementation-plan.md#phase-12-trust-mode--bilateral-social-mediation-design-first)**.

**Related:** [User stories](./UserStory.md) · [Scenarios](./scenarios.md) — Scenario 4 (social handshake) · [protocol-standard](./protocol-standard.md) · Human profile schema in `@envoymesh/protocol`

---

## 1. Problem statement

Owners want **agent-assisted introductions**: discovery, matching, and presenting **authentic** profile material to candidate peers. They **do not** want the AI to silently upgrade trust (e.g. create `direct` bonds) or invent profile facts.

**Trust mode** is an owner-controlled operating posture: the agent may **propose** introductions and attach **owner-signed** profile fragments within declared bounds; **only the human** commits **`bond.request`** / **`bond.accept`** (or equivalent approval-queue actions that emit those intents).

**Bilateral mediation:** Alice's agent and Bob's agent may both participate. Neither side completes bonding until **both humans** have explicitly approved.

---

## 2. Definitions

| Term | Meaning |
|------|--------|
| **Trust mode** | Local node setting: agent may run outbound discovery/intro assistance and send **approved-category** profile material to others per policy. Does **not** imply autonomous bonding. |
| **Bond commitment** | Cryptographic/social act that raises trust tier: today **`bond.request`** then **`bond.accept`** with `requestedLevel` ∈ `{ referred, direct }` (see protocol). |
| **Intro thread** | Logical conversation keyed by a shared **`correlationId`** spanning discovery notes, agent↔agent sync, drafts, audits, and eventual bond intents. |
| **Profile fragment** | A subset of fields derived from **`HumanProfilePayload`** (or successor schema), **signed by the owner**, with an explicit **purpose** and optional **expiry**. |

### Matching inputs (two basics)

AI-assisted matching only works when **both** sides of the comparison are grounded in human intent and verified facts:

1. **What kind of friend the owner wants** — Preferences the **human** sets for the agent (topics, activities, collaboration style, geography hints, trust ceiling for intros, etc.). This is **not** inferred persona; it is explicit criteria or prompts the owner approves as the agent’s search brief. Product-wise this may live in node config, a signed **`FriendMatchingPreferences`**-style document (future schema), or structured fields edited in Settings.
2. **What kind of person the owner is** — Represented by **owner-signed** **`HumanProfilePayload`** / **`HumanProfileFragmentPayload`** (discovery card / intro tiers): display name, hobbies, knowledge interests, **`capabilities`**, optional bio—anything used for peer-facing truth must remain signer-verifiable.

**How matching uses them:** The agent ranks or filters peers by aligning **A’s stated preferences** with **B’s signed profile material** (and symmetrically **B’s preferences** with **A’s profile**) before emitting **`discovery.request`** / **`broadcast.request`** (tag hashes, **`requestedCapabilities`**) or proposing **`social.intro.*`**. The LLM may **explain** why a candidate fits only when tied to those two grounded sources; it must not invent preferences or biography.

---

## 3. Design principles

1. **Human-in-the-loop for bonds.** Agents draft and negotiate **non-binding** intros; **`bond.*`** carrying tier changes MUST originate from **owner-approved** paths (direct UI action or approval queue entry tied to owner confirmation — exact UX is product layer).
2. **No invented biography.** Anything presented as “the owner's profile” MUST verify against **owner-signed** material (full profile or fragment). LLM prose MAY summarize **only** what is already in signed fields, or MAY suggest **draft** text that is **never** sent as profile without owner sign-off.
3. **Least disclosure.** Trust mode exposes **tiered** profile views (see §5), not necessarily the full `HumanProfilePayload` visible to bonded contacts.
4. **Symmetric gates.** Bilateral flows require **two** human confirmations before bond completion; protocol and audit SHOULD make “one-sided bond” attempts visible and rejectable by policy.
5. **Auditability.** All intro and bond steps SHOULD share a **`correlationId`** where possible (existing observability convention).
6. **Conversational signal ≠ signed identity.** Agents MAY use **`chat.message`** (see §4) to ask **their owner** clarifying questions (“what did you mean by…?”) or to exchange **bounded** questions with **another agent** about a candidate. Anything learned there is **soft**: it may inform ranking and **`social.intro.propose`** **`rationale`** text, but MUST NOT be presented as verified biography unless it maps to **owner-signed** profile material or an explicit owner-approved update path.

---

## 4. Current protocol baseline (no new intents required for v0 mental model)

Already in `@envoymesh/protocol`:

- **`discovery.request` / `discovery.response`** — tag/capability matching; `DiscoveryMatch` exposes `ownerId` / `peerId` / matches.
- **`bond.request` / `bond.accept` / `bond.challenge` / `bond.challenge.response`** — trust negotiation; `BondRequestPayload` includes `requestedLevel`, optional `proofOfContext`, optional **`introCorrelationId`** / **`ownerCommitmentRef`** (Trust-mode linkage).
- **`HumanProfilePayload`** — owner-signed profile with `profileVisibility`: `public` | `private`, plus fields such as `displayName`, `bio`, `hobbies`, `knowledge`, `capabilities`, `updatedAt`.
- **`chat.message`** — allowed combinations include human↔human, human↔agent, agent↔human, and agent↔agent (per envelope role policy). Use for **live Q&A** during vetting; policy gates still apply by bond tier.

Trust mode builds **on** these types; it does **not** replace bond semantics.

### Conversational due diligence

Within Trust mode, agents may gather **extra context** before proposing an intro:

| Channel | Typical use | Truth tier |
|---------|-------------|------------|
| **Agent ↔ owner (human)** | Refine “what kind of friend” preferences; confirm whether to pursue a candidate | Owner intent — authoritative for **preferences** |
| **Agent ↔ counterparty agent** | Clarify availability, topical overlap, norms (“happy to intro our humans?”) — complements **`social.intro.sync`** | **Soft** — cite as dialogue in **`rationale`**, not as signed **`profileFragment`** facts |
| **Agent ↔ counterparty human** | Rare early on (trust tier); only where **`chat.message`** policy already allows | **Soft** unless peer later confirms via signed profile or explicit bond path |

Product SHOULD label UI copy so owners see **chat-derived hints** separately from **verified profile / fragment** data.

---

## 5. Profile disclosure tiers (proposed product + schema direction)

Today, `profileVisibility` is binary. Trust mode needs **explicit slices** so owners see what strangers vs intro candidates receive.

**Implemented:** **`HumanProfileFragmentPayloadSchema`** (`discovery-card` | `trust-mode-intro`) — dedicated signed subset + `humanProfileFragmentForSigning()`; verify via `@envoymesh/identity` `verifyCanonicalPayload` on unsigned fields.

**Still optional:** extend **`HumanProfilePayload`** with tiered visibility maps if product prefers one artifact instead of fragments.

**Semantic tiers:**

| Tier | Typical contents | Who receives |
|------|------------------|--------------|
| **Discovery card** | Display name (or pseudonym), capability/tag hashes, minimal hobbies keywords | Responders to `discovery.request` / broadcast matching paths gated by Trust mode policy |
| **Intro profile** | Discovery card + short bio excerpt, curated interests | Candidates after mutual interest / agent-mediated intro |
| **Full profile** | Existing signed profile | Typically post-bond or explicit share |

Bond Engine MUST enforce: outbound fragments **only** when Trust mode is on **and** fragment purpose/expiry validates.

---

## 6. EMP intents (implemented in `@envoymesh/protocol`)

Wire payloads and envelope role rules:

| Intent | Roles (validated on envelope) | Payload schema |
|--------|--------------------------------|----------------|
| **`social.intro.sync`** | agent → agent | `SocialIntroSyncPayloadSchema` |
| **`social.intro.propose`** | agent → human | `SocialIntroProposePayloadSchema` (requires `profileFragment` or `profileFragmentRef`) |
| **`social.intro.owner-ready`** | human → agent or human → human | `SocialIntroOwnerReadyPayloadSchema` |

**Bond linkage:** optional fields on **`bond.request`**: `introCorrelationId`, `ownerCommitmentRef`.

**`@envoymesh/bonds`:** capability entries + tier rules for **`social.intro.*`** (public: sync allow / propose challenge; referred: allow).

### 6.1 `social.intro.sync` (agent → agent)

Two agents exchange **non-binding** coordination. Payload: `introCorrelationId`, `ownerId`, optional `counterpartyOwnerIdHint`, `profileFragmentRefs`, `interest` (`explore` \| `decline` \| `request-human-review` \| `withdraw`), optional `noteToCounterpartyAgent`.

### 6.2 `social.intro.propose` (agent → human)

Candidate intro with **`profileFragment`** and/or opaque **`profileFragmentRef`**, optional non-authoritative **`rationale`**.

### 6.3 `social.intro.owner-ready`

Owner acknowledgment before **`bond.request`** when sent on the wire; envelope signature covers the payload. May remain **local-only** (approval queue) — product choice.

---

## 7. End-to-end flows

### 7.1 Outbound (Trust mode on)

1. Agent issues **`discovery.request`** (and/or relay **`broadcast.request`**) within configured tag/capability/sensitivity caps.
2. Agent selects candidates; may use **`chat.message`** with **owner** and/or **counterparty agent** (where policy allows) to refine fit—see §4 **Conversational due diligence**.
3. Agent exchanges **`social.intro.sync`** with peer agents where applicable (structured coordination alongside optional chat).
4. Agent surfaces **`social.intro.propose`** to **owner** (Social UI / digest / notifications — product).
5. Owner reviews; on approve, runtime emits **`bond.request`** with `requestedLevel` per owner choice (often **`referred`** first).
6. Remote human completes **`bond.accept`** (or challenge flow).

### 7.2 Inbound

1. Receive **`bond.request`** while Trust mode assists intros — **no auto-accept** unless a **separate**, explicit owner policy exists (out of scope for baseline Trust mode; if added later, MUST be owner-signed automation caps).

### 7.3 Bilateral (two agents)

1. Share **`introCorrelationId`** across **`social.intro.sync`** messages on both sides.
2. Track state machine: `{none, probing, mutual_interest, owner_pending_local, owner_pending_remote, bond_requested, bonded, withdrawn}` locally (exact states implement-defined).
3. **`bond.request`** only when **local** owner has committed; recipient still chooses accept/reject.

---

## 8. Bond Engine & configuration hooks

Implementors SHOULD:

- Add **`trustModeEnabled`** (and possibly schedules/caps) to persisted node config / agent policy surfaces.
- Deny **`bond.request`** / **`bond.accept`** initiated by **`senderRole: agent`** unless carrying an **`ownerCommitmentRef`** (or local-only approval ticket ID mapped to owner action).
- Allow **`social.intro.*`** only when Trust mode enabled and sensitivity ≤ configured ceiling.

Exact rule tables belong in `@envoymesh/bonds` alongside existing tier/intent decisions.

---

## 9. UX & Safety notes

- Surface **both** inputs clearly: **“Who I’m looking for”** (preferences) vs **“How I present myself”** (profile / discovery card)—the agent should never blur them.
- When chat informed an intro, show **“From conversation with their agent”** (or similar) vs **“From verified profile snippet”**.
- Clearly separate UI labels: **“Suggested intro”** vs **“Send bond request”**.
- Default **`requestedLevel`** for first contact SHOULD bias to **`referred`** unless owner overrides.
- Rate-limit outbound **`social.intro.sync`** and **`bond.request`** to mitigate harassment.

## 10. Implementation backlog (ordered)

**Phase tracking:** [trust-mode-implementation-plan.md](./trust-mode-implementation-plan.md) (Phases A–F).

1. **`[x]`** Dedicated signed **`HumanProfileFragmentPayloadSchema`** + `humanProfileFragmentForSigning()` in `@envoymesh/protocol`.
2. **`[x]`** EMP intents **`social.intro.sync`**, **`social.intro.propose`**, **`social.intro.owner-ready`** + tests + envelope role policy.
3. **`[x]`** Extend **`bond.request`** with optional **`introCorrelationId`** / **`ownerCommitmentRef`**; bonds capability + tier rules for **`social.intro.*`**.
4. **`[x]`** Node inbound **`social.intro.*`** + audits + **`trustModeEnabled`** / **`friendMatchingPreferencesText`** config + credential-bearing agent **`bond.request`** gate (Phase A).
5. **`[x]`** Agent tools (**`mesh.intro.*`**) gated by Trust mode (`listAgentTools({ trustModeEnabled })` / **`executeTool`** **`trustIntro`** context).
6. **`[x]`** Social UI: Trust mode toggle + friend prefs (**Settings**); intro inbox (**Inbox**) + **`social.intro:propose`** WS/RPC + **`sendHello`** commitment path (**Phase B–D**).
7. **`[ ]`** Scenario + alignment doc updates (`scenarios.md`, `alignment-review.md`) when behavior is testable.
8. **`[ ]`** Optional **`FriendMatchingPreferences`** (or equivalent) signed schema in `@envoymesh/protocol` if criteria must be verifier-auditable across devices.

---

## 11. Non-goals (this revision)

- Fully autonomous bonding while owner sleeps **without** prior signed automation policy (that remains a distinct, higher-risk track).
- Replacing **`bond.challenge`** with ML judgment.
- Global reputation or Sybil-proof stranger discovery (see Phase 4F / WAN docs separately).
