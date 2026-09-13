/**
 * §5 audit — every `this._profileDir` reference, classified by the inventory's own truth.
 *
 * ## Why this exists
 *
 * Design §5 puts a product's own state under `<home>/<product>/` and leaves the kernel
 * stores in the shared `profile/`. Doing that needs every reference to `this._profileDir`
 * sorted into "kernel, stays" and "product, moves" — and the *first* estimate for that
 * work ("34 stores") was wrong by an order of magnitude: there are ~134 references.
 *
 * Classifying them by eye is how a kernel file ends up in a product directory, which on a
 * fresh install means an identity a second product cannot see — the opposite of the goal.
 * So the classification is machine-made:
 *
 *   * **guard** — `hasProfileDir(this._profileDir)`: a test for "is there a profile", which
 *     is a question about *identity* and stays;
 *   * **store** — the reference constructs a store, classified kernel or product by
 *     `inventory-node-stores.mjs` (the same source of truth the gate uses, so the two
 *     cannot disagree);
 *   * **path** — a file or directory built from the profile directory: reported, because
 *     each one has to be decided by hand and that is the actual worklist;
 *   * **other** — anything left over, which is a prompt to look rather than a category.
 *
 * Usage: `node scripts/audit-profile-dir-usage.mjs [--json]`
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const implPath = path.join(root, "apps/node/src/node-service-impl.ts");

/** Field → group, straight from the inventory (never a second opinion). */
function storeGroups() {
  const json = execFileSync(process.execPath, [path.join(here, "inventory-node-stores.mjs"), "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(json);
  const groups = new Map();
  for (const store of parsed.stores ?? []) {
    if (store?.field) groups.set(store.field, store.group);
  }
  return groups;
}

/** A store construction on this statement: `this._x = …(this._profileDir…)`. */
function storeFieldOnLine(line, groups, previousLines) {
  const assignment = /this\.(_[A-Za-z0-9_]+)\s*=/.exec(line);
  const candidates = [];
  if (assignment) candidates.push(assignment[1]);
  // A store may be assigned across lines (`this._x =\n  productStore(...)`), so the field
  // name can sit on the line above.
  for (const previous of previousLines) {
    const m = /this\.(_[A-Za-z0-9_]+)\s*=$/.exec(previous.trim());
    if (m) candidates.push(m[1]);
  }
  for (const field of candidates) {
    if (groups.has(field)) return { field, group: groups.get(field) };
  }
  return null;
}

const lines = readFileSync(implPath, "utf8").split("\n");
const groups = storeGroups();
const buckets = { guard: [], storeKernel: [], storeProduct: [], path: [], other: [] };

lines.forEach((line, index) => {
  if (!line.includes("this._profileDir")) return;
  const entry = { line: index + 1, text: line.trim().slice(0, 110) };
  if (/hasProfileDir\(this\._profileDir\)/.test(line)) {
    buckets.guard.push(entry);
    return;
  }
  // `requireProductStoreDir(this._profileDir, "name")` and `productStore(this._profileDir, …)`
  // are the product gate itself (`apps/node/src/product-store-availability.ts`), so a
  // reference wrapped in one is product-owned **by construction** — a stronger signal than
  // my field-name heuristic, which misses the multi-line forms.
  if (/requireProductStoreDir\(this\._profileDir|productStore\(this\._profileDir/.test(line)) {
    const named = /requireProductStoreDir\(this\._profileDir,\s*"([^"]+)"/.exec(line);
    buckets.storeProduct.push({ ...entry, field: named?.[1] ?? "(productStore)" });
    return;
  }
  const store = storeFieldOnLine(line, groups, lines.slice(Math.max(0, index - 3), index));
  if (store?.group === "kernel") {
    buckets.storeKernel.push({ ...entry, field: store.field });
    return;
  }
  if (store?.group === "product") {
    buckets.storeProduct.push({ ...entry, field: store.field });
    return;
  }
  if (
    /join\(this\._profileDir|\(this\._profileDir[,)]|this\._profileDir\s*\)|resolve\(this\._profileDir|this\._profileDir,/.test(
      line,
    )
  ) {
    buckets.path.push(entry);
    return;
  }
  buckets.other.push(entry);
});

const total = Object.values(buckets).reduce((n, b) => n + b.length, 0);

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify({ total, buckets }, null, 2)}\n`);
  process.exit(0);
}

console.log("# §5 audit — this._profileDir references in node-service-impl.ts\n");
console.log(`total: ${total}`);
console.log(`  guard        ${buckets.guard.length}  (kernel — "is there a profile", stays)`);
console.log(`  store kernel ${buckets.storeKernel.length}  (stays in profile/)`);
console.log(`  store product${String(buckets.storeProduct.length).padStart(3)}  (must move to <home>/<product>/)`);
console.log(`  path         ${buckets.path.length}  (one decision each — the real worklist)`);
console.log(`  other        ${buckets.other.length}  (unclassified: look at these first)\n`);

const show = (title, rows, limit) => {
  if (rows.length === 0) return;
  console.log(`## ${title} (${rows.length})`);
  for (const row of rows.slice(0, limit)) {
    console.log(`  ${String(row.line).padStart(6)}  ${row.field ? `${row.field}: ` : ""}${row.text}`);
  }
  if (rows.length > limit) console.log(`  … and ${rows.length - limit} more`);
  console.log("");
};

// ─── the fan-out: modules that read the same paths through a handed-over directory ───
//
// This is the part the first worklist missed, and it changes the shape of the migration:
// product state is not only built inside `node-service-impl.ts`. Helper modules take a
// `profileDir` parameter and read the *same* directories (`join(profileDir, "web")` for
// published pages, `envoy-harness/sessions` for harness state, the OpenClaw workspace).
// Moving the impl's lines without moving the hand-offs writes one root and reads the other
// — which is why the migration has to move whole *features*, and why this section exists.
const handoffModules = [];
for (const rel of readdirSync(path.join(root, "apps/node/src")).filter((n) => n.endsWith(".ts"))) {
  if (rel === "node-service-impl.ts" || rel.endsWith(".test.ts")) continue;
  const text = readFileSync(path.join(root, "apps/node/src", rel), "utf8");
  const reads = [
    ...text.matchAll(/join\(\s*profileDir\s*,\s*"([^"]+)"/g),
    ...text.matchAll(/join\(\s*this\._profileDir\s*,\s*"([^"]+)"/g),
  ].map((m) => m[1]);
  if (reads.length === 0) continue;
  handoffModules.push({ file: rel, reads: [...new Set(reads)].sort() });
}
if (handoffModules.length > 0) {
  const features = new Set();
  for (const m of handoffModules) for (const r of m.reads) features.add(r);
  console.log(`## fan-out: modules reading the same directories via a handed-over profileDir (${handoffModules.length})`);
  for (const m of handoffModules) console.log(`  ${m.file}: ${m.reads.join(", ")}`);
  console.log(
    `\n  Every directory above must move with its feature, hand-off included, or a fresh\n` +
      `  install writes one root and reads the other. Affected roots: ${[...features].sort().join(", ")}\n`,
  );
}

show("product stores to move", buckets.storeProduct, 40);
show("path sites to decide", buckets.path, 60);
show("unclassified", buckets.other, 40);
