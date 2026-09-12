/**
 * Module-boundary classifier — generates the Axis-1 reusability manifest.
 *
 * **Rule (from `docs/envoymesh-refactoring-plan.md` §3):** reusability is a
 * binary, mechanical property — *does this module require a product concept?*
 * A module is `reusable` when all three conditions hold:
 *
 *   1. **No concept reference** — it does not name a product concept.
 *   2. **No tainted dependency** — it does not import, directly or
 *      transitively, a module that fails (1) or (2).
 *   3. **No non-core package dependency** — every `@envoymesh/*` package it
 *      imports is in the declared core set (below).
 *
 * Conditions (1)+(2) alone yield 476 reusable files in `apps/node/src`;
 * adding (3) yields 259. The plan's figures are the three-condition result.
 * Both declared inputs (concept set, core package set) are recorded in the
 * manifest so the classification is reproducible and auditable.
 *
 * **What this script does:** scans source roots, applies the three conditions,
 * derives capability tags, and writes `module-boundary.json`.
 *
 * **Scope** — the module universe the boundary applies to:
 * - `apps/node/src/**\/*.ts`
 * - `packages/*\/src/**\/*.ts` (npm packages; excludes test/dist)
 * - `packages/envoy-{mesh,mesh-libp2p,thin-client}-dart/lib/**\/*.dart`
 *
 * **Tags are labels, not boundaries.** They exist for navigation and review;
 * they carry no dependency rules (`§3` Axis 2).
 *
 * **Usage:**
 * ```sh
 * node scripts/classify-modules.mjs                 # write the manifest
 * node scripts/classify-modules.mjs --check         # fail if it is stale
 * node scripts/classify-modules.mjs --stdout        # print, do not write
 * node scripts/classify-modules.mjs --summary       # counts only
 * ```
 *
 * **Exit codes:** 0 = ok, 1 = `--check` found the manifest stale (or unreadable).
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { isTsSourceFile, stripComments, stripCommentsAndStrings } from "./lib/source-files.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

// --- declared inputs --------------------------------------------------------
// Changing either of these changes the classification; both are written into
// the manifest header so a diff of the manifest shows the input change too.

/** Product concepts. A module naming any of these is `product-bound`. */
export const CONCEPT_PATTERN =
  "\\b(OWNER_FAMILY_PROFILE_ID|FamilyProfile|familyProfile|familyProfiles|" +
  "boundFamilyProfileId|callerFamilyProfileId|FamilyThreadKey|AiBotThreadKey|" +
  "persona|Persona|PhonePersona|bondTier|BondTier|familyRoom|FamilyRoom|" +
  "isOwnerProfile|SocialBackend|PhoneSocialStore|BondContact|" +
  "CrossPersonaSuggestion)\\b";

/**
 * NOTE on a deliberate omission: a **bare `profileId`** is *not* a concept.
 * It is protocol vocabulary — e.g. `PairingData.profileId` is an optional
 * query parameter, and `ext-agent-adapter/session-model-store.ts` mentioned it
 * only in a comment. Matching it produced false positives that made the
 * reusable pairing descriptor (`pairing_uri.dart`) look product-bound. The
 * qualified forms (`familyProfileId`, `boundFamilyProfileId`,
 * `callerFamilyProfileId`, `isOwnerProfile`) name the product concept; the
 * bare field does not.
 */

/**
 * `@envoymesh/*` packages a `reusable` module may import.
 * `@envoymesh/api` is deliberately excluded: it currently exports the whole
 * product surface (E9), so it is not a core package today.
 */
export const CORE_PACKAGES = [
  "@envoymesh/protocol",
  "@envoymesh/identity",
  "@envoymesh/network",
  "@envoymesh/vault",
  "@envoymesh/local-store",
];

/**
 * Paths excluded from the module universe, with the reason. Written into the
 * manifest header so the scope is auditable rather than implied by a glob.
 */
export const EXCLUDED = {
  "packages/openclaw":
    "Vendored third-party tree (upstream \"openclaw\" 0.2.0, ~2.7 GB, 16,882 .ts files). " +
    "Not this repo's code to classify; the boundary does not apply to it.",
};

/** Source roots scanned for modules. */
export const ROOTS = [
  "apps/node/src",
  "packages",
  "packages/envoy-mesh-dart/lib",
  "packages/envoy-mesh-libp2p-dart/lib",
  "packages/envoy-thin-client-dart/lib",
];

function isExcluded(rel) {
  return Object.keys(EXCLUDED).some((p) => rel === p || rel.startsWith(`${p}/`));
}

