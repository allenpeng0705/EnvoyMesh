/**
 * Seeded-violation regression tests for `scripts/check-module-boundary.mjs`.
 *
 * **Why these exist (plan §4.3).** A rule that silently stops firing looks
 * exactly like a rule with nothing to catch, so every implemented rule needs
 * its own seeded violation proving the check can fail. One test per rule:
 *
 * | Test | Rule | Seeded violation |
 * |------|------|------------------|
 * | direction | 1 | a `reusable` module imports a `product-bound` module |
 * | completeness | 3 | a file exists on disk but is absent from the manifest |
 * | duplicate | 3 | a module appears in the manifest twice |
 * | concept | 4 | a `reusable` module names a product concept |
 * | clean | — | **positive control**: a correct fixture must pass |
 *
 * The positive control matters as much as the violations: without it, a checker
 * that fails everything would pass this suite.
 *
 * Run: `node --test scripts/test/module-boundary.test.mjs`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const CHECKER = path.join(repoRoot, "scripts", "check-module-boundary.mjs");

/** The concept pattern the fixture relies on — kept deliberately minimal so the
 *  test does not silently pass because of an unrelated concept name. */
const CONCEPT_PATTERN = "\\b(OWNER_FAMILY_PROFILE_ID|familyProfile|isOwnerProfile)\\b";

/**
 * Build a fixture tree and run the checker against it.
 * @returns {{code: number, stdout: string, stderr: string}}
 */
async function runChecker({ files = {}, dartLib = null, pkgs = null, reusable, productBound }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "module-boundary-"));
  const dir_ = dir;
  const srcDir = path.join(dir, "apps", "node", "src");
  await fs.mkdir(srcDir, { recursive: true });

  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(srcDir, name), content, "utf8");
  }

  // `pkgs: { 'fixturepkg': { exports: { '.': './dist/index.js', './sub': './dist/sub.js' } } }`
  // builds `packages/<name>/package.json`, so rule 2 (declared entry points)
  // can be exercised.
  if (pkgs) {
    for (const [name, pj] of Object.entries(pkgs)) {
      const dir = path.join(dir_, "packages", name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "package.json"),
        JSON.stringify({ name: `@envoymesh/${name}`, ...pj }, null, 2),
        "utf8",
      );
    }
  }

  // `dartLib: { 'envoy_mesh.dart': ..., 'src/core.dart': ... }` builds
  // `packages/<pkg>/lib/...` so rule 5 (the Dart library surface) can be seeded.
  if (dartLib) {
    for (const [rel, content] of Object.entries(dartLib)) {
      const full = path.join(dir, "packages", "fixturepkg", "lib", rel);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, "utf8");
    }
  }

  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      {
        version: 1,
        declaredInputs: { conceptPattern: CONCEPT_PATTERN, corePackages: [], excluded: {} },
        reusable,
        productBound,
      },
      null,
      2,
    ),
    "utf8",
  );

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [CHECKER, "--root", dir, "--manifest", "manifest.json"],
      { cwd: repoRoot },
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const P = (name) => `apps/node/src/${name}`;

test("rule 1 (direction): a reusable module importing a product-bound module fails", async () => {
  const res = await runChecker({
    files: {
      "leaky.ts": `import { thing } from "./bound.js";\nexport const x = thing;\n`,
      "bound.ts": `export const thing = 1;\n`,
    },
    reusable: [{ path: P("leaky.ts"), tags: [] }],
    productBound: [{ path: P("bound.ts"), tags: [], viaPackage: ["@envoymesh/api"] }],
  });

  assert.equal(res.code, 1, "checker must fail on a seeded direction violation");
  assert.match(res.stderr, /\[direction\]/, "violation must be reported under rule 1");
  assert.match(res.stderr, /leaky\.ts/, "violation must name the offending module");
});

test("rule 3 (completeness): an unclassified file on disk fails", async () => {
  const res = await runChecker({
    files: {
      "known.ts": `export const a = 1;\n`,
      "brand-new.ts": `export const b = 2;\n`,
    },
    reusable: [{ path: P("known.ts"), tags: [] }],
    productBound: [],
  });

  assert.equal(res.code, 1);
  assert.match(res.stderr, /\[completeness\]/);
  assert.match(res.stderr, /brand-new\.ts/);
});

