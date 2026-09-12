/**
 * Workspace wiring gate — the five places a package must be declared.
 *
 * **Why this exists.** Adding `@envoymesh/host-connect` required edits in six
 * different files, and the failure mode of missing one is not a lint error — it
 * is a *different* compiler error somewhere else:
 *
 * | Missed | Symptom |
 * |---|---|
 * | the consumer's `tsconfig.json` `references` | `TS6059`/`TS6307`: "not under rootDir" for **every** file the consumer imports from the package |
 * | the consumer's `package.json` `dependencies` | works locally by workspace hoisting; breaks in a fresh install or a bundled app |
 * | root `workspaces` | the package is never linked, so nothing resolves from `node_modules` |
 * | root `tsconfig.json` `references` | `tsc -b` at the root never builds it |
 * | `tsconfig.base.json` `paths` | source-level resolution silently degrades to `node_modules`, so the built `.d.ts` is typechecked instead of the source — and it looks fine |
 * | `vitest.config.ts` alias | tests resolve the built output, or fail outright on a clean tree |
 *
 * Each of those was hit at least once during this refactor (`apps/node` imported
 * `node-core` and `harness` while declaring neither; `openclaw-runtime` was a
 * workspace with a composite tsconfig and **no** root reference, no `paths`
 * entry and no vitest alias). A rule list is the fix: the wiring is checked the
 * same way the boundary is.
 *
 * **Rules** (all enforced, all seeded-testable — `scripts/test/gates.test.mjs`):
 *
 * - **R1 declared dependency** — a workspace that imports `@envoymesh/X` must
 *   declare it. A **`src`** import must be in `dependencies` (or
 *   `peerDependencies`): a runtime import parked in `devDependencies` installs
 *   fine in the monorepo and is missing in a production/bundled install. A
 *   **`test`-only** import may be a `devDependency`.
 * - **R2 project reference** — a workspace that **emits** (`composite: true`
 *   without `noEmit`) must `reference` every `@envoymesh/X` it imports **from
 *   `src`**. This is the `TS6059`/`TS6307` rule, and its two bounds are real:
 *   an app that only type-checks (`noEmit`) never emits into `rootDir`, and a
 *   test file is usually outside the project's `include` entirely. Over-applying
 *   R2 demands references that would be circular — `packages/protocol`'s test
 *   cross-checks against `@envoymesh/identity`, which already references
 *   `protocol`.
 * - **R3 root reference** — every **library** package (`packages/*`) with a
 *   composite tsconfig must appear in the root `tsconfig.json` references, so
 *   `tsc -b` builds it.
 * - **R4 resolution entries** — every **library** package needs a
 *   `tsconfig.base.json` `paths` entry and a `vitest.config.ts` alias.
 *
 *   R3/R4 stop at `packages/*` deliberately: an app is an entry point, not a
 *   dependency. Nothing imports `@envoymesh/node`, so a `paths` mapping for it
 *   would have no consumer, and demanding one would have produced five
 *   permanently-ignored findings — the kind of gate people learn to skip.
 * - **R6 one workspace list** — the root `package.json` `workspaces` field and
 *   `pnpm-workspace.yaml` `packages:` must name the same set. pnpm 10 ignores the
 *   former (this repo's own `.npmrc` says so), so a package missing from the
 *   latter is invisible to `pnpm install` while looking fully wired to npm — and
 *   the reverse leaves a dead entry. **Seven places, not six**: this rule exists
 *   because this refactor's own "six places" list was wrong, and
 *   `packages/host-connect`, `packages/harness` and `packages/node-core` were all
 *   missing from the pnpm list when that list was written.
 * - **R5 no build output in `src`** — a `src` tree must not contain compiler
 *   output. Precisely: no `.js`/`.js.map`/`.tsbuildinfo`/`.d.ts.map`, and no
 *   `.d.ts` **that has a sibling `.ts` of the same stem** (that is an emission);
 *   a standalone `.d.ts` is a hand-written ambient shim and is allowed. This is
 *   the rule whose absence let `classify-modules.mjs` count emitted
 *   declarations as modules (see `scripts/lib/source-files.mjs`).
 *
 * **Two implementation notes, both from reviewing this file rather than from the
 * repo misbehaving.** (1) `tsconfig.json` is JSONC and `config` predicates were
 * raw regexes over text, so a *comment* could disable R2/R3 or satisfy R4 —
 * `// "noEmit": true was removed…` turned R2 off, and a comment naming a package
 * satisfied R4. All config text is now comment-stripped first. (2) Reference
 * paths were compared as raw strings, so two spellings `tsc` accepts
 * (`"../../packages/lib/"`, `"packages/lib"` without `./`) were rejected; they
 * are now normalized before comparison.
 *
 * **Usage:**
 * ```sh
 * node scripts/check-workspace-wiring.mjs            # the repo
 * node scripts/check-workspace-wiring.mjs --root DIR # a fixture
 * ```
 *
 * **Exit codes:** 0 = ok, 1 = a wiring rule failed.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { isEmittedArtifact, isTsSourceFile, stripComments } from "./lib/source-files.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const value = args[i + 1];
  // A flag with no value used to fall back silently, so `--root` as the last
  // argument scanned *this* repo while claiming to scan a fixture.
  if (value === undefined || value.startsWith("--")) {
    console.error(`[fail] ${name} needs a value`);
    process.exit(2);
  }
  return value;
}

// Relative to the caller's cwd, not to this script: `--root fixture/` used to
// resolve against `scripts/`, so a fixture run silently inspected the repo.
const root = path.resolve(process.cwd(), opt("--root", path.resolve(here, "..")));

const failures = [];
const warnings = [];

async function readJson(abs) {
  try {
    return JSON.parse(await fs.readFile(abs, "utf8"));
  } catch {
    return null;
  }
}

async function readText(abs) {
  try {
    return await fs.readFile(abs, "utf8");
  } catch {
    return null;
  }
}

/** Workspace directory (repo-relative) → its package name. */
async function loadWorkspaces() {
  const rootPkg = await readJson(path.join(root, "package.json"));
  if (!rootPkg) throw new Error(`no package.json at ${root}`);
  const out = new Map();
  for (const pattern of rootPkg.workspaces ?? []) {
    if (!pattern.endsWith("/*")) {
      const pkg = await readJson(path.join(root, pattern, "package.json"));
      out.set(pattern, pkg?.name ?? null);
      continue;
    }
    const parent = pattern.slice(0, -2);
    let entries;
    try {
      entries = await fs.readdir(path.join(root, parent), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const rel = `${parent}/${entry.name}`;
      const pkg = await readJson(path.join(root, rel, "package.json"));
      out.set(rel, pkg?.name ?? null);
    }
  }
  return out;
}

/**
 * Every `@envoymesh/*` specifier mentioned by the `.ts` sources under `dirs`.
 *
 * The first version scanned only `<workspace>/src` and `<workspace>/test`, so a
 * workspace whose sources live elsewhere (`lib/`, a script directory) was skipped
 * entirely — a hole nobody has today, but the rule claims to cover "a workspace".
 * Output and vendored directories are skipped; `dist*` covers `dist-e2e` and
 * friends, which this repo commits as fixtures.
 */
async function scopedImports(dirs) {
  const found = new Set();
  const walk = async (dir) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          // `target` is Rust/Cargo output (the Tauri app has one), and the
          // `dist*`/dot prefixes cover JS build output and tooling directories.
          ["node_modules", "build", "target", ".git", ".dart_tool"].includes(entry.name) ||
          entry.name.startsWith("dist") ||
          entry.name.startsWith(".")
        ) {
          continue;
        }
        await walk(abs);
      } else if (entry.isFile() && (isTsSourceFile(entry.name) || entry.name.endsWith(".tsx"))) {
        // Comments stripped, strings kept — a specifier IS a string literal,
        // but `{@link import("@envoymesh/api")}` in a doc comment is not an
        // edge. Without this the gate's first run reported 20 false failures
        // (fifth occurrence of this class in the repo; see `stripComments`).
        const text = stripComments((await readText(abs)) ?? "");
        // Both quote styles, plus the side-effect form (`import "x"`). The
        // first version matched only `from "…"`, so `from '@envoymesh/x'` and
        // `import "@envoymesh/x"` slipped through — legal spellings the gate
        // claims to cover. Template-literal specifiers are deliberately not
        // matched: they are not statically resolvable, and no such import
        // exists here.
        const QUOTE = `["']`;
        const SCOPED = `(@envoymesh\\/[a-z0-9-]+)(?:\\/[^"']*)?`;
        for (const re of [
          new RegExp(`from\\s*${QUOTE}${SCOPED}${QUOTE}`, "g"),
          new RegExp(`import\\s*\\(\\s*${QUOTE}${SCOPED}${QUOTE}`, "g"),
          new RegExp(`^\\s*import\\s+${QUOTE}${SCOPED}${QUOTE}`, "gm"),
        ]) {
          for (const m of text.matchAll(re)) found.add(m[1]);
        }
      }
    }
  };
  for (const dir of dirs) await walk(path.join(root, dir));
  return found;
}

