/**
 * No bare `require(...)` in ESM sources.
 *
 * **Why this exists.** Every package here is `"type": "module"`, so `require` is
 * not defined at runtime — a bare `require(...)` is a `ReferenceError`. Nothing
 * catches it: it type-checks (`@types/node` declares `require`), it compiles
 * (`tsc` leaves the call alone), and any test that does not execute that exact
 * line passes.
 *
 * Three had shipped, all found on 2026-09-12:
 *
 *   * `apps/node/src/stun.ts` — `stunLookup()` threw
 *     `ReferenceError: require is not defined` from the built `dist/` output, so
 *     STUN/NAT detection was dead in production. Verified by calling the built
 *     module, not by reading it.
 *   * `apps/node/src/node-service-impl.ts` — `_resolveOpenClawDir()` used
 *     `require("./bundled-paths.js")`. The §6.2 kernel probe surfaced the failure
 *     and **allow-listed it** as a pre-existing defect; the allow-list entry is
 *     now gone because the call is fixed and reported as served.
 *   * `apps/node/src/developer-cli.ts` — the relay snapshot path, whose
 *     "avoid a circular dep" comment was already moot (the file imported that
 *     barrel at the top).
 *
 * A local function *named* `require` is fine (`envoy-invite-uri.ts` has one), and
 * a `require` inside a template literal is fine (`home-node-liveness-watchdog.ts`
 * generates a CommonJS script). Both are handled below rather than excluded by
 * path, so a real one in those files would still fail.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stripCommentsAndStrings } from "../../../scripts/lib/source-files.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Files whose bare `require(` is a real runtime error. */
export function bareRequireOffenders(files: { path: string; code: string }[]): string[] {
  const offenders: string[] = [];
  for (const { path: rel, code } of files) {
    // Comments and string/template contents cannot be a call — and the generated
    // CJS script in the watchdog lives inside a template literal.
    const stripped = stripCommentsAndStrings(code) as string;
    if (!/\brequire\s*\(/.test(stripped)) continue;
    // A locally declared `require` shadows the global, which is legal.
    if (/(?:function|const|let|var)\s+require\b/.test(stripped)) continue;
    offenders.push(rel);
  }
  return offenders;
}

function walk(dir: string, out: { path: string; code: string }[] = []) {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (["node_modules", "dist", ".git", "target", "build"].includes(entry)) continue;
      walk(full, out);
      continue;
    }
    if (!entry.endsWith(".ts") || entry.endsWith(".d.ts")) continue;
    out.push({ path: path.relative(repoRoot, full), code: readFileSync(full, "utf8") });
  }
  return out;
}

describe("ESM sources contain no bare require()", () => {
  it("no `require(` call in apps/*/src or packages/*/src", () => {
    const files = [
      ...walk(path.join(repoRoot, "apps")),
      ...walk(path.join(repoRoot, "packages")),
    ].filter((f) => f.path.includes(`${path.sep}src${path.sep}`))
      // `packages/openclaw` is the vendored upstream tree (openclaw 0.2.0):
      // not this repo's code to fix, and excluded from the boundary manifest for
      // the same reason (`declaredInputs.excluded`). Everything else is ours.
      .filter((f) => !f.path.startsWith(`packages${path.sep}openclaw${path.sep}`));
    expect(files.length).toBeGreaterThan(500); // the scan is actually looking at the tree
    expect(bareRequireOffenders(files)).toEqual([]);
  });

  // Negative controls: the scan must fail on the shapes it exists to catch, and
  // must not fail on the two legal shapes it deliberately allows.
  it("seeded: detects a bare require, ignores a local one and a template-literal one", () => {
    const seeded = (code: string) => bareRequireOffenders([{ path: "seed.ts", code }]);
    expect(seeded('const http = require("node:http");\n')).toEqual(["seed.ts"]);
    expect(seeded('const { a } = require("./a.js");\n')).toEqual(["seed.ts"]);
    // legal: a local function named require
    expect(seeded("function require(p: URLSearchParams, k: string) { return p.get(k)!; }\n")).toEqual([]);
    // legal: inside a generated script string
    expect(seeded('return `const http = require("node:http");`;\n')).toEqual([]);
    // legal: a comment
    expect(seeded('// keep the CommonJS require("node:http") for `node -e`\nconst a = 1;\n')).toEqual([]);
    // legal: ESM equivalents
    expect(seeded('import { createRequire } from "node:module";\nconst r = createRequire(import.meta.url);\n')).toEqual([]);
  });
});
