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

const here = path.dirname(fileURLToPath(import.meta.url));

// --- args ------------------------------------------------------------------
const args = process.argv.slice(2);
let target = 500;
let hard = 800;
let allowlistPath = path.join(here, "module-size-allowlist.json");
const dirs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--target") target = Number(args[++i]);
  else if (a === "--hard") hard = Number(args[++i]);
  else if (a === "--allowlist") allowlistPath = args[++i];
  else dirs.push(a);
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
    } else if (e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) {
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

let failed = false;
const warnings = [];
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