test("rule 3 (completeness): a module classified twice fails", async () => {
  const res = await runChecker({
    files: { "dup.ts": `export const a = 1;\n` },
    reusable: [{ path: P("dup.ts"), tags: [] }],
    productBound: [{ path: P("dup.ts"), tags: [] }],
  });

  assert.equal(res.code, 1);
  assert.match(res.stderr, /\[completeness\]/);
  assert.match(res.stderr, /classified 2 times/);
});

test("rule 4 (concept): a reusable module naming a product concept fails", async () => {
  const res = await runChecker({
    files: {
      "sneaky.ts": `import { OWNER_FAMILY_PROFILE_ID } from "@envoymesh/api";\nexport const p = OWNER_FAMILY_PROFILE_ID;\n`,
    },
    reusable: [{ path: P("sneaky.ts"), tags: [] }],
    productBound: [],
  });

  assert.equal(res.code, 1);
  assert.match(res.stderr, /\[concept\]/);
  assert.match(res.stderr, /OWNER_FAMILY_PROFILE_ID/);
});

test("rule 4 (concept): a concept mentioned only in a comment does NOT fail", async () => {
  // Guards the correction found during implementation: concepts are matched
  // against comment/string-stripped text, so a doc comment is not a coupling.
  const res = await runChecker({
    files: {
      "documented.ts": `// bridge fromOwnerId (familyProfile otherwise)\nexport const a = 1;\n`,
    },
    reusable: [{ path: P("documented.ts"), tags: [] }],
    productBound: [],
  });

  assert.equal(res.code, 0, `a comment must not count as a concept reference\n${res.stderr}`);
});

test("rule 5 (dart surface): a reusable library exporting a product-bound module fails", async () => {
  const res = await runChecker({
    dartLib: {
      "envoy_mesh.dart": "library;\nexport 'src/core.dart';\nexport 'src/social.dart';\n",
      "src/core.dart": "class Core {}\n",
      "src/social.dart": "class Social {}\n",
    },
    reusable: [
      { path: "packages/fixturepkg/lib/envoy_mesh.dart", tags: [] },
      { path: "packages/fixturepkg/lib/src/core.dart", tags: [] },
    ],
    productBound: [
      { path: "packages/fixturepkg/lib/src/social.dart", tags: ["social"], concept: "persona" },
    ],
  });

  assert.equal(res.code, 1, "checker must fail when a reusable library re-exports a product type");
  assert.match(res.stderr, /\[dart-surface\]/, "violation must be reported under rule 5");
  assert.match(res.stderr, /src\/social\.dart/, "violation must name the offending export");
});

test("rule 5: a product-bound library is exempt (it declares its own classification)", async () => {
  // `envoy_mesh_libp2p.dart` really is product-bound today. Rule 5 enforces the
  // declared classification; it does not invent one.
  const res = await runChecker({
    dartLib: {
      "lib_social.dart": "library;\nexport 'src/social.dart';\n",
      "src/social.dart": "class Social {}\n",
    },
    reusable: [],
    productBound: [
      { path: "packages/fixturepkg/lib/lib_social.dart", tags: ["social"] },
      { path: "packages/fixturepkg/lib/src/social.dart", tags: ["social"] },
    ],
  });

  assert.equal(res.code, 0, `a product-bound library must not be flagged\n${res.stderr}`);
});

test("rule 5: an import mentioned only in a comment does not create an edge", async () => {
  // Regression guard for a real bug: `envoy_mesh.dart` documents the
  // `envoy_mesh_social.dart` import in a doc comment, and an unanchored
  // directive regex read it as a dependency — transitively marking the
  // reusable library product-bound. Directives come from comment-stripped,
  // line-anchored text.
  const res = await runChecker({
    dartLib: {
      "envoy_mesh.dart":
        "library;\n/// add `import 'package:envoy_mesh/envoy_mesh_social.dart';`\nexport 'src/core.dart';\n",
      "src/core.dart": "class Core {}\n",
      "src/social.dart": "class Social {}\n",
    },
    reusable: [
      { path: "packages/fixturepkg/lib/envoy_mesh.dart", tags: [] },
      { path: "packages/fixturepkg/lib/src/core.dart", tags: [] },
    ],
    productBound: [{ path: "packages/fixturepkg/lib/src/social.dart", tags: ["social"] }],
  });

  assert.equal(res.code, 0, `a commented-out import must not create an edge\n${res.stderr}`);
});

