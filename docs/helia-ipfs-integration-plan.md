# Helia IPFS integration plan (dual-engine, Kubo-safe)

**Status:** Design / backlog — **does not replace** the shipped Kubo engine.

**Implementation scope:** **H1–H6** only. Kubo deprecation is **out of scope** — both engines remain supported indefinitely.

**Strategy:** Introduce Helia as a **second IPFS export engine** behind a small abstraction. The owner **configures and switches** the active engine at any time (Settings or `node-config.json`). Kubo is the **default**; Helia unlocks after parity CI. Shadow mode runs both for comparison. Switching engines does **not** uninstall the other — both stay available on the node.

**Related:** [external-distribution-ipfs-plan](./external-distribution-ipfs-plan.md) · [envoymesh-with-kubo](./envoymesh-with-kubo.md) · [developer-cli](./developer-cli.md)

---

## 1. Why dual-engine instead of a swap

| Concern | Dual-engine answer |
|---------|-------------------|
| Kubo works today | No changes to `kubo-ipfs-export.ts`, `kubo-ipfs-engine.ts`, or Tauri sidecar — Kubo stays shipped alongside Helia |
| Helia value (mobile, TS-native, no Go binary) | New code path only; desktop keeps Kubo as default |
| CID interop risk | **`publishedExternal.cid` stays Kubo-derived** until parity gate passes |
| Rollback / switch | Change `ipfsExportEngine` in Settings — takes effect on next export; no reinstall |

**Rule:** Never delete or rewrite Kubo modules to “make room” for Helia. Add parallel modules and a router.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Social UI / agent tools / RPC                                   │
│  exportLibraryItemToIpfs · getIpfsEngineStatus                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  vault-ipfs-export-service.ts  (orchestration — unchanged policy) │
│  allowIpfs gate · vault read · audit · published-external store   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  ipfs-export-router.ts  (NEW — engine selection + shadow mode)    │
└──────────────┬─────────────────────────────┬──────────────────────┘
               │                             │
    ┌──────────▼──────────┐       ┌──────────▼──────────┐
    │  KuboExportEngine   │       │  HeliaExportEngine  │
    │  (existing logic)   │       │  (NEW, @helia/unixfs)│
    │  subprocess + daemon│       │  in-process TS       │
    └─────────────────────┘       └─────────────────────┘
```

**Kubo path (unchanged behavior):**

- `kubo-ipfs-cli.ts` → `kubo-ipfs-engine.ts` → `kubo-ipfs-export.ts`
- Recipe id: `kubo-ipfs-export-v1`
- Managed daemon under `{profile}/ipfs-kubo`

**Helia path (new, isolated):**

- `helia-ipfs-engine.ts` → `helia-ipfs-export.ts`
- Recipe id: `helia-unixfs-export-v1` (separate semver bump surface)
- Blockstore under `{profile}/helia-blocks/` (or in-memory for fingerprint-only phase)
- **No** subprocess, **no** shared repo with Kubo

---

## 3. Engine abstraction (new module)

Add `apps/node/src/ipfs-export-engine.ts` with a minimal interface — **extracted from today’s Kubo calls**, not invented anew:

```typescript
export type IpfsExportEngineId = "kubo" | "helia";

export interface IpfsExportAddOutcome {
  ok: boolean;
  cid?: string;
  engineId: IpfsExportEngineId;
  engineVersion: string;       // kubo semver OR helia package version
  ipfsInteropRecipe: string;   // kubo-ipfs-export-v1 | helia-unixfs-export-v1
  stderr?: string;
  errorHint?: string;
}

export interface IpfsExportEngine {
  readonly id: IpfsExportEngineId;
  availableSync(profileDir: string): boolean;
  getStatus(profileDir: string): IpfsEngineStatusSlice;
  ensureReady(profileDir: string): Promise<void>;
  addFile(absFilePath: string, profileDir: string): Promise<IpfsExportAddOutcome>;
}