/** Capability tags (Axis 2 — labels only, no rules). First match wins. */
const TAG_RULES = [
  [/terminal/i, "terminal"],
  [/harness|^eh-|\/eh-|coding|ext-agent|aider|codex|claudecode|codewhale|cursor-agent|mmx|opencode/i, "harness"],
  [/relay|discovery|libp2p|network|envelope|transport|bootstrap|mdns|dht|stun/i, "transport"],
  [/pairing|pair-|kiosk|invite|qr/i, "pairing"],
  [/\bcall|camera|voice|webrtc|session-manager/i, "calls"],
  [/vault|library|rag|knowledge|obsidian|markdown/i, "vault"],
  [/model|brain|semantic|prompt/i, "models"],
  [/vault|fileshare|library|file-share|fs-|home-fs|attachment/i, "filesystem"],
  [/family|persona|social|chat|contact|bond|roster|profile|avatar|feed|gallery|intro/i, "social"],
  [/screens|widgets|components|views|theme|l10n/i, "ui"],
];

// --- helpers ----------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};

const manifestPath = path.resolve(
  repoRoot,
  opt("--out", "scripts/module-boundary.json"),
);

// `stripComments` / `stripCommentsAndStrings` live in `scripts/lib/source-files.mjs`
// — the directive-vs-concept distinction broke this file twice and the wiring
// gate once, so there is one implementation and the helper documents which
// variant each use needs.

async function walk(dir, ext) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", "dist", "build", ".dart_tool", "test", "tests"].includes(e.name)) continue;
      out.push(...(await walk(full, ext)));
    } else if (ext === ".ts" ? isTsSourceFile(e.name) : e.name.endsWith(ext)) {
      // `.ts` goes through `isTsSourceFile`, which excludes declarations and
      // every other emitted artifact. `name.endsWith(".ts")` alone is true of
      // `foo.d.ts`, and a stray tsc emission inside `src/` then counted as
      // modules — five phantom manifest entries, no compile error (see
      // scripts/lib/source-files.mjs).
      out.push(full);
    }
  }
  return out;
}

/** Resolve a relative import spec to a repo-relative module path, if in scope. */
function resolveImport(fromRel, spec, known) {
  if (spec.startsWith("@envoymesh/")) return null; // package boundary
  // Dart uses bare sibling specifiers (`import 'models.dart'`) — relative to
  // the importing file, not to a package scheme. Any other bare specifier
  // (npm package, `package:` URI) is an external boundary.
  const isDartSibling = spec.endsWith(".dart") && !spec.includes(":");
  if (!spec.startsWith(".") && !isDartSibling) return null;
  const base = path.posix.dirname(fromRel);
  const joined = path.posix.normalize(path.posix.join(base, spec));
  const candidates = [
    joined,
    joined.replace(/\.js$/, ".ts"),
    `${joined}.ts`,
    `${joined}.dart`,
    path.posix.join(joined, "index.ts"),
  ];
  for (const c of candidates) if (known.has(c)) return c;
  return null;
}

// --- scan -------------------------------------------------------------------