test("rule 2 (surface): an undeclared subpath import fails", async () => {
  const res = await runChecker({
    pkgs: { fixturepkg: { exports: { ".": "./dist/index.js", "./declared": "./dist/declared.js" } } },
    files: {
      // `./not-declared` is absent from the exports map — a deep path.
      "consumer.ts": "import { x } from \"@envoymesh/fixturepkg/not-declared\";\nexport const a = x;\n",
    },
    reusable: [{ path: P("consumer.ts"), tags: [] }],
    productBound: [],
  });

  assert.equal(res.code, 1, "checker must fail on an undeclared subpath");
  assert.match(res.stderr, /\[surface\]/);
  assert.match(res.stderr, /not-declared/);
});

test("rule 2: a DECLARED subpath import passes (subpaths are public API here)", async () => {
  // The point of the refinement: `@envoymesh/api/chat-room-service` and
  // `@envoymesh/network/protocols` are declared entry points, not deep paths.
  const res = await runChecker({
    pkgs: { fixturepkg: { exports: { ".": "./dist/index.js", "./declared": "./dist/declared.js" } } },
    files: {
      "consumer.ts": "import { x } from \"@envoymesh/fixturepkg/declared\";\nexport const a = x;\n",
    },
    reusable: [{ path: P("consumer.ts"), tags: [] }],
    productBound: [],
  });

  assert.equal(res.code, 0, `a declared subpath must pass\n${res.stderr}`);
});

test("rule 2: wildcard subpath exports are honoured", async () => {
  const res = await runChecker({
    pkgs: { fixturepkg: { exports: { ".": "./dist/index.js", "./schemas/*": "./schemas/*" } } },
    files: {
      "consumer.ts": "import { x } from \"@envoymesh/fixturepkg/schemas/emp-0.1/envelope\";\nexport const a = x;\n",
    },
    reusable: [{ path: P("consumer.ts"), tags: [] }],
    productBound: [],
  });

  assert.equal(res.code, 0, `a wildcard-declared subpath must pass\n${res.stderr}`);
});

test("rule 2: an external sibling package is not judged (its manifest is not here)", async () => {
  // `@envoymesh/envoy-harness-client` is built from ../envoy-harness, so this
  // repo cannot know its exports map. Not judging it is the honest choice.
  const res = await runChecker({
    files: { "consumer.ts": "import { x } from \"@envoymesh/envoy-harness-client/ehui\";\nexport const a = x;\n" },
    reusable: [{ path: P("consumer.ts"), tags: [] }],
    productBound: [],
  });

  assert.equal(res.code, 0, `an unknown package must not be judged\n${res.stderr}`);
});

test("rule 2 (dart): reaching into another package's src/ fails", async () => {
  const res = await runChecker({
    dartLib: { "envoy_mesh.dart": "library;\n" },
    files: { "unused.ts": "export const a = 1;\n" },
    reusable: [
      { path: P("unused.ts"), tags: [] },
      { path: "packages/fixturepkg/lib/envoy_mesh.dart", tags: [] },
    ],
    productBound: [],
  });
  // inject a Dart consumer by hand — it lives in the fixture package's lib tree
  const probe = await runChecker({
    dartLib: {
      "envoy_mesh.dart": "library;\n",
      "consumer.dart": "import 'package:other_pkg/src/internals.dart';\n",
    },
    files: { "unused.ts": "export const a = 1;\n" },
    reusable: [
      { path: P("unused.ts"), tags: [] },
      { path: "packages/fixturepkg/lib/envoy_mesh.dart", tags: [] },
      { path: "packages/fixturepkg/lib/consumer.dart", tags: [] },
    ],
    productBound: [],
  });

  assert.equal(probe.code, 1, "a package:.../src/ import must fail rule 2");
  assert.match(probe.stderr, /\[surface\]/);
  assert.match(probe.stderr, /package:other_pkg\/src\//);
});

test("positive control: a correct fixture passes", async () => {
  const res = await runChecker({
    files: {
      "clean.ts": `import { join } from "node:path";\nexport const a = join("x");\n`,
      "bound.ts": `export const b = 1;\n`,
    },
    reusable: [{ path: P("clean.ts"), tags: [] }],
    productBound: [{ path: P("bound.ts"), tags: [], viaPackage: ["@envoymesh/api"] }],
  });

  assert.equal(res.code, 0, `a clean fixture must pass\n${res.stderr}`);
  assert.match(res.stdout, /module-boundary OK/);
});

test("the real repository passes the implemented rules", async () => {
  const { stdout } = await execFileAsync(process.execPath, [CHECKER], { cwd: repoRoot });
  assert.match(stdout, /module-boundary OK/);
});
