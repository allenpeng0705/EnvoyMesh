# Sites & Guidebook update — v0.4.0

**Release:** 0.4.0  
**Revised:** 2026-09-01  
**Status:** P0 shipped (guidebook + homepage Market section)

## Why 0.4.0

Since **0.3.0** (Harness, Team jobs, knowledge recovery), **Phase 63 Envoy Market** shipped as the headline minor release:

| Area | What changed | Site impact |
|------|----------------|-------------|
| **Envoy Market** | Per-owner shop, public/bonds listings, mesh search, listing-scoped inquire, EnvoyAI shortlist, soft close | **New pillar** — Market nav + section on homepage |
| **Social UX** | Market tab; Discover before Explore; full Market i18n | Feature cards + guidebook Part XVI |
| **Commerce honesty** | No in-app payment/escrow in 0.4.0 | Copy on site + guidebook §64.6 |

EnvoyGo store listings were **not** updated (separate app version).

---

## File checklist

### Version bump (repo)

| File | Action | Status |
|------|--------|--------|
| `VERSION` + `scripts/sync-version.mjs` | Workspace → 0.4.0 | ✅ |
| `sites/index.html` | Links → `0.4.0` guidebook; Market section + nav | ✅ |
| `sites/index-zh.html` | Mirror EN | ✅ |
| `sites/EnvoyMesh_GuideBook_0.4.0.html` | Regenerated from md | ✅ |
| `sites/EnvoyMesh_GuideBook_0.4.0.zh-CN.html` | Regenerated from md | ✅ |
| `EnvoyMesh_GuideBook_0.4.0.md` | Source + Part XVI Market; Appendix J | ✅ |
| `EnvoyMesh_GuideBook_0.4.0.zh-CN.md` | 0.4.0 addendum + E.1 | ✅ |
| `CHANGELOG.md` | `[0.4.0]` entry | ✅ |
| `README.md` / `README.zh-CN.md` | Guidebook links → 0.4.0 | ✅ |
| `sites/knowledge-base*.html` | Generic upgrade reindex copy | ✅ |

### P0 — ship with 0.4.0 release artifacts

| File | Task | Status |
|------|------|--------|
| `sites/index.html` / `index-zh.html` | `#market` section; meta description | ✅ |
| `EnvoyMesh_GuideBook_0.4.0.md` | Part XVI (§64.1–64.7); J.1 Market listed | ✅ |
| Regenerate HTML | `node scripts/generate-guidebook-html.js` | ✅ |

### P1 — soon after tag

| File | Task | Status |
|------|------|--------|
| `sites/index.html` / `index-zh.html` | Dedicated Market screenshot when captured | Optional |
| `sites/security.html` | Listing-scoped stranger chat policy note | Optional |

### Deployment (operator)

Upload to `gpt4people.online/EnvoyMesh/` when binaries exist.

**Stable mirror URLs** (unchanged — overwrite on each release):

| File on server | Public URL |
|----------------|------------|
| `envoymesh-desktop.dmg` | https://gpt4people.online/EnvoyMesh/envoymesh-desktop.dmg |
| `envoymesh-desktop.exe` | https://gpt4people.online/EnvoyMesh/envoymesh-desktop.exe |

Optional: `EnvoyMesh_GuideBook_0.4.0.pdf` / `.zh-CN.pdf`

---

## Verification before publish

- [x] All guidebook links on `index.html` / `index-zh.html` point to `0.4.0`
- [x] Guidebook EN/ZH HTML regenerated; cover shows **0.4.0**
- [ ] Download URLs return 200 after upload
- [x] No claim of in-app payments in 0.4.0 Market copy
- [x] `CHANGELOG.md` `[0.4.0]` matches Phase 63 scope
- [x] EnvoyGo `pubspec.yaml` / store docs untouched

---

## Guidebook — new subsection IDs (0.4.0)

| Location | IDs | Topics |
|----------|-----|--------|
| Part XVI | §64.1–64.7 | Envoy Market shop, browse, inquire, EnvoyAI, payments honesty, Social tabs |
| Appendix J.1 | — | Market listed under Available (0.4.0) |
| Appendix J.5 | — | Human market vs Agent Network marketplace |
| ZH addendum | — | 0.4.0 Market summary |