async function collectModules() {
  const relPaths = new Set();
  const abs = new Map();

  for (const f of await walk(path.join(repoRoot, "apps/node/src"), ".ts")) {
    const rel = path.relative(repoRoot, f).split(path.sep).join("/");
    relPaths.add(rel);
    abs.set(rel, f);
  }
  const pkgDir = path.join(repoRoot, "packages");
  for (const entry of await fs.readdir(pkgDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name.endsWith("-dart")) continue; // handled by the lib roots below
    if (isExcluded(`packages/${name}`)) continue; // documented in EXCLUDED
    for (const f of await walk(path.join(pkgDir, name, "src"), ".ts")) {
      const rel = path.relative(repoRoot, f).split(path.sep).join("/");
      relPaths.add(rel);
      abs.set(rel, f);
    }
  }
  // Every Dart package with a `lib/` tree is in scope — discovered, not
  // hardcoded. A hardcoded list let a NEW Dart package escape classification
  // entirely (found when `envoy-reuse-fixture` was added), which would have
  // made the completeness rule vacuous for Dart.
  for (const entry of await fs.readdir(pkgDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (isExcluded(`packages/${entry.name}`)) continue;
    const libDir = path.join(pkgDir, entry.name, "lib");
    let isDartPackage = false;
    try {
      isDartPackage = (await fs.stat(path.join(pkgDir, entry.name, "pubspec.yaml"))).isFile();
    } catch {
      isDartPackage = false;
    }
    if (!isDartPackage) continue;
    for (const f of await walk(libDir, ".dart")) {
      const rel = path.relative(repoRoot, f).split(path.sep).join("/");
      relPaths.add(rel);
      abs.set(rel, f);
    }
  }
  return { relPaths, abs };
}

async function classify() {
  const { relPaths, abs } = await collectModules();
  const conceptRe = new RegExp(CONCEPT_PATTERN);

  const text = new Map();
  const concepts = new Map(); // rel -> matched concept token
  const pkgImports = new Map(); // rel -> Set of @envoymesh/* packages
  const deps = new Map(); // rel -> [rel]

  for (const rel of relPaths) {
    const raw = await fs.readFile(abs.get(rel), "utf8");
    const code = stripCommentsAndStrings(raw);
    text.set(rel, code);

    const m = code.match(conceptRe);
    if (m) concepts.set(rel, m[0]);

    // Directives are read from comment-stripped text, so a commented-out or
    // documented import is not a dependency, while string literals (the
    // specifiers themselves) survive.
    const directives = stripComments(raw);
    const specs = [
      ...directives.matchAll(/from\s+"([^"]+)"/g), // TS
      ...directives.matchAll(/^\s*(?:import|export)\s+'([^']+)'/gm), // Dart sibling
      ...directives.matchAll(/^\s*import\s+'([^']+)'/gm), // Dart package:
    ].map((x) => x[1]);

    const pkgs = new Set();
    for (const s of specs) {
      if (s.startsWith("@envoymesh/")) {
        const parts = s.split("/");
        pkgs.add(`${parts[0]}/${parts[1]}`);
      }
    }
    pkgImports.set(rel, pkgs);

    const resolved = [];
    for (const s of specs) {
      if (s.startsWith("package:")) {
        // package:envoy_mesh/src/foo.dart -> packages/envoy-mesh-dart/lib/src/foo.dart
        const pm = s.match(/^package:([a-z_]+)\/(.+)$/);
        if (pm) {
          const dirName = { envoy_mesh: "envoy-mesh-dart", envoy_mesh_libp2p: "envoy-mesh-libp2p-dart", envoy_thin_client: "envoy-thin-client-dart" }[pm[1]];
          if (dirName) {
            const cand = `packages/${dirName}/lib/${pm[2]}`;
            if (relPaths.has(cand)) resolved.push(cand);
          }
        }
        continue;
      }
      const r = resolveImport(rel, s, relPaths);
      if (r) resolved.push(r);
    }
    deps.set(rel, resolved);
  }

  // The single mechanism: seed on BOTH failure modes, then propagate.
  //   * condition (1) — the module names a product concept
  //   * condition (3) — the module imports a non-core @envoymesh package
  // Condition (2) is the propagation itself. A module that transitively
  // reaches either seed is not reusable — `reusable` means "free of product
  // coupling, directly or transitively", and a product *package* is coupling
  // just as much as a product *concept*.
  //
  // (An earlier version propagated only the concept seeds, which let a module
  // import a package-coupled module and still be called reusable — the two
  // scripts disagreed and `check-module-boundary.mjs` caught it.)
  const seeds = new Set(concepts.keys());
  for (const rel of relPaths) {
    if ([...pkgImports.get(rel)].some((p) => !CORE_PACKAGES.includes(p))) seeds.add(rel);
  }
  const tainted = new Set(seeds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const rel of relPaths) {
      if (tainted.has(rel)) continue;
      if (deps.get(rel).some((d) => tainted.has(d))) {
        tainted.add(rel);
        changed = true;
      }
    }
  }

  /**
   * Exported symbol names — a module's **declared surface**.
   *
   * Recorded for `reusable` modules only: that is the surface a product
   * consumes, and it is what Step 4 of the plan asks to be declared rather than
   * implied by "whatever the file happens to export". `product-bound` modules
   * need no declared surface — nobody outside the product should consume them.
   */
  function exportedSymbols(code, isDart) {
    const names = new Set();
    if (isDart) {
      for (const m of code.matchAll(/^(?:abstract\s+|final\s+|sealed\s+|base\s+)?class\s+(\w+)/gm)) names.add(m[1]);
      for (const m of code.matchAll(/^enum\s+(\w+)/gm)) names.add(m[1]);
      for (const m of code.matchAll(/^typedef\s+(\w+)/gm)) names.add(m[1]);
      // top-level functions: `RetType name(` or `name(` at column 0
      for (const m of code.matchAll(/^[A-Za-z_][\w<>,?\s]*\s+(\w+)\s*\(/gm)) names.add(m[1]);
    } else {
      for (const m of code.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+(\w+)/gm)) names.add(m[1]);
      for (const m of code.matchAll(/^export\s*\{([^}]*)\}/gm)) {
        for (const part of m[1].split(",")) {
          const n = part.trim().split(/\s+as\s+/).pop()?.trim();
          if (n) names.add(n);
        }
      }
    }
    return [...names].sort();
  }

  const reusable = [];
  const productBound = [];
  for (const rel of [...relPaths].sort()) {
    const tags = [];
    for (const [re, tag] of TAG_RULES) {
      if (re.test(rel)) {
        if (!tags.includes(tag)) tags.push(tag);
      }
    }
    tags.sort();

    const pkgs = pkgImports.get(rel);
    const nonCore = [...pkgs].filter((p) => !CORE_PACKAGES.includes(p));

    if (!tainted.has(rel)) {
      reusable.push({ path: rel, tags });
    } else {
      const row = { path: rel, tags };
      if (concepts.has(rel)) row.concept = concepts.get(rel);
      else if (nonCore.length) row.viaPackage = nonCore.sort();
      else row.viaDependency = true;
      productBound.push(row);
    }
  }
  // Declared surface — the exported symbol names of each `reusable` module.
  //
  // Deliberately NOT part of the manifest: a manifest that changed on every
  // export edit would fail `--check` on unrelated PRs and turn a boundary guard
  // into noise. The manifest gates CI; the surface informs review.
  const surface = {};
  for (const row of reusable) {
    const syms = exportedSymbols(text.get(row.path), row.path.endsWith(".dart"));
    if (syms.length) surface[row.path] = syms;
  }

  return { reusable, productBound, fileCount: relPaths.size, surface };
}

