#!/usr/bin/env node
/**
 * Fingerprint packages/openclaw for Tauri staging reuse.
 *
 * Printed to stdout as a single line. Staged trees store the same line in
 * resources/openclaw/.openclaw-stage-stamp. When the live source stamp
 * differs, stage-tauri-openclaw-bundle.sh / build-desktop.ps1 re-stage
 * automatically (no STAGE_OPENCLAW_BUNDLE=1 / -ForceOpenClaw required).
 *
 * Usage: node scripts/openclaw-stage-stamp.mjs <openclaw-source-dir>
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const source = process.argv[2];
if (!source) {
  console.error("usage: openclaw-stage-stamp.mjs <openclaw-source-dir>");
  process.exit(2);
}

function sha256File(path) {
  if (!existsSync(path)) return "missing";
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);
}

function git(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

let version = "?";
try {
  version = JSON.parse(readFileSync(join(source, "package.json"), "utf8")).version || "?";
} catch {
  /* ignore */
}

const head = git(source, ["rev-parse", "HEAD"]) || "nogit";
const dirty = git(source, ["status", "--porcelain"]) ? "dirty" : head === "nogit" ? "nogit" : "clean";

const parts = [
  `v=${version}`,
  `git=${head}`,
  `tree=${dirty}`,
  `entry=${sha256File(join(source, "dist/entry.js"))}`,
  `mjs=${sha256File(join(source, "openclaw.mjs"))}`,
  `pkg=${sha256File(join(source, "package.json"))}`,
];

// Lockfile catches dependency bumps even when package.json version is unchanged.
const lock = join(source, "pnpm-lock.yaml");
if (existsSync(lock)) {
  parts.push(`lock=${sha256File(lock)}`);
}

process.stdout.write(`${parts.join(" ")}\n`);
