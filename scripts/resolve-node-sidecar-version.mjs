#!/usr/bin/env node
/**
 * Resolve the Node.js version to bundle in Tauri desktop builds.
 *
 * With no args: read OpenClaw's engines.node minimum, then pick the newest
 * release on nodejs.org that satisfies it (prefer latest LTS when available).
 *
 * With one arg: return that version verbatim (explicit pin for reproducible builds).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const OPENCLAW_PACKAGE_PATHS = [
  join(ROOT, "apps/tauri/src-tauri/resources/openclaw/package.json"),
  join(ROOT, "packages/openclaw/package.json"),
];

const FALLBACK_MIN = "22.19.0";

function parseMinNode(enginesNode) {
  if (!enginesNode || typeof enginesNode !== "string") return FALLBACK_MIN;
  const match = enginesNode.match(/>=?\s*(\d+\.\d+\.\d+)/);
  return match?.[1] ?? FALLBACK_MIN;
}

function readOpenClawMinNode() {
  for (const path of OPENCLAW_PACKAGE_PATHS) {
    if (!existsSync(path)) continue;
    try {
      const pkg = JSON.parse(readFileSync(path, "utf8"));
      const min = parseMinNode(pkg.engines?.node);
      console.error(`[fetch-node-sidecar] OpenClaw requires Node >= ${min} (from ${path})`);
      return min;
    } catch {
      // try next path
    }
  }
  console.error(
    `[fetch-node-sidecar] OpenClaw package.json not found — using minimum Node ${FALLBACK_MIN}`,
  );
  return FALLBACK_MIN;
}

function semverGte(a, b) {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

async function resolveLatestRelease(minVersion) {
  const res = await fetch("https://nodejs.org/dist/index.json");
  if (!res.ok) {
    throw new Error(`Failed to fetch Node.js release index: HTTP ${res.status}`);
  }
  const index = await res.json();
  const eligible = index.filter((entry) => semverGte(entry.version, minVersion));
  if (eligible.length === 0) {
    throw new Error(`No Node.js release found >= ${minVersion}`);
  }
  const lts = eligible.find((entry) => entry.lts);
  const picked = lts ?? eligible[0];
  const label = picked.lts ? ` (LTS: ${picked.lts})` : "";
  console.error(`[fetch-node-sidecar] Selected Node ${picked.version}${label}`);
  return picked.version.replace(/^v/, "");
}

const explicit = process.argv[2]?.trim();
if (explicit) {
  process.stdout.write(explicit.replace(/^v/, ""));
  process.exit(0);
}

const min = readOpenClawMinNode();
const version = await resolveLatestRelease(min);
process.stdout.write(version);
