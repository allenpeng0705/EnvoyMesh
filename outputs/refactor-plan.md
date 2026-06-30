# Refactoring Plan — `apps/node/src/node-service-impl.ts`

## Baseline
- Branch: `refactor/impl-clean` (based on `main` / `74157e4d`)
- File size: 14,247 lines, 543 methods, 0 TypeScript errors
- Existing extracted modules at baseline: `company-invite`, `discovery`, `fleet-manifest`, `lan-auto-bond`, `sync`, `wan` (each follows the runtime-module pattern)

## Pattern (what to follow)

Each extraction creates `apps/node/src/node-service-{feature}.ts`:
1. Define `export interface XxxRuntimeContext { … }` — typed bag of data + services the runtime needs.
2. Export `async function xxxViaRuntime(ctx, params)` — pure functions, no `this`.
3. Replace the class method body with a single call to the runtime function, building the context inline from `this._xxx` fields.

```ts
// Class method becomes ~5 lines:
async importFleetManifest(params): Promise<...> {
  if (!this._taskStore) return { ok: false, reason: "malformed", ... };
  return importFleetManifestViaRuntime(
    { trustStore: this._trustStore, peerDirectoryStore: this._peerDirectoryStore, ... },
    params,
  );
}
```

## Per-extraction protocol (one commit each)

1. Read the section, list the methods that belong to it.
2. Sketch the `RuntimeContext` (which fields, which helpers it needs).
3. Extract each method body to a runtime function in the new file.
4. Reduce the class method to a 1-block delegation (guards + call).
5. Add unit tests for the runtime module (`packages/api/test` or a sibling) using a mock context.
6. **Verify:** `npm run typecheck` → 0 errors. `npm test` → all pass.
7. **Commit** with the conventional message: `refactor: extract <feature> to node-service-<feature>.ts`.
8. Move to next only after the user confirms the previous one is good.

## Sequence (10 extractions, small → big)

| # | Feature                       | Lines | Section                            | Risk |
|---|-------------------------------|-------|------------------------------------|------|
| 1 | Discovery clusterer           |  ~89  | Phase 23A+ (6155–6244)             | low  |
| 2 | Mesh Intelligence Report      |  ~74  | Phase 28   (6032–6106)             | low  |
| 3 | Proactive agent pass          |  ~49  | Phase 27   (6106–6155)             | low  |
| 4 | Connection suggester          |  ~41  | Phase 23B  (4820–4861)             | low  |
| 5 | Mesh awareness pass           |  ~26  | Phase 25A  (6257–6283)             | low  |
| 6 | Chat RAG search (stub)        |  ~13  | Phase 23D  (6244–6257)             | low  |
| 7 | Intent history                | ~168  | Phase 25D  (6298–6466)             | med  |
| 8 | Cross-device continuity       |~1014  | Phase 25   (6466–7480)             | med  |
| 9 | Agent Network Chains          |~1187  | Phase 40   (12157–13344)           | high |
|10 | Voice/Video Calls             | ~903  | Phase 38   (13344–14247)           | high |

Items deferred: OpenClaw Runtime (~1171), Fleet Manifest inline cleanup, Agent Circle CRUD, Bond steward pass — these need more careful scoping and come later.

## Why this order
- Start with 4 small (≤90 lines) extractions to validate the pattern works on this baseline.
- Then a stub + small standalone (Chat RAG) to confirm the test harness fits.
- Escalate to mid-sized (Intent history, Continuity) once the pattern is stable.
- Largest extractions (Chains, Calls) last, when we have the rhythm.

## Progress

- [x] **Step 1** (cb9bc62): Discovery clusterer → `node-service-discovery-clusterer.ts`. -76 / +136 runtime / +192 test. 2043 pass / 79 fail. 7 new unit tests.
- [x] **Step 2** (a9a94c4): Mesh Intelligence Report → `node-service-mesh-intelligence.ts`. -58 / +167 runtime / +287 test. 2055 pass / 79 fail. 12 new unit tests.
- [x] **Step 3** (f0f8f5f): Proactive agent pass → `node-service-proactive-agent.ts`. -35 / +112 runtime / +207 test. 2065 pass / 79 fail. 10 new unit tests.

Cumulative: `node-service-impl.ts` 14,247 → 14,078 lines (-169). 0 tsc errors. 0 regressions.

## Out of scope
- Changing public API surface of `NodeService`.
- Modifying `@envoymesh/*` packages.
- Renaming existing methods.
- Touching `.deepseek/state/` (permission-blocked, runtime state).

## Success criteria
- File shrinks from 14,247 → ~5,000 lines (estimated).
- `npm run typecheck` clean after every commit.
- `npm test` green after every commit.
- Every new runtime module has unit tests (mocked context).