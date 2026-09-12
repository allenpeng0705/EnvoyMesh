/**
 * Module-boundary check — the enforcement half of Axis 1.
 *
 * **Rules (from `docs/envoymesh-refactoring-plan.md` §4.3).** Each rule has its
 * own seeded-violation test in `scripts/test/module-boundary.test.mjs`.
 *
 * | # | Rule        | Fails when |
 * |---|-------------|------------|
 * | 1 | Direction   | a `reusable` module imports a `product-bound` module |
 * | 3 | Completeness| a module is missing from the manifest, or appears twice |
 * | 4 | Concept     | a `reusable` module names a product concept |
 *
 * Rules 2 (declared entry points / no deep-path imports) and 5 (the Dart
 * reusable surface exports no social symbol) arrive with Steps 2–3 of the
 * plan, once the entry points are declared. They are deliberately **not**
 * stubbed as passing checks — an unimplemented rule must not look green.
 *
 * **Scope.** The module universe scanned by `classify-modules.mjs`. Files
 * excluded there (documented in the manifest's `declaredInputs.excluded`) are
 * out of scope here too.
 *
 * **Usage:**
 * ```sh
 * node scripts/check-module-boundary.mjs                    # check
 * node scripts/check-module-boundary.mjs --manifest <path>
 * ```
 *
 * **Exit codes:** 0 = all implemented rules pass, 1 = a violation.
 */

import { promises as fs } from "node:fs";
import {
  isTsSourceFile,
  stripComments,
  stripCommentsAndStrings,
} from "./lib/source-files.mjs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
// `--root` exists so the seeded-violation tests can point the checker at a
// fixture tree. Default is the repository root.
const root = path.resolve(repoRoot, opt("--root", "."));
const manifestPath = path.resolve(root, opt("--manifest", "scripts/module-boundary.json"));

// --- load manifest ----------------------------------------------------------

let manifest;
try {
  manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
} catch (err) {
  console.error(
    `check-module-boundary: cannot read ${path.relative(root, manifestPath)} ` +
      `(${err.code ?? err.message}).\n` +
      "  Generate it first: node scripts/classify-modules.mjs",
  );
  process.exit(1);
}

const reusable = manifest.reusable ?? [];
const productBound = manifest.productBound ?? [];
const conceptRe = new RegExp(manifest.declaredInputs?.conceptPattern ?? "(?!x)x");
const excluded = manifest.declaredInputs?.excluded ?? {};

const violations = [];
const add = (rule, file, detail) => violations.push({ rule, file, detail });

// --- rule 3: completeness ---------------------------------------------------

const seen = new Map();
for (const row of [...reusable, ...productBound]) {
  seen.set(row.path, (seen.get(row.path) ?? 0) + 1);
}
for (const [file, count] of seen) {
  if (count > 1) add("completeness", file, `classified ${count} times (must be exactly once)`);
}

const classified = new Set(seen.keys());

/** Files on disk that should be in the manifest. */
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
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (Object.keys(excluded).some((p) => rel === p || rel.startsWith(`${p}/`))) continue;
    if (e.isDirectory()) {
      if (["node_modules", "dist", "build", ".dart_tool", "test", "tests"].includes(e.name)) continue;
      out.push(...(await walk(full, ext)));
    } else if (ext === ".ts" ? isTsSourceFile(e.name) : e.name.endsWith(ext)) {
      // Same predicate as the classifier, on purpose: rule 3 (completeness)
      // compares this list against the manifest, so the two must agree on what
      // a module *is*. Declarations are excluded — nothing imports a `.d.ts`,
      // so it is outside the boundary universe — and an emitted declaration
      // counted here would be reported as "not in the manifest" forever.
      out.push(rel);
    }
  }
  return out;
}

const onDisk = new Set();
for (const f of await walk(path.join(root, "apps/node/src"), ".ts")) onDisk.add(f);
const pkgDir = path.join(root, "packages");
let pkgEntries = [];
try {
  pkgEntries = await fs.readdir(pkgDir, { withFileTypes: true });
} catch {
  // A partial tree (fixture, sparse checkout) has no `packages/` — not an error.
}
for (const entry of pkgEntries) {
  if (!entry.isDirectory() || entry.name.endsWith("-dart")) continue;
  if (Object.keys(excluded).some((p) => p === `packages/${entry.name}`)) continue;
  for (const f of await walk(path.join(pkgDir, entry.name, "src"), ".ts")) onDisk.add(f);
}
// Discovered, not hardcoded — the same universe the classifier scans.
for (const entry of pkgEntries) {
  if (!entry.isDirectory()) continue;
  if (Object.keys(excluded).some((p) => p === `packages/${entry.name}`)) continue;
  let isFile = false;
  try {
    isFile = (await fs.stat(path.join(pkgDir, entry.name, "pubspec.yaml"))).isFile();
  } catch {
    isFile = false;
  }
  if (!isFile) continue;
  for (const f of await walk(path.join(pkgDir, entry.name, "lib"), ".dart")) onDisk.add(f);
}