export interface IpfsEngineStatusSlice {
  available: boolean;
  running: boolean;
  managed: boolean;
  engineVersion?: string;
  errorHint?: string;
}
```

**Refactor scope (H1):** `vault-ipfs-export-service.ts` calls the router instead of `ensureKuboIpfsReady` + `kuboIpfsAddFileInteropRecipeV1` directly. Kubo implementation is a thin wrapper over existing functions — **zero CLI flag changes**.

---

## 4. Canonical CID policy (critical)

| Field | Source until parity gate | After parity gate (optional) |
|-------|--------------------------|------------------------------|
| `publishedExternal.cid` | **Active engine at export time** (default: Kubo) | Whichever engine is selected when user clicks Export |
| `publishedExternal.ipfsInteropRecipe` | Active engine recipe id | Records Kubo vs Helia recipe per export |
| `publishedExternal.exportEngineId` (NEW) | `"kubo"` \| `"helia"` | Audit trail when owner switches engines |
| `publishedExternal.kuboVersion` | Set when Kubo ran for that export | Empty if export used Helia only |
| `publishedExternal.cidHelia` (NEW, optional) | Shadow mode only — **never** sent in discovery | Diagnostic / migration aid |
| `publishedExternal.heliaVersion` (NEW, optional) | Shadow mode audit | Same |

**Discovery rule (unchanged):** `libraryMatches[].cid` uses **`publishedExternal.cid` only** — the canonical interop identifier peers expect from `ipfs cat` / gateways.

**Shadow mode:** On export, if `externalPublish.heliaShadowMode: true`, run Helia after Kubo succeeds, compare CIDs, audit mismatch — **do not** overwrite `cid` with Helia output.

---

## 5. Configuration

Extend `node-config.json` → `externalPublish` (all new fields default safe):

```typescript
interface ExternalPublishConfig {
  allowIpfs: boolean;                    // existing
  gatewayAllowlist: string[];             // existing

  /** Which engine produces publishedExternal.cid. Default: "kubo". */
  ipfsExportEngine?: "kubo" | "helia" | "kubo-with-helia-shadow";

  /** When primary is kubo, also run Helia and record cidHelia + parity audit. Default: false. */
  heliaShadowMode?: boolean;

  /** Helia-only: persist blocks to profile dir vs in-memory fingerprint. Default: "profile". */
  heliaBlockstore?: "profile" | "memory";
}
```

| `ipfsExportEngine` | Primary CID | Helia runs? | Kubo runs? |
|--------------------|-------------|-------------|------------|
| `kubo` (default) | Kubo | No | Yes |
| `kubo-with-helia-shadow` | Kubo | Yes (compare) | Yes |
| `helia` | Helia | Yes | No (desktop only after parity CI green) |

**Platform defaults (runtime, not user-facing initially):**

| Runtime | Default engine | Helia allowed? |
|---------|----------------|----------------|
| Tauri desktop | `kubo` | shadow only until parity |
| Browser + `node:dev` | `kubo` | shadow only until parity |
| Mobile (`MobileNode`) | `helia` (future) | Yes — **only** engine that can run in-process |
| Relay | — | No IPFS |

Mobile does **not** flip global default; each device has its own `ipfsExportEngine` in its profile config (e.g. mobile on `helia`, desktop on `kubo`).

---

## 5.1 Engine switching (runtime)

Owners switch engines without reinstalling or rebuilding the app.

| Action | Behavior |
|--------|----------|
| **Change engine in Settings** | Writes `externalPublish.ipfsExportEngine` to `node-config.json` via existing `updateNodeConfig` RPC |
| **When it applies** | Next **Export** / **Re-export** uses the newly selected engine; no node restart required |
| **Both engines on disk** | Kubo sidecar + Helia npm deps remain installed; router picks one per export |
| **Previous exports** | Unchanged — each row in `published-external.json` keeps its own `cid`, recipe, and `exportEngineId` |
| **Re-export after switch** | New revision overwrites latest export metadata; discovery uses new `cid` if file still matches `contentHash` |
| **Unavailable engine** | If selected engine is missing (e.g. Helia before H5 on mobile), export fails with clear hint; user can switch back in Settings |
| **Per-device** | Tauri desktop, browser+node, and mobile each have independent profile config — different engines on different devices is OK |

**Settings → Node → IPFS export engine** (dropdown, persisted):

| Option | Value | When enabled |
|--------|-------|--------------|
| Kubo | `kubo` | Always (default) |
| Kubo + Helia shadow | `kubo-with-helia-shadow` | H4+ |
| Helia | `helia` | H5+ (mobile), H6+ (desktop) after parity CI |

**Developer override:** `node-config.json` or env `ENVOYMESH_IPFS_EXPORT_ENGINE=kubo|helia|kubo-with-helia-shadow` for CI and scripts (optional, H1+).

---

## 6. Helia recipe (to be frozen in code)

Mirror Kubo semantics in `@helia/unixfs` — exact options TBD in H2 spike, then frozen as `helia-unixfs-export-v1`:

| Kubo flag | Helia analogue (target) |
|-----------|---------------------------|
| `--cid-version 1` | CIDv1 output from unixfs importer |
| `--pin=false` | No implicit pin in blockstore policy |
| Single file add | `unixfs.addFile()` on vault byte stream |
| Quiet root CID | DAG root CID string (same role as `ipfs add -Q`) |

**Parity gate:** For each fixture in `apps/node/test/fixtures/ipfs/`, Helia root CID **must equal** Kubo `kubo-ipfs-export-v1` CID before `ipfsExportEngine: "helia"` is allowed on desktop.

---

## 7. Package layout

```
packages/
  ipfs-export/                    # NEW shared types + recipe ids (optional split)
    src/
      recipes.ts                  # kubo-ipfs-export-v1, helia-unixfs-export-v1
      engine-types.ts