function revision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

// --- main -------------------------------------------------------------------

const { reusable, productBound, fileCount, surface } = await classify();

const manifest = {
  _comment:
    "Generated by scripts/classify-modules.mjs — Axis-1 reusability manifest. " +
    "Do not hand-edit the ordering; re-run the classifier. See docs/envoymesh-refactoring-plan.md §3–4.",
  version: 1,
  revision: revision(),
  declaredInputs: {
    conceptPattern: CONCEPT_PATTERN,
    corePackages: CORE_PACKAGES,
    excluded: EXCLUDED,
  },
  reusable,
  productBound,
};

const summary = {
  files: fileCount,
  reusable: reusable.length,
  productBound: productBound.length,
  byConcept: productBound.filter((r) => r.concept).length,
  byPackage: productBound.filter((r) => r.viaPackage).length,
  byDependency: productBound.filter((r) => r.viaDependency).length,
};

if (flag("--summary")) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (flag("--stdout")) {
  process.stdout.write(serialized);
  process.exit(0);
}

if (flag("--check")) {
  let existing = null;
  try {
    existing = await fs.readFile(manifestPath, "utf8");
  } catch {
    console.error(`check-module-boundary: manifest missing at ${path.relative(repoRoot, manifestPath)}`);
    process.exit(1);
  }
  const parsed = JSON.parse(existing);
  // `revision` is provenance, not content — ignore it when comparing.
  const norm = (m) => JSON.stringify({ reusable: m.reusable, productBound: m.productBound });
  if (norm(parsed) !== norm(manifest)) {
    console.error(
      "check-module-boundary: manifest is stale — re-run `node scripts/classify-modules.mjs`.\n" +
        `  files=${summary.files} reusable=${summary.reusable} productBound=${summary.productBound}`,
    );
    process.exit(1);
  }
  console.log(`module-boundary manifest is current (${summary.files} modules)`);
  process.exit(0);
}

const surfacePath = path.resolve(
  repoRoot,
  opt("--surface-out", "scripts/module-surface.json"),
);
await fs.writeFile(
  surfacePath,
  `${JSON.stringify(
    {
      _comment:
        "Generated by scripts/classify-modules.mjs — the DECLARED SURFACE of every `reusable` module: " +
        "its exported symbol names. Informational, not gated: unlike the manifest, this file is expected " +
        "to change whenever an export changes, so `--check` does not compare it.",
      revision: revision(),
      surfaces: surface,
    },
    null,
    2,
  )}\n`,
);

await fs.writeFile(manifestPath, serialized);
console.log(
  `wrote ${path.relative(repoRoot, manifestPath)} — ${summary.files} modules: ` +
    `${summary.reusable} reusable, ${summary.productBound} product-bound ` +
    `(${summary.byConcept} name a concept, ${summary.byPackage} only via package, ${summary.byDependency} only via dependency)\n` +
    `wrote ${path.relative(repoRoot, surfacePath)} — declared surface for ${Object.keys(surface).length} reusable modules`,
);
