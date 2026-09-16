# EnvoyMesh refactoring — encapsulate the modules so future products can reuse them

**Status:** **Steps 0–6, H1–H5 and E9 are implemented in code** (commits `2a5e6083` → `ada65b03`); §8.9 (kernel decomposition) and §10 E10 (per-area ownership) remain **deferred by decision**, and §8.17 lists what is left before a second product can treat the packages as reusable · **Owner:** platform / node runtime

> **✅ Tracked (since 2026-09-12).** This file and the evidence it cites are force-included through the `.gitignore` contents pattern, so they survive a clean checkout and are visible on other machines. Everything else under `docs/` remains local scratch — see **E7**, which recorded the original decision and why it was reversed. The one companion document is `docs/envoymesh-multi-product-design.md` (product packaging, deliberately outside this plan's scope — §11).
>
> Figures are annotated with the revision they describe — the *baseline* measurements are `d599d1bb`, and section-level corrections say when they supersede an earlier number. A few figures in this header were stale for a while ("no implementation started" while Steps 1–6 had landed, and a manifest count that still included committed declaration files); they are fixed here, and §8.13–§8.16 record what each review round caught. The manifest itself is regenerated per change and gated by `--check` in CI, so its numbers cannot drift silently.

### Implementation readiness

**All design decisions are closed** — E1 revised · E6 dissolved by measurement · **E2–E5, E7–E9 decided** (§10). Nothing in §1–§9 is waiting on a design answer.

| Step | Ready? | Why |
|---|---|---|
| **1** manifest + completeness | ✅ **done (§8.2)** | 791 modules classified; rules 1/3/4 in CI with 7 seeded tests |
| **1b** §6.2 kernel probe | ✅ **done (§6.3)** | Ran over 104 RPCs; profile-coupled RPCs 15 → 2, both legitimate. E8's stop rule satisfied |
| **H1–H3, H4, H5** host split | ✅ **done (§8.8)** | 11/11 acceptance symbols gone; `ws-server.ts` now **classifiable `reusable`** |
| **2** Dart split | ✅ **done (§8.3)** | Reusable library has no social symbol; rule 5 enforces it |
| **3** enforcement | ✅ **done (§8.5)** | All 5 rules enforced; 15 seeded tests |
| **4** node inventory | ✅ **done (§8.6)** — boundary, surface **and the ownership decision (E10, Option 1)** | Manifest + `module-surface.json` delivered; ownership is a documented catch-all with a recorded split trigger, not an invented map |
| **5** reuse test | ✅ **done (§8.7)** | `packages/envoy-reuse-fixture` — 9 tests, in CI |
| **H4** cast removal | ✅ **ready now** | Working tree clean at `d599d1bb`; nothing in flight |
| **6** extraction | ✅ **done** — harness + node-core + **`@envoymesh/host-connect`** (§8.8 Step 6b) | H1–H5 ✅, A5 ✅, E10 started |

**So: the engineering programme is complete — Steps 1–6 and H1–H5 have all landed**, every finding from the post-change review (Step 6d) is fixed, and **E10 is now decided (Option 1: defer with a recorded trigger)**. **No items remain open.**

- **Step 4's ownership half (E10)** — **decided**: Option 1, defer, with an explicit trigger and the area list kept as the reference for when it is taken. Written up at the end of this section and in `.github/CODEOWNERS`.
- **Kernel decomposition (§8.9), deferred by decision.** Its brief now exists and is gated (`scripts/inventory-node-stores.mjs`, Step 6c): **48** stores, **14 kernel / 28 product / 6 undecided**, with the next step's shape stated — a `productStoreDir` gate across every product-classified store plus a decision about the `/tmp/unknown` fallback. It was left as its own step because a partial split would let the code claim "no product stores" while nine ungated stores and the per-call harness stores still materialise.

---

## Why we are doing this refactoring

EnvoyMesh today is **one product**: Social (desktop) + EnvoyGo (mobile), built as a single system. Everything in it works, and almost none of it can be reused by anything else.

The target is that **future products are built on EnvoyMesh's modules instead of beside them or forked from them.** Two future products define the shape of that target and are the reason this work matters:

| Future product | What it is | What it needs to reuse |
|---|---|---|
| **EnvoyDev** | a paseo-class coding app with its own desktop host and mobile client, plus distributed features; `envoy-harness` built in | transport, pairing/QR, host, harness adapters |
| **EnvoyAgent** | one agent, in the spirit of HomeClaw / hermes / OpenClaw, stable and extensible, with EnvoyMesh as its channel to the home computer | transport, pairing/QR, host |

> **Neither product is designed in this document and neither is a deliverable of this work.** They are the *reason* for the refactoring and, later, the *proof* that it succeeded. This document contains no product design.

### The blocker, measured — not asserted

1. **The reusable layer and the product layer share one surface.** `packages/envoy-mesh-dart/lib/envoy_mesh.dart` is labelled *"EnvoyMesh social-lite SDK"* and exports **13 reusable and 8 product-bound** modules from a single library (the manifest's count, §2.7). A consumer that wants `canonical_json` and `envoy_signing` receives `SocialBackend`, `PhoneSocialStore`, `BondContact` and `CrossPersonaSuggestion` in scope (§2.3).
2. **Hosting a connection requires the social node.** `apps/node/src/ws-server.ts` — the only WebSocket host in the repo — resolves connecting clients against the **family-profile store**, repairs profile bindings, routes 9 events by profile, and parses **five** social thread-key formats purely to decide chat fan-out. A second product's desktop app that reused it would inherit chat rooms and a family-profile model it has no concept of (§2.5).
3. **Nothing enforces the boundary.** The only structural check in the repo is a line-count guard (`scripts/check-module-size.mjs`). Nothing verifies dependency direction, and nothing verifies that a reusable module avoids product concepts — which is *how* (1) and (2) came to exist (§2.2).

### The encouraging part

The boundary **already largely exists**, it has simply never been declared or checked:

- **198 of 507** files in `apps/node/src` are `reusable` under the manifest's three-condition test — and **350** would be if `@envoymesh/api` were a core package, which is what E9 unlocks (§2.7).
- The host's **45** wired events already split **25 product-agnostic / 20 social**, and **14 of the 25** are the harness/terminal stream EnvoyDev wants (§6.1).
- The npm packages are already layered correctly on a true-leaf `protocol` package (§2.1).

So this is a **declaration-and-enforcement** problem, not a rewrite — with one real decoupling job: the host's routing policy (§2.5, §6.1).

---

## How we will do it

**1. Measure the boundary instead of arguing about it.** Reusability is a **binary, mechanical** property — *does this module require a product concept?* — computed by seeding social-concept references and propagating taint along the import graph. Capability tags (`transport`, `harness`, `terminal`, …) are labels with no rules attached. (§2.7, §3)

**2. Declare it as data.** A reviewed manifest — `reusable` / `product-bound`, with tags — so the boundary is reviewable as a diff rather than living in prose. (§4.2)

**3. Enforce it in CI.** Dependency direction, product-concept naming, classification completeness, and the Dart core surface. **This is the highest-leverage step**: without it every declared boundary decays on the next feature branch, which is precisely how the current state arose. (§4.3)

**4. Prove it with a reuse test.** A consumer fixture built from `reusable` modules only; CI fails if any product concept is reachable. This is the assertion that "the modules are reusable" is true — and the test a future product will satisfy. (§4.4)

**5. Extract only what has an out-of-app consumer.** Declare boundaries in place for in-app consumers; extract a package only for the **connect/host** and **harness** layers, because a different desktop app cannot import `apps/node/src` by path. (§6.1, E1)

### Constraints — non-negotiable

| Constraint | Meaning |
|---|---|
| **No product behaviour changes** | Not one shipped feature changes behaviour. Steps 1–5 move no product logic |
| **Every step is independently revertible** | Steps are metadata or additive checks, except the Dart split, which is a mechanical import update |
| **In-flight work is landed first** | Phase 68 (Coding tab) is committed before shared files are touched — see Step 0 |
| **No extraction before declaration** | Extracting first reproduces today's problem one level down |
| **No product design** | EnvoyDev / EnvoyAgent are motivation and future validation only (§11) |

### The plan at a glance

| # | Phase | Output | Changes behaviour? |
|---|---|---|---|
| **0** | Land in-flight Phase 68 | a committed baseline to revert to | — |
| **1** | Measure + manifest + completeness CI | the repo can state what is reusable; no new file escapes | no |
| **2** | Dart core/social split | a reusable Dart surface with no social symbol | no |
| **3** | Direction + concept-naming enforcement | boundaries that hold on the next branch | no |
| **4** | Node inventory (507 files) | declared, owned surfaces across `apps/node` | no |
| **5** | Reuse test | CI proof that encapsulation worked | no |
| **6** | Out-of-app extraction (host/connect + harness) | a separate app hosts QR + host:port with no product-bound import | ✅ **done** |
| — | Host-split detail H1–H5 (§6.1) | a host with no social routing policy, and no product dependency at all | no |
| — | *Deferred* | kernel decomposition, general `@envoymesh/core` package | — |

Full detail and acceptance criteria: §8. The measurement that drives all of it: §2.7.

---

## How to read the rest

§1 = the claim to be earned · §2 = measured current state (§2.7 is the key measurement) · §3–4 = the design · §5–7 = workstreams, including the host split (§6.1) · §8 = rollout plan, acceptance, rollback · §9–11 = risks, decisions, exclusions · **§12 = appendix** holding the product-scope material (correct, but downstream of encapsulation).

---

## 1. What "encapsulation" means here

### 1.1 The claim to be earned

A new consumer can build a product on EnvoyMesh's modules such that:

1. it imports a **declared surface** — not "whatever happens to be exported today";
2. **no social or product concept is reachable** from that surface, and this is **mechanically checked**, not asserted;
3. it requires **no change to EnvoyMesh's existing products** to exist.

Today, (2) fails outright (§2.3) and (1) and (3) are unenforced (§2.2).

### 1.2 What this is not

- **Not a rewrite.** The existing layering is mostly sound (§2.1) — the work is declaring and enforcing boundaries, not re-architecting.
- **Not product design.** EnvoyDev/EnvoyAgent are names for *future consumers*, nothing more (§11).
- **Not the permission/scope model.** Agent capabilities and client scopes are useful, but they are **downstream** of encapsulation and are confined to §12 here.
- **Not a big-bang split of `node-service-impl.ts`.** That file is decomposed last, if at all (§8.9).

### 1.3 What the product vision requires of the reusable layer

The products that motivate this work have a specific shape, and that shape places concrete constraints **here**. **These are constraints on the reusable layer only — no product is designed in this document** (§11).

| # | Vision requirement | What it demands of the reusable layer |
|---|---|---|
| **V1** | Each product ships its **own desktop app** that hands out a **QR code and host:port** for its mobile app | The **host** side must be reusable and **package-extractable**: WS host, QR/pairing-payload issuance, token validation, relay registration. The consumer is a *different app*, so "declared in place" is not enough |
| **V2** | Mobile apps connect **the same way EnvoyMesh's mobile does** | Largely satisfied already: `envoy_thin_client` (2,434 lines, **zero** social constructs) + pairing URI + candidate resolution |
| **V3** | **Other instances of a product** can connect by the same methods | A **connection-authorization** primitive that is *not* social bonds: connect by QR/host:port, then authorize a session on that connection |
| **V4** | **EnvoyDev** reuses `envoy-harness` and supports paseo-class harnesses | The harness / `ext-agent-adapter` layer must be reusable and package-extractable |
| **V5** | **EnvoyMesh is the *channel*** to the home computer, not a feature of the social app | Transport must be a first-class reusable product, not a subsystem of `apps/node` |

**V1 and V3 are the two the plan did not cover**, and V1 revises the plan's core assumption (§8.9, E1).

---

## 2. Current encapsulation state (measured)

Metrics are from the working tree unless noted; HEAD differs because Phase 68 is in flight.

### 2.1 The npm packages are already layered correctly

```
protocol            (leaf — no @envoymesh deps)
  ├── identity      ├── bonds      ├── models      └── network
        └── api (identity, protocol)     local-store (bonds, identity, protocol)
```

`protocol` is a genuine leaf and everything fans in through it. **Package-level dependency direction is sound.** What is missing is *enforcement* (§2.2) and a *declared public surface per package* (§4.1).

### 2.2 There is no architectural enforcement anywhere

The only structural check in the repo is **`scripts/check-module-size.mjs`** (with `scripts/module-size-allowlist.json`) — a line-count guard.

**Nothing checks dependency direction. Nothing checks that a reusable module avoids product concepts.** Encapsulation therefore rests entirely on author discipline — which is precisely why §2.3 exists.

### 2.3 The Dart SDK publishes one mixed surface — the concrete leak

`packages/envoy-mesh-dart/lib/envoy_mesh.dart` is labeled *"EnvoyMesh social-lite SDK"* and exports **all 21 modules from a single library**:

| Class | Count | Modules |
|---|---|---|
| **Reusable** | **14** | `canonical_json`, `ed25519_pem`, `envoy_envelope`, `envoy_identity`, `envoy_signing`, `envelope_factory`, `relay_envelope_factory`, `mesh_protocols`, `mesh_envelope_transport`, `bootstrap_addrs`, `discovery_topics`, `capability_topic_cid`, `lan_owner_id` |
| **Social** | **5** | `social_backend`, `phone_social_backend`, `phone_social_store`, `models`, `cross_persona_suggestions` |
| **Borderline** | **2** | `phone_identity_store`, `phone_discovery_runtime` |

**Consequence:** a consumer that wants `canonical_json` and `envoy_signing` must import a social-labeled library, and receives `SocialBackend`, `PhoneSocialBackend`, `PhoneSocialStore`, `BondContact`, `MeshPeerHit` and `CrossPersonaSuggestion` in scope. The reusable primitives and the product types share one surface, so rule 2 of §3 (Axis 1) cannot be checked today.

Dart package *direction* is otherwise correct: `envoy_mesh_libp2p` → `envoy_mesh` + `envoy_thin_client`, both properly declared in `pubspec.yaml`.

| Dart package | Lines | Social constructs in surface |
|---|---|---|
| `envoy-thin-client-dart` (`envoy_thin_client`) | 2,434 | **None** — pairing URI, candidate resolution, reconnect, JSON-RPC client |
| `envoy-mesh-libp2p-dart` (`envoy_mesh_libp2p`) | 1,576 | **Corrected by the manifest: 1 reusable / 5 product-bound.** `phone_discovery_session.dart` uses `_backend.persona` to sign envelopes, and the single library re-exports it — so the package's surface is product-bound (see §2.7) |
| `envoy-mesh-dart` (`envoy_mesh`) | 2,533 | **Mixed** — 13 reusable + 8 product-bound (§2.7) |

### 2.4 `apps/node` is the real encapsulation gap

| Metric | Value |
|---|---|
| Files / lines | **507** files · **168,459** lines |
| Layout | **448** top-level `.ts` + 5 subdirectories (`agent-runtime-envoy`, `bridge`, `chain-graph`, `ext-agent-adapter`, `openclaw-bridge-smoke`) |
| Largest modules | `node-service-impl.ts` 18,786 · `index.ts` 6,674 · `node-service-chain-orchestration.ts` 4,310 · `tool-registry.ts` 3,644 · `chain-orchestrator.ts` 3,313 |
| Partial decomposition | **73** `node-service-*.ts` modules (51,198 lines) + **22** `node-service-handlers-*.ts` |
| Client-facing contract | `NodeService` **436** members · `RpcMethods` **426** members (`packages/api`) |

The 73 `node-service-*.ts` modules and 22 handler modules show a **decomposition seam already exists** — but there is **no declared boundary, no declared owner, and no declared public surface**, so nothing distinguishes a reusable module from a product-bound one. Both look identical to a consumer.

### 2.5 The host is welded to the social node — the gap V1 exposes

`apps/node/src/ws-server.ts` (**1,119** lines) is the WebSocket host every client connects to. Four couplings, in increasing order of severity. **The first is much better than it looks, and the last is much worse.**

**(a) The injection seam is already clean.** `start(nodeService: NodeService)` (`:132`) takes the **interface**. `NodeService` declares `on<K extends keyof NodeServiceEvents>(…)` (`packages/api/src/node-service.ts:2901`), and `NodeServiceEvents` carries **67** typed events. All **45** events the host wires are declared there — *wired but undeclared: none*. **The event vocabulary is already product-agnostic.**

**(b) Seven service-level casts bypass the interface** — five `as NodeServiceImpl` (`:205`, `:560`, `:604`, `:740`, `:947`) and two `as any` (`:533`, `:540`):

| Site | Member reached past `NodeService` |
|---|---|
| `:205` | the whole event-wiring block (`callManager` is impl-only) |
| `:533`, `:540` | `lookupSessionToken`, `listFamilyProfiles` |
| `:560`, `:604` | `healSessionProfileFromBinding`, `touchFamilyProfileLastSeen` |
| `:740`, `:947` | further impl-only members |

`callManager` is the reason for `:205`, which then disables type-checking for the entire wiring block and forces the defensive `typeof nodeServiceImpl.on` runtime check at `:206` / `:333` — code that exists only because the cast removed the compiler's guarantee.

**(c) The host implements social identity resolution.** The auth path (`:531–561`) does not merely accept a token: it looks the connecting client up in the **family profile store** (`listFamilyProfiles()`, `:540`) to decide `isOwnerProfile`, and **repairs** a "corrupted" binding — *"Prefer boundFamilyProfileId when profileId was corrupted to owner … Persist heal so later reconnects / push keep using Mom/Dad"* (`:556–561`). It also tracks presence via `touchFamilyProfileLastSeen` (`:604`). **Authentication in the host is family-profile-aware.**

**(d) The host implements social routing and message fan-out.** The 45 events are wired through **36 call sites** — 27 `emitEvent` (broadcast) and 9 `emitEventToProfile` — because the ten `eh:*` events share one broadcast call site:

| Disposition | Count | Examples |
|---|---|---|
| Broadcast (`emitEvent`) | **27** | `node:status`, `peer:discovered`, `p2p:envelope`, `terminal:*`, `eh:*` |
| Profile-scoped (`emitEventToProfile`) | **9** | **6** hardcoded to `OWNER_FAMILY_PROFILE_ID`; 3 resolved by social helpers |
| Special-cased | 2 groups | `chat:room-*` → owner-only (*"Mesh rooms are owner-only — never broadcast to family-member WS sessions"*, `:225`); `chat:family-room-*` → remapped onto `chat:room-*` with `kind: "family"` (`:235–257`) |

`emitEventToProfile` (`:1026–1044`) encodes the rule: untokened local clients are the owner; tokened sessions must match `profileId`. And `resolveChatMessageTargetProfiles` (`:1081–1119`, 38 lines) parses **five** social thread-key formats (`family`, `aiBot`, `bridge`, `envoyAi`, `__envoy_ai__`) purely to decide who receives a chat message.

**Consequence for V1.** A second product's desktop app reusing this host would inherit chat rooms, a family-profile model, family-profile presence tracking, and family/AI-bot message fan-out — concepts it has no notion of. Reuse therefore requires **either** accepting the family model **or** replacing three things: **session-identity resolution, event disposition policy, and message fan-out.**

**The fix is designed in §6.1** — declared event dispositions, a session-identity port, pluggable fan-out, and removal of the impl casts. A product host then composes **core events + its own**, rather than inheriting the social routing block. Of the 45 events, **25 are already product-agnostic**; the split is a boundary that exists but is not yet declared.

**Encouraging counter-evidence — the pairing/QR sub-pieces are already clean:**

| Module | Coupling | Verdict |
|---|---|---|
| `pairing-kiosk-server.ts` | `node:http`, `node:crypto`, `node:net` **only** | **Already extractable** |
| `node-service-handlers-pairing-payload.ts` | `node:crypto`, `@envoymesh/api` types, `./review-pairing.js` | **No social dependency** |
| `ext-agent-adapter/*` (paseo-class harness adapters) | `node:child_process`/`path`/`os`/`fs`/`crypto`, local stores, **2** `@envoymesh/api` imports | **Nearly extractable** — a cheap V4 win |
| `relay-client-cycle.ts` (WAN discovery) | `@envoymesh/protocol`, `@envoymesh/identity`, `@envoymesh/network` + local | Reusable except for one `import type { NodeProfile }` |
| `ws-server.ts` | 7 impl casts; family-profile auth; social routing + fan-out | **The work item** |

### 2.6 EnvoyGo: the app layer is not yet separable

The plan addressed the Dart *packages* but not the app. Under V1/V2 future products ship their own mobile apps, so EnvoyGo's reusable surface matters:

| Area | Lines | Reusable? |
|---|---|---|
| `services/node_service_client.dart` | **2,800** | Largest reusable asset. It wraps **225 distinct RPC methods** (230 call sites) — *not* the full 426-method node union, of which **201 are never called by the client at all**. Social methods are among the 225 |
| `services/` (other 27 files) | ~3,187 | Splits cleanly: pairing, connectivity, envoy URL, feature flags, onboarding gate, mDNS lock, UPnP, push ≈ **reusable**; chat voice notes, family content, library/vault fetch, people cache, blog parsing ≈ product |
| `providers/node_provider.dart` | 2,038 | Home/thin-client **connection** state — reusable in shape |
| `providers/social_context_provider.dart` | 693 | **Named social, yet holds the phone-mesh *runtime*** — a connection concern, misnamed |
| `providers/chat_provider.dart` | 3,514 | Product |
| `providers/` (call, contact, cross-persona, content-engage, feed-notify) | 1,373 | Product |
| `mesh/` | 303 | Reusable — already delegates to the Dart SDKs |

**Connection state and product state share one layer**, and the naming actively misleads (§4.2).

### 2.7 Measuring the boundary: how much of `apps/node` is already reusable?

Rather than guess, the boundary can be **measured**. The method has **three conditions, all of which must hold** for a file to be `reusable` — and an earlier draft of this section stated only the first two, which produced a different number (see the correction note below):

1. **No concept reference.** The file does not name a product concept (the concept set below).
2. **No tainted dependency.** It does not import — directly or transitively — a file that fails (1) or (2).
3. **No non-core package dependency.** Every `@envoymesh/*` package it imports is in the **declared core set**: `protocol`, `identity`, `network`, `vault`, `local-store`.

**Both sets are declared inputs, not derived facts**, and the manifest records them so the classification is reproducible and its assumptions are visible:

| Input | Value | Note |
|---|---|---|
| Concept set | the strict set (below) | §2.7's sensitivity table varies this and nothing else |
| Core package set | `protocol`, `identity`, `network`, `vault`, `local-store` | `@envoymesh/api` is **deliberately excluded**: it currently exports the whole product surface (E9), so it is not a core package today |

> **Superseded figures.** An earlier revision of this section quoted **259 / 204 / 80** reusable files. Those came from a method that (a) omitted the core-package condition from propagation and (b) matched concepts in raw text, so comments counted. The current figures — produced by the classifier — are **198 / 193 / 111**. The old numbers are kept only so the correction is traceable (see the correction note below the sensitivity table).

**The manifest is now the authoritative artifact.** Step 1 implemented the classifier, so these numbers are produced by a script rather than by hand:

```
scripts/classify-modules.mjs   →  scripts/module-boundary.json
scripts/check-module-boundary.mjs   (rules 1, 3, 4 — CI: ci-module-boundary.yml)
```

Scope: **795 modules** — `apps/node/src` (508) + `packages/*/src` + the three Dart package `lib` trees. `packages/openclaw` is **excluded** as vendored third-party (upstream "openclaw" 0.2.0, ~2.7 GB, 16,882 `.ts` files); the exclusion is recorded in the manifest so the scope is auditable.

| Scope | Modules | `reusable` | `product-bound` |
|---|---|---|---|
| **whole manifest** | **795** | **435** | **360** |
| `apps/node/src` | 508 | **199** | 309 |
| `envoy_mesh` (Dart) | 23 | **16** | 7 |
| `envoy_thin_client` (Dart) | 12 | **12** | **0** |
| `envoy_mesh_libp2p` (Dart) | 7 | **4** | 3 |
| `@envoymesh/api` | 131 | 101 | 30 |
| `@envoymesh/protocol` | 10 | 10 | 0 |

**Sensitivity — and the input that actually dominates.** The plan previously presented the *concept set* as the main axis. With the corrected method the concept set matters far less; the **core package set** dominates:

| Variant | `reusable` in `apps/node/src` |
|---|---|
| Declared core set (baseline) | **198** |
| Medium concept set (`+ deviceCertificate`, `Mandate`) | 193 |
| Broad concept set (any social-ish word) | 111 |
| **`@envoymesh/api` moved into the core set** | **350** |

That last row is the important one: **`@envoymesh/api` alone accounts for 152 files** (198 → 350). It is excluded because it currently exports the whole product surface (E9), so **E9 is the single change that most improves reusability** — and the manifest will show it as a diff.

> **Two corrections found during implementation** (recorded because "measured" is only meaningful if the method is reproducible):
>
> 1. **A missing condition.** The method as originally stated had two conditions (no concept reference, no tainted dependency) and yields **476** reusable files in `apps/node/src`. The quoted figures required a third — every `@envoymesh/*` import must be a core package. The method statement in this section now carries all three.
> 2. **Comments were being counted.** The original measurement scanned raw text, so a concept named in a *comment* seeded taint: `ext-agent-adapter/session-model-store.ts` mentions `family profileId` in a doc comment and tainted 6 further files transitively. Concepts are now matched against **comment- and string-stripped** text, while imports are read from **raw** text (import specifiers *are* string literals — stripping first erases every edge, a bug this work hit and fixed).
>
> Both are now enforced by tests: `scripts/test/module-boundary.test.mjs` includes a case asserting that a concept mentioned **only in a comment does not fail**.
>
> 3. **A commented-out import was read as a real dependency** (found implementing Step 2). `envoy_mesh.dart`'s new doc comment mentions `import 'package:envoy_mesh/envoy_mesh_social.dart'`, and the directive regex was unanchored over raw text — so the *comment* created a dependency edge that marked the freshly-reusable library **product-bound**. Directives are now extracted from **comment-stripped, line-anchored** text: comments must go, but string literals (the specifiers) must stay. That is the opposite constraint from concept matching, which is why two strippers are needed. The fix moved 3 files to `reusable` (427 → 430) and has its own regression test.

### 2.8 Summary

| Layer | Direction | Surface declared | Social leakage checkable | Reusable by a *different app*? |
|---|---|---|---|---|
| npm packages | ✅ layered | ❌ | ❌ | ✅ (they are packages) |
| Dart SDKs | ✅ correct | ❌ (one mixed library) | ❌ | ✅ |
| `apps/node` internals | ❌ undeclared | ❌ | ❌ | ❌ by path |
| **host / `ws-server`** | ⚠️ interface seam clean; family-profile auth + social routing baked in | ❌ | ❌ | ❌ **the V1 blocker** |
| **EnvoyGo app** | ❌ connection + product state mixed | ❌ | ❌ | ❌ |

**Encapsulation is a declaration-and-enforcement problem, not a rewrite problem.** That is what makes it tractable — and the one place that needs real decoupling is the host's *routing policy*, not its plumbing (§2.5).

---

## 3. Module boundary: two axes, not four classes

An earlier revision of this plan used four classes — `core` / `feature` / `social` / `product` — and made "is this a feature or a social module?" a blocking decision (E6). **The measurement in §2.7 shows that is the wrong question.** Two runs of a name-based classifier disagreed by more than 2× on `feature` membership, and with the corrected method the concept set is no longer the dominant input — the **core package set** is, moving `apps/node/src` between 198 and 350 reusable files (§2.7).

The load-bearing property is not *which category* a module belongs to. It is:

> **Does this module require a product concept to function?**

That is **binary, and mechanically checkable** — it is exactly the taint test in §2.7.

### Axis 1 — reusability (binary, enforced)

| Value | Meaning | Test |
|---|---|---|
| **`reusable`** | Needs no social or product concept, directly or transitively | No social-concept reference; no `product-bound` dependency |
| **`product-bound`** | References a product concept — bond/trust tier, family profile, persona, chat, roster, contact, avatar | Imports or names such a concept |

**Rule 1 (direction).** A `reusable` module may not depend on a `product-bound` module.
**Rule 2 (naming).** A `reusable` module may not name a product concept, even in a type it defines.
**Rule 3 (surface).** A module's exports are its contract; anything not exported is private.

### Axis 2 — capability tags (labels, not boundaries)

Orthogonal to reusability, and used for navigation and review, not enforcement:

`transport` · `pairing` · `harness` · `terminal` · `calls` · `models` · `vault` · `knowledge` · `filesystem` · `social` · `ui`

A module can be `reusable` + `harness` (the harness adapters, which are nearly clean today — §2.5) or `product-bound` + `harness` (coding heartbeats, which reference owner review invites). **Tags carry no dependency rules**, which is what removes the taxonomy dispute entirely: nothing in the plan depends on whether terminal sessions are "a feature" or "social".

### What this buys

- **E6 disappears.** There is no longer a `feature` vs `social` line to adjudicate.
- **The boundary becomes measurable.** The §2.7 test *is* the classification procedure, so the manifest is generated, spot-reviewed, and then diffed — rather than argued file by file.
- **The boundary is now an artifact, not an argument.** `scripts/module-boundary.json` is generated by `scripts/classify-modules.mjs` and enforced by `scripts/check-module-boundary.mjs` — so the classification is reviewable as a diff and cannot drift silently (§2.7, §8.2).

---

## 4. Design: four mechanisms

### 4.1 Declared public surface

One entry point per package/module that lists exactly what is exported. A consumer imports the entry point, never a deep path. Precedent already exists: each npm package has `src/index.ts`, and each Dart package has a single `lib/<name>.dart` — the problem is that `envoy_mesh.dart` declares *everything* (§2.3).

### 4.2 Classification manifest

A machine-readable file listing every module and its class from §3:

```jsonc
{
  "reusable": [
    { "path": "packages/protocol",                          "tags": ["transport"] },
    { "path": "apps/node/src/node-service-handlers-terminal.ts", "tags": ["terminal", "harness"] },
    { "path": "packages/envoy-mesh-dart/lib/src/canonical_json.dart", "tags": ["transport"] }
  ],
  "productBound": [
    { "path": "apps/node/src/node-service-family.ts", "tags": ["social"], "concept": "family-profile" },
    { "path": "packages/envoy-mesh-dart/lib/src/phone_social_store.dart", "tags": ["social"], "concept": "persona" }
  ]
}
```

The two class keys are the manifest's actual JSON keys: `reusable` and **`productBound`** (camelCase, so the classifier and both checkers can read them without a case mapping). This document's prose says *"product-bound"* because that reads better in a sentence; the kebab-case spelling in an earlier draft of this example was never what the code emits, and a review caught the divergence.

Reusability is the enforced axis (§3); `tags` are labels and `concept` records *which* product concept binds the module, so a future product can tell whether it is affected.

Rules are **data, not prose** — which is what makes them checkable (§4.3) and reviewable as a diff.

**Derive the manifest from imports and exported types — never from names.** Names in this codebase demonstrably lie:

- `packages/envoy-mesh-dart/lib/envoy_mesh.dart` is titled *"social-lite SDK"*, yet **14 of its 21** modules are product-agnostic (§2.3).
- `apps/envoygo/lib/providers/social_context_provider.dart` is named social, yet holds the phone-mesh **runtime** — a connection concern (§2.6).
- A name-based heuristic in earlier analysis of this repo classified `pinLibraryItemExternal` (file sharing) as coding, and missed `restartPi` / `sendToPi` / `ehRespond*`.

A name heuristic is permitted only as a **candidate generator**; the evidence must be the import graph and the exported types.

### 4.3 Enforcement — the missing piece

A new CI check modelled on the existing `check-module-size.mjs`, verifying:

| Check | Fails when |
|---|---|
| Direction | a `reusable` module imports a `product-bound` module |
| **Surface (rule 2)** | a `@envoymesh/*` subpath import is **not declared** in that package's `exports` map, or a Dart file reaches into another package's `src/` |
| Completeness | a module is unclassified, or classified twice (new files cannot escape the model) |
| Concept naming | a `reusable` module names a product concept (`OWNER_FAMILY_PROFILE_ID`, `familyProfile*`, `persona`, `bondTier`, `profileId`, …) |
| Dart reusable surface | the reusable Dart library exports a social symbol |

**This is the highest-leverage single item in the plan.** Without it, every boundary declared in §3 decays on the next feature branch.

**Each rule needs its own seeded-violation regression test** — a five-rule CI with one test is brittle, because a rule that silently stops firing looks identical to a rule with nothing to catch:

| # | Rule | Seeded violation (must fail CI) |
|---|---|---|
| 1 | Direction | Add a `reusable` module importing a known `product-bound` module |
| 2 | Surface | Add a deep-path import that bypasses a declared entry point |
| 3 | Completeness | Add a new file to `apps/node/src` without a manifest entry |
| 4 | Concept naming | Add `OWNER_FAMILY_PROFILE_ID` to a `reusable` module |
| 5 | Dart reusable surface | Re-export a social symbol from the Dart reusable library |

**Author contract for rule 3 — decide now, because it governs PR velocity.** Under **"classify in the same PR"** the manifest entry is part of the change that adds the file; the check fails the build otherwise. Under **"break the build until a follow-up"** a new file can land unclassified and block everyone. **The plan adopts classify-in-the-same-PR:** the manifest is one line per file, so the cost is paid by the author who has the context, and the repo is never left in a failing state.

### 4.4 The reuse test — mechanical acceptance

A consumer fixture built from **`reusable` modules only** (plus the clean Dart SDKs), in CI. It asserts that:

- it compiles with no social import available;
- no social symbol is reachable through the declared surface.

**This is the proof that encapsulation succeeded**, and it is exactly the test a future EnvoyDev or EnvoyAgent will satisfy — which is the only role those names play in this document.

---

## 5. Workstream A — Dart client SDKs and the EnvoyGo app

*Smallest, closest to done, and directly serves "reuse the libs to build products" (V2).*

- **A1.** ✅ **Done** (§8.3). Split `envoy_mesh`'s single library into a **reusable** library and a **social** library. The 13 reusable modules move to the former; the 8 product-bound modules move out (manifest counts, §2.7). The split is expected to **flip many downstream modules to reusable** — `libp2p_node.dart` imports the mixed library today and is therefore classified product-bound.
- **A2.** ✅ **Decided (E3)** and applied. The two borderline modules — `phone_identity_store` (persona identity → *social*) and `phone_discovery_runtime` (mesh discovery used by the phone social plane → *needs review*). See E3.
- **A3.** ✅ **Decided (E4)**; documentation pending. Name and version the reusable client SDK (`envoy_thin_client` already has **zero** social constructs, so it is the natural anchor). See E4.
- **A4.** ✅ **Done (§8.4.1).** **EnvoyGo — split the RPC client surface.** `services/node_service_client.dart` (2,800 lines) wrapped **225 distinct RPC methods** (230 call sites) — social methods among them, so a future mobile app could not reuse the client without the product. Split into `home_rpc_session.dart` (connection/session plumbing, reusable) plus nine `rpc_bindings/*.dart` mixins (the product bindings).
- **A5.** ✅ **Done (§8.4.2).** **EnvoyGo — split providers by concern.** Connection lifecycle (`node_provider.dart`, 2,038 lines; the phone-mesh runtime inside `social_context_provider.dart`, **693**) from product state (`chat_provider.dart`, **3,514**; call/contact/cross-persona/content-engage/feed-notify, 1,373). Today they share one layer (§2.6).
- **A6.** ✅ **Done (§8.4.2).** **EnvoyGo — separate `services/`** into reusable (~10 files: pairing, connectivity, envoy URL, feature flags, onboarding gate, mDNS lock, UPnP, push) and product (~15 files).
- **Acceptance:** the reusable library exports no social symbol; a consumer builds against `envoy_thin_client` + the `envoy_mesh` reusable library + `envoy_mesh_libp2p` only; EnvoyGo's connection layer contains no chat/call/contact/persona type.

---

## 6. Workstream B — node kernel boundary and the host/connect layer

*Largest and highest-risk. Deliberately ordered after A and the enforcement from §4.3.*

- **B1.** Classify all **507** files in `apps/node/src` on **Axis 1 only** (`reusable` / `product-bound`) using the §2.7 taint test, then add capability tags. The existing seams — **73** `node-service-*.ts` and **22** `node-service-handlers-*.ts` modules — mean this is mostly *labelling what exists*. **Measured (manifest): 198 of 507 files are `reusable`; 309 `product-bound`** — 227 coupled only via a non-core package, 71 via dependency, 11 by naming a concept. **The 227 package-coupled files are the review target: E9 moves 152 of them** (198 → 350 reusable, §2.7).
- **B2.** Keep the **client-facing contract** as-is: `NodeService` (436 members) + `RpcMethods` (426 members) are already product-agnostic and are the natural boundary between kernel and consumer.
- **B3.** **Declare boundaries in place first** for modules whose consumer is inside `apps/node` — extraction there would add packaging overhead without benefit (E1).
- **B4.** **Extract the host/connect layer** — QR/pairing issuance, WS host, token validation, relay registration — because its consumer is a **different app** (V1). Requires severing `ws-server.ts` from `NodeServiceImpl` and from profile-scoped social event routing (§2.5). The clean sub-pieces (`pairing-kiosk-server.ts`, `node-service-handlers-pairing-payload.ts`) make this bounded.
- **B5.** **Extract the harness / `ext-agent-adapter` layer** for V4 — already nearly clean (§2.5).
- **B6.** **Kernel composability — required for V1** (see §6.2). The kernel must be constructible and operable **without social inputs**; today it is not.
- **B7.** File-size hygiene — splitting `node-service-impl.ts` for readability is **deferred, and is an *outcome* of B6, not a method** (§8.8).
- **Acceptance:** no `reusable` module depends on a `product-bound` module; a consumer drives the client contract with no product concept loaded; **a separate app can host QR + host:port and run the harness without importing a product-bound module.**

### 6.1 The host split — design of B4

**Requirement (V1):** a product's own desktop app must be able to host QR + host:port **without inheriting any social concept**. Concretely, EnvoyDev must never ship chat rooms, mesh/family rooms, a family-profile model, profile-aware authentication, family presence tracking, or family/AI-bot fan-out (§2.5).

**The split is already visible in the event list.** Of the 45 events the host wires, **25 are product-agnostic and 20 are social**:

| | Count | Contents |
|---|---|---|
| **Reusable** | **25** | `node:*` (4), `peer:*` (2), `p2p:envelope`, `crdt:sync`, `discovery:multihop-update`, `config:updated`, `bridge:status`, **`eh:*` (10)**, `pi:proposal`, `terminal:*` (3) |
| **Product-bound** | **20** | `chat:*` (9), `bond:*` (2), `home:*` (3), `agent:*` (2), `profile:updated`, `hello:*` (2), `share:agent-proposed` |

**14 of the 25 reusable events are the harness/terminal stream EnvoyDev actually wants** — and they are *already* product-agnostic. So the host split is not a re-classification; it is making an existing boundary explicit and injectable.

**H1 — Event disposition becomes data.** Replace the 36 hand-wired `nodeServiceImpl.on(…)` call sites (covering 45 events) with a declared table:

```ts
export type EventDisposition =
  | { kind: "broadcast" }
  | { kind: "ownerOnly" }
  | { kind: "byProfile"; resolve: (data: unknown) => string[] }

/** The core host knows only these. No chat, bond, or profile knowledge. */
export const CORE_EVENT_DISPOSITIONS: Readonly<Record<string, EventDisposition>> = { /* 25 */ }
```

A product supplies its own map at start; the host merges them. Today's inline policy — `chat:room-*` owner-only, `chat:family-room-*` remapped with `kind: "family"`, 6 hardcoded `OWNER_FAMILY_PROFILE_ID` routes — moves into the social map.

**H1 is smaller than the 45-event list suggests.** The ten `eh:*` events are *already* a single loop — `for (const name of [...] as const)` at `ws-server.ts:312–325`, with the `.on` call at `:324`. So the disposition table slots straight into the existing shape:

```ts
for (const [name, disp] of Object.entries(dispositions)) {
  nodeServiceImpl.on(name, (data) => this.deliver(name, disp, data))
}
```

Fourteen of the 25 reusable events (the `eh:*` ten plus `pi:proposal` and the three `terminal:*`) collapse into that one loop.

**H2 — Session identity becomes a port.** The four casts in the auth path (`lookupSessionToken`, `listFamilyProfiles`, `healSessionProfileFromBinding`, `touchFamilyProfileLastSeen`) collapse into one narrow dependency:

```ts
export interface SessionIdentityResolver {
  /** Token → authorized caller. Must not require any product concept. */
  resolveSession(token: string): Promise<{ caller: RpcCallerContext } | null>
  /** Optional presence bookkeeping. */
  noteSessionActivity?(caller: RpcCallerContext): void
}
```

- **Core implementation:** token lookup only.
- **Social implementation:** adds family-profile resolution, the `boundFamilyProfileId` heal, and `touchFamilyProfileLastSeen`.

**H3 — Fan-out becomes pluggable.** `resolveChatMessageTargetProfiles` (`:1081–1119`) moves out of `ws-server.ts` into the social policy module and is registered as the `resolve` function for `chat:message`. It never belonged in the transport: it parses five social thread-key formats purely to decide delivery.

**H4 — Remove the impl casts.** `callManager`'s call events move onto `NodeServiceEvents` / `NodeService.on`, which deletes the `:205` cast, the `typeof nodeServiceImpl.on` probe (`:206`) and its error branch (`:333`) — and with them the remaining `as NodeServiceImpl` sites once the members are on the interface.

**H5 — The host's node dependency becomes a declared surface, and its product policy becomes ports (§8.8).** H1–H4 made the transport stop *naming* product concepts; H5 made it stop *depending on* product code at all, which is what the extraction gate actually requires. Three ports replace four product reach-ins:

| Port | Replaces | Product side |
|---|---|---|
| `dispatch(method, params, session)` | the 1,778-line router + caller mechanism + `localOwnerCaller` | `index.ts` one-liner |
| `transformForSession(event, data, session)` | `stampConfigCallerForSession` + a cast to `mayFamilyProfileUseExtAgent` | `social-session-delivery.ts` |
| `socketMethods.handle/closed` | six `homeClawCoreWs*` / `homeTerminalWs*` blocks + their cleanup | `social-socket-methods.ts` |

plus `HostNodeService` (5 members in place of the 436-member `NodeService`), `HOST_WS_BIND_HOST` (in place of `@envoymesh/node-core`), the wire types moved to `@envoymesh/protocol` (in place of `@envoymesh/api`), and `preAuthMethods` as data (in place of two hard-coded method names). **Result: `ws-server.ts` is classifiable `reusable`** — the precondition §8.8's extraction step was missing.

**Resulting host surface for EnvoyDev:** the 25 reusable events (14 of which it uses directly), plus its own — and no product concept reachable, no product module importable.

**Acceptance — two layers, because a symbol grep is not a behaviour test (review point #1).**

**(a) Static — the import-graph check.** None of these may be reachable from `ws-server.ts`:

`OWNER_FAMILY_PROFILE_ID` · `parseFamilyThreadKey` · `parseAiBotThreadKey` · `parseBridgeThreadKey` · `parseEnvoyAiProfileId` · `isEnvoyAiThreadKey` · `listFamilyProfiles` · `healSessionProfileFromBinding` · `touchFamilyProfileLastSeen` · `callManager` · `NodeServiceImpl`

**(b) Behavioural — the contract test.** Static absence proves the import was removed; it does **not** prove the core resolver or the disposition table behave correctly. Required end-to-end assertions, with a `WsServer` started using **core dispositions and the core identity resolver only**:

| # | Assertion |
|---|---|
| 1 | A `coding`-scoped token authenticates and receives a response to a granted method |
| 2 | A method outside that scope's grant is **denied** |
| 3 | `terminal:session-updated` is delivered to the subscribed socket |
| 4 | **No `chat:*` event is delivered to anyone** — no chat disposition is registered, so a `chat:message` on the service is a no-op, not an error |
| 5 | An untokened local client is treated as the owner and still receives broadcast events |

Assertion 4 is the one that encodes the requirement: *a product host has no chat, therefore a chat event must be silently undeliverable rather than crash or leak.*

**Guard the silent drop against its failure mode.** Silent drop is correct product behaviour, but it makes a **typo'd disposition key indistinguishable from a legitimate no-op** — the event simply never arrives. So the host must log a warning when an event arrives with **no registered disposition**, in development/debug builds; and a test must assert that a deliberately misspelled disposition key produces that warning. Without it, assertion 4 can pass for the wrong reason.

**Interface-change surface — what each sub-fix touches (R1).** This decides what can run in parallel with Phase 68:

| Sub-fix | Files | Changes `packages/api/src/node-service.ts`? | Can start before Step 0? |
|---|---|---|---|
| **H1** event dispositions | new module + `ws-server.ts` | **No** — keys are typed `keyof NodeServiceEvents`, a type-only import. **Additive, no edit to the file** | **Yes** |
| **H2** session-identity port | new module + `ws-server.ts` | **No** — `RpcCallerContext` is node-local (`apps/node/src/rpc-caller-context.ts`) | **Yes** |
| **H3** pluggable fan-out | new module + `ws-server.ts` (moves `resolveChatMessageTargetProfiles` out) | **No** | **Yes** |
| **H4** remove impl casts | **`packages/api/src/node-service.ts`** (add `callManager` events to `NodeServiceEvents` / `NodeService.on`) | **Yes — a real edit** | **No — gated on Step 0** |

**So H1–H3 are additive-only and parallel-safe; H4 is the single sub-fix that collides with in-flight work.** H4 is also independent of H1–H3, so landing the first three before Phase 68 is committed is safe and reversible.

**Where the new types live (review point #2).** H1's disposition type and H2's `SessionIdentityResolver` are the host's **extension points** — the things a product implements. They therefore belong to the **host layer**, not to `apps/node/src` internals and not to `packages/api` (which is the RPC contract, not the host's DI surface). So H1/H2 create **one new node module** (a host contract module holding both types), and **Step 6's extraction moves that module into the extracted host package wholesale**.

Two consequences, stated so nothing is assumed:
- Relative to **R1's question**, H2 remains additive: it edits no existing file, including `packages/api/src/node-service.ts`.
- Relative to **Step 6**, the module is a *relocation candidate*, not a permanent `apps/node/src` resident. If relocating it later is undesirable, the alternative is to define it in `packages/api` from the start — which is still non-breaking, but makes H2 a genuine **new-type addition** to that package rather than a purely local one.

### 6.2 Kernel composability — the one place the god-object actually blocks V1

`apps/node/src/node-service-impl.ts` (**18,786 lines**) implements all 435 `NodeService` methods. **Of that, the class itself is 16,902 lines** — declared `class NodeServiceImpl` at **`:1804`**, body ending **`:18,705`** — and the first **1,804 lines are preamble** (imports and helpers).

**Measurement rules (stated so any reviewer can reproduce them).** Earlier drafts of this section quoted counts that a naive grep could not reproduce; the rules are therefore given verbatim.

| Quantity | Value | Rule |
|---|---|---|
| Class members | **834** (1,793 preamble lines excluded) | `^  (?:public \|private \|protected \|readonly \|static )*(?:async )?([A-Za-z_$][\w$]*)\s*[(<:=]` applied to the brace-matched class body, after stripping `//` comments, `/* */` blocks, and string/template literals |
| Family/profile identifier refs | **140** | `OWNER_FAMILY_PROFILE_ID\|boundFamilyProfileId\|FamilyProfile\|familyProfile\|_callerFamilyProfileId\|isOwnerProfile\|profileId` |
| Chat/room identifier refs | **88** | `chatRoom\|familyRoom\|_chatStore\|roomId\|targetProfileId` |
| Bond/trust identifier refs | **17** | `bondTier\|trustTier\|_trustStore` |

**The unit is explicit identifier occurrences after comment/string stripping — not whole words, not lines.** Naive whole-word counts over the same cleaned body give very different numbers (`\bprofile\b` → 147, `\bchat\b` → 108, `\bbond\b` → 15), which is why the patterns are stated here rather than a bare count. The plan previously listed decomposing it as *"last, if at all"*. **Checking the code shows that framing was wrong** — the file size is the symptom, not the problem.

**What actually blocks V1.** A product's desktop app must run a node runtime to host QR + host:port + harness. It cannot today, for two measured reasons — both **social**, neither optional:

| Evidence | Location | Consequence |
|---|---|---|
| Constructor **demands social inputs** — `constructor(` at **`:2438`**, with `humanProfileStore: HumanProfileStore` at **`:2442`** and `profile?: NodeProfile` at **`:2444`**; field `_humanProfileStore` **`:1812`** | `:2438`, `:2442`, `:2444` | A product cannot instantiate the kernel at all without supplying a human-profile store and a profile |
| Social state embedded throughout the class body: **140** family/profile, **88** chat/room, **17** bond/trust identifier refs (rules above) | class body | Social behaviour is not confined to a few injectable places, so it cannot be switched off by configuration |

> **Not part of this argument: the voice/video call layer.** Calls are a separate **WebRTC layer** — `call-manager.ts` (483), `call-inbound.ts` (493), `session-manager.ts` (468), `stun.ts` (433) = **1,877 lines with zero social-concept references**. It is **explicitly deferred** (§11). It appears here only as an illustration of a *pattern* — a clean subsystem the kernel still owns unconditionally (`readonly callManager = new CallManager()`, `:1929`) — not as a blocker in its own right.

**Why more file-splitting would not fix it.** The repo already extracts modules ad hoc — and the result is **12 `node-service-*` files in the size allowlist** (`scripts/module-size-allowlist.json`, **35** entries in total, with `node-service-impl.ts` first). Extraction by size has produced new oversized files **without producing composability**. Split-first repeats this.

**What would fix it.** The injection seam already exists and is clean: `node-service-contexts.ts` (1,513 lines) and `node-service-impl-service-deps.ts` (850 lines) contain **zero** family/persona references. So:

1. **Probe (cheap, first):** make the **social** inputs optional and injectable — `humanProfileStore` and `NodeProfile` — then measure whether the kernel constructs **and serves RPCs** with no social input at all.
2. **Extract only where the probe fails:** wherever the kernel still reaches for social state after step 1, move that concern out through the declared boundary.
3. **The file shrinks as a consequence.** Decomposition is the *outcome* of moving social concerns out, never the method.

**Acceptance:** a kernel instance can be constructed and serve `RpcMethods` with **no `HumanProfileStore` and no `NodeProfile`**. (A side effect worth noting: once the pattern exists, `CallManager` can be made optional the same way — but that is not part of this plan, §11.)

### 6.3 Probe result — §6.2 ran, and it converged ✅

`apps/node/test/kernel-composability-probe.test.ts` drives **104 zero-arg RPCs** against a kernel built with no `humanProfileStore` and no `NodeProfile`.

| Iteration | `served` | require a human profile |
|---|---|---|
| Initial measurement | 84 | **15** |
| After extraction 1 (one call site → 9 cleared) | 93 | 6 |
| After extraction 2 (7+2 call sites → 4 cleared) | **94** | **2** |

**The two remaining are the two that are *about* the human profile** — `getHumanProfile`, `syncProfileToBonds`. That is the correct end state, so **E8's stop rule is satisfied: no further `node-service-impl.ts` extraction is required for V1.**

**Extraction 1 — `_ensureFamilyOwnerMigrated()` (one call site, 9 RPCs freed).** A family-profile migration was a precondition of **18** RPCs. It already had a three-level fallback for `displayName` — `human profile → ownerId → "Owner"` — so a node without a human profile had every ingredient it needed; it simply could not get past a **throwing** load. Fixed with `tryLoadHumanProfile()`, which degrades only on `HumanProfileUnavailableError` and still propagates real store failures. The 9 it freed were mostly capabilities with **no social meaning**: `getIpfsEngineStatus`, `getRagIndexStatus`, `testRagEmbedding`, `getNodeConfig`, `runCapabilityProviderWorker`, `runSocialProxyPass`, `getLocalAgentNetworkWorkerCard`, plus two content RPCs.

**Extraction 2 — the owner-id fallback pattern (9 call sites, 4 RPCs freed).** Seven `const human = await this.getHumanProfile()` sites plus two inline `(await this.getHumanProfile())?.ownerId` sites all shared the shape `this._profile?.owner?.ownerId || human?.ownerId`, with an explicit missing-ownerId branch — i.e. they already tolerated an absent profile. They called the **public RPC**, which must throw when no profile exists, and inherited that throw. Replaced with a private `_humanProfileOrUndefined()`. The gallery mutation was deliberately left alone: it genuinely mutates the human profile and must fail without one.

**Not addressed — and now the largest remaining item.** `profileDir` still conditions **29** store creations in the constructor, mixing core stores (trust, peer directory, agent identity) with product ones (family profiles, family rooms, shop, market, commerce, social proxy, agent circles). A product host must still supply a `profileDir`, so **construction is not yet product-free** — the probe addressed the two inputs it named, not this. This belongs with B4 (host/connect) rather than the probe.

**Two by-products of running the probe**
- `ensureDefaultWebSite` and `listFeedPosts` now fail with *domain* errors ("owner identity required") rather than availability errors — they need an **owner identity** (`NodeProfile`, also absent by design), which is a legitimate separate requirement. Reported, not hidden.
- **A pre-existing defect surfaced:** `node-service-impl.ts:9467` calls `require("./bundled-paths.js")` inside an **ESM** module, so `listOpenClawExtensionPlugins` fails with `Cannot find module`. Present at HEAD and unrelated to composability; allow-listed in the probe so it stays visible. `bundled-paths.ts` exists — the defect is the `require`, not a missing file.

---
## 7. Workstream C — npm package rules

*Small — no restructuring expected, because §2.1 shows the layering is already right.*

- Declare each package's public surface (mostly already done via `src/index.ts`).
- Add per-package direction rules to the manifest (§4.2) and the CI check (§4.3).

**`@envoymesh/api` needs an explicit answer (R8).** It is imported by `apps/social`, `apps/envoygo`, and the Tauri shell, and §5's acceptance ("consumers build against the reusable surface") includes it. Today its surface is essentially **all 435 `NodeService` methods**, i.e. the whole product, so it is currently a *product* surface wearing a package name — a consumer cannot import `RpcMethods` without also seeing every social method. Two options:

| Option | Consequence |
|---|---|
| **`NodeService` stays the surface** | Simplest; but "reusable" would be a lie for this package, and Step 5's reuse test could not exclude social method names |
| **Extract a narrower `CoreNodeService`** (+ `CoreRpcMethods`) for the reusable subset, with the full interface extending it | Honest boundary, and it gives the reuse test something to assert against; costs a real interface split of 435 methods |

**Recommendation: extract `CoreNodeService`.** It is also the prerequisite named in §8.8 for ever shrinking `node-service-impl.ts` — the same partition answers both questions. Tracked as **E9** (§10).

---

## 8. Rollout plan

**Linear order across §6.1 and §6.2** (these are the same phase and were previously split across two sections):

```
Step 0  land Phase 68            →  Step 4  node inventory (B1)      →  §6.2 kernel probe (B6)
   →  §6.1 H1–H3 host split      →  H4 (gated on Step 0)            →  Step 6 extraction (B4/B5)
```

H1–H3 may run **before** Step 0 (§6.1 table); H4 may not.

### 8.1 Step 0 — land the in-flight Coding tab *(gate — now satisfied)*
**Status: done.** The Phase 68 work landed across three commits — `ccef35b8` → **`283604ff` (*"Coding Tab"*)** → **`d599d1bb` (*"Refine coding tab"*)**, which is now HEAD. **The working tree is clean.**

**Every figure in this plan reproduces at `d599d1bb`** — verified: `ws-server.ts` 1,119 · `node-service-impl.ts` 18,786 · `json-rpc-router.ts` 1,778 · 507 files / 168,459 lines in `apps/node/src` · 426 `RpcMethods` · 186 Dart files in `apps/envoygo/lib`.

**Nothing is uncommitted, so every step is unblocked — including H4**, which was the last one gated on in-flight work. Note that `d599d1bb` also touched the node runtime: it added 3 RPC methods (`askCodingHarness`, `setCodingHarnessRuntime`, `clearCodingHarnessRuntime`, all coding-gated), a new file (`coding-runtime-store.ts`), and grew `node-service-impl.ts` by 148 lines. **The figures in this plan were re-measured against `d599d1bb` accordingly** — an illustration of why §8.11 pins a revision instead of carrying counts.

### 8.2 Step 1 — classification manifest + completeness check ✅ **done**

No behaviour change. **Implemented artifacts** (E5):

| Artifact | Purpose |
|---|---|
| ✅ `scripts/classify-modules.mjs` | Applies the three conditions of §2.7 over 791 modules and emits the manifest. `--check` fails when the manifest is stale |
| ✅ `scripts/module-boundary.json` | The manifest: 791 modules → 426 `reusable`, 365 `product-bound`, with declared inputs recorded in the header |
| ✅ `scripts/check-module-boundary.mjs` | Rules **1** (direction), **3** (completeness), **4** (concept naming), **5** (a `reusable` library may only export `reusable` modules — added with Step 2). Rule **2** (declared entry points) still deliberately **not** stubbed — an unimplemented rule must not look green |
| ✅ `.github/workflows/ci-module-boundary.yml` | Runs `--check`, the rules, and the seeded tests on every PR — mirrors `ci-module-size.yml` |
| ✅ `scripts/test/module-boundary.test.mjs` | **10 tests**: one seeded violation per implemented rule (plus duplicate-classification, a comment-only concept, the product-bound-library exemption, and the comment-edge regression), **and a positive control** so a checker that fails everything cannot pass |
| ⏳ extend `.github/workflows/ci-node-refactor.yml` | Its existing 13-file "Refactoring regression suite" is the behavioural half; add cases when behaviour changes (E5) |

**Delivered:** the repo can state which modules are reusable; a new file cannot escape classification (classify-in-the-same-PR, enforced in CI); every implemented rule provably fails on a seeded violation.

**Evidence:** `node scripts/classify-modules.mjs --check` → current; `node scripts/check-module-boundary.mjs` → *"module-boundary OK — rules 1, 3, 4 pass over 791 modules"*; `node --test scripts/test/module-boundary.test.mjs` → 7/7 pass.

**Two implementation findings are recorded in §2.7** (a missing condition; concepts being matched in comments) — both were caught by implementing, not by review, and both now have regression tests.

### 8.3 Step 2 — Dart core/social split (Workstream A) ✅ **done**

**Delivered.** `packages/envoy-mesh-dart/lib/envoy_mesh.dart` is now the **reusable** library (13 modules); the 7 product-bound modules moved to the new **`envoy_mesh_social.dart`**. The library's own doc comment no longer says *"EnvoyMesh social-lite SDK"*, and both libraries document the split so an unresolved symbol points a consumer at the right import.

| Verified | Result |
|---|---|
| `envoy_mesh.dart` classified `reusable` by the manifest | ✅ (previously `product-bound` — that was the defect) |
| Every export of the reusable library is `reusable` | ✅ 13/13 |
| `envoy_thin_client` | ✅ 12 modules, **0 product-bound** |
| Consumer imports updated | **24 files** (4 in the package's tests, 20 in EnvoyGo, 4 in `envoy_mesh_libp2p`) |
| Dart analyzer errors | **0** in all three packages (baseline was 0) |
| Dart tests | 49 + 12 + 51 **all pass** |
| Behavior change | none — imports only |

**Enforcement is live: rule 5.** `scripts/check-module-boundary.mjs` now enforces *"a library the manifest calls `reusable` may only export `reusable` modules."* `envoy_mesh.dart` and `envoy_thin_client.dart` are checked; `envoy_mesh_libp2p.dart` and `envoy_mesh_social.dart` are **exempt because the manifest calls them product-bound** — the rule enforces the declared classification rather than inventing one. Three seeded tests cover it, including one for the comment-edge bug below.

**The libp2p surface — done as a follow-up (§8.4).** See below.

**Also not done here — Workstream A's EnvoyGo half (A4–A6, §5)**: the RPC-client surface, the provider split, and the `services/` split. They are app-level work, not SDK work, and remain open.

### 8.4 libp2p follow-up ✅ **done** — and it made the transport reusable

The same defect existed one package over: `envoy_mesh_libp2p.dart` re-exported `phone_discovery_session.dart`, which signs envelopes with `_backend.persona`. Because one library re-exported a persona-using module, the manifest classified the **whole package surface** product-bound — **including `Libp2pNode`, the host itself, which references no social symbol at all.**

**Root cause was a misplaced type, not a real dependency.** `Libp2pNode` needed `PhoneDiscoveryProvider`, declared in `phone_discovery_runtime.dart` — which was product-bound *only* because it imported `models.dart`. And `models.dart` bundled two unrelated things:

| `models.dart` contents | Nature |
|---|---|
| `BondContact`, `MeshChatMessage` | **Social** — a bond record, a chat-room message |
| `MeshPeerHit` + `peerDialable`, `isDirectPeerAddress`, `allAddressesNeedRelayHop` | **The transport's own result type and address logic.** Names no product type; requires no product concept |

**Fix: split `models.dart`** into `mesh_peer_hit.dart` (`reusable`) and `models.dart` (`product-bound`). That single change cascaded:

```
models.dart split
  → phone_discovery_runtime.dart becomes reusable   (E3's recorded refinement, realised)
    → Libp2pNode becomes reusable                   (its only need was PhoneDiscoveryProvider)
      → the env:libp2p library surface becomes reusable
```

**Result — the libp2p host is reusable**, which is what V1 needs for WAN.

| Module | Before | After |
|---|---|---|
| `envoy_mesh_libp2p.dart` (library surface) | product-bound | **reusable** |
| `src/libp2p_node.dart` (**the host**) | product-bound | **reusable** |
| `src/phone_mesh_session.dart` | product-bound | **reusable** |
| `src/seed_store.dart` | reusable | reusable |
| `src/phone_discovery_session.dart` | product-bound | product-bound *(uses `persona` — **semantic**)* |
| `src/libp2p_mesh_envelope_transport.dart` | product-bound | product-bound *(takes `PhoneSocialBackend` — **semantic**)* |
| **package total** | **1 / 5** | **4 / 3** |

`envoy_mesh.dart` gained `mesh_peer_hit.dart` and `phone_discovery_runtime.dart`; the product-bound pair moved to the new **`envoy_mesh_libp2p_social.dart`**, consumed by `social_context_provider.dart`.

**Two couplings survived deliberately, because they are real:** the two remaining product-bound modules cannot be reclassified by moving a type — one needs the persona to sign, the other needs the social backend to route. That distinction (incidental vs semantic) is the useful output of the exercise.

**Verified:** Dart analyzer **0 errors** in all three packages; Dart tests **49 + 12 + 51 pass**; boundary **OK over 795 modules** (435 reusable).

### 8.4.1 Workstream A4 — EnvoyGo RPC client surface ✅ **done**

`apps/envoygo/lib/services/node_service_client.dart` **2,800 → 99 lines**, split into:

| Artifact | Lines | Contents |
|---|---|---|
| `services/home_rpc_session.dart` | 93 | **Reusable** — the transport handle (`homeClient`), generic push-event `on()`, teardown/`dispose()`, and the connection/session RPCs that name no product concept (`getConnectionStatus`, `getNodeConfig`, `updateNodeConfig`, `getPairingPayload`, `updateMyListenAddrs`) |
| `services/rpc_bindings/*.dart` | 86–409 each, 9 files | **Product** — the typed method bindings by concern: `FamilyMarketRpcs`, `ChatRpcs`, `AgentRpcs`, `HarnessRpcs`, `TerminalRpcs`, `PeopleRpcs`, `ContentRpcs`, `ChainRpcs`, `CallRpcs` |
| `services/node_service_client.dart` | 99 | `class NodeServiceClient extends HomeRpcSession with <9 mixins>` + the `call:*` event bridge + `noop()` |

**Mixins, not extensions** — chosen so test subclass overrides (`_StubClient extends NodeServiceClient`) keep virtual dispatch. The public import path and every call site are unchanged.

**Verified independently by the plan's author, not taken on report:**

| Check | Result |
|---|---|
| `dart analyze` | **0 errors** / 228 issues — identical to baseline |
| `flutter test test/{mesh,widgets,providers,services}` | **389 pass / 6 fail** — failure set byte-identical to baseline |
| The 6 failures | **all pre-existing** — 3 × `content_engage_provider_test`, 1 × `node_service_client_test` (sendCallInvite), 2 × `eh_split_diff_test` |

**A figure in this plan was wrong, and A4 exposed it.** §2.6 and §5 A4 claimed the client was "typed against all 426 RPC methods". It is **not**: it wraps **225 distinct RPC methods (230 call sites)**. The 426 is the node-side `RpcMethods` union — a different quantity. Measured here: **201 of the 426 node methods are never called by the client at all.** This is the same unit-conflation that produced four earlier errors (§2.7's correction notes); the lesson is now familiar enough to name: *a count must state the thing it counts.*

### 8.4.2 Workstream A5 + A6 — EnvoyGo providers and services ✅ **done**

**A5 — providers by concern.** A new **connection** layer and a **product** layer:

| Layer | Files |
|---|---|
| `lib/connection/` | `node_connection_provider.dart` (1,966; was `providers/node_provider.dart` 2,038) — home/thin-client connection lifecycle · `phone_mesh_runtime.dart` (433, **extracted**) — libp2p session, WAN/LAN discovery, mDNS lock, foreground policy, retry/self-heal |
| `lib/providers/` | chat 3,514 · call 836 · contact 173 · cross-persona 207 · content-engage 118 · feed-notify 114 · terminal 77 · locale 25 · `social_context_provider.dart` 693 → **294** · `node_provider.dart` → an **11-line re-export shim** so all 47 importers keep working |

**Where the phone-mesh runtime went, and why:** the **connection** side. Its content is transport/session work and it declares no social type of its own; the file that *held* it was named social only because of the Social tab's Home-vs-phone switch — a product concern that stayed behind. **Name and content disagreed; content won.** That mismatch was already a recorded finding (§2.6).

**A6 — `services/` split.** 11 reusable files stay in `lib/services/` (1,142 lines); 18 product-bound files + the 9 `rpc_bindings/` mixins moved to `lib/services/product/` (2,242 + 2,705 lines); 58 files had imports rewired. **Mechanically verified:** the transitive import closure of the 11 reusable files is exactly those 11 — zero product-bound dependency, direct or transitive.

**Verified:** `dart analyze` **0 errors**; the four-directory test set **389 pass / 6 fail** with a byte-identical failure list; plus the two repointed source-pinning tests → **410 pass / 6 fail**. **Regression: none.**

**Plan figures corrected by A5/A6 — and the corrections matter:**
- **`pairing_service`, `envoy_url`, `push_notification_service`, `push_preferences` are product-bound, not reusable.** A5/A6's guessed split was wrong in four places: `pairing_service` binds `familyProfiles` and `profileAvatarColor`; `envoy_url` builds `envoy://contact?…` and feed/gallery surfaces; the push pair route `bond_request`/`feed_notify` and carry `profileId`. Their reusable cores already live in `envoy_thin_client` — the instinct "pairing is reusable" is right about the *capability*, wrong about *these app files*.
- **`coding_ext_sessions` is reusable, not product** — a `SharedPreferences` registry of ext-agent sessions that names no product concept. An E6-style "product UI ≠ product concept" case.
- The call+contact+cross-persona+content-engage+feed-notify total was **1,374**, not 1,373.

**A5 gap ✅ closed — 24 product-bound modules → 0.** The acceptance line *"EnvoyGo's connection layer contains no chat/call/contact/persona type"* **now holds**, verified by transitive import closure over the real import list, not by assertion.

The inversion was done by making the **connection layer publish and the product layer subscribe**:

| Artifact | Layer | Role |
|---|---|---|
| `connection/home_connection_hooks.dart` | connection | the hooks the connection layer publishes; imports only `flutter_riverpod` |
| `connection/phone_mesh_bridge.dart` | connection | the **interface** the runtime calls for transport/session/discovery |
| `providers/phone_mesh_bridge.dart` | **product** | `PhoneSocialMeshBridge` — implements that interface against the live `phoneSocialBackendProvider` |

So the dependency now runs **product → connection**, never the reverse. `node_connection_provider.dart`'s complete import list is: `dart:` builtins, `envoy_mesh_libp2p`, `envoy_thin_client`, `flutter_riverpod`, storage, two connection files, and the hooks — **no product provider**.

**Verified:** EnvoyGo `dart analyze` **0 errors**; `flutter test test/{mesh,widgets,providers,services}` **389 pass / 6 fail — identical to the baseline failure list** (3 × `content_engage_provider`, 1 × `node_service_client` sendCallInvite, 2 × `eh_split_diff`). No behaviour change.

**Two pre-existing conditions recorded so nobody misreads a signal:**
- **14 l10n test failures** across `browser_screen_test` (4), `recent_chains_screen_test` (4), `active_chain_detail_screen_test` (1) and `l10n_coverage_test` (5) make full `flutter test` red today (594 pass / 20 fail). Cause: those tests build screens in a bare `MaterialApp` with no `localizationsDelegates`, and `AppLocalizations.of` ends in `!`. **Not refactor-related**, and the reason the agreed test set excludes those directories.
- `node_service_client_test.dart:426` ("sendCallInvite omits iceServers") is a **stale contract**: the test expects no `callType` param, the code always sends `'callType': 'audio'`. Pre-existing; report-only.

### 8.5 Step 3 — direction + surface enforcement ✅ **done**

**All five rules are now implemented and enforced**, each with its own seeded-violation test (`scripts/test/module-boundary.test.mjs`, **15 tests**):

| Rule | Enforced by | Seeded tests |
|---|---|---|
| 1 Direction | `check-module-boundary.mjs` | 1 |
| **2 Surface** | `check-module-boundary.mjs` | **5** |
| 3 Completeness | `check-module-boundary.mjs` | 2 |
| 4 Concept naming | `check-module-boundary.mjs` | 2 |
| 5 Dart reusable surface | `check-module-boundary.mjs` | 3 |
| — | positive control + the real repo | 2 |

**Rule 2 needed refining during implementation — the plan's wording was wrong.** It said *"a module is imported by deep path instead of its declared entry point"*, which reads as "no subpath imports". But this repo's packages **declare subpath exports as public API** — `@envoymesh/api/chat-room-service`, `@envoymesh/network/protocols`, `@envoymesh/protocol/schemas/emp-0.1/*`. Those are entry points, not deep paths; banning them would have been wrong.

**The rule as implemented:** a `@envoymesh/*` subpath import is a violation only when the package does **not declare** it in its `exports` map (wildcards honoured); for Dart, reaching into another package's `src/` is a violation, since a Dart package's surface is its `lib/<name>.dart` libraries.

Measured state at implementation: **every subpath import owned by this repo is declared.** The one apparent exception, `@envoymesh/envoy-harness-client/ehui`, belongs to the external `envoy-harness` sibling monorepo (built by `build:envoy-harness` from `../envoy-harness`), so this repo cannot see its `exports` map — **rule 2 declines to judge packages it does not own**, which is the honest behaviour and is covered by a seeded test.

**The behavioural half — `ci-node-refactor.yml` extended (E5).** That workflow already existed for exactly this purpose, so it was extended rather than duplicated. Its 13-file refactoring regression suite is joined by the **§6.2 kernel composability probe** as its own step, with a comment explaining that a *growing* `needs-profile` set is new coupling and fails CI. The static half stays in `ci-module-boundary.yml`, mirroring how `ci-module-size.yml` owns the line-count rule.

**Correction — the `NodeService` member count (§8.5, Step 6c).** This document has said **435** members in five places, and the refactor's own comments repeated **423**. Both were wrong: measured on `d599d1bb` (the pinned revision) by two independent parses of `packages/api/src/node-service.ts` — depth-tracked member extraction, and counting two-space member lines inside the interface body — the interface has **436** members, unchanged between HEAD and the working tree, with `RpcMethods` at **426**. The corrected figure is used from here on; the earlier sections' 435s are left as written but should be read as 436. The lesson is the one this document keeps recording: **a hand-copied count is a claim, and nobody re-measures a claim.** The number only matters as the contrast (5 members vs ~436), which is why it was easy to get wrong and easy to miss.

**A sixth rule set joined them later — workspace wiring (Step 6c).** `check-module-boundary.mjs` answers "may this module depend on that one"; it cannot answer "is this package *declared* where it must be". Adding a package needs **seven** edits (see the pnpm note below), and a missing one surfaces as an unrelated compiler error or a silent resolution downgrade. `scripts/check-workspace-wiring.mjs` (rules R1–R6) now covers that, with **35** seeded tests in `scripts/test/gates.test.mjs` and its own workflow, `ci-workspace-wiring.yml` — same shape as the others: a custom script, no new dependency, one concern per workflow. Its first run found five pre-existing wiring bugs.

### 8.6 Step 4 — node inventory + boundary declaration (Workstream B) ✅ **done**

**Boundary — delivered.** All **796** modules are classified by the manifest, including `apps/node/src` (508). The completeness rule makes it impossible for a new file to escape: it must be classified in the same PR, and CI fails otherwise. That is what turned "no declared boundary" (§2.4) into a declared one.

**Surface — delivered as a separate artifact. The design decision mattered.** `scripts/module-surface.json` records the **declared surface** of every `reusable` module: its exported symbol names (417 modules / 3,702 symbols *as measured at this step*; today **422** modules, because the comment stripper was later made string-aware — see Step 6c — and stopped erasing `envoy://` URLs and everything after them).

It is deliberately **not** part of the manifest, and **not gated**:

| | Manifest | Surface |
|---|---|---|
| Contents | classification (reusable / product-bound + tags) | exported symbol names per reusable module |
| Gated by `--check`? | **yes** — a new file must be classified in the same PR | **no** |
| Size | 99 KB | 146 KB |

The first attempt put `surface` inline in the manifest rows. That inflated it to **241 KB and would have failed `--check` on every unrelated export edit** — turning a boundary guard into noise. A guard that fires on unrelated changes gets disabled; so the surface is generated, reviewable, and uploaded as a CI artifact, while the gate keeps watching only what it should. **Verified both ways:** adding an export leaves `--check` passing *and* appears in the surface artifact.

**Ownership — decided, and deliberately minimal.** The plan asks for a "declared owner" per module. An invented owner map would be worse than none, because it looks authoritative — so the first step was the honest one: a `.github/CODEOWNERS` with a **documented catch-all** (`@allenpeng0705`, derived from the remote and 1,244 commits by that author) plus the list of areas a split would use. The repository owner then chose **Option 1 (§8.8 E10): defer the per-area split, with a recorded trigger**. See that section for the options that were weighed and what would reopen the decision.

**One gap the surface work exposed and fixed.** The classifier hardcoded the three Dart package names, so a **new Dart package escaped classification entirely** — discovered when `packages/envoy-reuse-fixture` was added and produced no manifest rows. Both scripts now **discover** Dart packages (any `packages/*` with a `pubspec.yaml` and a `lib/` tree). Without that, the completeness rule was vacuous for Dart.

### 8.7 Step 5 — the reuse test (§4.4) ✅ **done**

**Delivered: `packages/envoy-reuse-fixture`** — a real consumer package built **only** from `reusable` modules, with **9 passing tests**. It imports exactly three libraries and never the social ones:

```
package:envoy_mesh/envoy_mesh.dart          (reusable SDK)
package:envoy_thin_client/envoy_thin_client.dart   (12/12 reusable)
package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart   (reusable transport — the host)
```

**It is a consumer, not a smoke test.** Every assertion is something a non-social product needs: derive a peer identity from a generated key pair (no owner profile, no device certificate), sign and verify through canonical JSON (key order irrelevant, tampering rejected), build and verify an envelope whose JSON contains no product concept, decide dialability from `hasHopSlot` + addresses, parse a pairing URI into transport candidates, map interests onto discovery topics, and round-trip a libp2p seed. If any of it required a bond or a persona, the package would not compile.

**The assertion is mechanical, not rhetorical.** The test scans its own import directives (comment-stripped — see below), rejects the two social libraries and any `package:*/src/*` path, then cross-checks each imported library file against the manifest and fails if it is classified `product-bound`. **If someone re-adds a social export to a reusable library, this fails.**

**A trap it hit, twice — and a lesson worth recording.** The test's first version scanned its own source *raw*, so the doc comment — which explains that the fixture must not import the social libraries — read as a violation. That is the **third** time in this refactor that a comment was mistaken for code:

| Where | Comment misread as |
|---|---|
| `classify-modules.mjs` concept matching | a concept reference (tainted 7 files) |
| `classify-modules.mjs` directive extraction | an import edge (marked the reusable library product-bound) |
| `reuse_test.dart` self-scan | a social import |

The recurring rule: **directives and concepts must be read from comment-stripped text, but string literals must survive directive extraction.** Three independent failures of the same kind is strong evidence the pattern deserves a shared helper rather than three ad-hoc strippers.

**Two smaller bugs the fixture caught, both mine:** `Directory(path).existsSync()` used to test for a *file* (always false, so the repo root was never found), and a wrong expectation about `peerDialable` — a **direct** address is dialable regardless of `hasHopSlot`; the hop slot decides only for circuit-only addresses. The test now encodes the real semantics.

**CI:** a new `reuse-test` job in `ci-module-boundary.yml` (flutter-action, `dart pub get`, `dart analyze --fatal-infos`, `dart test`). It lives there rather than in `ci-flutter.yml` because it is the encapsulation proof, not an EnvoyGo test.

### 8.8 Step 6 — out-of-app extraction (host/connect + harness)
**Explicitly not deferred** (§8.9): the connect/host layer (V1) and the harness layer (V4) have consumers **outside `apps/node`**, so they must become real packages. Ordered last so each extraction moves a boundary that is already declared and already enforced.

**Order within this step:** the kernel-composability probe (§6.2) comes **first** — done, §6.3 — because a product host needs a kernel it can construct. **H1–H3** of the host split (§6.1) follow, then **H4**, then the extraction itself.

**Deliverable:** a separate app can host QR + host:port and run the harness without importing a `product-bound` module — and can construct a kernel with no social input.

#### Progress — H1 ✅, H2 ✅, H3 ✅, H4 ✅ landed; the extraction is scoped and in flight

**The two extractions are not equally ready, and the scoping found out why.**

**Harness layer (V4) — clean.** `apps/node/src/ext-agent-adapter/` is **23 files / 6,662 lines** with **72 internal imports** and only three dependencies leaving the directory:

| Dependency | Also used by | Verdict |
|---|---|---|
| `service-ports.ts` (139) | 10 other `apps/node` files | **shared** — cannot move into the harness |
| `home-fs.ts` (505) | 4 other files | **shared** |
| `mmx-media-slash.ts` (91) | 1 other file | **shared** |

Their transitive closure is **exactly those three files (735 lines)**, so they become a small shared core, `@envoymesh/node-core`, and the harness depends on it. Everything else the harness needs is `@envoymesh/api` (5 type imports), Node builtins, and `@anthropic-ai/claude-agent-sdk`.

**Host/connect layer (V1) — blocked, and the blocker is the router.** Only **6** reusable candidates exist to carry (`ws-host-contract`, `human-profile-availability`, `inbound-guard`, `rpc-error-code`, `service-ports`, `ws-rpc-concurrency`). But `ws-server.ts` imports:

- `@envoymesh/api` — the RPC contract, which currently exports the whole product surface, so the host package would be `product-bound` **via package** (E9's problem);
- `./json-rpc-router.js` — **1,778 lines that contain the product's gating** (`isOwnerOnlyRpcMethod`, `CODING_GATED_RPC`). The host's dispatch path runs through it, so extracting the host today would carry the product's authorisation policy with it;
- `./rpc-caller-context.js` — product-bound (the `AsyncLocalStorage` **mechanism** is reusable; the caller *factories* are policy).

**So a genuinely reusable host package needs the dispatcher injected and the caller-context module split** — the same "inject the policy" move H1 and H2 already made for dispositions and session identity:

| Enabling change | Why |
|---|---|
| `start(nodeService, { dispatch })` | `ws-server.ts` imports the router for **one call site** (`routeRpcMethod`). Injecting it removes the router from the host's dependency graph entirely, exactly as injecting `eventDispositions` removed the social policy |
| Split `rpc-caller-context.ts` | `runWithRpcCaller` + the `RpcCallerContext` type are the reusable *mechanism*; `localOwnerCaller` / `sessionCallerFromToken` are product policy (and H2's resolver already superseded the latter's use in the auth path) |
| E9 (`CoreNodeService`) | The host legitimately needs the RPC *contract*. Until `@envoymesh/api` stops exporting the whole product surface, the package is product-coupled **by design deficit**, not by mistake |

**Status — harness + `node-core` extracted ✅; host extraction still blocked on the three enabling changes above.**

**Landed.** Two real packages now exist and are wired into the monorepo:

| Package | Contents | Standalone typecheck |
|---|---|---|
| `@envoymesh/node-core` | `service-ports.ts`, `home-fs.ts`, `mmx-media-slash.ts` + `index.ts` | **0 errors** |
| `@envoymesh/harness` | the 23 `ext-agent-adapter` files + `pi-runtime.ts` + `index.ts` (**24 files**), with a `./pi-runtime` **subpath export** matching the repo's convention | **0 errors** |

Wiring is complete: `tsconfig.json` project references, `vitest.config.ts` aliases, and `package.json` with real `dependencies` (`@envoymesh/api`, `@envoymesh/vault`, `@envoymesh/node-core`, `mammoth`, `xlsx`, `@anthropic-ai/claude-agent-sdk`).

**The harness is self-contained — measured, not asserted.** Its external imports are `@envoymesh/api` (7 type imports), `@envoymesh/node-core` (3), Node builtins, and `@anthropic-ai/claude-agent-sdk`. **No social package appears.** `apps/node/src/ext-agent-adapter/` is gone; the 12 `ext-agent` tests still live in `apps/node/test` with their imports updated.

**The host/connect extraction did *not* land** at that point, and should not have been claimed as part of "the extraction." It needed the three enabling changes in the table above: injected dispatch, a split caller-context module, and E9. Extracting it then would have carried the product's authorisation policy (the 1,778-line router) into the package. **(Superseded — H5 landed those changes, and the package itself followed: see *Step 6b* below.)**

**How this was verified, and an honest note on process.** Both this extraction and the A5 gap below were executed by background agents that **failed before producing a report** — so every number here was verified independently: `tsc -b packages/node-core packages/harness` = 0 errors; `tsc -b` (monorepo) = the 2 + 4 pre-existing errors only; `npx vitest run apps/node/test` = the 6 pre-existing failures; boundary **OK over 799 modules**. One genuine defect was left behind and fixed: `apps/envoygo/lib/providers/phone_mesh_bridge.dart` was missing its `package:envoy_mesh/envoy_mesh_social.dart` import (1 analyzer error → 0). A failed agent's tree must be verified, never assumed.

**H3 ✅ — the fan-out resolver left the transport.** `resolveChatMessageTargetProfiles` (44 lines) and its **five social thread-key parsers** moved out of `ws-server.ts` into the new **`social-ws-policy.ts`** (classified `product-bound`, correctly — it names family profiles and AI-bot/bridge thread keys).

| | Before | After |
|---|---|---|
| `ws-server.ts` | 1,119 lines | **1,071** |
| §6.1 acceptance symbols reachable from `ws-server.ts` | 11 of 11 | **6 of 11** |
| eliminated | — | `parseFamilyThreadKey`, `parseAiBotThreadKey`, `parseBridgeThreadKey`, `parseEnvoyAiProfileId`, `isEnvoyAiThreadKey` |

Verified: `ws-chat-profile-routing.test.ts` **6/6** (import repointed), typecheck unchanged at the 2 pre-existing errors, boundary **OK over 797 modules**.

**H1 — event dispositions as data.** Replace the 36 hand-wired `on(…)` call sites with a declared table. **The model needs one case beyond §6.1's sketch:** the chat special cases *rename* events and *reshape* payloads (`chat:family-room-*` → `chat:room-*` with `kind: "family"`), which `broadcast` / `ownerOnly` / `byProfile` cannot express. So the type gains `custom`, carrying a handler that receives a small delivery API (`emitEvent`, `emitEventToProfile`). The social dispositions — the `chat:room-*` owner-only rule and the six hardcoded `OWNER_FAMILY_PROFILE_ID` routes — move beside `social-ws-policy.ts`.

**H1 ✅ — event dispositions are data, and the host no longer knows the product.**

| | Before | After |
|---|---|---|
| `ws-server.ts` | 1,119 lines | **983** |
| Hand-wired `on(…)` call sites | 36 (covering 45 events) | **1 loop** over a merged table |
| Wiring lines replaced | 132 | 38 |
| §6.1 acceptance symbols reachable | 11 of 11 | **6 of 11** |

Two modules were added:

| Module | Classification | Contents |
|---|---|---|
| `ws-host-contract.ts` | **reusable** | the `EventDisposition` type, the 25-entry **core** table, `mergeEventDispositions`, `dispatchEvent`, and the delivery/handler contracts |
| `social-ws-policy.ts` | `product-bound` | the 20-entry **social** table (H3 had already put the fan-out resolver here) |

**The classification result is the point:** the contract is `reusable` and the policy is `product-bound`, so the host's extension points are separable from the product's routing rules. That is what H1 was for.

**The disposition model needed two changes from §6.1's sketch, both found by meeting the real wiring:**

1. **`ownerOnly` was removed, not implemented.** "Only the owner profile" *names the family-profile model* — the host cannot contain it. The social table expresses owner-only as `byProfile` with a resolver returning the owner id, so the concept stays in the policy that owns it. Verified by a test asserting the core table's serialised form contains no `owner`/`profile`/`chat`/`bond`/`family` token.
2. **`custom` was added** for audience *plus transformation*: `chat:family-room-updated` renames onto `chat:room-updated`, and `chat:family-room-message` reshapes its payload with `kind: "family"`. `byProfile` cannot express that, and it does not belong in the host.

**The misspelling guard is load-bearing.** A disposition table is data, so a typo is not a compile error — and without a guard a misspelled event would silently drop, making the "no `chat:*` delivered" assertion pass for the wrong reason. `dispatchEvent` therefore **warns in non-production** and returns `false` for: an unregistered event, a disposition naming an unknown handler, and an empty audience. Three tests cover exactly those.

**The core vocabulary is declared locally, deliberately.** Typing it as `keyof NodeServiceEvents` would be available, but importing `@envoymesh/api` classifies a module `product-bound` today (E9) — and this contract exists to be part of the *reusable* host layer. A local list keeps it dependency-free; the drift risk is closed by a test that parses the `NodeServiceEvents` interface and fails if a core event name is not a real one.

**Behavioural acceptance — 14 tests** (`ws-event-dispositions.test.ts`): the mechanism (broadcast, audience routing, empty-audience drop, custom rename/reshape, host delegation), the three guards, the two tables' sizes and disjointness, the inherited routing rules, and the requirement itself — **a host built with core dispositions only delivers no `chat:*`, `bond:*`, `home:*`, `agent:*`, `hello:*` or `profile:updated` event, and reports every one of them as dropped.**

**A regression I introduced and caught.** The 132-line block I replaced contained the `callManager.onCallEvent(…)` wiring, which is *not* in the disposition tables (it is H4's target). Dropping it would have silently stopped call events reaching clients, with **no test covering it**. Restored explicitly, marked as H4's target. Found because the full `apps/node` suite was run and compared against a stashed baseline.

**Baseline discipline on that suite.** `apps/node/test` gives **7 failures / 5 files**, and they are **all pre-existing** — verified by stashing only my three files and re-running each in isolation: `chain-decomposer` 1, `ext-agent-supervised-hermes` 2, `ext-agent-supervised-openhuman` 2, `pairing-payload` 1 (6 deterministic), plus `node-service-reachability`'s intermittent `ENOTEMPTY` temp-dir `rmdir` under parallel load. **No regression from H1.** The hermes/openhuman/pairing-payload failures were *not* in the previously recorded baseline set — running them at the stashed baseline confirmed they fail there too.

**H2 ✅ — the session-identity port. The host no longer needs the product's identity model.**

The auth path used to do the product's work itself: look the token up, query the **family profile store** to decide `isOwnerProfile`, **repair** a corrupted binding, and track presence — through `as any` / `as NodeServiceImpl` casts, because none of those members are on the `NodeService` interface. It could not answer *"who is this?"* without the family-profile model.

| | Before | After |
|---|---|---|
| §6.1 acceptance symbols reachable from `ws-server.ts` | 11 of 11 | **2 of 11** — only `callManager` (H4's target) and `NodeServiceImpl` |
| eliminated by H2 | — | `OWNER_FAMILY_PROFILE_ID`, `listFamilyProfiles`, `healSessionProfileFromBinding`, `touchFamilyProfileLastSeen` |

`SessionIdentityResolver<TCaller>` lives in **`ws-host-contract.ts`** (classified `reusable`) and is deliberately **generic over the caller context**: the host carries the product's `RpcCallerContext` **opaquely** — passing it to `runWithRpcCaller` and never inspecting it — so the contract needs no import of the product's caller module. A test asserts that a resolver **with no profile model at all** satisfies the port.

Two things the port had to express, both discovered by doing it:

- **`localScopeKey`.** The host needs a scope key for *untokened loopback clients* to keep routing them, but must not know which key that is. The product supplies it through the resolver. This replaced the two `OWNER_FAMILY_PROFILE_ID` uses inside `emitEventToProfile`.
- **`start()` now throws without a resolver.** A host with no resolver cannot authenticate any client, and untokened clients would silently receive nothing. Failing loudly at startup beats degrading quietly; the single call site passes `createSocialSessionIdentityResolver(nodeService)` and the error names it.

**The manifest caught the progress, unprompted.** `--check` failed after H2 with `ws-server.ts`: previously product-bound because it *named the concept* `OWNER_FAMILY_PROFILE_ID`, now product-bound only *via the package* `@envoymesh/api`. That is the classify-in-the-same-PR contract working as designed — the committed manifest no longer described the tree.

**Behavioural acceptance — 10 tests** (`ws-session-identity.test.ts`): a concept-free resolver satisfies the port; the product resolver's null cases, legacy-token→owner scope, family-store `isOwnerScope`, thrown-store fallback, `boundFamilyProfileId` preference when `profileId` was corrupted, healing fired — and **not** fired for a legitimate owner token — presence keyed by scope, and the local scope key.

**A bug the test caught in my own resolver.** `noteSessionActivity` wrapped the presence hook in `Promise.resolve(...).catch(...)`, which does **not** catch a *synchronous* throw — so a throwing hook escaped into the RPC path. Guarded with `try`. Not defensive noise: the test fails without it.

**No regression.** `apps/node/test`: **7 failures, all pre-existing** — the identical set verified by stashing before H1 (chain-decomposer 1, hermes 2, openhuman 2, pairing-payload 1, plus the intermittent `node-service-reachability` ENOTEMPTY flake) — with the passed count rising by exactly the new tests (5,182 → 5,196 → 5,206).

**H4 ✅ — no RPC-contract edit was needed after all.** The plan assumed `callManager`'s events had to be moved onto `NodeServiceEvents`. They did not: **`onCallEvent` is already a typed channel on the `NodeService` interface** — only the implementation *field* it delegates to is impl-only. The host was bypassing a typed channel that already existed, which is why the line needed a cast to the concrete class.

| | Before | After |
|---|---|---|
| §6.1 acceptance symbols reachable | 11 of 11 | **0 of 11** |
| Service casts (`as any` / `as NodeServiceImpl`) | 12 | **0** |
| `ws-server.ts` | 1,119 lines | **~1,010** |

Three separate rough edges were cleared, each for its own reason:

1. **The call-event channel.** `nodeService.onCallEvent(…)` instead of reaching into the impl field. Kept as an explicit line rather than folded into the disposition table, because the client event *name* is `event.type` — chosen per-event by the payload — so it is not a static disposition.
2. **Two members that only *looked* impl-only.** `getNodeStatus` and `getConnectionStatus` are both on `NodeService`, so that cast was unnecessary. `mayFamilyProfileUseExtAgent` genuinely is not, so it is narrowed **structurally** rather than cast to the 18k-line class — the pattern H2 used for the session resolver.
3. **The socket casts.** The last nine `(ws as any)` were heartbeat/auth bookkeeping on the WebSocket. A `HostSocketState` interface plus one `hostState(ws)` helper removed them; that was readability, not boundary.

**A fail-open bug I nearly shipped.** To satisfy the optional structural member I first wrote `(await ns.mayFamilyProfileUseExtAgent?.(…)) ?? true`. That is a **permission gate**: `?? true` would GRANT bridge access precisely when the check was unavailable. Made the member required instead, so a missing implementation throws — fail-closed, matching the previous behaviour exactly.

**A completion gap my own test caught.** `ws-server.ts` was still *importing* `SOCIAL_EVENT_DISPOSITIONS`, so the host could not be packaged without a product module. The tables are now **injected**: `start(nodeService, { sessionIdentity, eventDispositions })`, with `index.ts` as the composition root supplying the product's. The host merges the product table with its own vocabulary and imports only `ws-host-contract.js`.

**The static acceptance is now mechanised** (`ws-host-boundary.test.ts`, 15 tests) rather than a documented grep — because a grep over the file **counts comments**, which flagged this refactor's own explanatory prose four times (§2.7's notes). The test strips comments, asserts none of the 11 symbols appears in code, asserts no service import and no service cast, and — guarding the guard — asserts the scan is not vacuous. It also checks the positive side: the host's extension points come from the **reusable** contract.

**Verified:** `apps/node/test` — **7 failures, all pre-existing**, passed count up by exactly the new tests (5,182 → 5,221). Boundary **OK over 798 modules**. `ws-server.ts` is now product-bound **only via the `@envoymesh/api` package** — it no longer *names* a product concept, which the manifest shows as the concept count dropping 24 → 23.

**Each sub-item must satisfy the §6.1 two-layer acceptance** — the static symbol check (all 11 to zero) *plus* the five behavioural assertions, including that a chat event on a social-free host is **silently undeliverable** rather than crashing, and that a misspelled disposition key is caught by the debug warning instead of passing for the wrong reason.

#### H5 ✅ — the narrow host node surface, and the three enabling changes §8.8 named

§8.8 recorded that the extraction "needs the three enabling changes" and stopped there. All three are landed, and the first two turned out to be smaller than the third — which was **not one change but four coupled ones**, or rather one claim ("the transport depends on the product") that had **five** separate causes.

**Enabling change 1 — injected dispatch.** `HostRpcDispatcher<TCaller>` in the contract; `start()` takes `dispatch`, and `routeToNodeService` is one line: `this._dispatch(method, params, session)`. That removed three imports from the transport — the 1,778-line `json-rpc-router`, the caller-context mechanism, and the product's `localOwnerCaller` factory — so the host no longer holds the product's **authorisation policy** in its dependency graph. `index.ts` supplies the one-liner that composes them. *The `method: RpcMethods` annotation came off with it: the router already took `string`, so the cast was never needed.*

**Enabling change 2 — the caller-context split.** `caller-context.ts` (44 lines) is the mechanism: a product-neutral `createCallerContextStore<TCaller>()` wrapping `AsyncLocalStorage`, with `run` / `get` / `runOptional`. `rpc-caller-context.ts` keeps the *policy*: `RpcCallerContext`, the owner and family-profile rules, `sessionCallerFromToken`, `requireOwnerProfile`, `redactNodeConfigForCaller`, `stampConfigCallerForSession`. All 25 existing import sites are unchanged, because the policy module **composes** the store rather than exposing it.

**Enabling change 3 — and this is where the measurement mattered.** "The host needs a handful of members, not 423" was the stated shape (the real figure is 435 methods / **436** members — see the correction below). Making it true exposed five distinct dependencies, each invisible until the previous one was removed:

| # | What the transport reached for | Removed by |
|---|---|---|
| 1 | `NodeService` — the product's whole RPC surface | `HostNodeService`: **5 members** (`on`, `onCallEvent`, `getNodeStatus`, `getConnectionStatus`, `noteClientActivity` — the list is the count; the number was written by hand in four files and drifted when `getNodeConfig` was removed) |
| 2 | `@envoymesh/api` — for four 4-line **wire types** | moved to `packages/protocol/src/json-rpc-wire.ts`; `api/ws-protocol` **re-exports** them, so no importer changed |
| 3 | `@envoymesh/node-core` — for two **constants** | `HOST_WS_BIND_HOST` declared in the contract (equality with `SOCIAL_WS_BIND_HOST` asserted by a test); the terminal port is supplied by the composition root |
| 4 | `stampConfigCallerForSession` + a cast to `mayFamilyProfileUseExtAgent` | the **`transformForSession`** port: `social-session-delivery.ts` holds the product's delivery rules |
| 5 | six inline `if (method === "homeClawCoreWs…")` blocks proxying two product sockets | the **`socketMethods`** port: `social-socket-methods.ts` |

Plus one datum: the two pre-auth exemptions (`pairThinClient`, `previewFamilyInvite`) became a `preAuthMethods` list — *data, not code* — so the host no longer knows that `previewFamilyInvite` names a family invite.

**Why each of the five mattered.** Fixing only #1 left the module `product-bound via @envoymesh/api`. Fixing #2 left it `via @envoymesh/node-core` — and node-core is product-bound because it re-exports `home-fs`, which depends on `api`, so #2's fix alone bought nothing observable. Fixing #3 left it `viaDependency`: the *relative* import of `rpc-caller-context.js`, whose caller type and stamping rule the transport was still using. Each fix was necessary and none was sufficient; the manifest's taint **reason** (`concept` / `viaPackage` / `viaDependency`) is what made the next one findable — and it is worth saying plainly that **#4 was not in §8.8's list of three at all.**

**Result — the transport is classifiable `reusable`, which was the gate.** `apps/node/src/ws-server.ts`: 1,119 → 1,034 → **986 lines**, importing exactly one `@envoymesh/*` package (`protocol`) and no tainted relative module. It is **1,044** after the move: the extraction *added* the `WsServerOptions` interface and the port documentation, and the review round after it added the fail-closed branch in `emitToSubscribers`. A move never changes a file, so any figure that looks like one should be explained — a review caught this and the three line counts above. Manifest at that point: **804 modules — 439 reusable / 365 product-bound** — **superseded**: that count still included committed declaration files, and the current, gated figure is **799 modules — 437 reusable / 362 product-bound** (`node scripts/classify-modules.mjs --check`; §6d). The new reusable set contained `ws-server.ts`, `ws-host-contract.ts` and `caller-context.ts`.

**Where the product's work went — four product-bound modules, by design.**

| Module | Lines | Holds |
|---|---|---|
| `host-node-adapter.ts` | 41 | the `NodeService` → `HostNodeService` bridge, including the `recordOwnerActivity` rename |
| `social-session-delivery.ts` | 94 | config stamping + capability masking, and the injected capability gate |
| `social-socket-methods.ts` | 147 | the OpenClaw-core and terminal-PTY proxies, plus their `closed` cleanup |
| `rpc-caller-context.ts` | 183 | unchanged policy, now composing the generic store |

**Two design decisions worth recording, because both were temptations to cut a corner.**

- **`SocketMethodPort.closed` is typed optional but is not optional in spirit.** Moving the two proxies behind a port without it would have leaked a proxy per disconnect — the transport used to call both `…ForCompanion(ws)` cleanups itself. The port groups `handle` and `closed` deliberately, so the pair cannot be separated by accident.
- **The capability gate is injected, not reached for.** It began as a `maySessionReceiveEnabled` member *on the node surface*; that was wrong twice over — it is a delivery question, not a node question, and it left the policy untestable without standing up an 18k-line node. `createSocialSessionDelivery(gate)` is now a pure function, and the single `instanceof NodeServiceImpl` lives in the exported `nodeMayUseExtAgent`, i.e. at the composition root (§2.5 (c)).

**H4's fail-open lesson was applied rather than repeated.** `nodeMayUseExtAgent` answers `false` for a node that is not the product's implementation, and the delivery transform answers *masked* when its gate throws. Both directions are asserted — *including* that the owner path does **not** consult the gate at all.

**Behaviour preservation, asserted branch by branch.** The old `bridge:status` masking and `home:config-updated` stamping had five branches between them (not-enabled → pass through; enabled + owner → pass through; enabled + member + denied → mask; gate throws → mask; no `config` key → pass through). All five are pinned in `social-session-delivery.test.ts`. The one observable edge case — a session-less socket receiving a payload with keys besides `config` — was checked against the emitters **first**: all four emit `{ config }` and nothing else, so the simplification is unobservable.

**A fifth instance of the substring-collision error, caught by the new test's own first run.** My static check used `expect(code).not.toContain("NodeService")`, and `ws-server.ts` legitimately contains **`HostNodeService`**. The check now uses `\b…\b` for identifiers and a separate prefix list for the `homeClawCoreWs*` / `homeTerminalWs*` families — the same mistake §2.7 records in a patch script, this time found by the assertion rather than by review.

**Behavioural acceptance — 39 new tests.** `ws-narrow-node-surface.test.ts` (7): a node with only the six declared members satisfies the port; the `@envoymesh/*` import set is exactly `["@envoymesh/protocol"]`; none of 16 symbols appears as an identifier; the manifest classifies the transport `reusable`; the two bind-host constants agree; a host with **no** product ports starts and subscribes to exactly the 25 core events; a host with no identity resolver still throws. `caller-context.test.ts` (11): nesting, `await` propagation, concurrent branches, store isolation, `runOptional`, rejection propagation, plus a no-product-concept scan. `social-session-delivery.test.ts` (10): the five branches above, three masking cases, and the fail-closed node gate.

**`ws-host-wiring.test.ts` (11) is the part the static tests cannot cover — that the ports are called at the right *moment*.** Driving the real `handleConnection` / `handleMessage` with a fake socket pins the ordering **auth gate → socket methods → dispatch**, with `on`/`off` absorbed before all of it: the dispatcher receives the resolved session (and passes the caller opaquely); an untokened client's RPC arrives with no session; a bad-token client is refused `UNAUTHORIZED` without dispatching — **except** for exactly the methods the product listed, and refused for one it did not; a socket method that answers stops the dispatcher while one that declines falls through; the port receives the connection, method, params, session and a reply surface; and closing the connection calls `closed`, which is the anti-leak assertion. Its first run failed 7 of 11 assertions on one mistake worth recording: `handleConnection` pushes a `connected` event *before* any reply, so "frame `[0]`" is not "response `[0]`" — hence the `responses()` helper filtering by `id`.

**A flake taxonomy, measured rather than waved away.** Over six full-suite runs: the **deterministic** pre-existing set is 5 (chain-decomposer 1, hermes 2, openhuman 2); each run then shows 1–2 of an **intermittent** `ENOTEMPTY: rmdir` family that rotates between `pairing-payload`, `node-service-reachability` and `chain-reconcile-inbound-creator` — all three are temp-dir cleanup under parallel load, and the third has both source and test **byte-identical to HEAD** (checked with `git status`), so it cannot be mine. Two runs also reported `Errors 1 error` in the summary; the two runs captured with the default reporter contain no unhandled-error block anywhere, and no run reproduced it when the dot reporter's full log was kept. **Verified:** `apps/node/test` — **6 failures, exactly the pre-existing set**, on a frozen-tree run; passed count 5,233 → **5,261**, up by exactly the 39 new tests. `tsc -b` monorepo at the **6 pre-existing** errors. Manifest **current over 804 modules**, boundary rules 1–5 OK, 15 seeded tests pass. `packages/{protocol,api,node-core,harness}` — 1,130 pass. `apps/social` — 5 failures, **proven pre-existing by re-running the same three files in a `HEAD` worktree** (4 failures there too).

**What this unblocks, and what it does not.** `ws-server.ts` + `ws-host-contract.ts` + `caller-context.ts` (with `ws-rpc-concurrency.ts`, `rpc-error-code.ts` and the host-state helper) can now move into a host/connect package without carrying product policy — that move is the next step. One gate remains, recorded rather than hidden: **`@envoymesh/node-core` is product-bound because it re-exports `home-fs` → `@envoymesh/api`, so no host module may import it** until that package is split (`service-ports.ts` is clean; `home-fs.ts` and `mmx-media-slash.ts` are not).

#### Step 6b ✅ — the host/connect package landed

**`@envoymesh/host-connect`** at `packages/host-connect/`. The extraction §8.8 had been waiting for since the beginning, now that H5 removed the five product couplings that made it impossible.

| File | Lines | Origin |
|---|---|---|
| `src/ws-server.ts` | 1,044 | moved from `apps/node/src` |
| `src/ws-host-contract.ts` | 512 | moved |
| `src/caller-context.ts` | 44 | moved (the generic store; H5) |
| `src/rpc-error-code.ts` | 38 | moved (wire error-code catalog) |
| `src/index.ts` | 74 | **new** — the single declared entry point (rule 2) |

**The package declares exactly two runtime dependencies: `@envoymesh/protocol` and `ws`.** That is the whole claim of §8.8, and it is now a test rather than a hope — `packages/host-connect/test/package-surface.test.ts` asserts the dependency list, asserts no module imports `@envoymesh/api` **or** `@envoymesh/node-core`, asserts every import is a Node builtin / those two deps / a sibling, asserts the manifest classifies every module here `reusable`, and — in the other direction — asserts the product's caller model (`RpcCallerContext`, `localOwnerCaller`, `sessionCallerFromToken`, `stampConfigCallerForSession`, …) is **not** exported. It lives with the package rather than with the app on purpose: an app-side test would still pass if someone later added a product import *here*.

**A fifth module did not move, and that was the interesting decision.** `ws-rpc-concurrency.ts` held 30 **product method names** (`sendChat`, `shareFile`, `runSocialProxyPass`, …) — a count that was written as 31 for a while and is now taken from the Set itself, which is the only place it was ever true. It is `reusable` by the classifier's letters — string literals are not identifiers — but shipping it would have put "this product's chat methods" inside the reusable host, which is the §2.5 leak H1 removed for events. So the **mechanism is injected, the data stayed with the product**:

```ts
shouldSerializeMethod?: (method: string) => boolean   // WsServerOptions
```

`apps/node` keeps the list and passes `isSerializedWsRpcMethod`; a new product passes its own predicate or nothing (concurrent by default). Exactly the disposition-table arrangement, applied to a list of method names.

**`WsServerOptions<TCaller>` is now a named export.** The seven-field object literal that had grown inside `start()`'s signature became its own type, so a product can type its composition root without importing the server module — and so the options surface is reviewable in one place, with each optional field's **strict** default written next to it.

**Wiring, all seven places a package needs (a checklist worth keeping):** root `package.json` `workspaces`; root `tsconfig.json` `references`; **the consuming project's** `references`; `tsconfig.base.json` `paths`; `vitest.config.ts` alias; a `dependencies` entry in the consumer's `package.json`; and — see R6 below — `pnpm-workspace.yaml` `packages`.

**Two failures this step produced, both instructive.**

1. **`TS6059` / `TS6307` — "not under rootDir" for every moved file.** The base-config `paths` mapping resolves `@envoymesh/host-connect` to *source*, and a project reference is what tells TypeScript to treat those files as the referenced project's output. `apps/node/tsconfig.json` listed `node-core` and `harness` but not the new package, so `apps/node` tried to own `packages/host-connect/src`. **A new package is not wired until every consumer references it** — the root reference alone is not enough.
2. **Build output emitted *beside* the sources.** `packages/host-connect/src/*.js` and `*.d.ts` appeared, and the classifier immediately counted **5 phantom modules** (810 instead of 805). Cleaned, then rebuilt from a cold start: `dist/src/…` only, no recurrence. Recorded because the symptom was *not* a compile error — it was a **wrong module count in the gate's own artifact**, which is exactly the kind of thing that would have been waved through as "the manifest is bigger now".

**A stale allowlist entry nearly became a silent hole.** `scripts/module-size-allowlist.json` listed `apps/node/src/ws-server.ts`; after the move that entry protected nothing, while `packages/host-connect/src/ws-server.ts` (over the 800 hard cap) was not mere-warned but *fail*-eligible the moment a scanner covered it. The entry now follows the file, and both workflows that run the size check (`ci-module-size`, `ci-node-hermetic`) now scan `packages/host-connect/src` as well. **A path-keyed allowlist is a silent failure mode under a file move.**

**Verified:** `tsc -b` (monorepo) = the **6 pre-existing** errors only; `tsc -b packages/host-connect` = **0**. Manifest **over 805 modules — 440 reusable / 365 product-bound** at the time of the move — **superseded** (that count included committed declaration files; the gated figure today is 799 / 437 / 362, §6d), with every `packages/host-connect/src/*` module `reusable`. Boundary rules 1–5 OK; 15 seeded tests pass. The 10 host test files: **93 pass** (an earlier figure of 95 was wrong). The package's own boundary suite: **8 pass** (an earlier figure of 7 was wrong). `apps/node/test`: the pre-existing failure set only. Module-size: warnings only, no failures.

**What is still open, named rather than implied.** (a) `apps/node/package.json` declares `@envoymesh/host-connect` but **not** `@envoymesh/node-core` or `@envoymesh/harness`, which it also imports — works today only by workspace hoisting, and should be fixed with a lock refresh. (b) `node-core` is still product-bound through `home-fs` → `@envoymesh/api`; splitting it would let a host module use `service-ports.ts`, which is clean. (c) The plan's §6.2 probe limitation is unchanged and still the largest remaining item: `profileDir` conditions **29** store creations, so a product host still needs a profile directory to construct a kernel. (d) `@envoymesh/host-connect` is deliberately **not** in the classifier's declared core set yet — adding it would let a `reusable` module import the host layer, which no module needs today.

#### Step 6c ✅ — the three near-misses, mechanised (and a 7-module measurement error they exposed)

Three failures during Step 6b were **not** extraction bugs. They were gates that could not see what had gone wrong, or that reported something that had not: a missing project reference, build output counted as modules, and an allowlist entry that had silently become void. Each is now a rule with a seeded test, following §4.3's principle that *a rule which cannot fail looks exactly like a rule with nothing to catch*.

**Near-miss 1 — "a package is not wired until every consumer references it" → `scripts/check-workspace-wiring.mjs` + `ci-workspace-wiring.yml`.** Adding a package needs edits in **seven** places (see the pnpm note below), and missing one produces a *different* error rather than a clear one. The gate encodes all six rules:

| Rule | Enforces | Symptom when missing |
|---|---|---|
| **R1** | imported `@envoymesh/X` is declared — `dependencies` when imported from `src`, `devDependencies` allowed for test-only | resolves by workspace hoisting; missing in a production install or bundle |
| **R2** | an **emitting** project (`composite`, not `noEmit`) references every package its `src` imports | `TS6059`/`TS6307` on every file the consumer imports |
| **R3** | every `packages/*` workspace is in the root `tsconfig.json` references | `tsc -b` at the root never builds it |
| **R4** | every `packages/*` workspace has a `tsconfig.base.json` path and a `vitest.config.ts` alias | source resolution silently degrades to built output |
| **R5** | no compiler output inside a `src` tree | the classifier counts artifacts as modules; stale output shadows source in tests |

**A seventh place the gate itself was missing — found by reviewing the gate, not by the gate.** The refactor's own summary said "adding a package needs six edits". It needs **seven**: this repo also carries `pnpm-workspace.yaml`, and its own header says pnpm 10 **ignores** the root `package.json` `workspaces` field, so `packages:` there is a second source of truth. Verified state: **`packages/host-connect`, `packages/harness` and `packages/node-core` were all absent from the pnpm list** (the first is this change's, the other two are the earlier extraction's), so `pnpm install` at the repo root could not see any of them while npm could. All three are now listed, the two lists agree (28 directories each), and **rule R6** in `check-workspace-wiring.mjs` fails when they diverge in either direction, with three seeded tests.

Two related facts worth carrying forward rather than rediscovering: `npm install --package-lock-only` **also rewrites `yarn.lock`** (measured: the file's hash changes on every run), and the root **`pnpm-lock.yaml` is untouched by it** — it is from 2026-08-27 and knows 16 importers, missing `harness`, `node-core`, `host-connect` and `openclaw-runtime`. That is **latent, not CI-breaking**: every root CI job runs `npm install`, and the two `pnpm install --frozen-lockfile` invocations in CI run inside `packages/openclaw`, which has its own `pnpm-lock.yaml`. Refreshing the root pnpm lock is recorded as an open item rather than done blind here.

**It found five real wiring bugs on its first clean run**, all pre-existing: `apps/node` imported `@envoymesh/node-core` and `@envoymesh/harness` without declaring either; `apps/relay` and `apps/social` imported `@envoymesh/protocol` undeclared; `packages/openclaw-runtime` was a workspace with a composite tsconfig and **no** root reference, **no** `paths` entry and **no** vitest alias. All are fixed. R2's two bounds are deliberate and were learnt from the repo: a `noEmit` app never emits into `rootDir` (that is `apps/social`, which legitimately references only `packages/api`), and a test file usually sits outside the project's `include` — over-applying R2 there would demand a **circular** reference, since `packages/protocol`'s test cross-checks against `@envoymesh/identity`, which already depends on `protocol`.

**Near-miss 2 — build output counted as modules.** The root cause was one character class: `name.endsWith(".ts")` is **also true of `foo.d.ts`**. So a stray `tsc` emission into `src/` was counted as modules, and the manifest grew by five phantom entries with no compile error anywhere — the gate's own artifact was wrong by a number the CI gate then compared against. The predicate is now shared (`scripts/lib/source-files.mjs`) and both the classifier and the completeness rule use it, because they compare their file lists **against each other**.

**Then the same fix found a seven-module measurement error that predates this work.** The module universe had been counting declaration files all along. Of the seven: **four were committed compiler output** (`packages/models/src/index.d.ts` + `semantic-firewall.d.ts`, `packages/openclaw-runtime/src/{index,tool-bridge}.d.ts`, plus their `.js`, `.js.map` and `.d.ts.map` — 14 files, since deleted), and **three are hand-written ambient shims** (`packages/vault/src/{ppt-to-text,word-extractor}.d.ts`, `openclaw-runtime/src/openclaw.d.ts`) that are not importable modules at all. Corrected universe: **798 modules — 433 reusable / 365 product-bound**. The previous "440 reusable" included seven files that are not modules.

**Near-miss 3 — a path-keyed allowlist is void after a file move.** `scripts/module-size-allowlist.json` kept passing while protecting a path that no longer existed, and the file at its new path was one scanner away from failing the hard cap. A dead entry is now an **error**; an entry whose file is under the cap is a **warning** (the rule's own words: "removing an allowlist entry is a good sign"). Both behaviours are seeded.

**A fourth finding fell out of deleting the committed output: a test that had been passing against a ghost for nearly three months.** With `packages/openclaw-runtime/src/index.js` gone, `packages/openclaw-runtime/test/index.test.ts` began importing the **source** — and two assertions failed. The evidence is unambiguous: commit `a3bc457a` ("fix bugs", 2026-06-05) added the test *and* a compiled `src/index.js` in the same commit; the `.js` implemented `isReady() { return this.ready && this.process !== null && !this.process.killed }` while the `.ts` beside it had already moved to bridge mode — `isReady() { return true }`, documented as "always ready (HTTP-based, no child process)". Because the test imports `../src/index.js`, Vite resolved the **artifact**, so the assertions kept checking behaviour that no longer existed in source. The source is authoritative (that is what `dist` is built from), so the two expectations were corrected with the reasoning recorded in the test file. (`a3bc457a` is dated 2026-06-05 and the correction landed 2026-09-12 — "nearly three months", not the "two months" this document first said.) **R5 exists precisely so this cannot recur** — this is what build output in `src/` costs.

**The sixth occurrence of the comment-vs-code class, this time in a brand-new gate.** `check-workspace-wiring.mjs`'s first run reported **26** failures; **20** were doc comments — `{@link import("@envoymesh/api")}` is not a dependency. Rather than patch the new script locally, the two variants finally became shared helpers (`stripComments` keeps strings for **directive** scanning; `stripCommentsAndStrings` blanks them for **identifier** scanning), and `classify-modules.mjs` and `check-module-boundary.mjs` now use the same implementations instead of their own copies. The helper documents all six failures, because this is the lesson that keeps being re-learnt.

**Verified:** every gate green — manifest **current over 798 modules**; boundary rules 1–5 OK over the same 798; **15** boundary seeded tests and **19** new gate seeded tests pass; `workspace-wiring OK` across **23** workspaces; module-size warnings only. `tsc -b` = the **6 pre-existing** errors. `apps/node/test` + `packages/host-connect/test`: **6 failures — the pre-existing set** (chain-decomposer 1, hermes 2, openhuman 2, and `pairing-payload`'s `ENOTEMPTY` flake), **5,268 passed**. Package suites: **1,430 passed**, after the two openclaw-runtime assertions above were corrected. `apps/social`: the same 5 pre-existing failures, unchanged.

**Where the three open items now stand — all three closed**

- **(a) done, including the lock.** `apps/node` declares `node-core` and `harness`; `apps/relay` and `apps/social` declare `protocol`; `openclaw-runtime` is wired in all three root places. `npm install --package-lock-only` refreshed the lock: **+56 lines, 12 changed entries** — **three** workspace packages that were missing from it (`packages/harness`, `packages/node-core`, `packages/host-connect`; `protocol` was already present and merely gained the two new declarations) plus the newly declared deps, and no version churn. Two of the twelve are unrelated pre-existing devDependency drift (`protocol` and `mobile-identity` gaining `@envoymesh/identity` as a devDep — which is what R1 required). **The same command also rewrites `yarn.lock`** (+29/−0, additive): it had gone stale for `node-core`, still claiming `@envoymesh/api` as a dependency, and is consistent now. The root `pnpm-lock.yaml` is *not* touched by npm — see the pnpm note below.
- **(b) done — `node-core` is off the product-bound list.** **Seven** symbols moved out of `@envoymesh/api/src/ext-agent.ts` into **`packages/protocol/src/ext-agent-contract.ts`** (five types — `ExtAgentCommandIntercept`, `ExtAgentCommandDescriptor`, `PreviewHomeFsFileParams`, `HomeFsPreviewKind`, `PreviewHomeFsFileResult` — plus the two values `EXT_AGENTS_WITH_PROJECT_PATH` / `extAgentUsesProjectPath`); `api` re-exports every one of them so no importer changed, and `node-core` now imports `@envoymesh/protocol` instead of `@envoymesh/api`. Protocol is the right home rather than the new package the earlier scoping proposed: it already carries the repo's dep-free domain contracts (`market.ts`, `agent-network.ts`, `agent-adapter.ts`), it is *in the classifier's declared core set*, and it has no dependency, so nothing can be re-tainted. **All four `node-core` modules are now `reusable`**, the package's `dependencies` are `protocol` + `vault` + two npm libs, and its tsconfig references protocol. *Three* of the four left the product-bound list: `home-fs.ts` and `mmx-media-slash.ts` were `viaPackage [@envoymesh/api]` and `index.ts` was `viaDependency`; **`service-ports.ts` was already `reusable`** (it has no imports at all). A review caught the earlier wording, which contradicted the H5 section above.
- **(c) measured *and* gated — `scripts/inventory-node-stores.mjs`.** The brief the plan was missing now exists, and building it corrected the brief itself three times:
  1. **"29 stores" was an undercount, twice over.** A complete scan finds **48**: 29 constructor-gated, **9 not gated at all** (field initializers such as `_codingScheduleStore`, `_publishedLibraryStore`, `_continuityStore`, plus `_capabilityIndex`, whose `this._x.init(profileDir)` is the only gated call), **11 per-call creations** (`createEnvoyHarnessSessionStore` ×10 and `createPublishedExternalStore`), and **10 locals / object-literal entries** (`workerLeases: new WorkerLeaseStore()`, `const sessionStore = new SessionStore({…})`, …). The fourth shape appeared only after a reviewer showed the first three missed it entirely — and `_chainStore` is a *field initializer*, not an `init(profileDir)` store as this document first said.
  2. **`profileDir` is not the only gate, and `this._profileDir` is not a real path.** A missing directory becomes **`/tmp/unknown`**, and the per-call stores are built from it on demand — so a node constructed with no directory does not fail, it *writes*. A kernel split has to deal with that fallback, not only with the gated creations.
  3. **A third gating shape already exists**: `getFilePath: () => string | null`, resolved lazily by the store itself (`node-service-persistence.ts`, `node-service-continuity.ts`). Those degrade correctly on their own and need no work.

  The proposed split is **14 kernel / 28 product / 6 undecided over 48 stores**, with a reason per store and the reading methods as evidence. Two of the evidence sentences here were wrong and a review caught them: `_familyProfileStore` has 20 readers but two of them are `getNodeConfig`/`updateNodeConfig` (config, not family), and `_shopStore` has 13 readers of which **8** are `shop*` methods and five are market/fan-out helpers. The counts were right; the summaries of them were not. `undecided` is a real answer on purpose: listing a store as undecided costs nothing, while a wrong `product` call silently removes a capability from the kernel.

  **What the script had to learn twice, recorded in its own notes:** *"where is the factory defined?"* classifies nothing (26 of 29 come from `local-store`), and *"which modules read the field?"* classifies everything the same way (every accessor lives in `node-service-impl.ts`, which is product-bound). It now reports the store's own doc comment plus the methods that touch it, and the grouping is an explicitly reviewed table — the script makes the judgement auditable, it does not pretend the judgement is mechanical.

  **Gated, not just reported.** `--check` fails if a store has no group or a group names a store that no longer exists (`ci-node-refactor.yml`, next to the §6.2 probe — the probe measures behavioural coupling, this measures the inventory). Its two seeded tests are in `scripts/test/gates.test.mjs`. **A parser bug was caught by that same instinct:** the first run printed a complete, plausible table with an **empty evidence column** for every row, because `m.end` is the Python API and `indexOf("{", undefined)` started at offset 0 — so every method body became one top-level block. It now refuses to print a report where no store has a reader.

  **The constructor split is deliberately the next step, with its cost stated rather than implied.** Gating only the 16–22 product stores would let the code claim "no product stores" while the nine ungated ones and the per-call harness stores still materialise — a claim that would be false, which is worse than not making it. The shape to implement: a `productStoreDir` gate applied across **all** product-classified stores (constructor-gated and field-initialized), plus a decision about the `/tmp/unknown` fallback, plus a test matrix asserting the kernel group is present and the product group is null. That is a behaviour-sensitive edit to an 18k-line constructor in a file with 5,300 tests, so it wants its own step rather than a tail-end of this one.

**Verified after all three.** `tsc -b` = the **6 pre-existing** errors. Manifest **current over 799 modules — 437 reusable / 362 product-bound** (from 798/433/365; `+1` module for `ext-agent-contract.ts`, `+3` for the node-core modules that left the product-bound list, and no module re-tainted). Boundary rules 1–5 OK; **15 + 35** seeded tests pass (the gate suite grew as review findings were seeded — 19 → 32 → 35; the count that holds is the one the runner prints, §8.13); workspace-wiring OK across 23 workspaces; module-size warnings only; **store inventory complete — 38 stores, 13 kernel / 22 product / 3 undecided**. `apps/node/test` + `packages/host-connect/test`: **7 failures, all pre-existing or environmental** — the five deterministic ones, `pairing-payload`'s `ENOTEMPTY` flake, and `scoreboard-rule-broadcast`, a wall-clock timer test (60 ms window on a 20 ms interval) that lost its race because this run took 77 s instead of the usual 40 s under concurrent load; it passes 3/3 in isolation and **both its test and its source are byte-identical to HEAD**. Package + Social suites: **2,797 passed, 5 failures — the known Social set**.

**The intermittent `Errors 1 error` is identified (and was mis-described here twice).** Two earlier runs reported it and this document called it part of "the `ENOTEMPTY` family" without evidence. It is an **unhandled rejection** — `ENOENT` from `rename()` in `packages/local-store/src/family-profile-store.ts:135`, i.e. the store's atomic write losing its `.tmp` file because `apps/node/test/commerce-receipt-node-service.test.ts`'s `afterEach` deletes the temp profile directory while a write is still in flight. Both files are **byte-identical to HEAD**, so it is pre-existing and unrelated to this work; it shares only the *cause class* with the `ENOTEMPTY` flakes (test teardown racing an async store write). One consequence is worth its own ticket: **no `--unhandled-rejections` flag is set anywhere, so Node's default is `throw`** — an unhandled rejection terminates the node process, which for a home node means a failed fire-and-forget store write could kill it.

#### Step 6d — the post-change review, and what it changed

Four independent reviewers attacked this work (one per surface: the extraction, the gates, the documented claims, and the host's per-caller delivery paths). It was worth doing: **the work was behaviourally sound and the record was not.** No defect was found in the code paths the refactor moved — every finding was either a gate that could not see its own subject, or a number/sentence in this document that was wrong.

**Blocking, and fixed: the module-size job was red.** Two separate causes:

1. **Three dead allowlist entries** — `apps/node/src/pi-runtime.ts` and `apps/node/src/ext-agent-adapter/{backends,daemon-supervisor}.ts`, left behind by the *harness* extraction and made hard failures by the integrity rule added in Step 6c. Repointed to `packages/harness/src/`, and **both CI invocations now scan that directory too** — without that, the entries would have protected files nothing looked at.
2. **Three files over the 800-line cap with no exception** — `agent-runtime-envoy/runtime.ts` (934), `chain-verify-loop.ts` (824), `node-service-setup-sponsor-friend.ts` (838). Verified pre-existing: they are byte-identical to HEAD and were already over the cap *with HEAD's own allowlist*, so that job was failing before this work touched it. Allowlisted as documented exceptions, which is exactly what the allowlist is for.
3. **And a process failure of mine:** three earlier runs of that command were reported as "warnings only" because I read `tail -1` and never checked the exit code. `gates.test.mjs` now runs the gate against the repo's **real** allowlist (two tests), so the drift cannot hide behind synthetic fixtures again.

**The gate had a seventh declaration site the refactor's own summary missed.** `pnpm-workspace.yaml` is authoritative under pnpm 10 (this repo's `.npmrc` says so), and `packages/host-connect`, `packages/harness` and `packages/node-core` were all absent from it. Fixed, and **rule R6** now fails when the two workspace lists diverge. This is recorded because it is the same lesson twice: a hand-written list of "places to declare a package" is a claim, and the repo had six when it had seven.

**Gates fixed after the review attacked them** (each with a seeded test that fails if the fix is reverted — 35 in `gates.test.mjs` now, `node --test scripts/test/gates.test.mjs`):

| Finding | Fix |
|---|---|
| `tsconfig.json` is JSONC, and `composite`/`noEmit` were decided by raw regex → a **comment** could switch R2/R3 off, or on | config text is comment-stripped before matching |
| R4 was satisfiable by a comment (`// "@envoymesh/x" mapping pending`) | comment-stripped, and the `paths` check now parses the file |
| Reference paths compared as raw strings → two spellings `tsc` accepts (`"../../packages/lib/"`, `"packages/lib"`) were rejected | normalized on both sides |
| `from "…"` only — single quotes and side-effect imports (`import "x"`) slipped past R1/R2 | both quote styles, bare form, and subpaths |
| R5 hard-coded a shorter suffix list than the shared one, so emitted `.mjs`/`.cjs`/`.d.mts` were invisible — then taking the shared list flagged a hand-written `.mjs` | output is now decided by the **sibling** rule (`.js`/`.d.ts` beside a source of the same stem) plus always-output maps; `apps/cli/src/_tmp_check.mjs` is correctly *not* flagged |
| R6's YAML parse required single quotes and truncated at `onlyBuiltDependencies:` | real block parse: quoted, unquoted, and reordered files |
| `--root` with no value silently scanned the repo; relative `--root` resolved against `scripts/` instead of cwd | usage error (exit 2), and cwd-relative resolution |
| `check-module-size.mjs`: `--hard` as the last argument set `NaN` (cap silently off), unknown flags became *directories* | validated flags (exit 2) |
| Two seeded tests passed for the wrong reason (a comment test whose packages were not workspaces; a dead-entry test against a directory that was already failing) | fixtures corrected so each test fails when its rule is removed |

**The comment stripper was not string-aware — the sixth-and-a-half occurrence of that class.** `stripComments` was three regexes, so `//` inside a string started a comment and `"` inside a comment opened a string. Measured before the fix: **109 files ended with a dangling backtick**, **114 lost more than three code identifiers**, and one `envoy://` template deleted a 2,767-character span including a real concept identifier. It is now a character scanner. **Verified as a pure improvement:** the manifest is byte-identical before and after (799 modules, 437/362, **zero changed entries**), while the informational surface artifact grew by 2 modules and restored symbols in 15 — the `envoy://` URL helpers whose exports the regex version had erased.

**The store inventory was over-claiming and is better for it.** A reviewer showed the parser saw three shapes and missed a fourth: `new XStore(profileDir)` in the constructor, object-literal fields (`workerLeases: new WorkerLeaseStore()`), `new LocalMemoryStore({…})`, `new SessionStore({ dir: join(this._profileDir, …) })`, and `await createXStore(this._profileDir)`. Widened — the inventory went **38 → 48 stores** (29 constructor-gated, 9 not gated, 11 per-call, 10 locals) and the split to **14 kernel / 28 product / 6 undecided**. The four shapes still out of reach are now *listed in the script's own header*, because `--check` proves "everything the parser finds is grouped", not "everything is parsed".

**Documentation corrections** (each verified against the tree): "six symbols moved" → seven; "all four `node-core` modules were product-bound" → three (service-ports was already reusable); "four workspace packages missing from the lock" → three; the store-evidence sentences (`shop*` 8 not 13; `_familyProfileStore`'s readers include two config methods; `_chainStore` is a field initializer); four line counts and one field count; the seeded-test counts; the rule counts (six → seven, R1–R5 → R1–R6); "two months" → nearly three; and the `NodeService` count itself.

**The 435-vs-436 question, settled properly.** The plan's "435 methods" was never wrong: measured at depth 0 the interface has **435 method declarations** plus **1 property-style member** = **436 members**, and `RpcMethods` has **426**. What *was* wrong was the number this refactor's own comments repeated — **423** — which appeared in eight files and is now corrected to the measured figure. The lesson is the one §2.7 keeps recording: a count written by hand in many places drifts from the thing it counts, and the earlier "correction" here over-claimed by calling the plan's own 435 an error.

**The host's own delivery path, checked adversarially (the fourth review).** Every path by which an authenticated session receives `bridge:status` or `home:config-updated` on the WebSocket transport goes through `transformForSession`, proved end-to-end with the real host, the real product dispositions and the real delivery policy, one socket per caller. Three things came out of it:

1. **A coverage gap, now closed.** The composition `hostHandled → emitToSubscribers → transformForSession` had **zero** coverage — the policy was tested as a pure function, the host wiring test passed neither dispositions nor a transform, and the disposition test stopped at `dispatchEvent` with a stub. A regression wiring either event as `broadcast`, or dropping the transform option at the composition root, would have passed all three. `apps/node/test/host-caller-delivery.test.ts` now drives the real thing over four sockets with real tokens and asserts the wire payload each one receives (owner `enabled: true`; denied member **`enabled: false`**; granted member `enabled: true`; member's config stamped with its own profile, owner's `aiBots` and `skillApiKeys` withheld).
2. **A latent robustness defect in the new shape, fixed.** `emitToSubscribers` awaited the per-session transform with no guard, so a transform that *threw* aborted delivery for every subscriber after the failing one — including the owner — and surfaced as an unhandled rejection (the caller is `void dispatchEvent(…)`). The pre-change code could not do this: its only fallible call sat inside a try/catch, and the config path was synchronous. The host now isolates the failure **per socket and fails closed** — that socket receives nothing, everyone else is unaffected, and a non-production warning names the event. Seeded by the fourth test in the file, which failed before the fix (unhandled rejection, no delivery to the owner) and passes after.
3. **The other transport's masking gap — fixed.** `apps/node/src/client-proxy-push.ts:79` forwards `bridge:status` **unmasked** to its per-caller stream, and the reviewer established reachability: the relay dials the home's `/envoymesh/client-proxy/0.1.0`, which is exactly what EnvoyGo's `HomeRemoteClient` uses for its DHT-direct and circuit-relay candidates, and it subscribes to `bridge:status`. So a family profile without `extAgentEnabled` receives `enabled: true` on that path — the symptom the WsServer mask exists to prevent. `home:config-updated` *is* stamped correctly there. `git diff HEAD -- client-proxy-push.ts` showed only a doc-comment line changed, so this refactor neither caused nor touched it. **Fixed** by giving that transport the same `transformForSession` policy object the host takes, against a session synthesised from the stream's caller — so the two transports cannot disagree, `bridge:status` is masked per caller, and `home:config-updated` keeps its stamping through the same code path. The capability gate also now fails closed there: a throwing gate yields `enabled: false`. Three tests cover it (member masked, granted member and owner unmasked, throwing gate masked). What it still lacks is a **device test** — an EnvoyGo family profile on a relay path asserting the received `enabled` — which needs a real device and is the reason the reachability chain, not a device run, is the evidence recorded here.

**One more thing the review's own fix exposed.** Switching the three static scans to the shared, string-aware stripper made visible what the regex version had been hiding: a guard asserting `handleMessage` survives stripping was failing because the *scan* had been reading a truncated file. The guard itself was then rewritten — it had compared stripped characters to 30% of the raw file, which broke when the host legitimately gained port documentation and long log strings (`codeOf` blanks strings). It now asserts the property directly, in both directions: code markers survive, and a phrase that exists only in a comment does not. The FORBIDDEN verdicts were unaffected — 15 tests pass against the accurate scan, so no symbol had been hidden by the mangling, which is luck rather than design.

**One item still open** — and the manifest is no longer it: `scripts/module-boundary.json` and `module-surface.json` are now **staged**, so they ship with the change instead of leaving `classify-modules.mjs --check` to fail on a fresh clone. The remaining item is **E10, ownership**, and the pnpm lock is fixed:

**The pnpm lock** (was item b): ~~The root `pnpm-lock.yaml` is stale and cannot be regenerated here~~ — **fixed, and my first explanation was wrong.** I claimed it needed registry credentials because `pnpm install --lockfile-only` failed with `@envoymesh/protocol is not in the npm registry`. The sibling is local, so that reading was wrong. The real cause: `packages/agent-adapter` is reached **by path** from the sibling (`file:../../../EnvoyMesh/packages/agent-adapter`), and pnpm treats a package reached that way as *external* — so its own `@envoymesh/protocol: 0.5.0` range is fetched from the registry instead of resolving to this workspace, and the mirror this machine points at does not carry the private packages. The sibling had already solved exactly this on its side, with `overrides` in its `pnpm-workspace.yaml` and a comment saying so.

Fixed by the same three redirects in the one place this repo keeps pnpm configuration — `package.json`'s existing `pnpm.overrides` (which already had `@envoymesh/envoy-harness`):

```json
"@envoymesh/protocol":      "link:packages/protocol",
"@envoymesh/identity":      "link:packages/identity",
"@envoymesh/agent-adapter": "link:packages/agent-adapter"
```

`pnpm install` at the EnvoyMesh root had been **impossible** before this, which is presumably why the lock went stale in the first place. Regenerated: **16 → 20 importers** (the four newest packages are now recorded) and **+238/−45 lines**, the deletions being the stale `0.2.2` specifiers for `@envoymesh/agent-adapter` and `link:` vs `file:` spellings for the sibling packages. `pnpm install --lockfile-only --frozen-lockfile` now passes at the root, and `npm` is unaffected (it reads `overrides` from the package root, not from a `pnpm` block). The nested `packages/openclaw` install was never part of this: it is its own workspace — **153 projects, its own lock, pnpm 11** — and its `--frozen-lockfile` check passes untouched. **A third flaky test is fixed too**: `scoreboard-rule-broadcast` waited a fixed 60 ms for a 20 ms interval and asserted two broadcasts, which a loaded machine can miss — it now waits for the *condition* with a 2-second deadline, so it still fails a broadcaster that never ticks but not one that ticks late.

**The `ENOTEMPTY` teardown flakes are fixed too**, in the three files that produced them (`pairing-payload`, `node-service-reachability`, `chain-reconcile-inbound-creator`): their `afterEach` `rm` now retries, because a store write in flight recreates a file inside the directory while `rm` walks it. That is the same race as the unhandled rejection below, seen from the test side.

**And the intermittent `Errors 1 error` is fixed too** (it was going to be its own ticket): it is an unhandled rejection from `family-profile-store`'s atomic write losing its `.tmp` file to a directory removal that happens between `writeFile` and `rename` — a wipe, shutdown, or a test's teardown finishing first. `writeFileShape` now drops the write **only** when the parent directory is gone (nothing left to persist) and rethrows any other rename failure, so a genuine anomaly is not swallowed. Pinned by `packages/local-store/test/family-profile-store-vanished-dir.test.ts`, whose sabotage of `rename` makes the race deterministic — a timing-based version of that test passed with *and* without the fix, which is why it is written the harder way.

#### E10 ✅ — decided: **Option 1, defer with a recorded trigger**

`apps/node/src` had "no declared boundary, no declared owner, and no declared public surface" (§2.4). Boundary and surface are now declared **and enforced**; ownership is the last piece, and it is a **decision about your organisation**, not a fact the tree can supply. `.github/CODEOWNERS` exists as an honest starting point (a documented catch-all with `@allenpeng0705`, derived from the remote and the commit history) plus a list of the areas a split would use.

The facts that shape the decision:

| Fact | Consequence |
|---|---|
| One human committer (1,244 commits), plus an agent identity in recent history | A per-area map keyed on *people* assigns every line to the same person today: it would look authoritative and mean nothing |
| The manifest already classifies all **799** modules and their surfaces | The *areas* are already derivable — `apps/node` 483, `packages/api` 131, `local-store` 38, `harness` 24, the Dart SDKs 42, `network` 13, `protocol` 12, … |
| `CODEOWNERS` only requests a review unless branch protection requires it | Splitting the file changes nothing operationally until that setting is on |

**Option 1 — defer, with a recorded trigger — CHOSEN (2026-09-12).** Keep the catch-all; split when one of these becomes true:

| Trigger | Why it reopens the question |
|---|---|
| **A second maintainer owns a subsystem** | The split only means something when the names differ; today every area would resolve to the same human |
| **A subsystem's change rate justifies a dedicated reviewer** | e.g. one area dominating a quarter's commits — measure it from `git log --name-only`, not by feeling |
| **A second product ships from this tree** (EnvoyDev / EnvoyAgent) | The reusable/product split already implies areas, and the product-bound side becomes a natural review boundary |

Cost: nothing. What you get today: GitHub already requests `@allenpeng0705` on every PR. **What it explicitly does *not* claim:** that one owner per area would be wrong — only that writing it down before there is a second name produces a document that looks authoritative and says nothing.

**Do first when a trigger fires:** build Option 2's area map (it is the prerequisite for a split that will not drift), then generate `.github/CODEOWNERS` from it. Do *not* hand-write twelve per-area lines.

**Options 2 and 3, kept for the record (the reasoning behind the choice):**

**Option 2 — an area map in the manifest.** Add an `areas` table to `scripts/classify-modules.mjs` (glob → area name), gated by the same completeness rule as the classification: `--check` fails when a module has no area, or an area matches nothing. Every module then carries the *area* it belongs to — a stable fact — while `CODEOWNERS` stays one line until a second person exists, at which point the file can be **generated** from the map instead of hand-maintained (where it would drift). Cost: ~150 lines and a seeded test. Recommended *when the trigger fires*: it also answers "what is this module part of?" for review and for the kernel work in §8.9.

**Option 3 — per-area `CODEOWNERS` now.** Twelve lines, each `@allenpeng0705`. Cost: thirty minutes. Value: near zero today, and it carries the risk the file itself warns about — *an invented owner map is worse than none, because it looks authoritative.* Only worth doing if you want the file ready for a second maintainer, in which case generate it from Option 2 rather than hand-write it.

**Three sub-decisions to settle when the trigger fires:** (a) **granularity** — by top-level directory (cheap, coarse) or by subsystem (`chain`, `family`, `market`, `mesh-core`, `agent-harness`, `host-connect`, `dart-sdk`, … — useful, needs a rule table); (b) **owners as teams or individuals** — GitHub teams require the repo to live in an organisation, individuals work today; (c) whether `scripts/**` and `.github/workflows/**` get their **own** owner, since those files *enforce* the boundary and a change there deserves the same review weight as a change to the boundary itself.

### 8.9 Deferred — kernel decomposition (but *not* the out-of-app extras)

Two different things were previously grouped here; V1/V4 pull them apart:

| Item | Status | Why |
|---|---|---|
| Splitting `node-service-impl.ts` (18,786 lines) **for file size** | **Deferred** | Pure hygiene. Ad-hoc extraction already produced 12 more allowlisted oversized files **without** composability. The split should be an *outcome* of §6.2, not a method |
| **What would unblock the file split** | — | Splitting the **435-method `NodeService` interface** (review point #12). Every one of those methods routes into this file, so until the interface is partitioned the impl has nowhere to shrink to. The deferral is therefore **not permanent** — it is waiting on interface partitioning, which is itself downstream of the boundary work |
| **Kernel composability** (§6.2) | **Not deferred — required by V1** | A product host must construct a kernel with no `HumanProfileStore` and no `NodeProfile` |
| Extracting a general `@envoymesh/core` package for *in-app* consumers | **Deferred** | Declaring in place achieves the same boundary at lower cost |
| Extracting the **host/connect layer** | **Not deferred — required by V1** | A different app cannot import `apps/node/src` by path |
| Extracting the **harness layer** | **Not deferred — required by V4** | Same reason; and it is already nearly clean |

Ordered after classification and enforcement (§8.2–8.5), so each extraction moves already-verified boundaries rather than inventing them. The two required extractions are Step 6 (§8.8).

### 8.10 Acceptance criteria

| Step | Done when | Revert is safe because |
|---|---|---|
| 1 | Every module classified exactly once; CI fails on an unclassified file | Manifest + check are additive |
| 2 | Reusable Dart library exports no social symbol; consumer builds against it alone | Two libraries replace one; imports are mechanical to update |
| 3 | Direction/surface checks pass; a seeded violation is caught | Checks are additive; no production code moved |
| 4 | All 507 node modules classified with declared surfaces | Classification is metadata, not code motion |
| 5 | Consumer fixture compiles against `reusable` modules with no product concept reachable | Fixture is additive |
| 6 | A separate app hosts QR + host:port and runs the harness with no `product-bound` import; `ws-server.ts` reaches none of the symbols listed in §6.1 | Extraction moves already-declared boundaries; H1–H3 are revertible independently |

### 8.11 Rollback
Every step is metadata or additive checks except Step 2, which is a mechanical import update. **Nothing in this plan moves product behaviour**, so no rollback can affect a shipped feature.

### 8.12 Baseline discipline
This repo has **known pre-existing test failures** on `main` unrelated to this work. Every step's verification must compare against a **captured HEAD baseline**, not "all green". A step is a regression only if it fails where HEAD did not.

**The baseline is pinned, not prose.** Phase 68 landed as a three-commit chain; **all figures in this plan were re-measured at its tip**:

```
d599d1bb  "Refine coding tab"  ← current HEAD, clean tree, all figures re-measured here
  └─ parent: 283604ff  "Coding Tab"
       └─ parent: ccef35b8005dee16dd21a6ffa93a20d03a5f1e2c
```

Pin **`d599d1bb`** for `git diff` comparisons — it is a real commit with a clean tree, and every figure in this plan was re-measured against it.

Record the failure set at the revision the work starts from and compare against it with `git diff` per step. **Do not carry file counts in the plan.** An earlier draft said "179 uncommitted files", and a later one said "506 files / 18,638 lines" — both were superseded within hours when `d599d1bb` added 3 methods and a file. **The revision is stable; the counts are not.** Where a count is needed, it must name the revision it describes.

### 8.13 Post-change review, round 2 (external reviewer, MiniMax) — what was real

The plan's own §8.8 write-up was reviewed by a second, independent reviewer against the working tree. It found **no defect in the extraction itself** and confirmed the parts that carry the design: the build graph across the seven declaration sites, the manifest shape and its `declaredInputs`, all five boundary rules, the §6.1 host split (no `as any` in the new `ws-server.ts`), the kernel composability probe's typed-error choice, the `EventDisposition` taxonomy, and that `@envoymesh/host-connect` depends on `protocol` + `ws` only.

Its **fifteen** listed issues reduce to fourteen unique claims (one is restated twice): **seven real** — five of them documentation or comment drift — **four wrong**, and **three** accurate observations that describe deliberate scope or design rather than defects. The pattern is worth recording, because it is the same one this plan keeps hitting: a reviewer reading prose rather than the artifact, and prose that had drifted from the artifact.

| Claim | Verdict |
|---|---|
| `check-workspace-wiring.mjs` "existed before this refactor" | **wrong** — added in this refactor; R6 present |
| `ws-rpc-concurrency.ts` "kept product-side, unresolved" | **wrong** — §6b documents the decision; the file is `reusable` and never shipped; the *data* stayed product-side by design |
| `ws-rpc-concurrency.ts` holds 31 method names | **number was wrong** — 30, counted from the Set |
| `EhTimelineUpdate` "has no `state` variant" | **wrong** — it has 4 variants including `state`; the real mismatch is that the `snapshot` variant alone has no `revision` (below) |
| `envoy-mesh-libp2p-dart` "does not yet have a social library" | **wrong** — it has one, with 2 `productBound` exports |
| Dart `envoy_mesh.dart` "exports 15 but says 13" | **confirmed and fixed** — the count is gone from the docstring rather than corrected, so it cannot drift again |
| `envoy_mesh_social.dart` also listed `MeshPeerHit` as a product type | **confirmed** (not reported) — it is `reusable` and exported by `envoy_mesh.dart`; docstring corrected |
| `envoy_mesh_social.dart` exports a `reusable` module | **confirmed** — `mesh_peer_hit.dart`; export dropped, docstring corrected |
| `productBound` vs `product-bound` naming | **confirmed** — §4.2's example corrected; the key is `productBound` |
| `check-module-boundary.mjs` says rules 2/5 "arrive with Steps 2–3" | **confirmed** — stale comment, all five are implemented |
| `packages/harness/tsconfig.json` includes a non-existent `test/**/*.ts` | **confirmed** — include removed; harness tests live in `apps/node/test` |
| §12 not marked historical | **partly** — it already said *(not a decision of this plan)*; the real defect was subsection order (12.4 before 12.3), now fixed |
| Reuse fixture is Dart-only | **not a defect** — §4.4/Step 5 and `ci-module-boundary.yml`'s `reuse-test` job scope it to the Dart libraries on purpose |
| harness surface (1 root + 1 subpath) | **by design**, as the reviewer itself concluded |
| E9 not implemented although §10 calls it decided | **confirmed — and now implemented** (§10 E9 "What landed") |
| 6 `tsc -b` errors | **confirmed pre-existing**, and both error sites are byte-identical at `d599d1bb` |

**The one thing this review got right that the plan had wrong:** §10 E9 recorded **"decided: extract `CoreNodeService` + `CoreRpcMethods`"** with a migration plan and the explicit argument that deferring gets more expensive — and the code had no `CoreNodeService`. Nothing in §6a–6d mentioned E9 at all, so the plan read as settled while the surface of `@envoymesh/api` was unchanged (435 methods). That is a contract-vs-code gap, not a code defect: the host package avoided the wide surface **locally** (`HostNodeService`, 5 members) but the public surface was exactly as wide as before. E9 was reopened rather than silently dropped, and is now **implemented** — see §10 E9 for what landed, how membership is decided and what it does *not* yet buy.

**The six `tsc -b` errors, re-diagnosed.** All six are pre-existing — both `node-service-impl.ts` sites are byte-identical at `d599d1bb`, and the four `apps/social` files (three of which the "Refine coding tab" commit itself added) are unchanged too. Two of the reviewer's six diagnoses were not accurate, and the correction matters for whoever fixes them:

| Error | Reviewer's diagnosis | Actual |
|---|---|---|
| `node-service-impl.ts:5100` | "`EhTimelineUpdate` has no `state` variant" | **It has four variants *including* `state`.** The mismatch is that the `snapshot` variant alone declares no `revision`, while the emit site spreads `{ ...update, revision }` over every variant — so the fix belongs on the `snapshot` variant, not in the emitter |
| `node-service-impl.ts:7416` | "a field rename not propagated to this call site" | **The rename predates this branch** — `SetExtAgentProjectPathParams` already says `projectPath` at `d599d1bb`. It is nevertheless a *real* runtime bug, not just a type error: the extra `path` key is silently ignored, so the Coding tab's "set project path" never sets one |

The remaining four are type-only (a `useState` narrowed to a single cron literal in two modals, an unnarrowed `chatId`, and an `AskExtAgentParams` cast that needs `unknown` first). **None is caused by this refactor and none is fixed by it** — they block a green `tsc -b` on the base commit as much as on this branch, so they belong to a separate change rather than to the encapsulation diff.

**Corrections this round applied to the plan itself** (all were counts or names, none behavioural): `ws-server.ts` 1,020 → **1,044**; the 804/439/365 and 805/440/365 manifest figures marked **superseded** by the gated 799/437/362; seeded tests 32 → **35**; the module-size allowlist 32 → **35** entries; §4.2's example key `product-bound` → `productBound`; §12 subsection order.

### 8.15 The second review round — and what "verified by reading" misses

A third review pass (against the committed tree) retracted two of its own earlier findings — both from running `git checkout HEAD -- .` and reviewing a partially-restored tree — confirmed the E9 work, and listed seven failures. Re-measured here, the picture was different in an instructive way:

| Reviewer's finding | What it actually was |
|---|---|
| 2 × `pi-runtime` failures | **Environment-dependent tests**, real defect in the tests. Both assertions only held where at least one tool dir was missing from `PATH`; the third test passed by *returning early* unless the Tauri sidecar was staged. Rewritten to own `process.env.PATH` and cover both directions, verified under three PATHs. The implementation was right: `withPiToolPath` returns its input unchanged when there is nothing to add, which is safe because `PiRuntime` spawns with `{ ...process.env, ...spawnEnv }` |
| 4-5 × `apps/social` | **One stale copy key plus two stale tests.** `settings.ai.aiEngine.projectFolder` was doing three jobs (settings label, picker `aria-label`, chat-link name) while `en`/`zh` held a sentence and five locales held the short form — breaking three tests *and* WCAG label-in-name. `ConfirmDialog`'s overlay test clicked inside the 300 ms anti-double-dismiss guard. The i18n audit's Phase-42 thresholds had rotted to meaningless (`< 180` against a real 323-364) |
| 1 × `kernel-composability-probe`, "flaky, 12 s, probably state pollution" | **Not reproducible.** The probe passes in the full suite here (25 s in one run, 11 s in isolation) against a `testTimeout` of 60 s, and its per-call 3 s budget already classifies slowness as `timeout` rather than failure. The likely mechanism was its own allow-list entry matching a *Node error string* (`Cannot find module './bundled-paths.js'`) that varies by environment — and that entry is now gone because the defect behind it is fixed (§8.16) |

**The lesson this round, sharper than §8.14's:** every one of these was found by *executing* something, not by reading it. The probe had already reported the `bundled-paths` failure and the response was to allow-list the message; the STUN and pairing-token bugs were invisible to `tsc` and green in vitest because vitest supplies a CJS-interop `require` that `dist/` does not. Reading the code said "fine"; calling the built module said `ReferenceError`.

### 8.16 Five bare `require()` calls were broken in the shipped ESM build — fixed

Every package is `"type": "module"`, so `require` is undefined at runtime. Five of them had shipped:

| Site | What was actually broken |
|---|---|
| `apps/node/src/stun.ts` | `stunLookup()` threw `ReferenceError: require is not defined` — **STUN/NAT detection was dead in production** |
| `packages/api/src/pairing-token.ts` | `decodePairingToken()` (sync) swallowed the `ReferenceError` in its `catch` and reported a *valid* gzip token as "not valid gzip-compressed data"; `pako` was not even a declared dependency (it resolved by hoisting) |
| `apps/node/src/node-service-impl.ts` | `_resolveOpenClawDir()` — the failure the §6.2 probe surfaced and allow-listed instead of fixing; the call now reports as served |
| `apps/node/src/developer-cli.ts` | Relay snapshot path; its "avoid a circular dep" comment was moot (the file already imported that barrel) |
| `packages/openclaw-runtime/src/index.ts` | `isOpenClawInstalled()` caught the error and returned `false` — it always reported "not installed", including when OpenClaw *is* installed |

All five are verified against **built output**: `stunLookup` returns a normal result, the sync pairing decode round-trips a compressed token, `isOpenClawInstalled()` returns `true` on a machine that has OpenClaw, and the probe reports the OpenClaw plugin call as served.

**The guard, and why it exists.** `apps/node/test/esm-no-bare-require.test.ts` scans `apps/*/src` and `packages/*/src` (comment- and string-stripped, so a `require` inside the watchdog's generated-script template or a local function *named* `require` is not a false positive; the vendored `packages/openclaw` tree is excluded, as in the boundary manifest) and fails on any bare `require(`. It was written after fixing the first two by hand and **immediately found three more** — the class was larger than the incident, which is the argument for the guard rather than five careful edits.

### 8.17 Where this actually stands (measured 2026-09-12, after `ada65b03`)

A fourth review pass confirmed Steps 0–6 / H1–H5 / E9 as landed and named five gaps. Re-measured here, with the numbers the decisions need:

| Gap | Measured state | What actually blocks it | Size |
|---|---|---|---|
| **`@envoymesh/api` taint** | **241 modules are product-bound only via a package**; `api` is not in `corePackages`. Simulated (classifier copy, `--out /tmp`, nothing tracked): adding `api` → **438 → 568 reusable (+130)**, viaPackage 241 → 72 | The *decision*, not the code. A blanket `corePackages` entry would admit product types whose names the concept pattern does not cover (`ChatMessage`, `FeedPostSummary`, `BondRecord`) into `reusable` modules — the same class the E9 review caught in `CoreRpcMethods`. The safe shape is a declared **`@envoymesh/api/core` subpath** with an E9-style disposition + veto generator | E9-sized |
| **`@envoymesh/harness` reusability (V4)** | **7 of 24 modules reusable**; 17 product-bound. Only **5** import `api` directly — and what they need is a *handful of symbols*: `extAgentUsesProjectPath` and `ExtAgentCommandIntercept`/`ExtAgentCommandDescriptor` are already in core packages, but `ExtAgentDefinition`, `ExtAgentCommandCatalog`, `ENVOYMESH_VERSION`, `defaultExtAgentStartHint`, `getExtAgentInstallGuide`, `ExtAgentReachability`, `InstallState`, the `Pi*` types and `ModelProviderConfig` exist **only in `api`** | Moving ~6–8 contract types into `@envoymesh/protocol`/`node-core` (re-exported by `api`, exactly as the ext-agent contract move already did for `extAgentUsesProjectPath`). **`project-path-store.ts` needs one type** and taints 5 modules directly plus 4 more through `one-shot-cli-backend.ts` — the cheapest real win in this table | small per symbol; ~10–16 modules unlocked |
| **Kernel constructor** | 48 stores, **14 kernel / 28 product / 6 undecided** (`inventory-node-stores.mjs`); the RPC probe passes but the constructor still hardcodes `this._profileDir = profileDir ?? "/tmp/unknown"` and two call sites compare against that string literal | The `productStoreDir` gate across all product-classified stores, plus a decision on the sentinel (make "no profile dir" a typed absence instead of a magic path) | behaviour-sensitive edit in an 18k-line file; own step (§8.9) |
| **Second-product proof** | `packages/envoy-reuse-fixture` is **Dart-only** | A minimal **TypeScript/desktop consumer** that hosts QR + the harness from the extracted packages — the real EnvoyDev spike. Note this is also what would *measure* the two rows above, rather than argue them | new work, not a fix |
| **This document's durability** | `docs/` is gitignored; **E7 decided that deliberately**, with the banner and "reversible at any time by moving both files" | `git add -f docs/envoymesh-refactoring-plan.md` (or an un-ignore rule) — one command, needs the owner's call | trivial |

**Recommended order**, cheapest true unblock first: (1) the harness contract-symbol move — it is small, it is the V4 requirement, and it does not depend on the `api` decision; (2) re-measure, then decide the `api/core` subpath with real numbers; (3) the kernel `productStoreDir` gate as its own step; (4) the TS reuse host, which then becomes the acceptance test for all of it.

#### 8.17.11 The review that found the gate could not fail

**The method.** Every claim in §8.17 was re-checked against the tree adversarially — not "does this look right" but "what input makes it wrong". Three checks found nothing (recorded below, because a negative result is the only evidence that a claim holds) and three findings were real, all three in code this refactor had just written.

**Finding 1 — `port: 0` published port zero.** `createReuseHost` documented `port` as "the port actually bound (equal to the requested one unless it was `0`)" and returned `options.port` verbatim, so a host started on `0` reported `0` and built the pairing URI `ws://127.0.0.1:0/ws`. §8.17.10's fix was a workaround *outside* the library — the CLI probed for a free port, closed the probe, and handed that number over — which left the library contract false for every other consumer and opened a TOCTOU window between the probe closing and the host binding. Fixed at the root: `WsServer` gained `boundPort` (read from the listening socket) and `waitUntilListening()` (settled by the `listening` callback, by a bind error, and by `stop()`, so it can neither hang nor be read too early); `ReuseHost.port` is a getter over the bound port; `serve()` is awaitable and resolves once the port is final; and the CLI's probe is gone. `apps/node/test/host-caller-delivery.test.ts` had poked `WsServer`'s private `httpServer` in a poll loop to work around the same gap — it now calls the public accessor.

**Finding 2 — an occupied port killed the consumer's process.** `WsServer`'s `EADDRINUSE` handler calls `process.exit(1)`. That is deliberate and right for the desktop host (the Tauri guardian respawns it) and indefensible in a library a second product embeds: `createReuseHost` on a busy port would end the *product's* process, with no error to handle. `WsServerOptions.onListenError` now takes over the decision; absent, the behaviour is byte-for-byte what it was. `reuse-host` passes a handler, so `serve()` rejects and the new test asserts it — a test that would kill the run if the hook ever stopped working, which is the intended failure mode for a silently-restored `process.exit`.

**Finding 3 — the store gate could not fail.** This is the one that matters. `inventory-node-stores.mjs` was documented and enforced as "a new product store that takes a directory without a guard cannot land" (§8.17.7). A negative control — a copy of the tree with one guard deleted — showed it reporting **clean**, for two compounding reasons:

| Sabotage (one edit in a copy of the tree) | Old rule | New rule |
|---|---|---|
| delete the guard, leaving `createShopStore(profileDir)` — the file's own two-line style | **not caught** | **caught** |
| same, collapsed onto one line | **not caught** | **caught** |
| `this._codingRuntimeStore.init(this._profileDir)` un-guarded | caught | caught |
| add a product store never gated (`createFeedPostStore(profileDir)`) | caught (by *completeness*, not by this rule) | caught |
| dir aliased into a local first (`const dir = profileDir; createShopStore(dir)`) | not caught | **not caught** (documented limit: needs dataflow, not a statement) |
| a *new* product store built the sanctioned way (`productStore(…)`) | clean | clean (no false positive) |
| the unmodified tree | clean | clean |

Two causes, both now fixed: the rule matched the directory argument and the construction **on the same line**, and the file writes the guard and the construction on different lines; and the row's shape label (`constructor, gated on profileDir`) — hardcoded from *how* the store is created, never from what the line says — excluded every one of the 35 constructor-shaped rows. The rule is now **statement-scoped** (a statement is guarded if the guard is in it or in an enclosing guarded `if`), matches a directory reaching a *store call* rather than a shape, and no longer consults the label. Two of my own fixes on the way were wrong in instructive ways: matching a bare binding name (`local:store`) as a substring reported five phantom leaks, and treating `= create…()` as a directory hand-off flagged a constructor's default parameter value — both are why the suite now carries the positive control alongside the sabotage.

**What the adversarial pass found nothing in.** (a) *The typed stand-in*: nothing calls `stop`/`close`/`flush`/`dispose` on any of the 17 gated product-store fields, and no code spreads one or asks `"x" in` one, so a bare kernel cannot trip the throwing Proxy on a teardown or inspection path; the product *method* calls that do reach it now fail closed with a typed error instead of writing under `/tmp/unknown`. (b) *The pairing parser*, under empty / garbage / `https:` / missing-field / `javascript:` / 2 MB inputs: no throw, no hang (2 MB in 15 ms), and hostile tokens survive a URL-encoded round-trip. The `javascript:` `wsUrl` is accepted exactly as the product's own parser accepts it — inherited, unchanged, and the defence belongs at the dial site, not in a format parser. (c) *The three rows the inventory calls "not gated"* are all **kernel** stores (two field initializers, one `init`), which need no gate by construction; the enforced invariant is about product rows, and it is still 34 product / 0 ungated.

A fourth, smaller finding came out of the same reading: `--token --port 3030` set the token to `--port` and *swallowed* `3030`, producing a silently misconfigured host instead of an error. A **known flag** in value position is now a missing value (`KNOWN_FLAGS` — the shape `check-module-size.mjs` already used), while a PEM starts with `-----`, which is not a flag name, so §8.17.10's fix is preserved rather than reverted.

**A fifth, from running the artifact again: `--token` gates identity, not access.** The help text said clients "must present" the token, which reads as access control. Asking the running host (`envoy-reuse-host --port 0`, then three clients) gives the narrower and better answer: a token that **matches** yields an owner session; a token **present but wrong** is refused with `UNAUTHORIZED` rather than silently downgraded to anonymous, so a typo cannot pass as a stranger; and **no token** yields no error and an *anonymous* session (`scopeKey: null`) — the transport says **who** is asking, never what they may do, so the CLI's own dispatcher answers its three diagnostics and a product decides everything else. That is exactly the host/product split the extraction is for, and it is now pinned by a test (no transport test covered the `UNAUTHORIZED` path), because a future edit could turn "anonymous" into "owner" without failing anything else.

#### 8.17.10 The `ModelProviderConfig`-style sweep, and a runnable second product

**The sweep, with its own instrument.** The technique that found `ModelProviderConfig` and the pairing payloads is now a script (`/tmp/contract-candidates.mjs`, reproduced below in prose): a module is tainted *by propagation* when its own text is clean yet the manifest calls it product-bound, so the **relative imports that resolve to product-bound modules** are the coupling, and the names taken from them are candidates. For each candidate, compute the closure — the declaring module, the names its declaration references, whether any reaches product-bound code — and only move it if that closure is clean.

Measured: **73 modules** are product-bound only through what they import, across **177 distinct candidate `name@module` pairs**, ranked by how many modules each blocks.

Two clean moves came out of it:

| Candidate | Declared in | Blocked modules | Verdict |
|---|---|---|---|
| `OutboundDeliverMesh`, `OutboundExpectReplyMesh` | `chat-outbound-deliver.ts` | 6 | **moved** → `network/src/mesh-ports.ts` (they are `Pick<EnvoyMesh, …>`; the mesh class is right there) |
| `isLibp2pPeerId` | `profile-sync-outbound.ts` | 5 | **moved** → the same module (a pure predicate over peer-id strings) |

Repointing the consumers added **+3 modules immediately** (`peer-directory-learn.ts`, `peer-transport-resolve.ts` and the new module itself; 552 → 555 reusable) — the two port moves alone were necessary but not sufficient, because those modules also imported the port *by its old path*.

**And the sweep's most useful output is a negative result.** The largest remaining cluster — `broadcast-outbound`, `mesh-outbound-helper`, `agent-task-propose-send`, `agent-worker-lease-broadcast`, `chain-production`, `scoreboard-rule-broadcast`, `agent-card-auto-fetcher` (7 modules) — is blocked by `sendEnvelopeWithRetry` / `sendExpectReplyWithRetry`. Their closure is **not** clean: they branch on `isProfileIntent` and call `deliverProfileEnvelopeWithRetry` / `deliverMessageEnvelopeWithRetry`, i.e. profile-sync delivery policy. Moving them would put product delivery logic in a core package — the opposite of the goal. They stay product-bound, and that is the correct answer rather than an unfinished one.

**The second product now runs.** `@envoymesh/reuse-host` gained `src/cli.ts` and a `bin` entry (`envoy-reuse-host`), serving `ping` / `whoami` / `hostInfo` and printing the pairing URI:

```
envoy-reuse-host 0.5.0 listening on ws://127.0.0.1:52431/ws
methods: ping, whoami, hostInfo

Pairing URI (encode this as a QR code):
  envoy://pair?wsUrl=…&token=…&ownerPublicKey=…&ownerId=envoy%3Aowner%3Aalice
```

Two bugs it exposed by being *run* rather than read, both in the CLI and both mine: `--owner-public-key "-----BEGIN PUBLIC KEY-----"` was rejected as "needs a value" (the parser refused anything starting with `--`, which is exactly what a PEM starts with — now values are accepted, and `--owner-public-key-file` reads a multi-line PEM from disk); and `--port 0` printed `ws://127.0.0.1:0/ws` with a pairing URI nobody could dial, because `WsServer` binds a number it is given and exposes no bound-port accessor. The unit tests had asserted the *shape* of the URL, not that its port was reachable — which is the argument for running the artifact, not just testing it. **The first fix for that was itself wrong**: the CLI resolved a free port and passed it in, which repaired the symptom for one caller and left the library's documented contract false for everyone else — see §8.17.11 for the root-cause fix (`boundPort`/`waitUntilListening`) and the removal of the probe.

#### 8.17.9 The pairing contract is shared — one QR format, two products

§8.17.8 found the reason a second product could not use EnvoyMesh's pairing code: `PairingPayload` and `PairWithHomeNodeParams` were declared in `ws-protocol.ts`, the product-bound module that carries the RPC union, and `pairing-token.ts` / `envoy-pair-uri.ts` each imported **one type** from it. Two type imports were the entire coupling, and they made the token codec and the URI builder product-bound too.

Both interfaces — plain data, no dependencies — now live in `protocol/src/pairing-contract.ts`, `@envoymesh/api` re-exports them, and the two api modules import from `protocol`. Measured effect:

| | before | after |
|---|---|---|
| `pairing-token.ts`, `envoy-pair-uri.ts` | `product-bound` | **`reusable`** |
| modules | 805 | 806 |
| reusable / product-bound | 549 / 256 | **552 / 254** |
| `api/core` modules re-exported | 106 | **109** |

**`@envoymesh/reuse-host` now speaks the product's format rather than its own.** Its local payload is gone; it builds the `envoy://pair?…` query that EnvoyMesh's parser reads, and its test asserts the interoperability directly: *a URI built by this package is parsed by `parseEnvoyPairUri`* — because a QR code only its issuing product can read is not a pairing code. The compressed token codec came along with the contract, so a second product's tokens decode in the product.

Two details worth recording, because both were mine: the test's reuse check was too coarse for a **subpath** import — it demanded that every module of `@envoymesh/api` be reusable, when `api/core` is precisely the declared entry point *of* a package that still holds product-bound modules. It now checks the entry point for a subpath and the whole package for a root specifier, which is rules 6a/6b stated in a test. And a line-slicing edit of the test file destroyed two of its tests; the file was restored from git and rewritten with anchored text replacements.

**§8.17.8's second open item is closed by the same change.** The question was what to do with `local-store`'s subpath discipline once its product modules had moved out; the answer is that there is nothing left to discipline — the package declares a single entry point (`.`) that is `reusable`, nothing imports a subpath, and rule 6b would fail if a product-bound module were ever re-exported from that entry point again.

#### 8.17.8 The second product exists — `@envoymesh/reuse-host`

The acceptance test proved a core-only consumer can boot a host; this is the artifact a reviewer asked for instead of a test: a real package, with its own `package.json`, project references, workspace entries and lockfile lines, that a product which is *not* EnvoyMesh social can depend on.

```
product (EnvoyDev, …) → @envoymesh/reuse-host → host-connect · harness · protocol
```

Three surfaces, all from the reusable layer:

* **transport** — `createReuseHost()` wires a `WsServer` from the two ports the contract requires (`sessionIdentity`, `dispatch`) and nothing else; a product supplies its own node surface, or takes the shell.
* **pairing (QR)** — `buildPairingUri` / `parsePairingUri` over a three-field payload, with a scanner-shaped parser that returns `null` for a foreign URI rather than throwing.
* **harness** — the ext-agent adapters, daemon supervisor and reachability probe re-exported as-is, which is only possible because harness reached 24/24 reusable in §8.17.1.

**The interesting finding is why the QR contract is local.** EnvoyMesh's own pairing modules (`api/pairing-token.ts`, `api/envoy-pair-uri.ts`) are `product-bound` — not because they name a product concept (they do not) but because they reach `ws-protocol.ts` through *relative* imports, and that module carries the RPC method union. A second product therefore declares its own QR payload. Moving the pairing contract into `protocol` — as was done for the ext-agent contract and for `ModelProviderConfig` — is the alternative, and it is a contract move with its own migration.

**Rule 6a demanded the declaration.** The moment the package's entry point classified `reusable`, the boundary check failed with *"importing it taints its consumers for no reason"* until `@envoymesh/reuse-host` was added to `declaredInputs.corePackages`. That is the third time this round the rule fired on something a human had not yet noticed.

| | before | after |
|---|---|---|
| modules | 804 | **805** |
| reusable | 548 | **549** |
| declared core packages | 17 | **18** |
| workspaces (wiring gate) | 23 | **24** |

#### 8.17.7 The kernel gate is complete — 0 ungated product stores, 0 undecided groups

§8.9's completion criterion was "a `productStoreDir` gate applied across all product-classified stores, plus a decision about the `/tmp/unknown` fallback, plus a test matrix". All three are now true, and the inventory is enforced rather than advisory.

| | before | after |
|---|---|---|
| ungated product stores | **12** | **0** |
| undecided groups | **6** | **0** |
| store groups | 14 kernel / 28 product | **14 kernel / 34 product** |
| inventory rule | report-only | **fails** (`--strict` semantics are now the default) |

**The 6 undecided groups were decided, fail-closed: all `product`.** Reputation anchors belong to the market/commerce feature; document acquisition is the product's document agent; the capability-provider job queue exists because the product orchestrates team jobs; and the worker lease / reliability / receipt trio is reached only through that same orchestration. A host that is not EnvoyMesh has no market, no document agent and no team jobs, so it has nothing for those stores to hold.

**Real leaks, not shape violations.** The first rule flagged twelve stores by construction *shape* — six of which were harmless (`new ChainStore()` takes no directory; the directory arrives later at a checked `init`). Refining it to "a directory is handed over unguarded" produced **4 stores / 13 call sites**: `createEnvoyHarnessSessionStore` (10 sites), `createPublishedExternalStore`, `createPublishedLibraryStore`, and the coding stores' lazy `init(this._profileDir)`. `requireProductStoreDir(dir, name)` gates them in the expression, so the guard is visible to the checker *and* the failure names the store instead of surfacing as `ENOENT: /tmp/unknown/…`.

**A false negative, caught by the control rather than by review.** The refined rule looked for a guard within four lines above the site. `node-service-impl.ts` is dense with guarded store creations, so un-gating a site still looked guarded — the tool reported clean while the leak was back. It then required the guard in the expression itself *or* in the enclosing `if (` block (which is how the constructor's chain-store block is written), and un-gating one site fails with the exact line. **This is the third time this refactor has been saved by insisting a rule can fail on the thing it claims to catch** — the pattern is: seed it, try to fool it, and fix the rule when it is fooled.

**…and the rule was still blind to the shape that matters — found by the next review round (§8.17.11).** "In the expression, on the same line as the directory" is not the shape this file uses: the product stores are written as

```ts
this._shopStore =
  hasProfileDir(profileDir) ? createShopStore(profileDir) : null;
```

so the guard and the directory never share a line, and the row's shape label (`constructor, gated on profileDir`, hardcoded from how the store is created rather than from what its creation line says) then excluded all 35 constructor rows from the rule. The gate reported `0 ungated` because it could not fire, not because nothing was ungated. It is now statement-scoped (see §8.17.11); the conclusion below — 0 ungated — survives the stronger rule, which is the only reason it was ever true.

**The last shape: field initializers became constructor-gated stores.** Six product stores were built in place (`private readonly _chainStore = new ChainStore()`), which is why the inventory called them ungated even after their `init` was guarded. They are now assigned in the constructor through `productStore(profileDir, name, factory)`, so on a bare kernel the field holds the typed stand-in rather than a usable object — §8.9's literal wording, "the product group is null", now holds.

**The test matrix** (`apps/node/test/product-store-matrix.test.ts`) asserts the runtime half the inventory cannot: a kernel with no profile directory treats absence as absence (not the sentinel), keeps its kernel stores **usable** (a real `exists()` call on the node-config store), hands out **no** usable product store across **21 product fields** (absent or the typed stand-in whose first property access names the store), and — the non-negotiable direction — still hands out **real** product stores when a directory exists. Its own first version probed `load()`, which some stores simply do not have, and reported "usable" for a store that had refused nothing; the discriminator is now property access, which is exactly what the stand-in guards.

**The probe stays green under the change** — 12 tests, `require a human profile: 2` unchanged, `precondition-not-met: 4` (up from 3: a bare kernel now reports the gated product stores as preconditions, which is the correct answer instead of silently writing to `/tmp/unknown`).

#### 8.17.6 Step (4) done — the reuse host, and what it actually proves

The boundary review's last finding was "no second-product proof": the Dart fixture proves the *SDK* claim, and there was no TypeScript consumer at all. A boundary claim that nobody consumes is a manifest entry, not a fact. `apps/node/test/reuse-host.test.ts` is that consumer, in its minimum honest form:

* It imports **`@envoymesh/host-connect` and `@envoymesh/protocol`** and nothing else EnvoyMesh. No `@envoymesh/api` (not even `/core`), no product store, no `NodeProfile`, no social concept.
* It boots the WS host with **two injected ports** — `sessionIdentity` and `dispatch`, the only two `WsServerOptions` requires — authenticates a thin client from the connect URL's `token`, and serves an RPC end-to-end, asserting the reply carries the resolved session. The transport never learns what a caller may do.
* It checks the claim **mechanically**: the test reads its own imports, fails if any specifier is not a declared core package, asks the manifest whether *every module* behind those packages is `reusable`, and asserts `@envoymesh/api` is absent. Renaming a package or re-tainting a module breaks the proof, not just the prose.

Two things it deliberately is not: it is **not a second product** (no UI, no packaging — it is the acceptance test that says one is now buildable from the reusable surface), and it is **not a substitute for the kernel gate**: a non-social host still constructs `node-service-impl` with a profile directory, which is §8.17.5's remaining 12 stores.

What the two tests cost to get right is also the useful part: the first version authenticated by putting `token` in the RPC params and got `ownerId: null` back — the host reads the token from the **connect URL** (`ws://…?token=`), which is exactly the kind of detail a real consumer discovers and a boundary document cannot state.

#### 8.17.5 Kernel `productStoreDir` — the typed-absence half is done, the gate is not

§8.9 named the shape: "a `productStoreDir` gate applied across **all** product-classified stores (constructor-gated and field-initialized), plus a decision about the `/tmp/unknown` fallback, plus a test matrix". Two of those three are done, and the third is now *enumerated and enforced* rather than remembered.

**The `/tmp/unknown` decision: absence is typed.** `profileDir` had become a magic string compared in **66 places** across `node-service-impl.ts` and `node-service-clawhub.ts` (`=== "/tmp/unknown"`, `profileDir && profileDir !== "/tmp/unknown"`, …). Every one now goes through `hasProfileDir()` from the new `product-store-availability.ts`, and the sentinel is declared once as `UNCONFIGURED_PROFILE_DIR`. Verified: no `/tmp/unknown` literal remains outside that module, and the change is behaviour-neutral by construction (`x === SENTINEL` → `!hasProfileDir(x)` is the same predicate).

**The seam mirrors the human-profile one.** `productStore(profileDir, name, factory)` returns the real store when a directory exists and a **typed, store-naming stand-in** when it does not — the same discipline as `createUnavailableHumanProfileStore`, for the same reason: a null-object would hide the dependency, a typed error measures it. The stand-in throws `ProductStoreUnavailableError` on any use, but is safe to hold, `await`, log and `JSON.stringify` — it prints `[unavailable product store: _shopStore]`, because *inspection is not use* and a log line must not crash a bare kernel.

**The gate itself is incomplete, and now says so on every run.** `inventory-node-stores.mjs --check` gained a rule over `product`-grouped stores that are not gated on a profile directory. It **reports** by default and fails under `--strict`: a rule that makes CI red on day one gets deleted, while one that names the remainder gets finished. Flipping `--strict` in `ci-node-refactor.yml` is therefore the completion criterion for §8.9. It currently names **12**:

| Shape | Stores |
|---|---|
| field initializer (constructed before `profileDir` is known) | `_codingHeartbeatStore`, `_codingRuntimeStore`, `_codingScheduleStore`, `_publishedLibraryStore`, `_chainStore`, `_delegatedChainStore` |
| local / object-literal binding inside a method | `createWebContentStore`, `createPublishedLibraryStore` (×2), `createPublishedExternalStore`, `createEnvoyHarnessSessionStore`, `LocalMemoryStore` |

They still materialise on a kernel that supplied no profile directory — the honest summary is that construction is **not yet product-free**, exactly as §8.9 predicted, and the checker keeps that visible. Closing it is a real refactor: those stores must move into the constructor (or become lazy) and their consumers must handle the typed error instead of finding a usable store, with the 5,300-test suite as the referee.

#### 8.17.4 Step (3) done — the local-store barrel split, and rule 6 turned into a real rule

The last rule-6 warning is gone, and the fix was not cosmetic. `local-store` was declared core while its **barrel re-exported product code**: `index.ts` re-exported `family-profile-store.ts` and `session-token-store.ts`, both `product-bound` (they name `FamilyProfile` / `boundFamilyProfileId`). So for the 19 modules that import `@envoymesh/local-store`, "declared core" was a lie — they were untainted while able to reach product code.

**Split:** the two stores left the barrel and got their own declared subpaths (`@envoymesh/local-store/family-profile-store`, `.../session-token-store`). Only 9 consumers existed (6 in `apps/node/src`, 3 tests) and they were migrated; the barrel now contains only reusable modules, so importing it cannot reach product code.

**Rule 6 was rewritten around the question that actually matters.** It used to judge a package by "are all its modules reusable" and merely *warned* about the dangerous direction. It now judges the package's **declared entry point**:

| | fires | why it matters |
|---|---|---|
| **6a** | the entry point is `reusable` but the package is not declared core | importers are tainted for nothing — this is what hid V4 (`node-core` 4/4, undeclared) |
| **6b** | the package is declared core but its entry point is `product-bound` | importers reach product code while looking reusable — **live until this split**, and every rule-6 warning until now was this case in disguise |
| note | entry reusable, product-bound modules behind their own subpaths | `local-store`'s state now, by design — visible, not silently accepted |

Both directions are seeded. Negative controls observed: re-adding `export * from "./family-profile-store.js";` to the barrel fails with the 6b message; undeclaring `harness` fails with 6a. A third seeded case pins the split shape (reusable entry + product module behind a subpath) passing *with a note*.

**Two of my own mistakes, both caught by the seeded tests rather than by me.** The entry-point resolution mapped `./dist/index.js` and `./dist/src/index.js` to `src/index.ts` — `local-store` emits to `dist/src/`, which is why my first export paths were wrong and `tsc` reported `TS2307`. And the rule's first version had a `reusable === 0` guard that skipped exactly the 6b case (a declared-core package with *nothing* reusable), so the rule could not fire on the state it exists to catch. It fired only after the fixture test failed — the argument for seeding every rule, again.

#### 8.17.3 Four verification hazards this round exposed

Recorded because each one silently changes what "the suite is green" means:

1. **`vitest` exits 0 while dropping test files.** A full run reported
   `8955 passed / 0 failed` and exit 0 while two files had never run — the log
   contained `[vitest-pool]: Failed to start forks worker for test files …` for
   `terminal-session-enrichment.test.ts` and `useAgentDraftAttachments.test.ts`.
   Under a loaded host the pool cannot start workers and the affected files are
   skipped, not failed. **Check the collected file count** (`Test Files … (N)`)
   against a known baseline; the exit code is not sufficient. Baseline here: 961
   files, 8,959 tests.
2. **The kernel probe's flake is real, and it is not state pollution.** In a
   loaded run it failed with `profile-coupled RPCs changed … getHumanProfile,
   startNode, syncProfileToBonds`: `startNode`'s `_profile ?? loadHumanProfile()`
   fallback is reached before its own work completes, so it reports the typed
   profile-unavailable error instead of timing out. It passes 4/4 in isolation
   and in unloaded full runs. The assertion is now split — the two calls that
   always need a profile must always be present, anything else fails except
   `startNode`, which is named as a known-under-load coupling. **`startNode`
   needing a human profile at all is a genuine kernel finding**: a kernel should
   be startable without one, so it joins the E8 extraction list.
3. **Running `pnpm install` at the repo root contaminates `node_modules`.** It
   is only ever needed for OpenClaw (`ci-smoke-openclaw-live.yml` runs it in that
   directory), and a root-level run left 137 pnpm-only packages in place — after
   which `tsc -b` reported 5 `PrivateKey` type errors from duplicate
   `@libp2p/interface` copies. `npm install` restored the tree and the errors
   vanished; no source change was involved. Refresh the pnpm lock with
   `--lockfile-only` (or run it where CI does), not with a root install.
4. **Capture the whole log when checking for flakes — the count alone is not
   enough to diagnose one.** Five full runs during the §8.17.11 review: four
   green at 961 files / 8,987 tests, and one with **2 failing tests** that ran
   concurrently with the sabotage probe that builds seven temp trees by hand.
   It did not recur — a fifth run started under the same concurrent load was
   green — but the two names are gone, because that run's output was piped
   through `tail`. A rerun that cannot name what failed costs another 90-second
   run; write to a file and grep it. (The 8,987 count is 8,959 plus the tests
   §8.17.11 added.)

#### 8.17.2 Step (2) done — `@envoymesh/api/core`, and the measurement that made it safe

The review called this "the highest-leverage next work: resolve api core vs product split". It is done, and the way it was done is the part worth recording, because the first design was wrong in a way that only measurement exposed.

**The blocker was in the classifier, not the code.** Specifiers were truncated to the package root (`@envoymesh/api/core` → `@envoymesh/api`), so *no* subpath could ever be declared core: the only lever was all-or-nothing, and the all-in version is unsafe — it would admit product types whose names the concept pattern misses (`ChatMessage`, `FeedPostSummary`, `BondRecord`) into reusable modules. Making **declared** subpath entry points their own specifier (the same test rule 2 already uses) is what unlocked it. Verified neutral on its own: totals unchanged, only the *reported reason* became more precise (the manifest now names the offending subpath, e.g. `@envoymesh/api/chat-room-service`, instead of the root).

**`packages/api/src/core.ts` is generated from the barrel**, filtered to modules the manifest calls `reusable` — 106 of the barrel's 134 re-export statements, 28 product-bound modules deliberately absent (`NodeService` among them). Generating from the barrel rather than globbing `src/*.ts` inherits the barrel's conflict resolution instead of rediscovering it as TS2308. It is gated by `--check` like the E9 artifact.

**The membership detail that matters:** a symbol is core only if `core.ts` actually exports it. The first version of the repoint tool asked "is any module declaring it reusable", and that is a different question — `BondLevel` is declared in the reusable `bond-trust-rank.ts` but reaches api's surface through the product-bound `node-service.ts`, so `core` does not export it. Repointing on the wrong rule produced 17 `TS2305` errors, caught by `tsc` in one shot rather than by a user.

| Measure | `d599d1bb` baseline | After 8.17.1 | **After 8.17.2** |
|---|---|---|---|
| repo reusable | — | 463 | **547** |
| repo product-bound | — | 338 | **256** |
| `apps/node/src` reusable | 198 | 200 | **269** |
| `packages/harness` reusable | 7 / 24 | 20 / 24 | **24 / 24** |
| product-bound *only via a package* | 241 | 221 | **111** |
| declared core packages | 5 | 12 | **17** |

The last round of that came from **rule 6, automatically**: repointing made `harness`, `models`, `rag` and `kb-obsidian` fully reusable, the checker failed on all four ("importing it taints its consumers for no reason"), and they were promoted. One promotion round, then stable — the fixpoint converges, and it converges *because the rule is enforced* rather than because someone remembered.

**A mistake of mine, worth its own line:** the repoint tool ran over every `.ts` file in the repo, including 106 test files and `apps/social` — none of which the classifier scans, so they were churn without classification benefit. They were reverted, narrowing the change from 271 files to 122. The scan roots are `apps/node/src` and `packages/**`; changes outside them cannot move the manifest.

#### 8.17.1 Step (1) done — and the blocker was not where either review looked

Two commits (`65f98f04`, `a6be0519`) and a measurement that corrected my own first hypothesis:

* **What I predicted** was that moving two symbols into `protocol` would clear ~12 harness modules. It cleared **zero**. The classifier said 7/24, unchanged.
* **The actual blocker** was the *declared core set*, not the code: `@envoymesh/node-core` had **4 reusable modules out of 4** and was not in `corePackages`, so every harness module importing it was seeded `product-bound` by condition 3. Measuring all of `packages/*` showed this was systematic — **seven** packages qualified and were undeclared: `node-core` 4/4, `host-connect` 5/5, `agent-adapter` 6/6, `bonds` 1/1, `ipfs-helia` 6/6, `mobile-identity` 1/1, `openclaw-runtime` 2/2.
* **Both halves were necessary**: the symbol moves repointed those modules away from `@envoymesh/api` (or promoting the packages would have changed nothing), and the promotion is what the classifier reads.

| Measure | Before | After |
|---|---|---|
| `packages/harness` reusable | **7 / 24** | **20 / 24** |
| repo reusable | 438 | **463** |
| repo product-bound | 362 | 338 |
| `apps/node/src` reusable | 200 | 200 (was 198 at the `d599d1bb` baseline) |
| modules product-bound *only via a package* | 241 | 221 |

**New rule 6** keeps it from drifting: every package whose modules are all `reusable` must be declared core, with three seeded tests and a negative control observed (removing `node-core` from the list fails). The inverse is a **warning**, because `local-store` is deliberately in that state: declared core, 3 product-bound modules inside, one of which names a product concept and is re-exported by its barrel. Demoting it was measured at **−19 reusable modules**, so it stays — visible via the warning — and splitting the product stores out of that barrel is the clean fix.

**What still blocks the remaining 4 harness modules** (`pi-runtime`, `probe`, `command-catalog`, `index`): symbols that exist **only** in `@envoymesh/api` — the nine `Pi*` types, `ModelProviderConfig`, `defaultExtAgentStartHint`, `getExtAgentInstallGuide`, `ExtAgentReachability`, `InstallState` and `ExtAgentCommandCatalog`. That is the `api/core` decision, now with a second reason to make it: `harness` is the V4 requirement and it cannot finish without it.

**One bookkeeping wart, recorded rather than hidden:** the generated manifest committed in `65f98f04` already reflects `a6be0519`'s core-set change (both were regenerated together before committing), so the first commit's artifact is not independent of the second's rule change. The tree is correct at HEAD; only the bisect story is slightly off.

### 8.14 The five "pre-existing failures" were stale tests, not bugs — fixed

Every verification round in this plan compared against a baseline of **5 deterministic failures** (`chain-decomposer` 1, `ext-agent-supervised-hermes` 2, `ext-agent-supervised-openhuman` 2), treating them as other people's damage. They were neither flaky nor environmental: all five were **tests that had drifted from the code**, and all five are now fixed. The suite is **5,880 passed / 0 failed / 19 skipped** (`apps/node` + `packages/api` + `packages/host-connect`), and the baseline for future work is **zero deterministic failures**.

| Failure | What had actually happened | Why the expectation was wrong |
|---|---|---|
| `chain-decomposer` — "clamps depth > 3 to 3" | Phase 65A made the clamp target the **mandate budget** (`resolveAllowedChainDepth`: default **2**, `allowDepth3` → 3, `allowDepth4` → 4, hard cap `CHAIN_MAX_DEPTH` = 4) | The test asserted the pre-65A rule (`99 → 3`) unconditionally. It now covers **all three budgets** plus the per-call flag path, which is more than it checked before |
| `…-hermes` ×2, `…-openhuman` ×2 | `ask()` gained a third parameter (`ExtAgentAskOpts`: per-ask `cwd` / `model` / `env` / `onDelta`) and both supervisor wrappers forward it | The assertions expected a two-argument call. Worse, because they never passed `opts`, a regression that **dropped `opts` whenever a supervisor was wired** — i.e. per-ask model and cwd silently ignored — would have passed the whole suite |

Each fix carries a **negative control**, run and observed: dropping `opts` on the supervised path fails 3 tests (the two updated assertions *and* the new forwarding test); making `resolveAllowedChainDepth` ignore its flags fails the depth test. The new `forwards ask() opts to the inner backend` cases pin the property that matters on **both** paths (supervisor wired and pass-through), because that is the path a real bug would take.

**The lesson worth keeping**, given this plan's own history with counts and contract drift: a "known pre-existing failure" in the baseline is not a fact about the world, it is an unexamined assertion. Four of these five were reporting a *contract change* the tests had not been told about.

**Two more changes this round, both consequences of the split.** (1) `packages/api/src` is now in the module-size scan (`ci-module-size.yml`, `ci-node-hermetic.yml`); its four pre-existing oversize modules (`node-service.ts`, `ws-protocol.ts`, `ext-agent.ts`, `chat-room-service.ts`) joined the allowlist for the same reason `packages/harness/src` did when that directory was added to the scan. (2) The generated `core-node-service.ts` is allowlisted (it is ~1.3k lines) — it is machine-generated, and the entry is safe precisely because a hand edit fails `--check`, so it cannot become a place to hide growth.

**One defect the reviewer missed, found while verifying its claims.** `packages/envoy-reuse-fixture/.dart_tool/` was **committed** — four files, including a 15 MB `incremental_kernel` test snapshot — because that package was added without a `.gitignore` while its two Dart siblings (`envoy-mesh-dart`, `envoy-mesh-libp2p-dart`) both carry the canonical Dart ignore list. `dart pub get` rewrites those files, so the CI `reuse-test` job would have dirtied the tree on every run, and a 15 MB binary cache rode along in the diff. Fixed: `packages/envoy-reuse-fixture/.gitignore` + `packages/envoy-thin-client-dart/.gitignore` (the latter has no cache committed yet but was the same latent hazard), and the four files are untracked. The classification manifest does not scan `.dart_tool`, so no count moved: still 799 / 437 / 362.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Classification is subjective; the manifest becomes a battleground | Axis 1 is **measured**, not argued (§2.7): a module naming a product concept is `product-bound` by test. Only the residual is reviewed, and it is enumerated |
| The measured boundary is wrong because the declared inputs are wrong | Both inputs are recorded **in the manifest** (`declaredInputs.conceptPattern`, `.corePackages`, `.excluded`) and §2.7 publishes their sensitivity. Changing an input is a one-line diff plus a regenerated manifest — visible, reviewable, reversible |
| Enforcement is added but never enforced | Checks run in the existing CI path alongside `check-module-size.mjs`; a seeded-violation test proves the check can fail |
| Physical extraction happens too early | Declare in place **unless the consumer is a different app** — only the host/connect and harness layers qualify (E1, §8.7). Extraction of anything else is deferred |
| The 507-file inventory stalls | Classification is metadata. It can land incrementally — the completeness check only requires each *new* file to be classified |
| Encapsulation work collides with in-flight features | Step 0 gate; and Steps 1–3 touch no product behaviour |
| A "reusable" claim that is not actually true | §4.4 makes it a CI assertion rather than a statement in a document |
| The plan is **client-biased** and silently omits hosting | §1.3 with V1/V3 and the host workstream (§2.5, B4). The host is where the plan was weakest |
| Classification follows names, which lie in this repo | §4.2: manifest derived from imports and exported types; names only as candidate generators (§2.3, §2.6) |
| Extraction is needed but deferred indefinitely | §8.7 splits deferred items from V1/V4-driven extraction, which is explicitly **not** deferred |

---

## 10. Decisions needed before implementation

### E1 — *(decided, revised)* Which parts of the reusable node layer become packages?
The answer splits by **who the consumer is**:

| Consumer | Approach |
|---|---|
| Other modules inside `apps/node` | **Declare in place.** Extraction adds packaging overhead without benefit |
| A **different app** — V1 (host/connect) and V4 (harness) | **Must become a package.** A separate app cannot import `apps/node/src` by path |

**Revised recommendation:** declare in place for classification; extract exactly the layers that have an **out-of-app consumer** (host/connect, harness). Bounding extraction to real consumers keeps the change small — and V1/V4 make those two genuinely necessary rather than speculative.

### E2 — *(decided)* How is the Dart social library separated?
**Decided: a new sibling library inside the same package** (`package:envoy_mesh/envoy_mesh_social.dart`), with the product-bound modules moving out of `envoy_mesh.dart`. The manifest now puts this at **8 modules out, 13 remaining** — and because `envoy_mesh.dart` is currently classified product-bound *as a surface*, the split is also what unblocks the downstream Dart modules (the whole `envoy_mesh_libp2p` library is product-bound today because it re-exports a persona-using module).

**Evidence.** `package:envoy_mesh/envoy_mesh.dart` is imported by **31 files, every one of them in `apps/envoygo`** — and **no file anywhere imports the social modules directly**; they are reachable only through the library. So splitting breaks nothing at module level: only those 31 import sites need review, and most need only the reusable library.

**Why not fold into the app.** It would relocate tested persona/social storage (`phone_social_store`) into `apps/envoygo`, making it unavailable to the future mobile apps V2 anticipates. Both options achieve the boundary — the boundary is about *what a consumer can see*, not where code sits — and in-package keeps it reusable. Folding stays available later; it is the more one-way move, so it should not be the first.

### E3 — *(decided)* Where do the two borderline Dart modules belong?
**Decided: both are `product-bound`** — and neither needed a judgement call, because the §3 rules settle them:

| Module | Rule that decides it |
|---|---|
| `phone_identity_store` (`PhonePersona`, `PhoneIdentityStore`) | **Rule 2 (naming)** — it names a product concept (`Persona`) |
| `phone_discovery_runtime` | **Rule 1 (dependency)** — it imports `models.dart` (`phone_discovery_runtime.dart:7`), which defines `BondContact` |

**Recorded refinement:** `models.dart` is itself **mixed** — `BondContact` (social), `MeshChatMessage` (chat), `MeshPeerHit` (arguably generic discovery data). If `models.dart` is later split, `phone_discovery_runtime` becomes reclassifiable. E3's answer is therefore **rule-derived and revisitable** — which is the property the plan wants: a classification that changes when the facts change, rather than a verdict.

### E4 — *(decided)* What is the reusable client SDK called, and how is it versioned?
**Decided: keep the package name `envoy_thin_client`, document it as "EnvoyConnect", and version it independently.**

**Evidence.** The repo's single-source-of-truth policy (`VERSION` → `scripts/sync-version.mjs`) covers `package.json`, Tauri, Cargo and Android — and **`sync-version.mjs` contains zero references to `pubspec.yaml`**. The Dart packages are consequently *already* off the repo version: `0.1.0` while `VERSION` is `0.5.0`. Independent versioning is the existing state, not a change.

Renaming the pub package is not recommended: it is an identity change carrying migration cost for every consumer and no functional benefit. Documenting the name "EnvoyConnect" in the README/API docs gets the branding without the churn. **Alternative if it should track the repo:** add a `pubspec.yaml` target to `sync-version.mjs` — small, but it makes a *client* library's version move whenever the server does, which is not obviously desirable.

### E5 — *(decided)* Which enforcement implementation?
**Decided: a custom script plus a dedicated workflow — the repository's own established pattern.**

**Evidence.** No dependency-analysis tooling exists in this repo (**12 total dependencies**, none matching `cruise` / `madge` / `depcheck` / eslint-boundary packages). The existing precedent is exact and already working:

```
scripts/check-module-size.mjs            ← custom node script
.github/workflows/ci-module-size.yml     ← dedicated workflow, runs on every PR
```

The new checks take the same shape: **`scripts/check-module-boundary.mjs`** + **`.github/workflows/ci-module-boundary.yml`**, a sibling to the size check, reusing the same allowlist idea for grandfathered exceptions. No new dependency; a rule-based tool remains open later if the rule set outgrows a script.

**Bonus finding — extend, do not duplicate.** `.github/workflows/ci-node-refactor.yml` **already exists** and runs a **13-file "Refactoring regression suite"** on PRs touching `apps/node/**` or `packages/**`. Step 1's characterisation harness should therefore **extend that suite** rather than create a parallel one (see §8.2).

### E6 — *(resolved by measurement)* Are `feature` and `social` really separate classes?
**Resolved by measurement — the question was wrong.** Name-based classification disagreed by 2× on `feature` membership, and the reusable count swings 111→350 files depending on the declared inputs. Axis 1 (`reusable` / `product-bound`) is binary and mechanically testable (§2.7), so it replaces the four-class taxonomy entirely (§3). **No longer blocking.** Capability tags carry no dependency rules, so nothing hinges on whether a given module is "a feature" or "social".

### E7 — *(decided)* Where does this document live?
**Decided: keep it in `docs/` and mark it explicitly as local scratch.** Both this plan and `docs/evidence/social-rpc-defaults.md` carry a banner stating they are not committed, because `docs/` is gitignored (`.gitignore:71`).

**Consequences, accepted deliberately:** the plan is invisible to CI, to other machines, and to anyone cloning the repo; it cannot be referenced from a PR; and it will not survive a clean checkout. **Anything that needs to be shared or durable must be copied to a tracked path first** — the banner says so, and this decision is reversible at any time by moving both files.

> **Reversed 2026-09-12 (E7b).** A boundary review made the durability argument that this section had accepted as a cost: the design record for a refactor is exactly the artifact a future agent or reviewer needs, and "it will not survive a clean checkout" is not a neutral property when the code it describes has landed. It was reversed the way the paragraph above said it could be — one change to `.gitignore` (the `/docs/*` + `!/docs/<file>` contents pattern, because a directory-level ignore cannot be negated selectively) and this file plus `docs/evidence/social-rpc-defaults.md` are now tracked. Everything else under `docs/` is still local scratch, and the file carries no secrets — it describes boundaries and measurements.

Renamed from `product_platform_architecture.md` to `envoymesh-refactoring-plan.md` so the filename matches the title.

### E8 — *(decided)* How far must kernel composability go?
**Decided: probe first, with an explicit stop rule.**

The probe: make `humanProfileStore` and `NodeProfile` **optional and injectable**, then test whether the kernel **constructs and serves RPCs with both absent**.

- **If it does → composability is satisfied for V1, and no `node-service-impl.ts` extraction is required.** The file may then shrink on its own schedule (§6.2) or never.
- **If it does not → extract only the concerns that still reach for social state**, one at a time, re-running the probe after each. **Stop as soon as it passes.**

The stop rule is the substance of this decision: it prevents the probe from silently becoming an open-ended decomposition project. Full-split-up-front is rejected — it is the one option that cannot be tested cheaply, and it would block V1 behind a 16,902-line refactor.

### E9 — *(decided — **implemented**, see "What landed" below)* Is `NodeService` the public surface, or is a narrower `CoreNodeService` extracted?

> **Status, recorded honestly.** The text below decides *extract `CoreNodeService` + `CoreRpcMethods`*. That decision sat unimplemented long enough for a second review to catch the divergence between this section and the code (§8.13) — `grep -r CoreNodeService packages apps --include=*.ts` returned nothing while the plan read as settled. It is now implemented.

**What landed** (`packages/api/src/core-node-service.ts`, **generated** by `scripts/generate-core-surface.mjs`):

| | |
|---|---|
| Core **type** surface | **100 members** over **8** declared sections, plus the **55 type declarations** those signatures need |
| Core **wire** surface | **92 names** — the members that were already real RPC methods, *intersected* with `ProductRpcMethods`. The other 8 (`recordOwnerActivity`, `clearAllUserData`, `exportDidDocument`, …) are methods the host calls in-process; including them would have widened the JSON-RPC contract with names no client can call. Found in review, after the first version conflated the two surfaces |
| Full surface | `NodeService` **extends** `CoreNodeService`; `RpcMethods = CoreRpcMethods \| ProductRpcMethods` |
| Consumers | every one unaffected — both directions of the split are additive; the moved types are still re-exported from `node-service.ts` and the barrel (the (b) dual-export window) |
| Gate | `node scripts/generate-core-surface.mjs --check` in `ci-module-boundary.yml`; hand-editing the artifact fails CI |
| Tests | `packages/api/test/core-surface.test.ts` — 8, including two seeded negative controls (a perturbed artifact and an added product method must both fail) |
| Measured effect | manifest **799 → 800 modules, 437 → 438 `reusable`**, no module re-tainted: `core-node-service.ts` is `reusable` by the three-condition test |

**Membership could not be derived from the manifest alone, and that is measured, not asserted.** E9 asked for membership "generated from the Axis-1 manifest". The manifest's `conceptPattern` is *module-shaped*: applied to method signatures it calls **359 of 441** members clean — `sendCallInvite`, `listChatHistory` and every commerce method among them — while whole sections (Voice/Video Calls, Push Notifications) are signal-clean and plainly product. (The figure is recomputed by the generator on every run and printed into the artifact's header, so it cannot go stale.) So the signals **veto** (a core method that names a product concept, or reaches a `product-bound` module through its own signature, fails the generator loudly) and a **declared section disposition** decides: 21 sections, each `core` / `product` / `undecided`, with `undecided` fail-closed, plus a **35-member residual list** for the members that live inside a `core` section but are product (`File Sharing` spans file transfer *and* the social feed/blog/web-site feature; `Identity` spans the node's identity *and* the owner's social profile). Every exclusion carries its reason, and a stale entry fails the run — the same shape as `scripts/inventory-node-stores.mjs` (`kernel` / `product` / `undecided`) and the same "enumerate the residual" rule as §2.7.

**What it does not do, stated plainly.** The §2.7 figure that E9 "unlocks **350** reusable files (198 → 350)" does **not** follow from the interface split alone. The classifier seeds on the *package* specifier (`condition 3`: a module importing a non-core `@envoymesh/*` package), so `@envoymesh/api` has to be **declared** a core package for those 152 files to flip — and it still exports product types (`FamilyProfile`, commerce, personas) from its barrel, which is exactly why it is excluded today. What the split buys immediately is the thing the plan actually needed: a **declared, gated, narrow surface** that a non-social product can be typed against, which is also the prerequisite §8.8 named for ever shrinking `node-service-impl.ts`. Declaring `api` core — or moving its product types behind a product subpath — is the next decision, and it is a decision, not a follow-through.

**This is not an E1 case (review point #10).** E1's rule is *"declare in place unless the consumer is a different app."* That trigger does not apply: `@envoymesh/api` is a **package surface**, and the trigger here is different — **the surface is too wide to be reusable.** It exports all **435** methods, so a reusable consumer that imports `RpcMethods` necessarily sees every social method name, and §5's reuse test cannot assert the absence of social symbols through it.

**Decided: extract `CoreNodeService` + `CoreRpcMethods`**, with the full `NodeService` **extending** the core interface. This is also the named prerequisite for ever shrinking `node-service-impl.ts` (§8.8), so one partition answers both.

**Membership is not decided here.** Which methods are core is **generated from the Axis-1 manifest** — the same partition the §2.7 measurement produces. That is why E9 is **downstream of Steps 1 and 4, not parallel to them**: choosing the membership by hand is precisely the classification argument §2.7 exists to avoid.

**This is a real surface split, not a rename.** Three things must be planned rather than assumed:

**(a) Migration path per consumer.** Today's consumers all import `NodeService`:

| Consumer | Kind | Migration |
|---|---|---|
| `apps/social` | product | **none** — keeps the full `NodeService` |
| `apps/envoygo` | product | **none** — keeps the full `NodeService` |
| Tauri shell | product | **none** — keeps the full `NodeService` |
| future reusable consumers | reusable | import **`CoreNodeService`** only |

Because the full interface extends the core one, **product consumers need no change at all** — the split is additive in their direction.

**(b) Deprecation / dual-export period.** Both types are exported from `@envoymesh/api` for **at least one release**. The core type is documented as *the reusable surface*; nothing is removed, so no consumer is forced to switch on the refactor's schedule.

**(c) Cost and breaking-change surface.** Moving a method from `NodeService` to `CoreNodeService` is **non-breaking** for `NodeService` consumers *because* the full interface extends the core one — a `NodeService` consumer keeps every method. The breaking direction is the reverse: **adding** a method to `CoreNodeService` obliges `NodeService` to implement it, which would affect any **out-of-tree** implementer of `NodeService`. There are none today (the sole implementer is `NodeServiceImpl`), so the split is safe now and gets more expensive later — an argument for doing it in this refactor rather than after.

### E10 — *(decided: Option 1, defer with a recorded trigger)* How is module ownership declared?
The plan asks each module to have a "declared owner" (§2.4, Step 4). The repo had **no `CODEOWNERS`**, and an invented owner map is worse than none because it looks authoritative — so this was left for the repository owner rather than guessed.

**Landed: a minimal `.github/CODEOWNERS`, derived from facts rather than preference.** The remote is `github.com/allenpeng0705/EnvoyMesh` and 1,244 commits are by that author, so the catch-all owner is `@allenpeng0705`. One owner for everything is honest and immediately useful — GitHub will request that reviewer — and is explicitly *not* a claim about how the code should be divided.

**Decided (2026-09-12): defer the per-area split, with a recorded trigger.** The repository owner chose **Option 1** of the three written up in §8.8 — keep the documented catch-all, and split when (a) a second maintainer owns a subsystem, (b) one subsystem's change rate justifies a dedicated reviewer, or (c) a second product ships from this tree. The area list and the note that `scripts/` + `.github/workflows/` deserve deliberate owners because they *enforce* the boundary both stay in the file, as the input to that future split. Option 2 (an area map in the manifest, from which `CODEOWNERS` can be generated) is the recorded prerequisite when a trigger fires, so the split is not hand-written and does not drift.

**Why not a per-area file now:** with one human committer, twelve area lines all name the same reviewer — the shape of an ownership map without its content, which the file's own comment warns against. Deferring costs nothing operationally: GitHub requests that reviewer either way.

---

## 11. Explicitly out of scope

- **No product design.** EnvoyDev and EnvoyAgent are motivation and future validation only; no scope, surface, or topology is specified for them. **Where that work now lives:** `docs/envoymesh-multi-product-design.md` (tracked) — the packaging design for installing the three products next to each other (separate apps, one shared profile root, one mesh owner at a time, local-model sharing). The how-to companion is `docs/envoymesh-new-app-guide.md` — what to depend on, how to boot a host, how the mobile pairing works, and how to sync with this repo. It is a separate document precisely because of the rule above; it consumes this plan's 556/252 split and changes nothing in it. **One boundary in that design matters here:** `@envoymesh/envoy-harness*` is a **peer** every product clones or copies itself, never something this repo distributes (design **D4**, guide §7.5). The `file:../envoy-harness/…` link this repo carries is a local development arrangement — the same link whose stale `@envoymesh/protocol` copy S0 had to repair — and `scripts/check-peer-deps.mjs` makes its absence legible instead of an `ERR_MODULE_NOT_FOUND`.
- **No changes to `apps/social` behaviour or feature set.** The Coding tab work in flight is a feature addition to Social, not part of this refactor.
- **No removal of social identity, bonds, roster, or family profiles.** Encapsulation keeps them reachable from `product-bound` modules; it only stops them leaking into `reusable` ones.
- **No reassignment of product capabilities.** Capability tags are labels; reusability is the only enforced axis (§3).
- **No big-bang decomposition** of `node-service-impl.ts`, and **no file-split for its own sake** (§8.8). What §6.2 requires is *composability*; a smaller file is a possible by-product, not the goal.
- **No new transport.** LAN `ws://`, relay `ws://`, and libp2p + circuit relay already serve every consumer.
- **No work on the voice/video call layer (WebRTC).** `call-manager` / `call-inbound` / `session-manager` / `stun` (1,877 lines, **zero** social-concept references) are **deferred**. It is a separate layer with its own concerns; it is not a blocker and nothing in this plan gates on it.

---

## 12. Appendix — worked example of what encapsulation enables *(not a decision of this plan)*

> **Read this as a worked example, not as plan content (review point #4).** The material below sketches *how a future product's client would get a bounded authorisation* once the boundary exists. It is included because it makes §4 concrete — and it is the clearest demonstration of why the boundary must come first.
>
> **It is not carried by this refactor, and it decides nothing here.** The one product-shaped item in it (`coding` / `coding.exec`) is a **worked example** built on the Coding tab — a real surface — not a commitment this plan makes. **Product design belongs in its own document**; mixing it into an encapsulation plan is precisely how the §2.3 mixed surface came into being. If it grows further, it should move out.

### 12.1 The `coding` scope *(worked example)*

The only scope specified anywhere in this document, because the Coding tab is the only product surface actually being built. `coding` = **72** methods (Tier A 48 + Tier B1/B2 24); `coding.exec` = **20** methods, consent-gated. Full 426-method classification below.

**EnvoyAgent's scope is deliberately absent.** An earlier revision proposed an `agent` scope; that was speculation about an unbuilt product and has been removed. When such a product is designed, its scope is derived with the same procedure — as a table entry, not a refactor.

#### Tier A — `coding`, confirmed by today's gate (48)

Identical to `CODING_GATED_RPC`. No decision required — this is the EnvoyDev core surface as the owner already defines it.

| Method | Scope | Today's gate | Handler home |
|---|---|---|---|
| `acceptEnvoyHarnessTurnReview` | `coding` | coding-gated | `node-service-impl.ts` |
| `askCodingHarness` | `coding` | coding-gated | `node-service-impl.ts` |
| `askEnvoyHarness` | `coding` | coding-gated | `node-service-impl.ts` |
| `cancelEnvoyHarnessTurn` | `coding` | coding-gated | `node-service-impl.ts` |
| `clearCodingHarnessRuntime` | `coding` | coding-gated | `node-service-impl.ts` |
| `closeTerminalSession` | `coding` | coding-gated | `node-service-impl.ts` |
| `createCodingHeartbeat` | `coding` | coding-gated | `node-service-impl.ts` |
| `createCodingReviewInvite` | `coding` | coding-gated | `node-service-impl.ts` |
| `createCodingSchedule` | `coding` | coding-gated | `node-service-impl.ts` |
| `createEnvoyHarnessChat` | `coding` | coding-gated | `node-service-impl.ts` |
| `deleteCodingHeartbeat` | `coding` | coding-gated | `node-service-impl.ts` |
| `deleteCodingSchedule` | `coding` | coding-gated | `node-service-impl.ts` |
| `deleteEnvoyHarnessChatTurn` | `coding` | coding-gated | `node-service-impl.ts` |
| `ehRespondToPermission` | `coding` | coding-gated | `node-service-impl.ts` |
| `ehRespondToUserQuestion` | `coding` | coding-gated | `node-service-impl.ts` |
| `ensureEnvoyTerminalSession` | `coding` | coding-gated | `node-service-impl.ts` |
| `ensurePiTerminalSession` | `coding` | coding-gated | `node-service-impl.ts` |
| `getEnvoyHarnessChatHistory` | `coding` | coding-gated | `node-service-impl.ts` |
| `getEnvoyHarnessCommandCatalog` | `coding` | coding-gated | `node-service-impl.ts` |
| `getEnvoyHarnessStatus` | `coding` | coding-gated | `node-service-impl.ts` |
| `getEnvoyHarnessTurnReview` | `coding` | coding-gated | `node-service-impl.ts` |
| `getEnvoyHarnessTurnStatus` | `coding` | coding-gated | `node-service-impl.ts` |
| `getHomeFsInfo` | `coding` | coding-gated | `node-service-impl.ts` |
| `getPiStatus` | `coding` | coding-gated | `node-service-pi.ts` |
| `invokeEnvoyHarnessEhui` | `coding` | coding-gated | `node-service-impl.ts` |
| `listCodingHeartbeats` | `coding` | coding-gated | `node-service-impl.ts` |
| `listCodingSchedules` | `coding` | coding-gated | `node-service-impl.ts` |
| `listEnvoyHarnessPeers` | `coding` | coding-gated | `node-service-impl.ts` |
| `listHomeFsEntries` | `coding` | coding-gated | `node-service-impl.ts` |
| `openEnvoyHarnessChat` | `coding` | coding-gated | `node-service-impl.ts` |
| `openEnvoyHarnessFile` | `coding` | coding-gated | `node-service-impl.ts` |
| `piRespondToProposal` | `coding` | coding-gated | `node-service-pi.ts` |
| `recordEnvoyHarnessUxEvent` | `coding` | coding-gated | `node-service-impl.ts` |
| `removeEnvoyHarnessChat` | `coding` | coding-gated | `node-service-impl.ts` |
| `resetEnvoyHarnessChat` | `coding` | coding-gated | `node-service-impl.ts` |
| `restartPi` | `coding` | coding-gated | `node-service-pi.ts` |
| `resumeEnvoyHarnessSession` | `coding` | coding-gated | `node-service-impl.ts` |
| `revertEnvoyHarnessTurn` | `coding` | coding-gated | `node-service-impl.ts` |
| `revertEnvoyHarnessTurnFiles` | `coding` | coding-gated | `node-service-impl.ts` |
| `runCodingHeartbeatNow` | `coding` | coding-gated | `node-service-impl.ts` |
| `runCodingScheduleNow` | `coding` | coding-gated | `node-service-impl.ts` |
| `sendToPi` | `coding` | coding-gated | `node-service-impl.ts` |
| `setCodingHarnessRuntime` | `coding` | coding-gated | `node-service-impl.ts` |
| `setEnvoyHarnessAutoRunPolicy` | `coding` | coding-gated | `node-service-impl.ts` |
| `setEnvoyHarnessProjectPath` | `coding` | coding-gated | `node-service-impl.ts` |
| `startEnvoyHarnessTurn` | `coding` | coding-gated | `node-service-impl.ts` |
| `updateCodingHeartbeat` | `coding` | coding-gated | `node-service-impl.ts` |
| `updateCodingSchedule` | `coding` | coding-gated | `node-service-impl.ts` |

#### Tiers B and B3 — EnvoyDev surface, NOT granted today (44)

**A product decision, not a derivation** — the decision is recorded in §12.2. These are the EnvoyDev surface (harness, `terminal*`, `ExtAgent*`, project-folder picker) but today 36 are `owner-only` and 7 are `open`. The **Bucket** column is what the method actually lets a client do: **B1** = metadata/config/suggestions, **B2** = reads host content, **B3** = executes on the host.

| Method | Bucket | Granted by | Today's gate | Handler home |
|---|---|---|---|---|
| `getExtAgentCommandCatalog` | **B1** | `coding` | open | `node-service-impl.ts` |
| `getExtAgentProjectPath` | **B1** | `coding` | owner-only | `node-service-impl.ts` |
| `listEnvoyHarnessChats` | **B1** | `coding` | soft-deny | `node-service-impl.ts` |
| `listTerminalSessions` | **B1** | `coding` | owner-only | `node-service-impl.ts` |
| `probeExtAgent` | **B1** | `coding` | open | `node-service-impl.ts` |
| `renameTerminalSession` | **B1** | `coding` | owner-only | `node-service-impl.ts` |
| `setExtAgentProjectPath` | **B1** | `coding` | owner-only | `node-service-impl.ts` |
| `setExtAgentSessionModel` | **B1** | `coding` | open | `node-service-impl.ts` |
| `terminalCancelGoalLoop` | **B1** | `coding` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalClearResumeGoal` | **B1** | `coding` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalDetectFailure` | **B1** | `coding` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalGetAssistState` | **B1** | `coding` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalPinContextSession` | **B1** | `coding` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalSendContextToAssistant` | **B1** | `coding` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalSetAssistModelOverride` | **B1** | `coding` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalSetInlineSuggestEnabled` | **B1** | `coding` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalSuggestCommand` | **B1** | `coding` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalSuggestFixFromFailure` | **B1** | `coding` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalUpdatePlanProgress` | **B1** | `coding` | owner-only | `node-service-handlers-terminal.ts` |
| `previewHomeFsFile` | **B2** | `coding` | owner-only | `node-service-impl.ts` |
| `revealHomeFsPath` | **B2** | `coding` | owner-only | `node-service-impl.ts` |
| `terminalExplainScrollback` | **B2** | `coding` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalGetHerdrExportHint` | **B2** | `coding` | owner-only | `node-service-handlers-herdr.ts` |
| `terminalGetScrollbackPreview` | **B2** | `coding` | owner-only | `node-service-handlers-terminal.ts` |
| `askExtAgent` | **B3** | `coding.exec` | open | `node-service-impl.ts` |
| `createTerminalSession` | **B3** | `coding.exec` | owner-only | `node-service-impl.ts` |
| `homeTerminalWsClose` | **B3** | `coding.exec` | open | `node-service-impl.ts` |
| `homeTerminalWsOpen` | **B3** | `coding.exec` | open | `node-service-impl.ts` |
| `homeTerminalWsSend` | **B3** | `coding.exec` | open | `node-service-impl.ts` |
| `terminalAdvanceGoalLoop` | **B3** | `coding.exec` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalAttach` | **B3** | `coding.exec` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalClearBackgroundWatch` | **B3** | `coding.exec` | owner-only | `node-service-impl.ts` |
| `terminalEnableExecPane` | **B3** | `coding.exec` | owner-only | `node-service-impl.ts` |
| `terminalEnablePrepareMode` | **B3** | `coding.exec` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalExec` | **B3** | `coding.exec` | owner-only | `node-service-handlers-terminal-exec.ts` |
| `terminalExecuteProposal` | **B3** | `coding.exec` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalObserveStep` | **B3** | `coding.exec` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalOpenClawPlan` | **B3** | `coding.exec` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalResumeGoalLoop` | **B3** | `coding.exec` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalRunFromNaturalLanguage` | **B3** | `coding.exec` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalRunPlanStep` | **B3** | `coding.exec` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalSetBackgroundWatch` | **B3** | `coding.exec` | owner-only | `node-service-impl.ts` |
| `terminalStartGoalLoop` | **B3** | `coding.exec` | owner-only | `node-service-handlers-terminal.ts` |
| `terminalWatchStep` | **B3** | `coding.exec` | owner-only | `node-service-handlers-terminal.ts` |

#### Tier D — `transport` (2)

Never routed through the switch — an open finding, see §12.4.

| Method | Scope | Today's gate | Handler home |
|---|---|---|---|
| `off` | `transport` | open | `—` |
| `on` | `transport` | open | `—` |

#### Tier E — `social` default (332 methods)

**Moved to [`evidence/social-rpc-defaults.md`](./evidence/social-rpc-defaults.md)** — evidence rather than plan, and 332 of the 426 rows. Every method in it keeps today's behaviour and needs no review.

### 12.2 Consent-gating host execution *(worked example)*

**Worked example:** *if* a future product needed consent-gated host execution, a `coding` scope would grant Tier A + B1 + B2 (**72** methods), and Tier B3 — the 20 methods that execute on the host — would be granted by a separate scope, **`coding.exec`**, issued only when the owner consents at pairing. **No such product is committed here** (§12 banner); this is how the mechanism would work, not a decision this plan carries.

**Consent lives in the token's scope list.** No second consent field is introduced, because the scope mechanism already provides exactly the properties consent needs: recorded at issuance, visible to the owner, checkable per call, and revocable.

| Concern | Design |
|---|---|
| **Where consent is captured** | The pairing flow, as a distinct step — *not* a checkbox among others. Text must name the capability plainly: "Allow EnvoyDev on this device to run commands on this computer." This is the highest-privilege grant the system issues |
| **What is issued** | Consent → `scopes: ["coding", "coding.exec"]`. Declined or skipped → `scopes: ["coding"]`. No path issues `coding.exec` implicitly |
| **Default** | **Fail-closed.** No consent means no scope, and a B3 call is denied |
| **Audit** | An audit event at issuance recording the grant and the granting profile (audit-first, per repo convention). Revocation is audited the same way |
| **Revocation** | Partial and independent of unpairing: dropping `coding.exec` while keeping `coding` withdraws shell access without a re-pair. Needs a token-store operation alongside `removeTokensForDeviceId` (see §12.4) |
| **Denial the client sees** | A distinct reason (*"this device is not permitted to run commands"*) a product UI can act on — not a generic forbidden error — so EnvoyDev degrades to 72-method mode instead of appearing broken |
| **Owner sessions** | Unaffected — the owner carries no scopes and already has full access. The flow must not ask the owner for consent |
| **Family profiles** | Unaffected — no scopes, so the existing `terminal*` owner-only rule still denies them. Granting a family profile shell access would be a separate decision with its own consent surface |

**Why a sub-scope rather than a per-method flag.** Method-level consent flags would put a security decision inside the grant table and make it easy to add a B3 method without noticing it inherits consent. Making the **grant** the consent unit means a new B3 method cannot become consented by accident — it either lands in `coding.exec` or it is misclassified loudly.


### 12.3 Why this is downstream

Every mechanism in §12 assumes the boundary from §3–4 already exists: a scope is only meaningful once there is a declared surface to scope, and per-method classification is only tractable once modules are classified `reusable` or `product-bound`. **Do the encapsulation work first.**

### 12.4 Open findings carried by this material

Two real defects surfaced while producing the §12.1 classification. Neither is resolved, and **both are independent of encapsulation** — recorded here so they are not lost:

1. **Unrouted declared methods.** `on` / `off` are members of `RpcMethods` but are handled directly in `ws-server.ts:791,798`, before `routeRpcMethod` — so no router-level check can ever see them. `getCapabilityManifest` / `updateCapabilityManifest` are in `RpcMethods` with **no `switch` case** at all, though implemented in `node-service-manifest.ts`. Any exhaustiveness check over the method union needs these two groups settled first.
2. **Consent-scope revocation granularity.** Dropping `coding.exec` while keeping `coding` should withdraw shell access without forcing a re-pair (per-pairing-consent recorded at issuance). That requires a token-store operation beyond `removeTokensForDeviceId`.
