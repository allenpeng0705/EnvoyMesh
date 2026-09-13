/**
 * Peer dependencies this repo does **not** distribute.
 *
 * `@envoymesh/envoy-harness*` lives in a sibling checkout. That is deliberate and it is a
 * policy, not an accident:
 *
 *   * **EnvoyMesh is not the distribution channel for the harness.** A product that wants it
 *     (EnvoyCoder, EnvoyAgent, …) clones or copies `envoy-harness` directly, the way
 *     EnvoyMesh does. Vendoring it here would make every product depend on *this* repo for
 *     someone else's package, and this repo's release cadence for its code.
 *   * What EnvoyMesh owes everyone else is an **honest failure**: a missing sibling must say
 *     what is missing and how to get it, not `ERR_MODULE_NOT_FOUND` from four directories
 *     deep inside a `file:` path.
 *
 * ## Why a check rather than a lazy import
 *
 * **Sixteen static value imports across ten files sit on the boot path** — measured with the
 * TypeScript parser, walking static relative imports from `apps/node/src/index.ts` (429 files
 * reachable): `node-service-impl.ts` (×3), `agent-runtime-envoy/persistent-acp-host.ts` (×2),
 * `node-service-setup-sponsor-friend.ts`, `envoy-harness-workspace.ts`,
 * `agent-runtime-envoy/factory.ts`, `agent-runtime-envoy/manifest.ts`,
 * `agent-runtime-envoy/local-runtime-registry.ts` (×2), `agent-runtime-envoy/runtime.ts` (×2),
 * `agent-runtime-envoy/bridge-to-envoy-harness-skill.ts` and `agent-runtime-envoy/acp-host.ts`
 * (×2). So the process dies *before it starts*. Across the workspace there are 19 such value
 * imports in 13 files — the other three (`developer-cli.ts`, `harness-submit-transport.ts`, and
 * `agent-runtime-envoy/peer-pool.ts`) are not statically reachable from the entry point — plus
 * 8 type-only imports that are erased at build. The OK line below prints the counts it
 * measured, so a stale number in the docs is visible the next time anyone runs this.
 *
 * Making those imports lazy would change `node-service-impl.ts`'s call sites to async —
 * a large, invasive change to product code for a condition that only affects a **dev
 * checkout**. The packaged desktop app stages the harness bundle at build time, so it is
 * never affected. So the check runs before the dev entry points, and the run-time failure
 * that remains is the one a developer would see anyway, now with the reason in front of it.
 *
 * It also refuses to check a subset: if the sources import a harness package that is not in
 * `PEERS` below, the check fails and says so, because reporting OK for a package nobody
 * resolved is worse than not checking at all.
 *
 * Usage: `node scripts/check-peer-deps.mjs` (exit 1 with instructions when missing).
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

/** Peer packages, with the entry point we actually import. */
const PEERS = [
  { name: "@envoymesh/envoy-harness", entry: "dist/index.js" },
  { name: "@envoymesh/envoy-harness-adapter", entry: "dist/index.js" },
  { name: "@envoymesh/envoy-harness-peer", entry: "dist/index.js" },
  { name: "@envoymesh/envoy-harness-client", entry: "dist/index.js" },
];

const SIBLING = path.join(root, "..", "envoy-harness");

/** Where the sources that may import a peer live. Overridable so seeded tests can use a fixture. */
function scanRoots() {
  const override = process.env.PEER_DEPS_SOURCE_ROOT;
  if (override) {
    const dir = path.resolve(override);
    // A typo here would otherwise read as "no harness imports anywhere" — i.e. a silent pass.
    if (!existsSync(dir)) {
      console.error(`PEER_DEPS_SOURCE_ROOT does not exist: ${dir}`);
      process.exit(1);
    }
    return [dir];
  }
  const roots = [];
  for (const top of ["apps", "packages"]) {
    const dir = path.join(root, top);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const src = path.join(dir, entry.name, "src");
      if (existsSync(src)) roots.push(src);
    }
  }
  return roots;
}

