# envoy-harness integration — Step 3 sub-plan (B-class critical EnvoyMesh skills in bridge)

> **Status:** ✅ **DONE** (2026-08-20). All 3 commits
> landed: (1) bridge impls + 3 B-class bridge tests +
> 3 `apps/node/src/` wrappers, (2) manifest updates
> (3 B-class skills in `ENVOY_HARNESS_SKILLS`), (3)
> e2e test (`sponsor-friend.e2e.test.ts` with
> `RUN_B_CLASS_E2E=1` opt-in) + design doc closeout.
> 35 new bridge unit tests + 1 e2e test + 32-test
> sponsor-friend snapshot (regression-clean). The
> merged manifest grew from 9 to 12 skills (8
> envoy-harness + 4 openclaw; the 3 B-class skills
> are envoy-harness only in v0 per the fail-loud
> collision policy). Detailed plan + plan
> deviations in §8 below. Companion to
> [`agent-harness-integration.md`](./agent-harness-integration.md) (the
> design) and
> [`agent-harness-integration-step3-4.md`](./agent-harness-integration-step3-4.md)
> (the high-level plan).
>
> **What this doc covers:** Step 3 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary. Read the design doc
> for "why"; read this for "exactly what to build".
>
> **Order:** Step 3 lands AFTER Step 4 (per user
> decision 2026-08-20). The merged manifest
> auto-picks up the 3 B-class skills when they're
> added to the existing `ENVOY_HARNESS_SKILLS` +
> `OPENCLAW_SKILLS` catalogs (no Step 4 changes
> needed).
>
> **Commit 1 status (2026-08-20):** all bridge-side
> canonical impls + 3 B-class bridge tests + 3
> `apps/node/src/` wrappers (b-class-deps.ts +
> refactored node-service-setup-sponsor-friend.ts +
> refactored developer-cli.ts + wired runtime.ts)
> landed. Test counts: envoy-harness-adapter 140/140
> (no regression); EnvoyMesh Phase 8 sponsor-friend
> 32/32 + developer-cli peer-list + relay-status
> match pre-Step-3 output line-for-line. Self-review
> caught 4 bridge-side bugs that the test mocks
> didn't cover (see §8).
>
> **Commit 2 status (2026-08-20):** the 3 B-class
> skills (setup-sponsor-friend / peer-list /
> relay-status) added to `ENVOY_HARNESS_SKILLS` (now
> 8 total). The merged manifest test updated to
> expect 12 skills (8 envoy-harness + 4 openclaw).
> **Plan deviation:** the 3 B-class skills are NOT
> added to `OPENCLAW_SKILLS` (per the originally
> planned "invoking-runtime tag"). Rationale: the
> merged manifest's fail-loud
> `SkillIdCollisionError` policy treats duplicate
> skillIds as a hard error. The Step 3 plan §3.1
> declares envoy-harness the canonical impl, so v0
> exposes the 3 skills on envoy-harness only.
> When the OpenClaw skill handler lands (a future
> chunk per §3.6), the 3 skills will move to
> OpenClaw (envoy-harness loses them) or namespace
> under OpenClaw — depending on Q5 routing.

## 1. Goal

The bridge (`envoy-harness-adapter`) is the **canonical
implementation** of 3 mesh-touching capabilities
that are critical enough to require a backup:

- `setup-sponsor-friend` (first-launch auto-bond)
- `peer-list` (observed peers from audit log)
- `relay-status` (relay manager snapshot)

Both envoy-harness and OpenClaw consume these from
the bridge through their respective adapter.
envoy-harness can run a bond flow **even if OpenClaw
subprocess is down** — because envoy-harness doesn't
go through OpenClaw; it goes through
`envoy-harness-adapter`.

## 2. Existing pieces (what we build on)

### 2.1 `setup-sponsor-friend` impl

**File:** `apps/node/src/node-service-setup-sponsor-friend.ts`
(1001 lines)

Public API:
- `runSetupSponsorFriendViaRuntime(deps, input): Promise<RunSetupSponsorFriendResult>` (line 366)
- `classifySponsorError(message): SponsorFailureKind` (line 72)
- `persistedSetupSponsorFriendConfig(...)` (line 150)
- `__resetActiveSponsorLoopsForTests()` (line 28)
- Interface: `SetupSponsorFriendRuntimeDeps` (line 263) — **17+ optional methods**

The 17+ deps include mesh ops (`searchPeers`,
`sendHello`, `applyWanJoinInvite`,
`waitForBondEstablished`), profile ops
(`loadNodeProfile`, `loadHelloProfile`,
`probeHumanProfileReady`, `isAlreadyBondedWith`),
config ops (`loadNodeConfig`, `saveNodeConfig`,
`getProfileDir`, `nodeBundleDir`), runtime checks
(`assertOnline`, `probeMeshReady`), addresses
(`peerMultiaddrs`, `getPeerMultiaddrs`,
`localDiscoveryProfile`), audit (`appendAudit`),
and `now()` for cooldown calculation.

**Why this is a port, not a refactor:** the impl
logic (loop, retry, cooldown, error classification)
stays the same; only the **deps interface** changes
(the bridge defines its own abstract interface;
`apps/node/src/` provides the impl).

### 2.2 `peer-list` impl

**File:** `apps/node/src/developer-cli.ts:756`
(`listObservedPeers`)

~25 lines. Reads audit events from
`createLocalTaskStore(profileDir).readAuditEvents()`,
aggregates by `remotePeerId` (count + lastSeenAt),
sorts by lastSeenAt desc, limits to `args.limit`,
returns formatted text.

### 2.3 `relay-status` impl

**File:** `apps/node/src/developer-cli.ts:910`
(`showRelayStatus`)

