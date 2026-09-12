/**
 * Module-size lint (the Codex LOC rule, ported).
 *
 * **Rule (from `codex/AGENTS.md`):** target modules under 500
 * lines of code; if a file exceeds roughly 800 lines, add new
 * functionality in a new module instead of extending the file,
 * unless there is a strong documented reason not to.
 *
 * **What this script does:**
 * - Scans `.ts` files under the given source dirs (tests are
 *   excluded — pass the `src` dirs, not `test`).
 * - Warns (exit 0) when a file exceeds the `--target` (500).
 * - Fails when a file exceeds the `--hard` cap (800) UNLESS it
 *   is listed in the allowlist (`module-size-allowlist.json`).
 *
 * **Line counting:** lines = number of `\n` newline characters, which
 * matches `wc -l`. A file that does not end with a trailing newline
 * still counts its last partial line, matching typical `wc -l` usage
 * (the count is "roughly N lines", so a ±1 edge is not material).
 * - The allowlist holds pre-existing (v1.x) oversized modules so
 *   the rule applies to NEW growth without forcing a retroactive
 *   refactor. Removing an allowlist entry is a good sign.
 *
 * **Usage:**
 * ```sh
 * node scripts/check-module-size.mjs [--target 500] [--hard 800] \
 *   [--allowlist scripts/module-size-allowlist.json] <dir>...
 * ```
 *
 * **Exit codes:** 0 = ok (warnings allowed), 1 = a non-allowlisted
 * module exceeds the hard cap.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { isTsSourceFile } from "./lib/source-files.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// --- args ------------------------------------------------------------------
const args = process.argv.slice(2);
let target = 500;
let hard = 800;
let allowlistPath = path.join(here, "module-size-allowlist.json");
const dirs = [];
const KNOWN_FLAGS = new Set(["--target", "--hard", "--allowlist"]);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--target" || a === "--hard" || a === "--allowlist") {
    const value = args[++i];
    if (value === undefined || KNOWN_FLAGS.has(value)) {
      // `--hard` as the last argument used to set NaN, which makes every
      // comparison false — the cap silently stopped applying rather than erroring.
      console.error(`module-size: ${a} needs a value`);
      process.exit(2);
    }
    if (a === "--target") target = Number(value);
    else if (a === "--hard") hard = Number(value);
    else allowlistPath = value;
    if ((a === "--target" || a === "--hard") && !Number.isFinite(a === "--target" ? target : hard)) {
      console.error(`module-size: ${a} must be a number, got "${value}"`);
      process.exit(2);
    }
  } else if (a.startsWith("--")) {
    // A typo used to be pushed as a *directory* (`--hard-cap 800 apps/node/src`
    // scanned a path called `800` and kept the defaults).
    console.error(`module-size: unknown flag ${a}`);
    process.exit(2);
  } else dirs.push(a);
}
if (dirs.length === 0) dirs.push("src");

// --- allowlist --------------------------------------------------------------
let allowlist = new Set();
try {
  const raw = await fs.readFile(allowlistPath, "utf8");
  const parsed = JSON.parse(raw);
  allowlist = new Set(Array.isArray(parsed) ? parsed : []);
} catch {
  // No allowlist file → empty allowlist (strict mode).
}

// --- scan -------------------------------------------------------------------
async function walk(dir, out) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out; // missing dir is fine
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      await walk(p, out);
    } else if (e.isFile() && isTsSourceFile(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const root = path.resolve(here, "..");
const files = [];
for (const dir of dirs) {
  await walk(path.resolve(root, dir), files);
}

// --- allowlist integrity ----------------------------------------------------
//
// The allowlist is keyed by **repo-relative path**, which makes it silently
// wrong the moment a file moves: the entry protects nothing, while the file at
// its new path is unprotected. That happened on the host/connect extraction —
// `apps/node/src/ws-server.ts` was allowlisted, the file became
// `packages/host-connect/src/ws-server.ts`, and the entry kept passing while the
// real 1,021-line file was one scanner away from failing the hard cap. A dead
// entry is therefore an ERROR, and an entry that is no longer needed is a WARN.
let failed = false;
const warnings = [];

for (const entry of allowlist) {
  const abs = path.resolve(root, entry);
  let lines;
  try {
    lines = ((await fs.readFile(abs, "utf8")).match(/\n/g) ?? []).length;
  } catch {
    failed = true;
    console.error(
      `[fail] allowlist entry "${entry}" matches no file. ` +
        "A path-keyed exception is silently void after a rename or move — " +
        `update it to the file's new path (or delete it) in ${path.relative(root, allowlistPath)}.`,
    );
    continue;
  }
  if (lines <= hard) {
    warnings.push(
      `allowlist entry "${entry}" is no longer needed (${lines} lines, hard cap ${hard}) — remove it`,
    );
  }
}
for (const file of files) {
  const content = await fs.readFile(file, "utf8");
  const lines = (content.match(/\n/g) ?? []).length;
  const rel = path.relative(root, file);
  if (lines > hard && !allowlist.has(rel)) {
    failed = true;
    console.error(
      `[fail] ${rel}: ${lines} lines exceeds the ${hard}-line hard cap ` +
        `(target ${target}). Add new functionality in a new module, or add a documented ` +
        `exception to ${path.relative(root, allowlistPath)}.`,
    );
  } else if (lines > target) {
    warnings.push(`${rel}: ${lines} lines (target ${target})`);
  }
}

for (const w of warnings) {
  console.warn(`[warn] ${w}`);
}
if (failed) process.exit(1);
console.log(
  `module-size check OK: ${files.length} files scanned, ` +
    `${warnings.length} over target (${target}), 0 over hard cap (${hard}) outside the allowlist.`,
);
