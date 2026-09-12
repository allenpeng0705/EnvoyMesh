/**
 * Seeded-violation regression tests for the repo's *wiring* gates.
 *
 * **Why these exist.** Three failures during the `@envoymesh/host-connect`
 * extraction were not bugs in the extraction — they were gates that could not
 * see what had gone wrong, or that reported something that had not:
 *
 * | Failure | Gate that should have caught it | What it needed |
 * |---|---|---|
 * | `TS6059`/`TS6307` on every moved file | `check-workspace-wiring.mjs` R2 | a seeded missing project reference |
 * | build output emitted into `src/`, counted as 5 modules | `classify-modules.mjs` + R5 | `.d.ts` excluded from the module universe, and emitted files reported |
 * | a dead module-size allowlist entry protecting nothing | `check-module-size.mjs` | a seeded stale path |
 *
 * A rule that cannot fail looks exactly like a rule with nothing to catch, so
 * every rule here has a seeded violation **and** the suite has a positive
 * control: a correct fixture must pass. The comment-stripping test is here for
 * the same reason — that class of mistake has now happened six times, most
 * recently inside `check-workspace-wiring.mjs` itself, where 20 of its first 26
 * findings were doc comments mentioning a package.
 *
 * Run: `node --test scripts/test/gates.test.mjs`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  isEmittedArtifact,
  isTsSourceFile,
  stripComments,
  stripCommentsAndStrings,
} from "../lib/source-files.mjs";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const WIRING = path.join(repoRoot, "scripts", "check-workspace-wiring.mjs");
const SIZE = path.join(repoRoot, "scripts", "check-module-size.mjs");

async function tmp(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeJson(abs, value) {
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function write(abs, content) {
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

/**
 * A minimal but *correct* repo fixture: one library package imported by one app.
 * `mutate` receives the tree root so a test can seed exactly one violation.
 */
async function wiringFixture(mutate = async () => {}) {
  const dir = await tmp("wiring-");
  await writeJson(path.join(dir, "package.json"), {
    name: "fixture-root",
    private: true,
    workspaces: ["apps/*", "packages/lib"],
  });
  await writeJson(path.join(dir, "packages/lib/package.json"), {
    name: "@envoymesh/lib",
    version: "0.0.0",
  });
  await write(
    path.join(dir, "packages/lib/tsconfig.json"),
    JSON.stringify({
      compilerOptions: { composite: true, rootDir: ".", outDir: "dist" },
      include: ["src/**/*.ts"],
    }),
  );
  await write(path.join(dir, "packages/lib/src/index.ts"), "export const lib = 1;\n");

  await writeJson(path.join(dir, "apps/app/package.json"), {
    name: "@envoymesh/app",
    version: "0.0.0",
    dependencies: { "@envoymesh/lib": "0.0.0" },
  });
  await write(
    path.join(dir, "apps/app/tsconfig.json"),
    JSON.stringify({
      compilerOptions: { composite: true, rootDir: ".", outDir: "dist" },
      include: ["src/**/*.ts"],
      references: [{ path: "../../packages/lib" }],
    }),
  );
  await write(
    path.join(dir, "apps/app/src/index.ts"),
    'import { lib } from "@envoymesh/lib";\nexport const app = lib;\n',
  );

  await write(path.join(dir, "tsconfig.json"), JSON.stringify({ references: [] }));
  await write(path.join(dir, "tsconfig.base.json"), JSON.stringify({ compilerOptions: {} }));
  await write(path.join(dir, "vitest.config.ts"), "export default {};\n");

  // The correct fixture needs R3/R4 satisfied for the library package.
  await write(path.join(dir, "tsconfig.json"), JSON.stringify({
    references: [{ path: "./packages/lib" }],
  }));
  await write(path.join(dir, "tsconfig.base.json"), JSON.stringify({
    compilerOptions: { paths: { "@envoymesh/lib": ["./packages/lib/src/index.ts"] } },
  }));
  await write(path.join(dir, "vitest.config.ts"), 'const a = { "@envoymesh/lib": 1 };\n');

  await mutate(dir);
  return dir;
}

