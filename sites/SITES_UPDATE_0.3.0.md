# Sites & Guidebook update — v0.3.0

**Release:** 0.3.0  
**Revised:** 2026-08-27  
**Status:** P0 + P1 shipped (2026-08-27). P2 banner on `agent-network-config.md` only.

## Why 0.3.0

Since **0.2.2** (Content tab, Family Network), three product areas moved enough to warrant a **minor** public release:

| Area | What changed | Site impact |
|------|----------------|-------------|
| **Envoy Harness** | New coding-agent surface in Social (panel + EH UI), TUI/peer in Tauri, ACP host | **New pillar** — not on site or guidebook today |
| **Agent Network** | Team jobs UX, worker discovery, chain reports, speculation / parallel attempts, recovery | Homepage copy still says generic “job board” |
| **Knowledge base** | Envoy Local embed sidecar, tighter chunks, self-healing reindex | `knowledge-base.html` omits local embed + recovery |

EnvoyGo remains a thin client — no store-listing changes required unless marketing text claims harness on mobile.

---

## File checklist

### Version bump (done in repo)

| File | Action | Status |
|------|--------|--------|
| `sites/index.html` | Links → `0.3.0` downloads + guidebook | ✅ |
| `sites/index-zh.html` | Same (中文) | ✅ |
| `sites/EnvoyMesh_GuideBook_0.3.0.html` | Regenerated from md | ✅ |
| `sites/EnvoyMesh_GuideBook_0.3.0.zh-CN.html` | Regenerated from md | ✅ |
| `EnvoyMesh_GuideBook_0.3.0.md` | Source + 0.3.0 subsections | ✅ |
| `EnvoyMesh_GuideBook_0.3.0.zh-CN.md` | ZH addendum + E.1 Harness | ✅ |
| `CHANGELOG.md` | `[0.3.0]` entry | ✅ |

### P0 — ship with 0.3.0 release artifacts

| File | Task | Status |
|------|------|--------|
| `sites/index.html` | Harness nav + section; Agent Network copy; hero/meta | ✅ |
| `sites/index-zh.html` | Mirror EN | ✅ |
| `sites/knowledge-base.html` | Envoy Local + recovery | ✅ |
| `sites/knowledge-base-zh.html` | Mirror | ✅ |
| `EnvoyMesh_GuideBook_0.3.0.md` | New subsections; Appendix J | ✅ |
| `EnvoyMesh_GuideBook_0.3.0.zh-CN.md` | 0.3.0 addendum | ✅ |
| Regenerate HTML/PDF | `node scripts/generate-guidebook-html.js` | ✅ HTML |

### P1 — soon after tag

| File | Task | Status |
|------|------|--------|
| `sites/index.html` / `index-zh.html` | Harness screenshots wired (`envoy_harness.png`) | ✅ |
| `sites/index.html` / `index-zh.html` | Re-capture `team_jobs.png` if speculation UI visible | Optional |
| `sites/security.html` | Harness approvals policy-gated on home node | ✅ |
| `sites/security-zh.html` | Mirror | ✅ |
| `sites/qr_review.html` | Bump version if it references downloads | N/A (no version refs) |
| `apps/envoygo/store-release/apple_google_reviewing.md` | Only if listing mentions desktop-only features | N/A |

### P2 — do not publish on main nav

| File | Task | Status |
|------|------|--------|
| `sites/agent-network-config.md` | Banner — Phase 32 AI Engine, not Agent Network | ✅ |

### Deployment (operator)

Upload to `gpt4people.online/EnvoyMesh/` when binaries exist.

**Stable mirror URLs** (sites link to these fixed paths — overwrite on each release; no HTML change when VERSION bumps):

| File on server | Public URL |
|----------------|------------|
| `envoymesh-desktop.dmg` | https://gpt4people.online/EnvoyMesh/envoymesh-desktop.dmg |
| `envoymesh-desktop.exe` | https://gpt4people.online/EnvoyMesh/envoymesh-desktop.exe |

Build scripts also write versioned archives under `release/envoymesh-desktop-{version}-…` for GitHub Releases. Copy the **stable** filenames above to the mirror (or upload both).

**macOS signed DMG for the mirror:** [docs/macos-mirror-signing.md](../docs/macos-mirror-signing.md) (Developer ID + notarization; not Mac App Store).

Other optional uploads:

- `envoygo-0.3.0-android.apk.zip` (or store-only if no sideload)
- `EnvoyMesh_GuideBook_0.3.0.pdf` / `.zh-CN.pdf` (optional)

---

## Verification before publish

- [x] All `0.2.2` links on `index.html` / `index-zh.html` point to `0.3.0`
- [x] Guidebook EN/ZH HTML regenerated; cover shows **0.3.0**
- [ ] Download URLs return 200 after upload (or hide until artifacts ready)
- [x] Feature status labels match Appendix J (Harness = Beta)
- [x] No claim that EnvoyGo runs full Harness IDE
- [x] `CHANGELOG.md` `[0.3.0]` matches shipped scope

---

## Guidebook — new subsection IDs (0.3.0)

| Location | IDs | Topics |
|----------|-----|--------|
| Tour | §11.13 | Harness (Beta) |
| Personal AI | §25.11–25.13 | Harness overview, timeline, Chat vs Terminal |
| Approvals | §28.11 | Harness approvals |
| Knowledge | §29.10–29.11 | Envoy Local embed; reindex recovery |
| Agent Network | §55.11 | Speculation (Beta) |
| EnvoyGo mirror | §60.9 | Harness monitor |
| Terminals | §78.11–78.13 | Terminal harness, peer exec, mobile |
| Appendix J.2 | — | Harness + speculation listed as Beta |
| Part XV | §103.13 | `/harness` website page outline |