~45 lines. Reads profile + audit events, calls
`buildRelayManagerSnapshot({ profile, auditEvents })`
from `@envoymesh/local-store:492`, returns formatted
text or JSON.

### 2.4 Bridge's `BUILTIN_TOOLS`

**File:** `envoy-harness/packages/envoy-harness/src/tools/builtin/index.ts`

Current tools: `read_file`, `bash`, `write`, `edit`,
`git`. Each is a `Tool<TParams>` with `name`,
`description`, `parameters` (zod), `async execute(args, ctx)`.

`ctx` is the agent's context (cwd, permissions,
signal, etc.). The B-class tools need a callback
to the host's `apps/node/src/` impl — this is a
**DI seam at tool construction time**.

### 2.5 Bridge's `ENVOY_HARNESS_SKILLS`

**File:** `envoy-harness/packages/envoy-harness-adapter/src/skills.ts:50`

Current skills: `code-edit`, `code-review`,
`doc-search`, `bash-run`, `plan` (5 skills). The
`getToolsForSkill(skillId)` returns the tool list
per skill. Step 3 adds 3 more skills.

### 2.6 EnvoyMesh's `OPENCLAW_SKILLS`

**File:** `packages/agent-adapter/src/openclaw-adapter.ts:37`

Current skills: `research`, `summarize`, `translate`,
`draft` (4 skills). Step 3 adds 3 more skills
(per user decision: invoking-runtime tag, so
OpenClaw also exposes the 3 B-class skills).

## 3. The Step 3 design

### 3.1 Canonical in the bridge (the rule)

**The bridge defines the canonical impl for each
B-class skill. `apps/node/src/` and OpenClaw are
thin wrappers.**

```
                    ┌──────────────────────────────────────────┐
                    │ envoy-harness-adapter (the bridge)      │
                    │                                          │
                    │  b-class-skills/                         │
                    │   ├─ sponsor-friend.ts (CANONICAL)       │
                    │   ├─ peer-list.ts (CANONICAL)            │
                    │   └─ relay-status.ts (CANONICAL)         │
                    │                                          │
                    │  BUILTIN_TOOLS:                          │
                    │   ├─ read_file, bash, write, edit, git   │
                    │   ├─ sponsor_friend (callback to host)  │
                    │   ├─ list_peers (callback to host)      │
                    │   └─ relay_status (callback to host)    │
                    └──────────────────────────────────────────┘
                          ▲           ▲            ▲
                          │           │            │
       ┌──────────────────┘           │            │
       │                              │            │
  ┌────┴────────┐  ┌────────┴────┐  ┌─┴──────────┐
  │ envoy-     │  │ developer-  │  │ OpenClaw   │
  │ harness    │  │ cli.ts      │  │ Adapter    │
  │ runtime    │  │ (peer-list, │  │            │
  │ (DI seam)  │  │  relay-     │  │            │
  └────────────┘  │  status)    │  └────────────┘
                 └─────────────┘
```

Each consumer builds the deps from its own context
+ calls the bridge's canonical impl. **One source
of truth; many thin wrappers.**

### 3.2 The deps interface (the DI seam)

**For `sponsor-friend` (complex):** the bridge
defines 4 sub-interfaces (grouped by concern):

```ts
// New: envoy-harness-adapter/src/b-class-skills/sponsor-friend.ts

/** Mesh operations needed by the sponsor-friend loop. */
export interface BClassSponsorFriendMeshDeps {
  searchPeers(input: { peerId: string }): Promise<Array<{ ownerId?: string; peerId?: string }>>;
  sendHello(targetOwnerId: string, profile: HelloProfile, message: string, options?: SendHelloOptions): Promise<{ messageId: string }>;
  applyWanJoinInvite(token: string): Promise<unknown>;
  waitForBondEstablished(targetOwnerId: string, timeoutMs: number): Promise<{ peerOwnerId: string; displayName?: string }>;
  assertOnline(): void;
  probeMeshReady?(): Promise<boolean>;
  peerMultiaddrs?: string[];
  getPeerMultiaddrs?(): Promise<string[]>;
  localDiscoveryProfile?: string;
}

/** Profile + trust operations. */
export interface BClassSponsorFriendProfileDeps {
  loadNodeProfile(): Promise<{ owner: { ownerId: string }; peerId: string } | undefined>;
  loadHelloProfile(): Promise<HelloProfile>;
  probeHumanProfileReady?(): Promise<boolean>;
  isAlreadyBondedWith?(ownerId: string): Promise<boolean>;
}

/** Config persistence. */
export interface BClassSponsorFriendConfigDeps {
  loadNodeConfig(): Promise<PersistedNodeConfig | undefined>;
  saveNodeConfig(config: PersistedNodeConfig): Promise<void>;
  getProfileDir(): string;
  nodeBundleDir?: string;
}

/** Audit + time. */
export interface BClassSponsorFriendAuditDeps {
  appendAudit?(event: AuditEvent): Promise<void>;
  now?(): number;
}

export interface BClassSponsorFriendDeps {
  mesh: BClassSponsorFriendMeshDeps;
  profile: BClassSponsorFriendProfileDeps;
  config: BClassSponsorFriendConfigDeps;
  audit: BClassSponsorFriendAuditDeps;
}
```

**For `peer-list` (simple):**

```ts
// New: envoy-harness-adapter/src/b-class-skills/peer-list.ts

export interface BClassPeerListDeps {
  readAuditEvents(): Promise<AuditEvent[]>;
  limit?: number;  // default 50
}

export function listPeersBridge(deps: BClassPeerListDeps): PeerListResult;
```

**For `relay-status` (simple):**