/** Expand a workspace pattern list (`apps/*`, `packages/api`, …) to directories. */
async function expandWorkspaces(patterns) {
  const out = [];
  for (const pattern of patterns) {
    if (!pattern.endsWith("/*")) {
      out.push(pattern);
      continue;
    }
    const parent = pattern.slice(0, -2);
    const entries = await fs.readdir(path.join(root, parent), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory()) out.push(`${parent}/${entry.name}`);
    }
  }
  return out.sort();
}

/** JSON with trailing commas tolerated (tsconfig files are JSONC). */
function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

/** Read and parse a JSONC config file, or null. */
async function readConfig(abs) {
  const text = await readText(abs);
  return text === null ? null : safeJson(stripComments(text));
}

/**
 * Merge the `compilerOptions` of a tsconfig's `extends` chain, nearest last.
 *
 * Relative extends only; a package-style specifier (`@tsconfig/node20`) cannot be
 * resolved from here and is ignored. Both relative forms matter and the first
 * version handled only one: `"./tsconfig.base.json"` names a **file**, while
 * `"../base"` names a **directory** whose `tsconfig.json` is meant.
 */
async function inheritedCompilerOptions(dirRel, depth = 0) {
  if (depth > 5) return {};
  const json = await readConfig(path.join(root, dirRel, "tsconfig.json"));
  const parent = json?.extends;
  if (typeof parent !== "string" || !parent.startsWith(".")) return {};
  const resolved = path.posix.normalize(path.posix.join(dirRel, parent)).replace(/\/+$/, "");
  if (resolved.endsWith(".json")) {
    return (await readConfig(path.join(root, resolved)))?.compilerOptions ?? {};
  }
  return {
    ...(await inheritedCompilerOptions(resolved, depth + 1)),
    ...((await readConfig(path.join(root, resolved, "tsconfig.json")))?.compilerOptions ?? {}),
  };
}