async function runWiring(dir) {
  // Both streams: failures go to stderr, and so do `[warn]`s — asserting only on
  // stdout is how an earlier version of this suite "failed" against a gate that
  // was working (the module-size advisory does the same thing, twice now).
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [WIRING, "--root", dir], {
      cwd: repoRoot,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const stderr = error.stderr ?? "";
    return { code: error.code ?? 1, stdout: `${error.stdout ?? ""}${stderr}`, stderr };
  }
}

// ─── the wiring gate ────────────────────────────────────────────────────────

test("wiring positive control: a correct fixture passes", async () => {
  const dir = await wiringFixture();
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 0, stdout);
  assert.match(stdout, /workspace-wiring OK/);
});

test("wiring R1: an undeclared dependency fails", async () => {
  const dir = await wiringFixture(async (root) => {
    await writeJson(path.join(root, "apps/app/package.json"), {
      name: "@envoymesh/app",
      version: "0.0.0",
    });
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 1);
  assert.match(stdout, /R1 apps\/app: src imports @envoymesh\/lib/);
});

test("wiring R1: a runtime import parked in devDependencies fails", async () => {
  // Declared, so it installs in the monorepo — and is missing from a
  // production/bundled install. This is the apps/node case, one level subtler.
  const dir = await wiringFixture(async (root) => {
    await writeJson(path.join(root, "apps/app/package.json"), {
      name: "@envoymesh/app",
      version: "0.0.0",
      devDependencies: { "@envoymesh/lib": "0.0.0" },
    });
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 1);
  assert.match(stdout, /devDependency — a production install would be missing it/);
});

test("wiring R1: a test-only import may be a devDependency", async () => {
  const dir = await wiringFixture(async (root) => {
    await writeJson(path.join(root, "apps/app/package.json"), {
      name: "@envoymesh/app",
      version: "0.0.0",
      devDependencies: { "@envoymesh/lib": "0.0.0" },
    });
    await fs.rm(path.join(root, "apps/app/src/index.ts"));
    await write(
      path.join(root, "apps/app/test/index.test.ts"),
      'import { lib } from "@envoymesh/lib";\nexport const t = lib;\n',
    );
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 0, stdout);
});

test("wiring R2: a missing project reference fails (the TS6059 class)", async () => {
  const dir = await wiringFixture(async (root) => {
    await write(
      path.join(root, "apps/app/tsconfig.json"),
      JSON.stringify({
        compilerOptions: { composite: true, rootDir: ".", outDir: "dist" },
        include: ["src/**/*.ts"],
      }),
    );
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 1);
  assert.match(stdout, /R2 apps\/app: composite project imports @envoymesh\/lib/);
});

test("wiring R2: a noEmit project is exempt (it never emits into rootDir)", async () => {
  // apps/social's shape: composite + noEmit + no reference. Over-applying R2
  // here would demand references the app genuinely does not need.
  const dir = await wiringFixture(async (root) => {
    await write(
      path.join(root, "apps/app/tsconfig.json"),
      JSON.stringify({
        compilerOptions: { composite: true, noEmit: true, rootDir: ".", outDir: "dist" },
        include: ["src/**/*.ts"],
      }),
    );
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 0, stdout);
});

test("wiring R3: a library missing from the root references fails", async () => {
  const dir = await wiringFixture(async (root) => {
    await write(path.join(root, "tsconfig.json"), JSON.stringify({ references: [] }));
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 1);
  assert.match(stdout, /R3 packages\/lib: composite package is missing from the root tsconfig/);
});

test("wiring R4: a library with no paths entry or vitest alias fails", async () => {
  const dir = await wiringFixture(async (root) => {
    await write(path.join(root, "tsconfig.base.json"), JSON.stringify({ compilerOptions: {} }));
    await write(path.join(root, "vitest.config.ts"), "export default {};\n");
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 1);
  assert.match(stdout, /R4 packages\/lib: @envoymesh\/lib has no tsconfig.base.json paths entry/);
  assert.match(stdout, /R4 packages\/lib: @envoymesh\/lib has no vitest.config.ts alias/);
});

test("wiring R4: an app is exempt (nothing imports an entry point)", async () => {
  const dir = await wiringFixture();
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 0, stdout);
  assert.doesNotMatch(stdout, /R4 apps\//);
});

test("wiring R5: emitted output inside src/ fails", async () => {
  const dir = await wiringFixture(async (root) => {
    await write(path.join(root, "packages/lib/src/index.js"), "export const lib = 1;\n");
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 1);
  assert.match(stdout, /R5 packages\/lib\/src\/index\.js: compiler output inside a src tree/);
});

test("wiring R5: a declaration beside its source fails, a standalone shim does not", async () => {
  const emitted = await wiringFixture(async (root) => {
    await write(path.join(root, "packages/lib/src/index.d.ts"), "export declare const lib: 1;\n");
  });
  const first = await runWiring(emitted);
  assert.equal(first.code, 1);
  assert.match(first.stdout, /R5 packages\/lib\/src\/index\.d\.ts/);

  // An ambient shim for an untyped npm package is a hand-written source file
  // (`packages/vault/src/word-extractor.d.ts` in this repo), not an emission.
  const shim = await wiringFixture(async (root) => {
    await write(
      path.join(root, "packages/lib/src/word-extractor.d.ts"),
      'declare module "word-extractor" { export function open(p: string): unknown }\n',
    );
  });
  const second = await runWiring(shim);
  assert.equal(second.code, 0, second.stdout);
});

test("wiring: a package named only in a comment is not a dependency", async () => {
  // The gate's own first run reported 20 false failures of exactly this shape —
  // `{@link import("@envoymesh/api")} …` in a doc comment.
  //
  // The first version of this test was worthless: it named `@envoymesh/other`
  // and `@envoymesh/third`, which are not workspaces in the fixture, so
  // `isWorkspaceName()` discarded them before the comment stripping was ever
  // consulted — deleting `stripComments` left the whole suite green. The comment
  // below therefore names `@envoymesh/lib`, which IS a workspace, inside
  // `packages/lib`, which declares nothing: only a working stripper keeps this
  // passing.
  const dir = await wiringFixture(async (root) => {
    await write(
      path.join(root, "packages/lib/src/index.ts"),
      '/** Mirrors {@link import("@envoymesh/lib")} — no, this is the lib itself. */\n' +
        "// and a line comment naming @envoymesh/lib too\n" +
        "export const lib = 1;\n" +
        'export const note = "from @envoymesh/lib";\n',
    );
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 0, stdout);
});

test("wiring R6: a package in package.json but not in pnpm-workspace.yaml fails", async () => {
  // pnpm 10 ignores the root `package.json` workspaces field (this repo's own
  // .npmrc says so), so this package is invisible to `pnpm install` while
  // looking fully wired to npm. `packages/host-connect`, `packages/harness` and
  // `packages/node-core` were all in exactly this state.
  const dir = await wiringFixture(async (root) => {
    await write(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'apps/*'\n  - 'packages/lib'\n",
    );
    // `packages/extra` exists only in package.json's list.
    await writeJson(path.join(root, "packages/extra/package.json"), {
      name: "@envoymesh/extra",
      version: "0.0.0",
    });
    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    pkg.workspaces = ["apps/*", "packages/lib", "packages/extra"];
    await writeJson(path.join(root, "package.json"), pkg);
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 1);
  assert.match(
    stdout,
    /R6 packages\/extra: in package.json workspaces but not in pnpm-workspace\.yaml/,
  );
});

test("wiring R6: a package in pnpm-workspace.yaml but not in package.json fails", async () => {
  const dir = await wiringFixture(async (root) => {
    await write(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/lib'\n  - 'packages/ghost'\n",
    );
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 1);
  assert.match(stdout, /R6 packages\/ghost: in pnpm-workspace\.yaml packages but not in package\.json/);
});

test("wiring R6: matching lists pass, and a missing pnpm file only warns", async () => {
  // Matching lists (the positive control for R6).
  const matching = await wiringFixture(async (root) => {
    await write(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - 'apps/*'\n  - 'packages/lib'\n");
  });
  const ok = await runWiring(matching);
  assert.equal(ok.code, 0, ok.stdout);

  // No pnpm-workspace.yaml at all → npm-only workspace, so R6 has nothing to
  // compare and must not fail (nor crash on its own warning list).
  const npmOnly = await wiringFixture();
  const warned = await runWiring(npmOnly);
  assert.equal(warned.code, 0, warned.stdout);
  assert.match(warned.stderr, /no pnpm-workspace\.yaml — R6 skipped/);
});

// ─── the holes a reviewer found by attacking the gate ───────────────────────

test("wiring: a JSONC comment cannot disable R2", async () => {
  // `tsconfig.json` is JSONC and the rule read raw text, so a comment mentioning
  // `"noEmit": true` switched the rule off — while `tsc` still emitted and still
  // failed with TS6059/TS6307. Same mechanism could turn R3 off, or *on*.
  const dir = await wiringFixture(async (root) => {
    await write(
      path.join(root, "apps/app/tsconfig.json"),
      '// "noEmit": true was removed when we started emitting declarations\n' +
        JSON.stringify({
          compilerOptions: { composite: true, rootDir: ".", outDir: "dist" },
          include: ["src/**/*.ts"],
        }),
    );
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 1, stdout);
  assert.match(stdout, /R2 apps\/app: composite project imports @envoymesh\/lib/);
});

test("wiring: a JSONC comment cannot satisfy R4", async () => {
  const dir = await wiringFixture(async (root) => {
    await write(
      path.join(root, "tsconfig.base.json"),
      '{\n  // "@envoymesh/lib" paths entry will be added when we migrate\n' +
        '  "compilerOptions": {}\n}\n',
    );
    await write(path.join(root, "vitest.config.ts"), '// "@envoymesh/lib" alias pending\n');
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 1, stdout);
  assert.match(stdout, /R4 packages\/lib: @envoymesh\/lib has no tsconfig.base.json paths entry/);
  assert.match(stdout, /R4 packages\/lib: @envoymesh\/lib has no vitest.config.ts alias/);
});

test("wiring: single-quoted and side-effect imports are seen", async () => {
  // The first regex required `from "…"` with double quotes, so two legal
  // spellings slipped past both R1 and R2.
  const dir = await wiringFixture(async (root) => {
    await write(
      path.join(root, "apps/app/src/index.ts"),
      "import '@envoymesh/lib';\nimport { lib } from '@envoymesh/lib';\nexport const app = lib;\n",
    );
  });
  const { code, stdout } = await runWiring(dir);
  // Declared in the fixture, so only a *missing* declaration would fail — prove
  // the detection instead by removing it.
  assert.equal(code, 0, stdout);
  const undeclared = await wiringFixture(async (root) => {
    await writeJson(path.join(root, "apps/app/package.json"), {
      name: "@envoymesh/app",
      version: "0.0.0",
    });
    await write(
      path.join(root, "apps/app/src/index.ts"),
      "import '@envoymesh/lib';\nexport const app = 1;\n",
    );
  });
  const failed = await runWiring(undeclared);
  assert.equal(failed.code, 1);
  assert.match(failed.stdout, /R1 apps\/app: src imports @envoymesh\/lib/);
});

test("wiring: the reference spellings tsc accepts are accepted", async () => {
  // `"../../packages/lib/"` (trailing slash) and `"packages/lib"` (no `./` at the
  // root level) both work with `tsc -b`, and both were rejected as "does not
  // reference" — a false positive on legitimate config.
  const withSlash = await wiringFixture(async (root) => {
    await write(
      path.join(root, "apps/app/tsconfig.json"),
      JSON.stringify({
        compilerOptions: { composite: true, rootDir: ".", outDir: "dist" },
        include: ["src/**/*.ts"],
        references: [{ path: "../../packages/lib/" }],
      }),
    );
  });
  const a = await runWiring(withSlash);
  assert.equal(a.code, 0, a.stdout);

  const noDotSlash = await wiringFixture(async (root) => {
    await write(path.join(root, "tsconfig.json"), JSON.stringify({
      references: [{ path: "packages/lib" }],
    }));
  });
  const b = await runWiring(noDotSlash);
  assert.equal(b.code, 0, b.stdout);
});

test("wiring R5: an emitted .mjs beside a .mts source fails, a hand-written .mjs does not", async () => {
  const emitted = await wiringFixture(async (root) => {
    await write(path.join(root, "packages/lib/src/index.mts"), "export const lib = 1;\n");
    await write(path.join(root, "packages/lib/src/index.mjs"), "export const lib = 1;\n");
  });
  const first = await runWiring(emitted);
  assert.equal(first.code, 1);
  assert.match(first.stdout, /R5 packages\/lib\/src\/index\.mjs/);

  // A hand-written `.mjs` with no source sibling is not compiler output — the
  // repo has one (`apps/cli/src/_tmp_check.mjs`) and flagging it would be wrong.
  const handwritten = await wiringFixture(async (root) => {
    await write(path.join(root, "packages/lib/src/scratch.mjs"), "console.log(1);\n");
  });
  const second = await runWiring(handwritten);
  assert.equal(second.code, 0, second.stdout);
});

test("wiring R6: double-quoted, unquoted and reordered pnpm lists are parsed", async () => {
  // The first parser required single quotes and truncated at
  // `onlyBuiltDependencies:`, so a formatted/reordered file reported every
  // workspace as missing.
  for (const yaml of [
    'packages:\n  - "apps/*"\n  - "packages/lib"\n',
    "packages:\n  - apps/*\n  - packages/lib\n",
    "onlyBuiltDependencies:\n  - node-pty\npackages:\n  - 'apps/*'\n  - 'packages/lib'\n",
  ]) {
    const dir = await wiringFixture(async (root) => {
      await write(path.join(root, "pnpm-workspace.yaml"), yaml);
    });
    const { code, stdout } = await runWiring(dir);
    assert.equal(code, 0, `${JSON.stringify(yaml)}\n${stdout}`);
  }
});

test("wiring: --root with no value is an error, not a silent repo scan", async () => {
  try {
    await execFileAsync(process.execPath, [WIRING, "--root"], { cwd: repoRoot });
    assert.fail("expected a usage error");
  } catch (error) {
    assert.equal(error.code, 2);
    assert.match(error.stderr, /--root needs a value/);
  }
});

test("comment stripping is string-aware (the reviewer's failure cases)", () => {
  // `//` inside a string is not a comment, and `"` inside a comment does not open
  // one. The regex version deleted spans: an `envoy://` template lost its closing
  // backtick, which then made the template regex blank thousands of characters —
  // including a real concept identifier.
  const url = 'const u = "https://example.com/x";\nconst conceptName = 1;';
  assert.match(stripComments(url), /https:\/\/example\.com\/x/);
  assert.match(stripComments(url), /conceptName/);

  const glob = 'const glob = "src/*";\nimport { x } from "@envoymesh/api";';
  assert.match(stripComments(glob), /@envoymesh\/api/);

  const template = "const t = `envoy://shop?x`;\nconst kept = 1;";
  assert.match(stripComments(template), /envoy:\/\/shop\?x/);
  assert.match(stripComments(template), /const kept/);

  const comment = '// he said "hello\nconst a = 1;';
  assert.doesNotMatch(stripComments(comment), /he said/);
  assert.match(stripComments(comment), /const a = 1/);

  // Identifier scanning blanks the strings but keeps the code.
  assert.doesNotMatch(stripCommentsAndStrings(url), /example\.com/);
  assert.match(stripCommentsAndStrings(url), /conceptName/);
});

test("wiring R2: `composite` inherited from an extended base still counts", async () => {
  // A project that sets `composite` in a base config and overrides nothing
  // locally does emit — and the raw-text rule called it non-emitting, so a real
  // TS6059/TS6307 passed the gate silently.
  const dir = await wiringFixture(async (root) => {
    await write(
      path.join(root, "apps/app/tsconfig.base.json"),
      JSON.stringify({ compilerOptions: { composite: true, rootDir: ".", outDir: "dist" } }),
    );
    await write(
      path.join(root, "apps/app/tsconfig.json"),
      JSON.stringify({ extends: "./tsconfig.base.json", include: ["src/**/*.ts"] }),
    );
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 1, stdout);
  assert.match(stdout, /R2 apps\/app: composite project imports @envoymesh\/lib/);
});

test("wiring R4: a paths entry pointing at another package fails", async () => {
  const dir = await wiringFixture(async (root) => {
    await writeJson(path.join(root, "packages/other/package.json"), {
      name: "@envoymesh/other",
      version: "0.0.0",
    });
    await write(path.join(root, "packages/other/src/index.ts"), "export const other = 1;\n");
    await write(
      path.join(root, "tsconfig.base.json"),
      JSON.stringify({
        compilerOptions: {
          paths: {
            "@envoymesh/lib": ["./packages/other/src/index.ts"],
            "@envoymesh/other": ["./packages/other/src/index.ts"],
          },
        },
      }),
    );
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 1, stdout);
  assert.match(stdout, /R4 packages\/lib: tsconfig.base.json maps @envoymesh\/lib to "[^"]+", which is not inside packages\/lib\//);
});

test("wiring R1: a workspace whose sources are not under src/ is still scanned", async () => {
  // Sources in `lib/` used to be invisible to R1 and R2 entirely — the rules
  // claim to cover "a workspace", not "a workspace with a src directory".
  const dir = await wiringFixture(async (root) => {
    await fs.rm(path.join(root, "apps/app/src"), { recursive: true, force: true });
    await write(
      path.join(root, "apps/app/lib/index.ts"),
      'import { lib } from "@envoymesh/lib";\nexport const app = lib;\n',
    );
    await writeJson(path.join(root, "apps/app/package.json"), {
      name: "@envoymesh/app",
      version: "0.0.0",
    });
  });
  const { code, stdout } = await runWiring(dir);
  assert.equal(code, 1, stdout);
  assert.match(stdout, /R1 apps\/app: (src|test) imports @envoymesh\/lib/);
});

// ─── the module-size allowlist ──────────────────────────────────────────────

test("module-size: a dead allowlist entry fails", async () => {
  // The host/connect extraction moved `apps/node/src/ws-server.ts` to
  // `packages/host-connect/src/ws-server.ts`; the allowlist kept passing while
  // protecting nothing, and the real file was one scanner away from failing the
  // hard cap.
  //
  // Scanned directory: `apps/node/src/bridge`, which is small and clean. The
  // first version scanned all of `apps/node/src`, where dozens of files are over
  // the cap and not allowlisted — so the command exited 1 with or without the
  // dead-entry rule, and the assertions held even with the rule neutered.
  const dir = await tmp("size-");
  const allowlist = path.join(dir, "allowlist.json");
  await fs.writeFile(allowlist, JSON.stringify(["apps/node/src/gone-forever.ts"]), "utf8");
  try {
    await execFileAsync(
      process.execPath,
      [SIZE, "--allowlist", allowlist, "apps/node/src/bridge"],
      { cwd: repoRoot },
    );
    assert.fail("expected the dead allowlist entry to fail the check");
  } catch (error) {
    assert.equal(error.code, 1);
    assert.match(
      error.stderr,
      /allowlist entry "apps\/node\/src\/gone-forever\.ts" matches no file/,
    );
    // The failure must be the dead entry and nothing else: a clean tree plus one
    // dead entry is exactly one `[fail]`.
    assert.equal((error.stderr.match(/^\[fail\]/gm) ?? []).length, 1, error.stderr);
  }
});

test("module-size: an entry that is no longer needed is a warning, not a failure", async () => {
  const dir = await tmp("size-");
  const allowlist = path.join(dir, "allowlist.json");
  // A small, clean directory: the point is the allowlist message, not the scan.
  await fs.writeFile(allowlist, JSON.stringify(["apps/node/src/bridge/config.ts"]), "utf8");
  // `console.warn` writes to stderr, so the advisory is on stderr and the
  // verdict on stdout — asserting only on stdout is how the first version of
  // this test "failed" against a check that was working.
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [SIZE, "--allowlist", allowlist, "apps/node/src/bridge"],
    { cwd: repoRoot },
  );
  assert.match(stderr, /is no longer needed/);
  assert.match(stdout, /module-size check OK/);
});

// ─── the node store inventory ───────────────────────────────────────────────

const STORES = path.join(repoRoot, "scripts", "inventory-node-stores.mjs");
const ROOT_STORES = path.join(repoRoot, "scripts", "inventory-node-stores.mjs");

/** Run the inventory against a tree that is a *copy* of the real one, minus edits. */
async function runInventory(args) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [STORES, ...args], {
      cwd: repoRoot,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

test("node-store inventory: the real tree passes the completeness gate", async () => {
  const { code, stdout } = await runInventory(["--check"]);
  assert.equal(code, 0, stdout);
  assert.match(stdout, /node-store inventory is complete/);
  // It must report all three shapes, not just the constructor-gated ones — the
  // first version of the brief said "29 stores" and missed nine.
  assert.match(stdout, /constructor-gated/);
  assert.match(stdout, /not gated/);
  assert.match(stdout, /per-call/);
});

test("node-store inventory: a store with no group fails the gate", async () => {
  // The completeness rule is what keeps the split honest: `undecided` is an
  // acceptable answer, but *silence* is not. Seed it by pointing the script at a
  // copy of the tree with one group removed.
  const dir = await tmp("stores-");
  const scripts = path.join(dir, "scripts");
  await fs.mkdir(scripts, { recursive: true });
  const source = await fs.readFile(ROOT_STORES, "utf8");
  await fs.writeFile(
    path.join(scripts, "inventory-node-stores.mjs"),
    source.replace('  _chatLogStore: ["product", "human chat transcripts"],\n', ""),
    "utf8",
  );
  // The script resolves the repo root from its own location, so a copy needs the
  // tree it inspects: symlink the two directories it reads.
  for (const rel of ["apps", "packages"]) {
    await fs.symlink(path.join(repoRoot, rel), path.join(dir, rel), "dir");
  }
  try {
    await execFileAsync(process.execPath, [path.join(scripts, "inventory-node-stores.mjs"), "--check"], {
      cwd: repoRoot,
    });
    assert.fail("expected the ungrouped store to fail the completeness gate");
  } catch (error) {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /\[fail\] _chatLogStore: a store with no group/);
  }
});

test("module-size: the repo's own allowlist has no dead entries", async () => {
  // The synthetic fixtures above cannot catch drift in the REAL allowlist, and it
  // drifted: three entries still pointed at `apps/node/src/pi-runtime.ts` and the
  // two `ext-agent-adapter/` files after the harness extraction moved them, so the
  // integrity rule this suite tests was failing in CI while the suite stayed green.
  // This test is the missing link — it runs the gate against the repo itself.
  const { stdout } = await execFileAsync(
    process.execPath,
    [SIZE, "apps/node/src", "packages/host-connect/src", "packages/harness/src"],
    { cwd: repoRoot },
  );
  assert.match(stdout, /module-size check OK/);
});

test("module-size: every allowlist entry points at a file that exists", async () => {
  const allowlist = JSON.parse(
    await fs.readFile(path.join(repoRoot, "scripts", "module-size-allowlist.json"), "utf8"),
  );
  const missing = allowlist.filter(
    (entry) => !existsSync(path.join(repoRoot, entry)),
  );
  assert.deepEqual(missing, [], `dead allowlist entries: ${missing.join(", ")}`);
});

// ─── the module universe ────────────────────────────────────────────────────

test("source-file predicate: declarations are not modules, sources are", () => {
  for (const name of ["index.ts", "index.mts", "index.cts", "kebab-case-name.ts"]) {
    assert.equal(isTsSourceFile(name), true, name);
  }
  for (const name of [
    "index.d.ts",
    "index.d.mts",
    "index.d.ts.map",
    "index.js",
    "index.js.map",
    "index.mjs",
    "index.tsbuildinfo",
  ]) {
    assert.equal(isTsSourceFile(name), false, name);
    assert.equal(isEmittedArtifact(name), true, name);
  }
  // `.d.ts` ends in `.ts` — the collision that made five emitted files count as
  // modules in the manifest with no compile error anywhere.
  assert.equal("index.d.ts".endsWith(".ts"), true);
});

test("the committed manifest contains no build output", async () => {
  const manifest = JSON.parse(
    await fs.readFile(path.join(repoRoot, "scripts", "module-boundary.json"), "utf8"),
  );
  const all = [...manifest.reusable, ...manifest.productBound].map((entry) => entry.path);
  const artifacts = all.filter((p) => isEmittedArtifact(p.split("/").pop()));
  assert.deepEqual(artifacts, []);
});

test("comment stripping: directives survive, prose does not", () => {
  const source = [
    '/** docs: {@link import("@envoymesh/api")} and "from @envoymesh/other" */',
    'import { x } from "@envoymesh/lib";',
    "// import { y } from '@envoymesh/commented';",
    'const s = "from @envoymesh/in-a-string";',
  ].join("\n");
  const directives = stripComments(source);
  assert.match(directives, /"@envoymesh\/lib"/);
  assert.doesNotMatch(directives, /@envoymesh\/api/);
  assert.doesNotMatch(directives, /@envoymesh\/commented/);
  // A specifier inside a string is a string, not an edge — but the *identifier*
  // scan must not see any of it.
  const identifiers = stripCommentsAndStrings(source);
  assert.doesNotMatch(identifiers, /@envoymesh\//);
});