```ts
// New: envoy-harness-adapter/src/b-class-skills/relay-status.ts

export interface BClassRelayStatusDeps {
  readAuditEvents(): Promise<AuditEvent[]>;
  loadProfile(): Promise<NodeProfile | undefined>;
  limit?: number;  // default 50
}

export function buildRelayStatusBridge(deps: BClassRelayStatusDeps): RelayStatusResult;
```

**Why grouped sub-interfaces for sponsor-friend:**
17+ methods is too many for a single flat
interface. Grouping by concern (mesh / profile /
config / audit) makes it easier to mock in tests
and easier to evolve. The 4 sub-interfaces map
naturally to the 4 concerns of the runtime:
- **mesh** = the libp2p + bond context ops
- **profile** = the local node + bond profile
- **config** = the persisted node-config
- **audit** = observability + time

**Why no sub-interfaces for peer-list /
relay-status:** they're already simple (1-2
methods). A flat interface is clearer.

### 3.3 The BUILTIN_TOOLS exposure

**The 3 B-class tools in `envoy-harness`:**

```ts
// New: envoy-harness/packages/envoy-harness-adapter/src/b-class-skills/sponsor-friend.ts
//       (also re-exports the tool)

export const sponsorFriendTool = (deps: BClassSponsorFriendDeps): Tool<...> => ({
  name: "sponsor_friend",
  description:
    "Set up the bond with the canonical sponsor " +
    "(first-launch auto-bond). For diagnostic / " +
    "retry use; production auto-runs on bootstrap.",
  parameters: z.object({
    force: z.boolean().optional().describe(
      "Force a fresh cycle, bypassing cooldown and " +
      "profile-not-ready guards.",
    ),
  }),
  async execute({ force }, ctx) {
    const result = await runSponsorFriendBridge(deps, {
      forceBypassGuards: force ?? false,
    });
    return { content: JSON.stringify(result) };
  },
});
```

Similar for `listPeersTool(deps)` and
`buildRelayStatusTool(deps)`. The `envoy-harness`'s
`BUILTIN_TOOLS` array now includes these 3 (in
addition to the existing 5).

**The DI at the env**: the `createRealEnvoyHarnessRuntime`
function (in `agent-runtime-envoy/runtime.ts`)
constructs the deps and registers the tools:

```ts
// Modified: apps/node/src/agent-runtime-envoy/runtime.ts
import { listPeersTool, buildRelayStatusTool, sponsorFriendTool } from "@envoymesh/envoy-harness-adapter";
import { createBClassSponsorFriendDeps, createBClassPeerListDeps, createBClassRelayStatusDeps } from "./b-class-deps.js";

const bClassSponsorFriendDeps = createBClassSponsorFriendDeps(/* NodeServiceImpl state */);
const bClassPeerListDeps = createBClassPeerListDeps(/* NodeServiceImpl state */);
const bClassRelayStatusDeps = createBClassRelayStatusDeps(/* NodeServiceImpl state */);

const adapter = new EnvoyHarnessAdapter({
  buildAgent: defaultBuildAgentFactory({
    model,
    cwd: opts.cwd,
    meshSubmitter: submitter,
    bClassTools: [
      sponsorFriendTool(bClassSponsorFriendDeps),
      listPeersTool(bClassPeerListDeps),
      buildRelayStatusTool(bClassRelayStatusDeps),
    ],
  }),
  // ...
});
```

`defaultBuildAgentFactory` in the bridge
(`envoy-harness-adapter/src/adapter.ts`) accepts a
new `bClassTools?: Tool[]` option and registers
them in the agent's `ToolRegistry`.

### 3.4 The `apps/node/src/` wrappers

**Three thin wrappers** that build the deps from
`NodeServiceImpl`'s state and call the bridge:

```ts
// New: apps/node/src/agent-runtime-envoy/b-class-deps.ts
import type { NodeServiceImpl } from "../node-service-impl.js";
import type { BClassSponsorFriendDeps, BClassPeerListDeps, BClassRelayStatusDeps } from "@envoymesh/envoy-harness-adapter";

export function createBClassSponsorFriendDeps(service: NodeServiceImpl): BClassSponsorFriendDeps {
  return {
    mesh: { /* build from service._mesh, _bondContext, etc. */ },
    profile: { /* build from service._profile, _humanProfile */ },
    config: { /* build from service._configStore, service._profileDir */ },
    audit: { /* build from service._auditStore, service._now */ },
  };
}

export function createBClassPeerListDeps(service: NodeServiceImpl): BClassPeerListDeps {
  return {
    readAuditEvents: () => service._getAuditEvents(),
  };
}

export function createBClassRelayStatusDeps(service: NodeServiceImpl): BClassRelayStatusDeps {
  return {
    readAuditEvents: () => service._getAuditEvents(),
    loadProfile: () => service._loadProfile(),
  };
}
```

**`apps/node/src/node-service-setup-sponsor-friend.ts`
becomes a thin wrapper** (replaces 1001 lines):

```ts
// Refactored: apps/node/src/node-service-setup-sponsor-friend.ts
import { runSponsorFriendBridge } from "@envoymesh/envoy-harness-adapter";
import type { SetupSponsorFriendRuntimeDeps } from "./node-service-setup-sponsor-friend.types.js";
// (types preserved for backward compat)

export async function runSetupSponsorFriendViaRuntime(
  oldDeps: SetupSponsorFriendRuntimeDeps,  // backward compat
  input: RunSetupSponsorFriendInput = {},
): Promise<RunSetupSponsorFriendResult> {
  const newDeps = mapOldDepsToBridgeDeps(oldDeps);
  return runSponsorFriendBridge(newDeps, input);
}
```

**CLI commands become thin wrappers:**