/** Is `@envoymesh/name` a workspace in this repo? */
function isWorkspaceName(name, workspaces) {
  return [...workspaces.values()].includes(name);
}

/**
 * Compiler output files inside a `src` tree (rule R5).
 * A standalone `.d.ts` is a hand-written shim, not an emission — see the header.
 */
async function buildOutputIn(dir) {
  const found = [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // `dist*` covers `dist`, `dist-e2e` (a committed e2e bundle fixture) and
      // friends: an output directory is not "output beside sources".
      if (["node_modules", "build"].includes(entry.name) || entry.name.startsWith("dist")) continue;
      found.push(...(await buildOutputIn(abs)));
      continue;
    }
    const name = entry.name;
    // One definition of "build output" (`lib/source-files.mjs`), applied with the
    // same *sibling* test that made the original `.d.ts` carve-out correct:
    //
    //   * maps and tsbuildinfo are output, always — nobody hand-writes them;
    //   * a `.js`/`.mjs`/`.cjs`/`.d.ts` is output when a source of the **same
    //     stem** sits beside it (`index.ts` + `index.js` is the committed-artifact
    //     incident this rule exists for), and is hand-written otherwise
    //     (`_tmp_check.mjs`, `word-extractor.d.ts` — ambient shims for untyped
    //     npm packages, several of which are committed in this repo).
    //
    // The first version hard-coded a shorter suffix list, so `.mjs`/`.cjs`/
    // `.d.mts`/`.d.cts` — what a `.mts` source emits under NodeNext — were
    // invisible; taking the shared list *without* the sibling test then flagged a
    // hand-written scratch script. Both halves are needed.
    const alwaysOutput =
      name.endsWith(".js.map") || name.endsWith(".d.ts.map") || name.endsWith(".tsbuildinfo");
    const stem = abs.replace(/\.[cm]?js$|\.d\.[cm]?ts$|\.d\.ts$|\.tsbuildinfo$/, "");
    const sibling =
      (await exists(`${stem}.ts`)) ||
      (await exists(`${stem}.tsx`)) ||
      (await exists(`${stem}.mts`)) ||
      (await exists(`${stem}.cts`));
    if (alwaysOutput || (isEmittedArtifact(name) && sibling)) {
      found.push(path.relative(root, abs));
    }
  }
  return found;
}