apps/node/src/
  ipfs-export-router.ts           # NEW — select engine, shadow mode
  ipfs-export-engine-kubo.ts      # NEW — wraps existing kubo-* modules
  helia-ipfs-export.ts            # NEW
  helia-ipfs-engine.ts            # NEW — lazy createHelia(), blockstore lifecycle
  kubo-ipfs-*.ts                  # UNCHANGED (except imports from router in H1)

packages/mobile-node/src/
  helia-ipfs-export.ts            # Re-export or thin wrapper (no child_process)
```

**Dependency:** Add `helia`, `@helia/unixfs` (and minimal blockstore deps) to `apps/node` first; later `@envoymesh/mobile-node` when mobile export ships. Keep Helia **out of** `@envoymesh/protocol` until schema fields stabilize.

---

## 8. API & UI (backward compatible)

### RPC

- `getIpfsEngineStatus` → extend to report **both** engines when shadow mode enabled:

```typescript
interface IpfsEngineStatus {
  /** Primary engine (produces publishedExternal.cid). */
  primary: IpfsEngineStatusSlice & { engineId: IpfsExportEngineId };
  /** Present when heliaShadowMode or dual status requested. */
  secondary?: IpfsEngineStatusSlice & { engineId: IpfsExportEngineId };
  lastParityCheck?: { at: string; matched: boolean; kuboCid: string; heliaCid?: string };
}
```

Existing clients reading `available` / `running` / `kuboVersion` at top level: keep **deprecated aliases** mapping to `primary` for one release cycle.

### Settings → Node

- **IPFS export engine** — dropdown to **switch** active engine: `Kubo` | `Kubo + Helia shadow` | `Helia`. Persisted immediately; next export uses selection.
- **IPFS engine status** — show **both** engines’ availability (Kubo sidecar / Helia in-process) so the owner knows what they can switch to before exporting.
- Helia option **disabled** in dropdown until parity CI green (desktop) or H5 shipped (mobile); tooltip explains why.

### Library

- No change to Export / Re-export buttons — same RPC; router reads current config.
- Optional column or tooltip on exported rows: engine badge (`Kubo` / `Helia`) from `exportEngineId`.
- Optional dev badge: “Helia shadow mismatch” when audit detects divergence.

---

## 9. Phased implementation (H1–H6)

Execute in order. Each phase has a **verification gate** before the next. **H7 (Kubo removal) is not planned** — this track ends at H6 with both engines coexisting.

### H1 — Extract router, zero behavior change

**Work:**

1. Add `ipfs-export-engine.ts` types + `ipfs-export-router.ts`.
2. Add `ipfs-export-engine-kubo.ts` delegating to existing Kubo modules.
3. Point `vault-ipfs-export-service.ts` at router with hardcoded `engine: "kubo"`.
4. Point `getIpfsEngineStatus` at Kubo via router.

**Verify:** All existing IPFS tests pass unchanged; no new Helia deps.

---

### H2 — Helia fingerprint spike (no RPC, no persistence)

**Work:**

1. Add `helia-ipfs-export.ts` with `heliaUnixfsAddFileInteropRecipeV1()`.
2. Developer CLI: `vault-ipfs-fingerprint --engine helia` (parallel to Kubo).
3. In-memory blockstore only; no daemon.

**Verify:** CLI prints Helia CID + recipe + helia version; Kubo path untouched.

---

### H3 — Golden parity CI

**Work:**

1. `apps/node/test/ipfs-helia-kubo-parity.test.ts` — same fixtures as `ipfs-kubo-golden.test.ts`.
2. CI job `ci-ipfs-helia-parity.yml` (or extend `ci-ipfs-kubo.yml`): runs Kubo + Helia, asserts CIDs match.
3. Document mismatches in test output for recipe tuning.

**Verify:** CI green on linux-amd64; macOS arm64 in release matrix before desktop Helia-primary.

**Gate:** No user-facing Helia primary until this passes.

---

### H4 — Shadow mode on desktop

**Work:**

1. Implement `helia-ipfs-engine.ts` (profile blockstore, lazy init).
2. Router: `kubo-with-helia-shadow` runs both; audit `vault.ipfs_export.helia_parity.matched|mismatched`.
3. Extend `published-external.json` with optional `cidHelia`, `heliaVersion` (backward compatible readers ignore).
4. Config + Settings UI: engine dropdown wired to `updateNodeConfig` (switchable at runtime).

**Verify:** Export still persists Kubo `cid` as canonical in shadow mode; owner can switch to/from shadow mode without restart.

---

### H5 — Mobile Helia export (opt-in)

**Work:**

1. Port Helia engine to `packages/mobile-node` (no `child_process`).
2. Mobile config profile flag or bonded-desktop delegation fallback unchanged when Helia unavailable.
3. Re-enable Library Export on mobile when `ipfsExportEngine: "helia"` and parity gate includes mobile-relevant fixtures.
4. UI: remove “desktop only” guard when Helia primary available.

**Verify:** Capacitor export on device; audit rows; discovery CID matches desktop Kubo exports for same file (parity).

---

### H6 — Configurable engine switch on desktop (post-parity)

**Work:**

1. Enable **Helia** in Settings engine dropdown when CI matrix green (alongside Kubo and shadow — all three switchable).
2. Tauri: optional **slim** build flavor without Kubo sidecar (separate artifact; **default build bundles both** so owners can switch back to Kubo).
3. Document engine switching in [envoymesh-with-kubo](./envoymesh-with-kubo.md) and operator runbooks.

**Verify:** Switch Kubo → Helia → Kubo on same profile; re-export produces correct CIDs; discovery, gateway verify, and agent tools work for exports from either engine.

**End state:** Permanent dual-engine product — configure and switch at any time; no planned removal of either engine.

---

## 10. What we explicitly do not change

| Module / behavior | Policy |
|-------------------|--------|
| `kubo-ipfs-export.ts` CLI args | Frozen unless `kubo-ipfs-export-v2` recipe bump |
| `kubo-ipfs-engine.ts` daemon lifecycle | No Helia imports |
| Tauri `fetch-kubo-sidecar.sh` / sidecar bundle | **Default build keeps Kubo**; optional slim Helia-only artifact at H6 |
| Gateway verify | HTTP-only; engine-agnostic (uses stored `cid`) |
| Discovery `cid` field | Always canonical `publishedExternal.cid` |
| Relay nodes | No IPFS |

---

## 11. Audit events (additions only)

| Event | When |
|-------|------|
| `vault.ipfs_export.helia_shadow.started` | Shadow mode begins |
| `vault.ipfs_export.helia_parity.matched` | CIDs equal |
| `vault.ipfs_export.helia_parity.mismatched` | CIDs differ — includes both CIDs in summary |
| `vault.ipfs_export.completed` | Unchanged; primary CID only |

Never log full file contents or blockstore paths outside profile.

---

## 12. Risks

| Risk | Mitigation |
|------|------------|
| Helia CID ≠ Kubo CID | Shadow mode + parity CI gate; canonical field stays Kubo until green |
| Bundle size (Helia deps) | Lazy import; mobile/desktop optional; measure in H2 |
| Two blockstores on disk | Separate dirs; Helia under `helia-blocks/` |
| Engine config confusion | Single dropdown; experimental locked until CI |
| Kubo regression during refactor | H1 is extract-only; no Helia in production path |

---

## 13. Success criteria (H1–H6)

1. **Kubo regression-free:** All existing IPFS tests pass after H1–H4.
2. **Parity proven:** Fixture files match Kubo CIDs in CI (`ENVOYMESH_HELIA_PARITY_TEST=1`).
3. **Mobile export:** End-to-end mobile export with discovery-visible CID matching desktop Kubo export of the same vault file.
4. **Runtime switching:** Owner changes engine in Settings; next export uses new engine without reinstall; Kubo ↔ Helia ↔ shadow all work after H6.
5. **Dual-engine coexistence:** Default Tauri release bundles Kubo **and** ships Helia deps; both switchable.

---

## 14. Quick reference

| Phase | User-visible? | Kubo touched? |
|-------|---------------|---------------|
| H1 Router extract | No | Wrapped only |
| H2 Helia CLI fingerprint | Dev CLI only | No |
| H3 Parity CI | No | No |
| H4 Shadow mode | Dev/config | No behavior change default |
| H5 Mobile export | Yes (opt-in) | No |
| H6 Engine switch (desktop) | Yes — Settings dropdown | Both remain available |

**Start here:** H1 when implementation begins; this document stays the source of truth for dual-engine policy (H1–H6).