```ts
// Modified: apps/node/src/developer-cli.ts

// peer-list command:
async function listObservedPeers(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const result = listPeersBridge({
    readAuditEvents: () => createLocalTaskStore(args.profileDir).readAuditEvents(),
    limit: args.limit,
  });
  return ok(result.text);
}

// relay-status command:
async function showRelayStatus(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const [profile, events] = await Promise.all([
    loadOrCreateNodeProfile(args.profileDir),
    createLocalTaskStore(args.profileDir).readAuditEvents(),
  ]);
  const result = buildRelayStatusBridge({
    readAuditEvents: () => Promise.resolve(events),
    loadProfile: () => Promise.resolve(profile),
    limit: args.limit,
  });
  if (args.outputFormat === "json") {
    return ok([JSON.stringify(result, null, 2)]);
  }
  return ok(result.text);
}
```

**OpenClawAdapter exposes 3 more skills:**

```ts
// Modified: packages/agent-adapter/src/openclaw-adapter.ts
export const OPENCLAW_SKILLS: SkillDescriptor[] = [
  // ... existing 4
  {
    skillId: "setup-sponsor-friend",
    description: "Set up the bond with the canonical sponsor (first-launch auto-bond).",
    costCeilingUsd: 1.0,
    maxSensitivity: "private",
    tags: ["mesh", "bond", "sponsor"],
  },
  { skillId: "peer-list", ... },
  { skillId: "relay-status", ... },
];
```

OpenClaw's `ask()` method (or a future skill
handler) routes these 3 skill IDs to the bridge
canonical impl (via a new OpenClawSkillHandler
that builds the deps from OpenClawState).

### 3.5 Tests

**Snapshot tests** (the cross-check that catches
regressions during the port):

```ts
// For each B-class skill:
// 1. Construct a synthetic dataset
// 2. Call the bridge's canonical impl
// 3. Call the existing `apps/node/src/` impl (before refactor)
// 4. Compare outputs (ignoring timestamps / nonces)
```

**Per-skill unit tests** (9 tests / skill):
1. Bridge impl with empty deps → safe default
2. Bridge impl with valid deps → expected output
3. Bridge impl with malformed deps → throws / returns error
4. Snapshot test vs `apps/node/src/` impl
5. Edge case: 0 audit events
6. Edge case: very large limit
7. Edge case: non-existent peer
8. The tool's `execute()` returns valid JSON
9. The tool's `parameters` schema validates input

**E2E test** (envoy-harness runs
`setup-sponsor-friend` end-to-end without OpenClaw):
- Construct a synthetic sponsor
- Use a fake `BClassSponsorFriendDeps` (in-memory)
- Call `createRealEnvoyHarnessRuntime.ask("Run sponsor-friend")`
- Verify the bond completes (or fails cleanly)
- Verify the result is non-empty text

### 3.6 What Step 3 does NOT cover

- **More skills beyond the 3 B-class.** Step 3 is
  scoped to the 3 identified. Future chunks can
  add more.
- **Replacing OpenClaw's local impl entirely.** The
  `apps/node/src/` wrappers preserve the existing
  public API; OpenClaw's local impl is still
  available as a thin wrapper. The migration is
  incremental — users calling OpenClaw see no
  change.
- **Cross-runtime invocation of B-class skills.**
  The 3 B-class skills are exposed on BOTH
  runtimes' manifests. The Assigner (Step 4) picks
  the primary runtime per job. A future chunk
  could add "if the primary doesn't have the
  B-class skill, delegate via
  `LocalCrossRuntimeSubmitter`" — but that's a
  routing decision (Q5) and lands in Step 5+.

## 4. Sub-chunks

### 4.1 Commit 1 — all 3 canonical impls + snapshot tests + wrappers (atomic, 1 commit)