async function exists(abs) {
  try {
    await fs.stat(abs);
    return true;
  } catch {
    return false;
  }
}

// --- run --------------------------------------------------------------------

const workspaces = await loadWorkspaces();
const rootTsconfig = (await readText(path.join(root, "tsconfig.json"))) ?? "";
// Any reference spelling `tsc` accepts: `./packages/x`, `packages/x`,
// `packages/x/`. The regex used to require the leading `./` *and* compare raw
// text, so a legal root reference was reported as missing.
const normalizeRef = (p) => path.posix.normalize(p).replace(/^\.\//, "").replace(/\/+$/, "");
const rootRefs = new Set(
  [...rootTsconfig.matchAll(/"path":\s*"([^"]+)"/g)].map((m) => normalizeRef(m[1])),
);
// Comment-stripped before matching: `// "@envoymesh/x" mapping pending` is not a
// mapping. (`tsconfig.base.json` is plain JSON here, but it is JSONC-compatible
// and the gate should not depend on that staying true.)
const basePaths = stripComments((await readText(path.join(root, "tsconfig.base.json"))) ?? "");
const basePathsParsed = safeJson(basePaths);
/** The `paths` target for a package, or null when there is no entry. */
const baseTarget = (name) => basePathsParsed?.compilerOptions?.paths?.[name]?.[0] ?? null;
const vitestText = stripComments((await readText(path.join(root, "vitest.config.ts"))) ?? "");
const vitestHas = (name) => vitestText.includes(`"${name}"`);

for (const [rel, name] of [...workspaces].sort(([a], [b]) => a.localeCompare(b))) {
  const pkg = await readJson(path.join(root, rel, "package.json"));
  if (!pkg?.name?.startsWith("@envoymesh/")) continue;

  // R1 / R2 — what this workspace imports must be declared and referenced.
  const srcImports = await scopedImports([`${rel}/src`]);
  // A workspace without `src/` (some tools put sources in `lib/`) would otherwise
  // be skipped by both R1 and R2.
  const testImports = await scopedImports([`${rel}/test`, rel]);
  const imports = new Set([...srcImports, ...testImports]);
  // Comment-stripped: `tsconfig.json` is JSONC, and a comment mentioning
  // `"noEmit": true` or `"composite": true` must not decide a rule either way.
  const tsconfigText = stripComments(
    (await readText(path.join(root, rel, "tsconfig.json"))) ?? "",
  );
  // `extends` is resolved too: a project that sets `composite` in a base config
  // and overrides nothing locally *does* emit, and the raw-text version treated
  // it as non-emitting — so a real TS6059/TS6307 passed the gate silently. Package
  // extends (`@tsconfig/node20`) cannot be resolved from here and are ignored.
  const inherited = await inheritedCompilerOptions(rel);
  const own = safeJson(stripComments(tsconfigText))?.compilerOptions ?? {};
  const effective = { ...inherited, ...own };
  const isComposite = effective.composite === true || /"composite":\s*true/.test(tsconfigText);
  const emits = isComposite && effective.noEmit !== true && !/"noEmit":\s*true/.test(tsconfigText);
  const runtime = new Set(Object.keys(pkg.dependencies ?? {}));
  const peer = new Set(Object.keys(pkg.peerDependencies ?? {}));
  const dev = new Set(Object.keys(pkg.devDependencies ?? {}));
  const refs = new Set([...tsconfigText.matchAll(/"path":\s*"([^"]+)"/g)].map((m) => m[1]));

  for (const spec of [...imports].sort()) {
    if (!isWorkspaceName(spec, workspaces)) continue; // sibling monorepo / alias
    if (spec === pkg.name) continue; // self
    const fromSrc = srcImports.has(spec);
    if (fromSrc && !runtime.has(spec) && !peer.has(spec)) {
      failures.push(
        `R1 ${rel}: src imports ${spec} but package.json does not declare it in ` +
          "dependencies/peerDependencies" +
          (dev.has(spec) ? " (it is a devDependency — a production install would be missing it)" : "") +
          " — works locally only by workspace hoisting",
      );
    } else if (!fromSrc && !runtime.has(spec) && !peer.has(spec) && !dev.has(spec)) {
      failures.push(
        `R1 ${rel}: test imports ${spec} but package.json declares it nowhere ` +
          "(add it as a devDependency)",
      );
    }
    if (emits && fromSrc) {
      const target = [...workspaces.entries()].find(([, n]) => n === spec)?.[0];
      // Normalized, so the spellings `tsc` accepts all compare equal:
      // `../../packages/lib`, `../../packages/lib/`, `packages/lib`.
      const same = (a, b) => path.posix.normalize(a).replace(/\/+$/, "") ===
        path.posix.normalize(b).replace(/\/+$/, "");
      const referenced = [...refs].some((r) =>
        same(path.posix.join(rel, r), target) || same(r, target),
      );
      if (!referenced) {
        failures.push(
          `R2 ${rel}: composite project imports ${spec} but does not reference ` +
            `${target} in tsconfig.json (TS6059/TS6307 — the project would try to own its sources)`,
        );
      }
    }
  }

  // R3 / R4 — the package must be reachable from the root build and the resolver.
  // Library packages only; see the header for why apps are exempt.
  const isLibrary = rel.startsWith("packages/");
  if (isLibrary && isComposite && !rootRefs.has(normalizeRef(rel))) {
    failures.push(
      `R3 ${rel}: composite package is missing from the root tsconfig.json references — ` +
        "`tsc -b` at the root never builds it",
    );
  }
  if (isLibrary) {
    const target = baseTarget(pkg.name);
    if (!target) {
      failures.push(
        `R4 ${rel}: ${pkg.name} has no tsconfig.base.json paths entry — source-level ` +
          "resolution degrades to node_modules (the built .d.ts is typechecked instead of the source)",
      );
    } else {
      // An entry that points somewhere else leaves *this* package unresolved —
      // the same symptom, with the rule satisfied. `tsc` catches it eventually;
      // the gate should not need `tsc` to notice.
      const normalized = path.posix.normalize(target.replace(/^\.\//, ""));
      if (!normalized.startsWith(`${rel}/`)) {
        failures.push(
          `R4 ${rel}: tsconfig.base.json maps ${pkg.name} to "${target}", which is not ` +
            `inside ${rel}/ — the mapping resolves a different package`,
        );
      }
    }
  }
  if (isLibrary && !vitestHas(pkg.name)) {
    failures.push(
      `R4 ${rel}: ${pkg.name} has no vitest.config.ts alias — tests resolve built output ` +
        "instead of source, or fail on a clean tree",
    );
  }

  // R5 — build output must stay out of src/.
  for (const file of await buildOutputIn(path.join(root, rel, "src"))) {
    failures.push(
      `R5 ${file}: compiler output inside a src tree — it belongs in dist/. ` +
        "A stray emission is counted as a module by the boundary classifier and shadows source resolution",
    );
  }
}

// R6 — the two workspace lists must agree. pnpm 10 ignores the root
// `package.json` `workspaces` field (per this repo's own `.npmrc`), so a package
// present in one list and absent from the other is wired for exactly one of the
// two package managers.
{
  const pnpmText = await readText(path.join(root, "pnpm-workspace.yaml"));
  if (pnpmText === null) {
    warnings.push("no pnpm-workspace.yaml — R6 skipped (npm-only workspace)");
  } else {
    const rootPatterns = (await readJson(path.join(root, "package.json")))?.workspaces ?? [];
    // Deliberately a small parse rather than a YAML dependency — but a *correct*
    // one for this file: the first version required single quotes and truncated
    // at `onlyBuiltDependencies:`, so a double-quoted entry, an unquoted entry,
    // or the file being reordered (that key sorted first) reported every
    // workspace as missing.
    const pnpmPatterns = (() => {
      const patterns = [];
      let inPackages = false;
      for (const line of pnpmText.split("\n")) {
        if (/^packages:\s*$/.test(line)) {
          inPackages = true;
          continue;
        }
        if (inPackages && /^[A-Za-z_#]/.test(line)) break; // next top-level key
        if (!inPackages) continue;
        const m = /^\s*-\s*(?:(['"])(.*?)\1|(\S+))\s*$/.exec(line);
        if (m) patterns.push(m[2] ?? m[3]);
      }
      return patterns;
    })();
    const [fromNpm, fromPnpm] = await Promise.all([
      expandWorkspaces(rootPatterns),
      expandWorkspaces(pnpmPatterns),
    ]);
    const pnpmSet = new Set(fromPnpm);
    const npmSet = new Set(fromNpm);
    for (const dir of fromNpm) {
      if (!pnpmSet.has(dir)) {
        failures.push(
          `R6 ${dir}: in package.json workspaces but not in pnpm-workspace.yaml ` +
            "packages — pnpm 10 ignores the package.json field, so this package is " +
            "invisible to `pnpm install`",
        );
      }
    }
    for (const dir of fromPnpm) {
      if (!npmSet.has(dir)) {
        failures.push(
          `R6 ${dir}: in pnpm-workspace.yaml packages but not in package.json ` +
            "workspaces — one of the two lists is stale",
        );
      }
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[fail] ${failure}`);
  console.error(
    `\nworkspace-wiring: ${failures.length} problem(s) across ${workspaces.size} workspaces. ` +
      "Every rule above is a place a package must be declared; see the header of " +
      "scripts/check-workspace-wiring.mjs for the symptom of each.",
  );
  process.exit(1);
}

for (const warning of warnings) console.warn(`[warn] ${warning}`);
console.log(
  `workspace-wiring OK — R1 deps, R2/R3 project references, R4 resolution entries, ` +
    `R5 build output and R6 workspace lists all clean across ${workspaces.size} workspaces`,
);
