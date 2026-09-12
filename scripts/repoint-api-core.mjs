/**
 * Repoint modules that import `@envoymesh/api` for **core-eligible symbols only**
 * to the declared `@envoymesh/api/core` entry point.
 *
 * A symbol is core-eligible when it is declared in a module the Axis-1 manifest
 * calls `reusable` (or in a core package). Such a module does not need the
 * product surface — it only needs the contract — and importing the api *root*
 * classifies it `product-bound` under the classifier's third condition.
 *
 * Usage:
 *   node scripts/repoint-api-core.mjs --list      # dry run: what would change
 *   node scripts/repoint-api-core.mjs --apply     # rewrite the files
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const apply = process.argv.includes("--apply");
const manifest = JSON.parse(readFileSync(path.join(repoRoot, "scripts/module-boundary.json"), "utf8"));
const core = new Set(
  manifest.declaredInputs.corePackages.map((c) => `packages/${c.replace("@envoymesh/", "")}/`),
);
const reusable = new Set(manifest.reusable.map((r) => r.path));
const productBound = new Set(manifest.productBound.map((r) => r.path));

// ── what `@envoymesh/api/core` actually exports ─────────────────────────────
//
// The first version of this script judged a symbol by "is any module declaring
// it `reusable`", which is *not* the same question: `BondLevel` is declared in
// the reusable `bond-trust-rank.ts`, but it reaches api's public surface through
// `node-service.ts` (`export type { BondLevel } from "./bond-trust-rank.js"`),
// which is product-bound and therefore excluded from `core`. Repointing on that
// rule produced 17 TS2305 errors. The rule that matches the mechanism is
// membership in the set below.
const apiSrc = path.join(repoRoot, "packages", "api", "src");
function exportedNames(absFile, seen = new Set()) {
  if (seen.has(absFile)) return new Set();
  seen.add(absFile);
  let code;
  try {
    code = readFileSync(absFile, "utf8");
  } catch {
    return new Set();
  }
  const names = new Set();
  for (const m of code.matchAll(
    /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:interface|type|class|const|enum|function|namespace)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    names.add(m[1]);
  }
  for (const m of code.matchAll(/^export (?:type )?\{([^}]*)\}/gms)) {
    for (const n of m[1].split(",").map((x) => x.trim().replace(/^type\s+/, "")).filter(Boolean)) {
      names.add(n.includes(" as ") ? n.split(/\s+as\s+/)[1] : n);
    }
  }
  for (const m of code.matchAll(/^export \* from "(\.\/[^"]+)\.js";$/gm)) {
    for (const n of exportedNames(path.join(apiSrc, `${m[1].slice(2)}.ts`), seen)) names.add(n);
  }
  return names;
}

const coreExported = exportedNames(path.join(apiSrc, "core.ts"));

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (["node_modules", "dist", "target", ".git", "build"].includes(e.name)) continue;
      walk(path.join(dir, e.name), out);
      continue;
    }
    if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) out.push(path.join(dir, e.name));
  }
  return out;
}

const files = [...walk(path.join(repoRoot, "apps")), ...walk(path.join(repoRoot, "packages"))].map((f) =>
  path.relative(repoRoot, f).split(path.sep).join("/"),
);

const candidates = [];
const skipped = [];
for (const rel of files) {
  const code = readFileSync(path.join(repoRoot, rel), "utf8");
  if (!code.includes('"@envoymesh/api"')) continue;
  const syms = new Set();
  for (const m of code.matchAll(/import(?: type)? \{([^}]+)\} from "@envoymesh\/api"/g)) {
    for (const n of m[1].split(",").map((x) => x.trim().replace(/^type\s+/, "")).filter(Boolean)) syms.add(n);
  }
  for (const m of code.matchAll(/import\("@envoymesh\/api"\)\.([A-Za-z_$][\w$]*)/g)) syms.add(m[1]);
  if (!syms.size) {
    skipped.push([rel, "no explicit symbols (barrel/dynamic import)"]);
    continue;
  }
  const bad = [...syms].filter((s) => !coreExported.has(s));
  if (bad.length) {
    skipped.push([rel, `product-bound symbol(s): ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? ", …" : ""}`]);
    continue;
  }
  candidates.push(rel);
}

console.log(`candidates: ${candidates.length} (of ${files.filter((f) => readFileSync(path.join(repoRoot, f), "utf8").includes('"@envoymesh/api"')).length} importers)`);
console.log(`  currently product-bound: ${candidates.filter((c) => productBound.has(c)).length}`);
console.log(`  currently reusable     : ${candidates.filter((c) => reusable.has(c)).length}`);
console.log(`  skipped                : ${skipped.length}`);

const revert = process.argv.includes("--revert");
if (revert) {
  let undone = 0;
  for (const rel of candidates) {
    const full = path.join(repoRoot, rel);
    const before = readFileSync(full, "utf8");
    const after = before.replaceAll('from "@envoymesh/api/core"', 'from "@envoymesh/api"')
      .replaceAll('import("@envoymesh/api/core")', 'import("@envoymesh/api")');
    if (after !== before) {
      writeFileSync(full, after);
      undone++;
    }
  }
  console.log(`reverted ${undone} file(s) to @envoymesh/api`);
  process.exit(0);
}

if (!apply) {
  console.log("\nfirst 15 candidates:");
  for (const c of candidates.slice(0, 15)) console.log(`  ${c}`);
  process.exit(0);
}

let changed = 0;
for (const rel of candidates) {
  const full = path.join(repoRoot, rel);
  const before = readFileSync(full, "utf8");
  const after = before
    .replaceAll('from "@envoymesh/api"', 'from "@envoymesh/api/core"')
    .replaceAll('import("@envoymesh/api")', 'import("@envoymesh/api/core")');
  if (after !== before) {
    writeFileSync(full, after);
    changed++;
  }
}
console.log(`\nrewrote ${changed} file(s) to @envoymesh/api/core`);