for (const file of onDisk) {
  if (!classified.has(file)) {
    add(
      "completeness",
      file,
      "not in the manifest — add it by re-running `node scripts/classify-modules.mjs` " +
        "(classify in the same PR that adds the file)",
    );
  }
}

// --- rule 1: direction + rule 4: concept naming ------------------------------

/**
 * Extract import specifiers.
 *
 * Two constraints pull in opposite directions, and both must hold:
 *   * specifiers are **string literals**, so strings must NOT be stripped;
 *   * a **comment** mentioning an import must not create an edge — that bug
 *     marked `envoy_mesh.dart` product-bound because its doc comment names
 *     `envoy_mesh_social.dart`.
 * So: strip comments only, and anchor the directive patterns to line starts.
 */
function importSpecifiers(raw) {
  const directives = stripComments(raw);
  const specs = [];
  for (const m of directives.matchAll(/from\s+"([^"]+)"/g)) specs.push(m[1]); // TS
  for (const m of directives.matchAll(/^\s*(?:import|export)\s+'([^']+)'/gm)) specs.push(m[1]); // Dart sibling
  for (const m of directives.matchAll(/^\s*import\s+'([^']+)'/gm)) specs.push(m[1]); // Dart package:
  return specs;
}


function resolveImport(fromRel, spec, known) {
  if (spec.startsWith("@envoymesh/")) return null;
  const isDartSibling = spec.endsWith(".dart") && !spec.includes(":");
  if (!spec.startsWith(".") && !isDartSibling) return null;
  const base = path.posix.dirname(fromRel);
  const joined = path.posix.normalize(path.posix.join(base, spec));
  for (const c of [
    joined,
    joined.replace(/\.js$/, ".ts"),
    `${joined}.ts`,
    `${joined}.dart`,
    path.posix.join(joined, "index.ts"),
  ]) {
    if (known.has(c)) return c;
  }
  return null;
}

const productBoundSet = new Set(productBound.map((r) => r.path));

for (const row of reusable) {
  const abs = path.join(root, row.path);
  let raw;
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch {
    continue; // removed file: rule 3 already reports the manifest as stale
  }

  // Rule 4 — a reusable module must not name a product concept.
  const stripped = stripCommentsAndStrings(raw);
  const hit = stripped.match(conceptRe);
  if (hit) {
    add(
      "concept",
      row.path,
      `names product concept "${hit[0]}" but is classified reusable — ` +
        "either it needs the concept (classify it product-bound) or it should not name one",
    );
  }

  // Rule 1 — a reusable module must not depend on a product-bound one.
  for (const spec of importSpecifiers(raw)) {
    const target = resolveImport(row.path, spec, new Set(seen.keys()));
    if (target && productBoundSet.has(target)) {
      add("direction", row.path, `imports product-bound module \`${target}\``);
    }
  }
}

// --- rule 5: a reusable library must export only reusable modules --------------
//
// The Dart packages publish one library per package (`lib/<name>.dart`) that
// re-exports its `src/` modules. That makes a library file a *surface*: if it
// re-exports a product-bound module, the product types are reachable through it
// and the library is not actually reusable — which was exactly the `envoy_mesh`
// defect (§2.3). The rule is stated generally and driven by the manifest: a
// library the manifest calls `reusable` may only export `reusable` modules.
//
// Libraries the manifest calls `product-bound` (e.g. `envoy_mesh_libp2p.dart`,
// which re-exports a persona-using module) are exempt — the rule enforces the
// declared classification rather than inventing one.

const reusableSet = new Set(reusable.map((r) => r.path));
const LIBRARY_RE = /^(packages\/[^/]+\/lib\/[^/]+\.dart)$/;

for (const libPath of reusableSet) {
  if (!LIBRARY_RE.test(libPath)) continue;
  let raw;
  try {
    raw = await fs.readFile(path.join(root, libPath), "utf8");
  } catch {
    continue;
  }
  const dir = path.posix.dirname(libPath);
  for (const m of raw.matchAll(/^export\s+'([^']+)'/gm)) {
    const target = path.posix.normalize(path.posix.join(dir, m[1]));
    if (reusableSet.has(target)) continue;
    if (productBoundSet.has(target)) {
      add(
        "dart-surface",
        libPath,
        `exports product-bound module \`${target}\` — a reusable library's surface must not reach a product concept`,
      );
    }
  }
}

