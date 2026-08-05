# Update Guidebook to v0.2.2

## Context

The guidebook (`EnvoyMesh_GuideBook_0.1.0.md`, 5,307 lines) is stuck at v0.1.0 while the product has shipped two major features not yet documented:

1. **Content tab UI** (Phase 45, shipped) — the Social/EnvoyGo "Content" tab with **Feed / Blog / Explore** sub-tabs. The underlying `envoy://` content system is documented in section 33, but the user-facing tab UI is not.
2. **Family Network** (Phase 51, shipped) — one home node becomes a private family social network: owner + family-member profiles, EnvoyGo pairing, per-member AI/profile, family direct + group chat, shared AI agents, isolated data. Not documented at all.

The user wants to bump the guidebook to **v0.2.2**, add these two features (English markdown first), convert to **PDF + HTML**, then produce the matching **condensed Chinese** version. Scope is limited to these two features plus version/date/CHANGELOG housekeeping — no full re-validation.

Sources of truth for the new content: `docs/implementation-plan.md` (Phase 45 §L5882, Phase 51 §L6477), `docs/family_network.md`, and the website copy already written this session (which accurately describes both features).

## Approach

Four stages, in order: **EN markdown → HTML + PDF → ZH markdown → ZH HTML + PDF**.

A key constraint: the guidebook uses strict sequential section numbers (1–96) with `§N` cross-references. To avoid risky renumbering of ~70 sections in a 5,300-line file, **both new features are added as subsections under existing related sections** — zero renumbering.

### Stage 1 — English markdown

Create **`EnvoyMesh_GuideBook_0.2.2.md`** (copy of `EnvoyMesh_GuideBook_0.1.0.md` + edits):

**1a. Version housekeeping** (header, lines 2–10):
- `**Version:** 0.1.0` → `0.2.2`
- `**Revised:** 2026-07-25` → `2026-08-05`
- Language links: every `EnvoyMesh_GuideBook_0.1.0` → `EnvoyMesh_GuideBook_0.2.2` (line 5)
- "EnvoyMesh 0.1.0 repository state" → "0.2.2" (line 10)

**1b. Content tab UI** — add subsections **33.11–33.13** under section 33 "Publish and Browse Mesh Content" (after current 33.10, ~line 1473). Section 33 already covers `envoy://` URLs/Browser/Bazaar, so the tab UI is the natural completion:
- `33.11 The Content tab — Feed, Blog, and Explore` (overview of the three sub-tabs; how they aggregate `envoy://` content already described in 33.1–33.9)
- `33.12 Feed and Blog — read and post` (Feed = social feed of followed authors/topics; Blog = long-form posts with templates from 33.7; posting flow, visibility, notifications via 33.8)
- `33.13 Explore — discover mesh content` (discovery of public/bonded authors and topics; relationship to Bazaar in 33.6; metadata-first listing then `library.read`)

Also add the three `#### 33.1x` entries to the TOC (around line 1454 where 33.x is listed).

**1c. Family Network** — add subsections **20.9–20.14** under section 20 "Profiles and Presence" (after 20.8, ~line 942). Section 20 is in Part III "People, Profiles, and Conversations" — the correct home — and Family Network is fundamentally about profiles (owner vs. member) on the home node. Zero renumbering:
- `20.9 Family Network — one home node, many profiles` (concept: turn the home node into a private family server; no cloud, no subscription)
- `20.10 Owner and family member roles` (owner = full EnvoyMesh; member = focused subset; "like Netflix profiles")
- `20.11 Invite a family member` (family invite QR ≠ normal pairing QR; EnvoyGo pairing flow; device locked to one profile)
- `20.12 Family direct and group chat` (local-only, family-only groups; presence; push)
- `20.13 Shared AI agents, isolated data` (shared model config with secrets stripped; per-profile AI/bot threads; data isolation between members)
- `20.14 What family members cannot access` (no terminal, Pi, vault, external mesh contacts, or node settings)

Also add `#### 20.9`–`#### 20.14` entries to the TOC (after 20.8, ~line 933).

**1d. CHANGELOG** — add a `## [0.2.2] - 2026-08-05` entry to `CHANGELOG.md` (above `[0.1.0]`) listing: Content tab (Feed/Blog/Explore) UI, Family Network (multi-profile), guidebook refreshed to 0.2.2.

### Stage 2 — English HTML + PDF