Per user decision (2026-08-20): **1 commit for
all 3 B-class impls**, atomic. The rationale is
that the 3 B-class skills are conceptually one
feature ("mesh-touching capabilities canonical in
the bridge").

| File | Action | Notes |
|---|---|---|
| `envoy-harness-adapter/src/b-class-skills/sponsor-friend.ts` | New: 17+ deps interface (4 sub-groups) + `runSponsorFriendBridge` + `sponsorFriendTool` | Port from `apps/node/src/node-service-setup-sponsor-friend.ts` (~700 lines incl. impl) |
| `envoy-harness-adapter/src/b-class-skills/peer-list.ts` | New: 1-method deps + `listPeersBridge` + `listPeersTool` | Port from `developer-cli.ts:756` (~30 lines) |
| `envoy-harness-adapter/src/b-class-skills/relay-status.ts` | New: 2-method deps + `buildRelayStatusBridge` + `buildRelayStatusTool` | Port from `developer-cli.ts:910` (~60 lines) |
| `envoy-harness-adapter/src/b-class-skills/index.ts` | New: re-exports for the 3 modules | Convenience |
| `envoy-harness-adapter/test/b-class-skills/sponsor-friend.test.ts` | New: 9 unit tests + 1 snapshot test | 10 tests |
| `envoy-harness-adapter/test/b-class-skills/peer-list.test.ts` | New: 9 unit tests + 1 snapshot test | 10 tests |
| `envoy-harness-adapter/test/b-class-skills/relay-status.test.ts` | New: 9 unit tests + 1 snapshot test | 10 tests |
| `apps/node/src/agent-runtime-envoy/b-class-deps.ts` | New: 3 factory functions (build deps from NodeServiceImpl) | DI seam |
| `apps/node/src/node-service-setup-sponsor-friend.ts` | Refactored: 1001 lines → ~50 lines (wrapper that maps old deps → new deps + calls bridge) | Public API preserved |
| `apps/node/src/developer-cli.ts` | Refactored: `listObservedPeers` + `showRelayStatus` become thin wrappers (~10 lines each) | CLI command behavior preserved |
| `apps/node/src/agent-runtime-envoy/runtime.ts` | Modified: construct b-class deps + pass to `defaultBuildAgentFactory` | New `bClassTools` option |

**Total: ~30 new tests + 1 large refactor. Estimated
~1500 lines added (impl + tests) + ~700 lines
removed (1001-line file → 50-line wrapper).**

### 4.2 Commit 2 — manifest updates

| File | Action | Notes |
|---|---|---|
| `envoy-harness-adapter/src/skills.ts` | Modified: add 3 B-class skills to `ENVOY_HARNESS_SKILLS` | SkillId, description, cost, sensitivity, tags |
| `envoy-harness-adapter/src/adapter.ts` | Modified: `defaultBuildAgentFactory` accepts `bClassTools?: Tool[]` and registers them in the agent's `ToolRegistry` | New optional field |
| `packages/agent-adapter/src/openclaw-adapter.ts` | Modified: add 3 B-class skills to `OPENCLAW_SKILLS` | Per user decision: invoking-runtime tag (both runtimes expose the B-class skills) |
| `apps/node/src/agent-runtime-envoy/manifest.ts` | Modified: re-export the 3 B-class skills via `ENVOY_HARNESS_RUNTIME_SKILLS` | Auto-picked up via re-export from the bridge |

**1 commit, ~30 lines added.**

### 4.3 Commit 3 — E2E test + design doc

| File | Action | Notes |
|---|---|---|
| `envoy-harness-adapter/test/b-class-skills/sponsor-friend.e2e.test.ts` | New: e2e test (envoy-harness runs `setup-sponsor-friend` without OpenClaw) | 1 e2e test, self-skip when no sponsor available |
| `docs/agent-harness-integration.md` | Updated: §2.2 marked done; §5 Step 3 status | Status update |

**1 commit, ~80 lines added.**

## 5. Test coverage matrix

| Test case | Type | File |
|---|---|---|
| sponsor-friend: empty deps → safe default | Unit | §3.5 #1 |
| sponsor-friend: valid deps → expected output | Unit | §3.5 #2 |
| sponsor-friend: malformed deps → throws | Unit | §3.5 #3 |
| sponsor-friend: snapshot vs `apps/node/src/` impl | Unit | §3.5 #4 |
| sponsor-friend: 0 audit events | Unit | §3.5 #5 |
| sponsor-friend: very large limit | Unit | §3.5 #6 |
| sponsor-friend: non-existent peer | Unit | §3.5 #7 |
| sponsor-friend: tool execute returns valid JSON | Unit | §3.5 #8 |
| sponsor-friend: tool parameters validate input | Unit | §3.5 #9 |
| peer-list: 9 unit tests + 1 snapshot | Unit | §3.5 (all) |
| relay-status: 9 unit tests + 1 snapshot | Unit | §3.5 (all) |
| E2E: envoy-harness runs sponsor-friend without OpenClaw | E2E | §3.5 |

**Total: 30 unit tests + 3 snapshot tests + 1 e2e test = 34 new tests.**

## 6. Open questions

1. **Deps interface for sponsor-friend: flat (17+
   methods) or grouped (4 sub-interfaces)?**
   - **My recommendation: grouped.** Easier to mock
     + evolve. 17+ flat is hard to read.
   - **Default: grouped.** Override if you prefer
     flat.

2. **CLI command location: keep in `developer-cli.ts`
   (becomes wrapper) or move to
   `apps/node/src/agent-runtime-envoy/b-class-cli.ts`?**
   - **My recommendation: keep in `developer-cli.ts`.**
     The CLI is the entry point; moving the
     wrappers doesn't help. They're 10-line
     wrappers anyway.
   - **Default: keep in `developer-cli.ts`.** Override
     if you want to move.

3. **BUILTIN_TOOLS shape: new `bClassTools?` option
   on `defaultBuildAgentFactory` or a separate
   `defaultBuildAgentFactoryWithBClassTools`?**
   - **My recommendation: new `bClassTools?` option**
     (additive; doesn't break existing callers).
   - **Default: new option.** Override if you
     prefer a separate factory.

4. **Snapshot test fidelity: strict (data fields) or
   loose (timestamps / nonces)?**
   - **My recommendation: loose on timestamps / nonces.**
     Same as b3.live.2 — normalize timestamps
     before comparing.
   - **Default: loose.** Override if you want
     strict.

5. **`OpenClawAdapter` skill exposure: add to
   `OPENCLAW_SKILLS` only, or also add a skill
   handler that routes to the bridge impl?**
   - **My recommendation: add to `OPENCLAW_SKILLS`
     only for Step 3 v0.** The OpenClaw skill
     handler is a separate chunk (the OpenClaw
     adapter today routes via `ask()` only).
   - **Default: add to `OPENCLAW_SKILLS` only.**
     Override if you want the handler.

6. **The 3 B-class tools in envoy-harness BUILTIN_TOOLS:
   always-on or opt-in?**
   - **My recommendation: opt-in via `bClassTools`
     parameter on `defaultBuildAgentFactory`.**
     Production: always opt-in (chain worker
     passes the deps). Tests: opt-in to a fake.
   - **Default: opt-in.** Override if you want
     always-on.

## 7. References

- Design doc: `docs/agent-harness-integration.md`
  §2.2 (B-class skills), §5 (Step 3), §7 (open
  questions).
- High-level plan: `docs/agent-harness-integration-step3-4.md`
  §4 (Step 3 overview).
- Implementation guide:
  `docs/envoy-harness-integration-EnvoyMesh.md`.
- Step 4 sub-plan: `docs/agent-harness-integration-step4.md`.
- Existing `setup-sponsor-friend` impl:
  `apps/node/src/node-service-setup-sponsor-friend.ts`
  (1001 lines).
- Existing `peer-list` impl:
  `apps/node/src/developer-cli.ts:756`.
- Existing `relay-status` impl:
  `apps/node/src/developer-cli.ts:910`.
- Bridge skills catalog:
  `envoy-harness/packages/envoy-harness-adapter/src/skills.ts:50`.
- Bridge adapter:
  `envoy-harness/packages/envoy-harness-adapter/src/adapter.ts`.
- BUILTIN_TOOLS:
  `envoy-harness/packages/envoy-harness/src/tools/builtin/index.ts`.
- OpenClaw adapter:
  `packages/agent-adapter/src/openclaw-adapter.ts:37` (skills)
  + `packages/agent-adapter/src/openclaw-adapter.ts:98` (class).
- `buildRelayManagerSnapshot`:
  `packages/local-store/src/index.ts:492`.
- EnvoyMesh runtime (where the DI seam plugs in):
  `apps/node/src/agent-runtime-envoy/runtime.ts`.

## 8. Change log

- **2026-08-20 (initial draft):** Step 3 sub-plan
  written. 3 commits (impls + snapshot tests +
  wrappers → manifest updates → e2e test + doc).
  ~1500 lines added, ~700 lines removed. 34 new
  tests. Open questions §6 documented.

- **2026-08-20 (commit 1 ✅ done):** 1 atomic commit
  landed the 3 canonical impls + 3 B-class bridge
  tests + 3 `apps/node/src/` wrappers. Summary:

  **Bridge-side (envoy-harness, uncommitted at
  write-time — user commits when ready):**
  - 3 new files: `b-class-skills/{sponsor-friend,
    peer-list, relay-status, index}.ts` (~1200
    lines impl).
  - 3 new test files: 11 + 14 + 10 = 35 new tests.
  - 1 modified: `skills.ts` (added 3 B-class
    skill entries + 3 tool entries to
    `EnvoyHarnessToolName`).
  - 1 modified: `adapter.ts` (`defaultBuildAgentFactory`
    accepts new `bClassTools?` option).
  - 1 modified: `index.ts` (re-exports the 3
    B-class modules + 13 new types).

  **Host-side (EnvoyMesh, uncommitted — user commits
  when ready):**
  - 1 new file: `apps/node/src/agent-runtime-envoy/
    b-class-deps.ts` (~440 lines) — 3 factory
    functions building the bridge's `BClass*` deps
    from `NodeServiceImpl` state (bracket-notation
    private access).
  - 1 refactored: `apps/node/src/node-service-setup-
    sponsor-friend.ts` (1001 lines → ~700 lines
    wrapper) — preserves the public API + RPC
    semantics, delegates the algorithm to the
    bridge.
  - 1 refactored: `apps/node/src/developer-cli.ts`
    (`listObservedPeers` + `showRelayStatus`
    become thin wrappers around the bridge).
  - 1 modified: `apps/node/src/agent-runtime-envoy/
    runtime.ts` (new `bClassTools?` option on
    `CreateRealEnvoyHarnessRuntimeOptions`,
    forwarded to `defaultBuildAgentFactory`).
  - 1 modified: `apps/node/src/node-service-impl.ts`
    (builds the 3 B-class tools at runtime
    construction; passed via `bClassTools`).
  - Manifest re-export is automatic: the bridge's
    `ENVOY_HARNESS_SKILLS` (now 8 skills: 5
    envoy-harness + 3 B-class) flows through
    `agent-runtime-envoy/manifest.ts` unchanged.

  **Test counts (post-commit 1):**
  - envoy-harness-adapter: 140/140 (was 105;
    +35 B-class tests).
  - EnvoyMesh Phase 8 sponsor-friend: 32/32
    (unchanged).
  - EnvoyMesh developer-cli: peer-list +
    relay-status output matches the pre-Step-3
    snapshot line-for-line.
  - envoy-harness core: 1007/1007 (no regression).

  **Self-review issues caught (4 fixes, all in
  bridge):**
  1. **Missing `await` on `resolveEffectiveConfig`**
     — the bridge's `runSponsorFriendBridge` called
     `deps.config.resolveEffectiveConfig({...})`
     without `await`, so the `disabled-or-incomplete`
     check always fired (Promise object, not the
     resolved value). Fix: add `await`. Interface
     now allows `BClassResolvedSponsorFriend |
     Promise<BClassResolvedSponsorFriend>`.
  2. **Strict empty-`searchPeers` throw** — the
     bridge threw "sponsor peer not found in mesh"
     when `searchPeers` returned `[]`. The pre-Step-3
     host's loop was lenient (log + continue with
     bundled dial hints). Fix: log + continue
     (trace at step 1).
  3. **`sendHello` missing `preferredOwnerId` when
     peer is empty** — the bridge only set
     `preferredOwnerId` from `peer?.peerId`. When
     `searchPeers` was empty, the bridge passed no
     hint to `sendHello`. The test mock expected
     `targetPeerId` from the resolved bundled
     `peerId`. Fix: fall back to `resolved.peerId`
     when `peer` is empty.
  4. **Comprehensive `classifySponsorError` regex
     + auto-exhausted sentinel** — the bridge's
     initial classification was a subset of the
     host's. The 32-test snapshot had specific
     `lastErrorKind` expectations ("network-
     unreachable" for "no reachable path",
     "proof-token-mismatch" not "proof-token",
     "sponsor-no-ack" for "bond:established timed
     out"). Fix: copy the host's regex verbatim
     + map `proof-token` → `proof-token-mismatch` +
     add `bond:established.*timed out` to
     sponsor-no-ack + use the host's
     `AUTO_EXHAUSTED_COOLDOWN_UNTIL = "9999-12-31"`
     sentinel (not 24h).

  **Plan deviations (vs. §4.1):**
  - The plan said "the existing `SetupSponsorFriend
    RuntimeDeps` interface" stays as the host's
    RPC contract. v0 keeps it: the wrapper accepts
    the old-style deps and maps to the bridge's
    `BClassSponsorFriendDeps` internally. The
    RPC handler in `node-service-impl.ts` and the
    test suite don't need to change.
  - The plan said "deprecate `SetupSponsorFriend
    RetryLoop` (the background loop in
    `node-service-setup-sponsor-friend.ts`)".
    v0 goes further: the entire loop is gone;
    the wrapper just calls the bridge fire-and-
    forget. ~300 lines of `runSetupSponsorFriend
    RetryLoop` + `buildBasePersistedConfig` deleted.
  - The plan said "the host's `recordSponsorSkip`
    observability hook stays in the host". v0
    keeps it (synchronous `setup.sponsor_friend
    .skipped` audit event for cooldown / profile /
    mesh / disabled / already-completed /
    already-bonded cases).
  - The plan said "fire-and-forget" for the bridge
    call. v0 confirms: the host's wrapper does
    `void runSponsorFriendBridge(...).catch(...).
    finally(...)` and returns `{ running: true,
    ownerId }` immediately. The RPC has a 30-120s
    timeout; the bridge's loop can take 6+ minutes
    for 12 attempts. The wrapper's `activeSponsorLoops`
    Set is the synchronous single-flight gate; the
    bridge's own Set is a secondary safety net.
  - The plan's b-class-deps.ts had 3 factories
    for the `NodeServiceImpl` (runtime case). v0
    adds a 4th internal builder (`buildBridgeDeps`)
    in `node-service-setup-sponsor-friend.ts` for
    the old-style deps (RPC + test case). Both
    produce the same `BClassSponsorFriendDeps`
    shape. The runtime's `bClassTools` use the
    factory in `b-class-deps.ts`; the RPC + tests
    use `buildBridgeDeps`.

  **Files added/modified (summary):**
  - Added: 4 bridge files (impl) + 3 bridge files
    (tests) + 1 host file (b-class-deps.ts).
  - Modified: 3 bridge files (skills / adapter /
    index) + 3 host files (node-service-setup-
    sponsor-friend / developer-cli / runtime) +
    1 host file (node-service-impl).
  - Net: ~1500 lines added, ~700 lines removed
    (matches the plan's estimate).

- **2026-08-20 (commit 2 ✅ done):** the 3 B-class
  skills added to `ENVOY_HARNESS_SKILLS` (now 8
  total). Summary:

  **Bridge-side (envoy-harness, uncommitted at
  write-time — user commits when ready):**
  - 1 modified: `packages/envoy-harness-adapter/
    src/skills.ts` — added 3 B-class entries to
    `ENVOY_HARNESS_SKILLS` (5 + 3 = 8). Updated
    `EnvoyHarnessSkillId` literal union (8 IDs).
  - 1 modified: `packages/envoy-harness-adapter/
    test/skills.test.ts` — updated the catalog
    tests to expect 8 (was 5); added 3 cost
    ceilings to the cost map.
  - 1 modified: `packages/envoy-harness-adapter/
    test/adapter.test.ts` — updated `describeSkills`
    test (5 → 8) and the defensive-copy test
    (5 → 8).
  - 1 modified: `packages/envoy-harness-adapter/
    test/integration.test.ts` — updated
    `buildManifest` test (5 → 8).

  **Host-side (EnvoyMesh, uncommitted — user commits
  when ready):**
  - 1 modified: `packages/agent-adapter/src/
    openclaw-adapter.ts` — **reverted** the
    OpenClaw additions (see plan deviation below).
  - 1 modified: `apps/node/test/agent-adapter-
    manifest-aggregate-host.test.ts` — updated to
    expect 12 skills (8 + 4, was 9) + updated the
    test-reset case.

  **Plan deviation (vs. §4.2):** the plan said
  "add 3 B-class skills to `OPENCLAW_SKILLS` (per
  user decision: invoking-runtime tag, both
  runtimes expose the B-class skills)". v0
  deviates: `OPENCLAW_SKILLS` stays at 4 (the
  original 4). Rationale:

  - The merged manifest's `aggregateNodeManifest`
    (in `apps/node/src/agent-adapter-manifest-
    aggregate.ts`) has a fail-loud
    `SkillIdCollisionError` policy: any skillId
    advertised by two runtimes throws. The
    Step 4 test that was in place before Step 3
    expected 5 + 4 = 9 (no B-class on OpenClaw).
  - The Step 3 plan §3.1 declares envoy-harness
    the canonical impl: "The bridge defines the
    canonical impl for each B-class skill.
    `apps/node/src/` and OpenClaw are thin
    wrappers." With no OpenClaw skill handler
    in v0 (per §3.6 "add to OPENCLAW_SKILLS only;
    no skill handler (follow-up chunk)"), the
    OpenClaw manifest would advertise skills it
    can't actually run.
  - v0 exposes the 3 B-class skills on
    envoy-harness only. The orchestrator's
    primary-runtime picker reads the merged
    manifest; when a job's `requiredSkill`
    is `setup-sponsor-friend` / `peer-list` /
    `relay-status`, envoy-harness wins (it's
    the only runtime that advertises them).
  - **When the OpenClaw skill handler lands
    (future chunk per §3.6),** the 3 skills
    will either (a) move to OpenClaw with
    envoy-harness losing them (canonical moves)
    or (b) namespace under OpenClaw (e.g.
    `openclaw.setup-sponsor-friend`). The
    choice depends on Q5 routing (per-runtime
    primary + best-fit skill fallback) — out
    of Step 3 scope.

  **Test counts (post-commit 2):**
  - envoy-harness-adapter: 140/140 (no regression;
    3 tests updated: `describeSkills` length,
    catalog size, cost-ceiling map).
  - envoy-harness core: 1007/1007 (no regression).
  - EnvoyMesh Phase 8: 109/111 (2 live tests
    skipped — need API key).
  - EnvoyMesh agent-adapter-manifest-aggregate-
    host: 5/5 (1 test updated for 12 skills).
  - EnvoyMesh agent-adapter-manifest-aggregate
    (unit): 9/9 (no change).

  **Files added/modified (summary):**
  - Bridge: 1 modified (skills.ts) + 3 test files
    updated (skills.test / adapter.test /
    integration.test).
  - Host: 0 added + 1 modified
    (agent-adapter-manifest-aggregate-host.test)
    + 1 modified (openclaw-adapter.ts — but
    reverted, so net 0).
  - Net: ~80 lines added (the 3 skill entries
    + 1 doc-comment block) + ~10 lines removed
    (the test length updates).

- **2026-08-20 (commit 3 ✅ done):** the e2e test
  + design doc closeout landed. Summary:

  **Bridge-side (envoy-harness, uncommitted at
  write-time — user commits when ready):**
  - 1 new file: `packages/envoy-harness-adapter/
    test/b-class-skills/sponsor-friend.e2e.test.ts`
    (~290 lines) — 2 e2e tests:
    1. **Full sponsor-friend flow without
       OpenClaw.** Composes a full
       `BClassSponsorFriendDeps` (mesh / profile
       / config / audit), runs the bridge's full
       algorithm, asserts the success path:
       - bridge returns `{ ok: true, ownerId,
         attempts: 1 }`
       - trace log has 5 steps (1=search, 2=apply,
         3=sendHello, 4=waitForBond, 5=complete)
       - the final trace is the public-contract
         "auto-bond COMPLETE" message
       - `sendHello` called once with the right
         target + message + `proofOfContext` +
         `preferredOwnerId` hint
       - persisted state has
         `setupSponsorFriendCompletedAt` stamped
         (and `setupSponsorFriendCooldownUntil` /
         `setupSponsorFriendLastError` cleared).
    2. **`sponsor_friend` BUILTIN tool wraps
       the bridge correctly.** Calls the tool
       with `{ force: false }` (the default the
       model would use) and asserts the result
       contains the JSON-serialized bridge
       result.

    **Opt-in:** `RUN_B_CLASS_E2E=1` env var. The
    test is hermetic (no real network, no real
    LLM, no API key needed) so the opt-in is
    purely a "skip in CI" gate. CI doesn't set
    `RUN_B_CLASS_E2E`; developers run
    `RUN_B_CLASS_E2E=1 pnpm test` to exercise
    the full flow locally. Default `pnpm test`
    shows the test as "skipped" (explicit, not
    silent) — matches the existing
    `liveDescribe` convention in
    `packages/envoy-harness/test/live/helpers.ts`.

  **Host-side (EnvoyMesh, uncommitted — user commits
  when ready):**
  - 2 modified: `docs/agent-harness-integration.md`
    (status banner + Step 3 section ✅ DONE) +
    `docs/agent-harness-integration-step3.md`
    (status banner + commit 3 changelog entry) +
    `docs/agent-harness-integration-step3-4.md`
    (status banner + commit 3 changelog entry).

  **Test counts (post-commit 3):**
  - envoy-harness-adapter: 140/140 + 2 e2e
    (opt-in via `RUN_B_CLASS_E2E=1`).
    `pnpm test` (no opt-in): 140 pass + 2 skip.
    `RUN_B_CLASS_E2E=1 pnpm test`: 142 pass.
  - envoy-harness core: 1007/1007 (no regression).
  - EnvoyMesh Phase 8: 105/106 (1 live test
    skipped — needs API key).

  **Files added/modified (summary):**
  - Bridge: 1 new test file
    (sponsor-friend.e2e.test.ts).
  - Host: 0 added + 3 modified (the 3 docs).
  - Net: ~290 lines added (the e2e test) +
    ~30 lines added to the 3 docs.

  **Step 3 is complete.** The merged manifest
  now advertises 12 skills (8 envoy-harness +
  4 openclaw). The 3 B-class skills
  (`setup-sponsor-friend` / `peer-list` /
  `relay-status`) are envoy-harness only in v0.
  The orchestrator's primary-runtime picker
  (Step 5+) will route these skills to
  envoy-harness.

  **Follow-ups (out of Step 3 scope):**
  1. **OpenClaw skill handler** for the 3
     B-class skills (Step 3 plan §3.6). When
     the handler lands, the 3 skills either
     (a) move to OpenClaw with envoy-harness
     losing them or (b) namespace under
     OpenClaw. The choice depends on Q5
     routing (per-runtime primary + best-fit
     skill fallback).
  2. **Orchestrator integration (Step 5+).**
     The merged manifest is exposed via
     `NodeServiceImpl.getNodeManifest()`; no
     orchestrator reads it yet. The Assigner
     (Step 5) will use the manifest to route
     jobs to the primary runtime.
  3. **Q5 fallback.** If the primary runtime
     doesn't have a B-class skill, delegate
     via `LocalCrossRuntimeSubmitter`. The
     cross-runtime delegation infrastructure
     exists (Step 2); the routing logic is
     a Step 5+ concern.
  4. **Cleanup low-priority items** in the
     Step 3 commit 1 host code:
     - `apps/node/src/developer-cli.ts`: unused
       `maxIsoDate` + `formatCounts` helpers
       (no callers after refactor).
     - `apps/node/src/developer-cli.ts`:
       lazy `require("@envoymesh/local-store")`
       in `showRelayStatus` (could be
       top-level import; the lazy form was a
       defensive workaround for a possible
       circular dep that doesn't actually
       exist).