// --- rule 2: imports must use a declared entry point ---------------------------
//
// **Refined during implementation.** The plan described rule 2 as "no deep-path
// imports", but this repo's packages *declare* subpath exports as public API —
// `@envoymesh/api/chat-room-service`, `@envoymesh/network/protocols`,
// `@envoymesh/protocol/schemas/emp-0.1/*`. Those are entry points, not deep
// paths. So the rule is:
//
//   a subpath import is a violation only when the package does NOT declare it
//   in its `package.json` `exports` map.
//
// Dart has no `exports` map: a package's surface is its `lib/<name>.dart`
// libraries, so reaching into `package:<pkg>/src/...` bypasses it.

/** Declared subpath exports, per `@envoymesh/*` package owned by this repo. */
const declaredSubpaths = new Map();
let pkgEntries2 = [];
try {
  pkgEntries2 = await fs.readdir(path.join(root, "packages"), { withFileTypes: true });
} catch {
  /* partial tree */
}
for (const e of pkgEntries2) {
  if (!e.isDirectory()) continue;
  try {
    const pj = JSON.parse(await fs.readFile(path.join(root, "packages", e.name, "package.json"), "utf8"));
    if (typeof pj.name !== "string" || !pj.name.startsWith("@envoymesh/")) continue;
    const keys = pj.exports && typeof pj.exports === "object" ? Object.keys(pj.exports) : [];
    declaredSubpaths.set(pj.name, new Set(keys.filter((k) => k !== ".")));
  } catch {
    /* no package.json — not a published package */
  }
}

function subpathIsDeclared(name, sub) {
  const keys = declaredSubpaths.get(name);
  if (!keys) return null; // package not owned here (external sibling) — not ours to judge
  if (keys.has(sub)) return true;
  for (const k of keys) {
    if (k.endsWith("/*") && sub.startsWith(k.slice(0, -1))) return true;
  }
  return false;
}

/** Source files whose imports can be judged: repo owned, excluding build output. */
async function consumerSources() {
  const out = [];
  const roots = [];
  for (const e of pkgEntries2) {
    if (!e.isDirectory()) continue;
    if (Object.keys(excluded).some((p) => p === `packages/${e.name}`)) continue;
    roots.push(path.join(root, "packages", e.name, "src"), path.join(root, "packages", e.name, "lib"));
  }
  let appEntries = [];
  try {
    appEntries = await fs.readdir(path.join(root, "apps"), { withFileTypes: true });
  } catch {
    /* partial tree */
  }
  for (const e of appEntries) {
    if (!e.isDirectory()) continue;
    roots.push(path.join(root, "apps", e.name, "src"), path.join(root, "apps", e.name, "lib"));
  }
  for (const r of roots) {
    out.push(...(await walk(r, ".ts")), ...(await walk(r, ".dart")));
  }
  return out;
}

const DECLARED_PKG = /^@envoymesh\/([^/]+)(\/.*)?$/;
const DART_DEEP = /^package:([a-z_]+)\/src\//;

for (const rel of await consumerSources()) {
  let raw;
  try {
    raw = await fs.readFile(path.join(root, rel), "utf8");
  } catch {
    continue;
  }
  for (const spec of importSpecifiers(raw)) {
    const ts = spec.match(DECLARED_PKG);
    if (ts) {
      const name = `@envoymesh/${ts[1]}`;
      const sub = ts[2] ? `.${ts[2]}` : null;
      if (!sub) continue; // the "." export
      const ok = subpathIsDeclared(name, sub);
      if (ok === false) {
        add("surface", rel, `imports \`${name}${ts[2]}\`, which \`${name}\` does not declare in its \`exports\` map`);
      }
      continue;
    }
    const dart = spec.match(DART_DEEP);
    if (dart) {
      add("surface", rel, `imports \`${spec}\` — reaching into another package's \`src/\`; import its declared library instead`);
    }
  }
}

// --- report -----------------------------------------------------------------

if (violations.length === 0) {
  console.log(
    `module-boundary OK — rules 1, 2, 3, 4, 5 pass over ${onDisk.size} modules ` +
      `(${reusable.length} reusable, ${productBound.length} product-bound)`,
  );
  process.exit(0);
}

const byRule = violations.reduce((m, v) => ((m[v.rule] = (m[v.rule] ?? 0) + 1), m), {});
console.error(
  `module-boundary FAILED — ${violations.length} violation(s) ` +
    `[${Object.entries(byRule).map(([k, v]) => `${k}: ${v}`).join(", ")}]\n`,
);
for (const v of violations.slice(0, 40)) {
  console.error(`  [${v.rule}] ${v.file}\n      ${v.detail}`);
}
if (violations.length > 40) console.error(`  … and ${violations.length - 40} more`);
process.exit(1);