**HTML**: `scripts/generate-guidebook-html.js` is currently hardcoded to the ZH 0.1.0 paths (lines 13–15). Parameterize it to accept `--input` / `--output` CLI args (falling back to current defaults), then run it to produce `EnvoyMesh_GuideBook_0.2.2.html` (project root) and `sites/EnvoyMesh_GuideBook_0.2.2.html`. The script already builds a styled TOC and adds heading IDs.

**PDF**: Install **pandoc** (`brew install pandoc`) plus **weasyprint** (`pip install weasyprint`) as the PDF engine — pandoc needs an engine, and weasyprint handles CJK (Chinese) fonts gracefully without a multi-GB LaTeX install. Generate:
```
pandoc EnvoyMesh_GuideBook_0.2.2.md -o EnvoyMesh_GuideBook_0.2.2.pdf \
  --pdf-engine=weasyprint --toc --toc-depth=3 \
  --metadata title="EnvoyMesh Guidebook 0.2.2" -c scripts/guidebook.css
```
(A small `scripts/guidebook.css` for print styling — page margins, font, code blocks — will be created. pandoc passes raw inline SVG/HTML through, so existing figures render.) Copy the PDF into `sites/` as well.

### Stage 3 — Chinese markdown (condensed append)

Create **`EnvoyMesh_GuideBook_0.2.2.zh-CN.md`** (copy of `EnvoyMesh_GuideBook_0.1.0.zh-CN.md` + edits):
- Same version housekeeping as 1a (0.1.0→0.2.2, date, links → 0.2.2 files)
- Append **condensed** ZH translations of the new subsections added in 1b/1c, matching the existing ZH guidebook's condensed style (the ZH edition is a 1,633-line summary, not a line-for-line translation — so the new sections stay concise). Place them at the equivalent locations (after the §20 and §33 ZH content) if the ZH file has those sections; otherwise append in a clearly-labeled "v0.2.2 新增" block near the end before any appendices.
- No full re-translation of the existing 1,633 lines.

### Stage 4 — Chinese HTML + PDF

Run the parameterized HTML generator on the ZH markdown → `EnvoyMesh_GuideBook_0.2.2.zh-CN.html` + `sites/` copy. Run pandoc+weasyprint → `EnvoyMesh_GuideBook_0.2.2.zh-CN.pdf` + `sites/` copy.

## Files created / modified

**Created:**
- `EnvoyMesh_GuideBook_0.2.2.md` (EN markdown)
- `EnvoyMesh_GuideBook_0.2.2.html`, `EnvoyMesh_GuideBook_0.2.2.pdf` (project root)
- `EnvoyMesh_GuideBook_0.2.2.zh-CN.md`, `.html`, `.pdf`
- `sites/EnvoyMesh_GuideBook_0.2.2.{html,pdf}`, `sites/EnvoyMesh_GuideBook_0.2.2.zh-CN.{html,pdf}`
- `scripts/guidebook.css` (print stylesheet for pandoc)

**Modified:**
- `scripts/generate-guidebook-html.js` — parameterize input/output paths
- `CHANGELOG.md` — add `[0.2.2]` entry

**Kept as-is (historical):** the `0.1.0.*` files are not deleted. The website `sites/index.html` / `index-zh.html` "Read Guidebook" links currently point to 0.1.0 — I'll update those links to 0.2.2 as a final touch (only if they reference the guidebook by filename).

## Verification

1. **Markdown integrity**: `grep -c '^### ' EnvoyMesh_GuideBook_0.2.2.md` — section count unchanged from 0.1.0 (no renumbering); new `#### 20.9`–`20.14` and `#### 33.11`–`33.13` present; TOC contains the new entries; version refs all read 0.2.2 (`grep -n '0\.1\.0'` returns nothing in body).
2. **HTML**: open `EnvoyMesh_GuideBook_0.2.2.html` in the browser (via the running static server) — confirm TOC links to the new subsections resolve and the Family Network / Content sections render.
3. **PDF**: open `EnvoyMesh_GuideBook_0.2.2.pdf` — confirm TOC, new sections, and inline SVG figures render; confirm page count is reasonable (~baseline + a few pages).
4. **ZH**: confirm `EnvoyMesh_GuideBook_0.2.2.zh-CN.md` version is 0.2.2, new ZH sections present, HTML+PDF render with correct Chinese characters.
5. **Cross-references**: `grep -nE '§[0-9]+|see [0-9]+\.'` — confirm none point to a now-shifted section (none should, since no renumbering occurred).
6. **Browser spot-check**: navigate the served HTML to the new `#content-tab` / `#family-network` headings to confirm anchors work.