/** Every `.ts` under the roots, skipping build output and dependencies. */
function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(p, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const HARNESS_SCOPE = "@envoymesh/envoy-harness";
// `import type`/`export type` is erased at build, so only value imports can fail at run time.
// The body is bounded by `[^;]*?`. Without that bound, a match starting at a statement that
// carries no `from` clause (a side-effect `import "./x.js";`) absorbs the statement after it,
// and the `type` keyword inside that absorbed text is never seen — so a type-only import is
// misread as a value import and reported as an uncovered package. Measured both ways:
// `scripts/test/gates.test.mjs` seeds the fixture and fails on the unbounded version.
const IMPORT_RE =
  /(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s+"([^"]*)";|import\s+"([^"]*)";/g;

/** Value (non-type-only) harness imports: per-package file sets, statement count, and files. */
function harnessValueImports(files) {
  const byPackage = new Map();
  const importingFiles = new Set();
  let statements = 0;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    let match;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(src))) {
      if (match[1]) continue;
      const spec = match[3] ?? match[4];
      if (!spec?.startsWith(`${HARNESS_SCOPE}`)) continue;
      // `@envoymesh/envoy-harness-client/ehui` is the package `@envoymesh/envoy-harness-client`.
      const name = spec.split("/").slice(0, 2).join("/");
      const relative = path.relative(root, file);
      if (!byPackage.has(name)) byPackage.set(name, new Set());
      byPackage.get(name).add(relative);
      importingFiles.add(relative);
      statements += 1;
    }
  }
  return { byPackage, importingFiles, statements };
}

const files = scanRoots().flatMap((dir) => sourceFiles(dir));
const { byPackage: imported, importingFiles, statements } = harnessValueImports(files);

// The check is only as good as its list: a new harness package must not slip past it.
const unlisted = [...imported.keys()].filter((name) => !PEERS.some((peer) => peer.name === name));
if (unlisted.length > 0) {
  console.error("A harness package is imported but not covered by this check.\n");
  for (const name of unlisted) {
    console.error(`  ${name}\n    imported by: ${[...imported.get(name)].join(", ")}`);
  }
  console.error(
    [
      "",
      "Add it to PEERS in scripts/check-peer-deps.mjs — and to the clone instructions it",
      "prints, so the next person knows where to get it. Checking a subset would report OK",
      "for a package that is in fact missing.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

// Printed before resolution on purpose: the count is a *measurement*, and the docs quote it,
// so it must be visible even where the peers are absent (CI has no sibling checkout). The
// seeded tests assert on this line.
console.log(
  `peer import scan: ${imported.size} harness package(s) imported by ${statements} ` +
    `value import(s) in ${importingFiles.size} file(s)`,
);

const missing = [];
for (const peer of PEERS) {
  const linked = path.join(root, "node_modules", ...peer.name.split("/"));
  const entry = path.join(linked, peer.entry);
  if (!existsSync(entry)) {
    missing.push({ ...peer, linked, entry, linkedExists: existsSync(linked) });
  }
}

if (missing.length === 0) {
  console.log(`peer dependencies OK (${PEERS.length} envoy-harness package(s) resolvable)`);
  process.exit(0);
}

console.error("Missing peer dependencies — this repo does not ship them.\n");
for (const peer of missing) {
  console.error(
    `  ${peer.name}\n` +
      `    resolved to: ${peer.linked}${peer.linkedExists ? " (link exists, but no built entry)" : " (no link)"}\n` +
      `    expected:    ${peer.entry}`,
  );
}
console.error(
  [
    "",
    "The Envoy Harness is a **peer** of every EnvoyMesh-family product, not something",
    "EnvoyMesh distributes. Get it the way this repo does:",
    "",
    `  sibling checkout:  ${SIBLING}`,
    "  clone or copy it there, then build it:",
    "",
    "      git clone <envoy-harness> ../envoy-harness",
    "      npm run build:envoy-harness",
    "",
    "A product that needs the harness should depend on its **own** copy (`file:../envoy-harness/…`",
    "or a published release), never on EnvoyMesh's link.",
    "",
  ].join("\n"),
);
process.exit(1);
