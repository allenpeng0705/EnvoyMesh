#!/usr/bin/env node
/**
 * FH-P0-B / Q1:B — compare live Mesh export vs committed snapshot.
 * FH-P1-E — when adding a featured harness, see `.github/pull_request_template.md`
 * (Coding provider checklist) before committing an updated snapshot.
 * Usage: node scripts/check-family-catalog-drift.mjs
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = join(root, "scripts/family-catalog-snapshot.json");

function stableJson(obj) {
  return JSON.stringify(obj);
}

const snapRaw = readFileSync(snapshotPath, "utf8");
const snapshot = JSON.parse(snapRaw);

const run = spawnSync(
  "npx",
  ["tsx", "scripts/family-catalog-mesh-export.ts"],
  { cwd: root, encoding: "utf8" },
);
if (run.status !== 0) {
  console.error(run.stderr || run.stdout || "export failed");
  process.exit(1);
}
const live = JSON.parse(run.stdout);

const fields = ["id", "extAgentId", "canSetMode", "permissions", "agentModeIds", "askingControl"];
const errors = [];

const snapById = new Map(snapshot.harnesses.map((h) => [h.id, h]));
const liveById = new Map(live.harnesses.map((h) => [h.id, h]));

for (const id of new Set([...snapById.keys(), ...liveById.keys()])) {
  const s = snapById.get(id);
  const l = liveById.get(id);
  if (!s) errors.push(`snapshot missing featured harness: ${id}`);
  if (!l) errors.push(`live export missing featured harness: ${id}`);
  if (!s || !l) continue;
  for (const f of fields) {
    if (stableJson(s[f]) !== stableJson(l[f])) {
      errors.push(`${id}.${f}: snapshot=${stableJson(s[f])} live=${stableJson(l[f])}`);
    }
  }
}

if (errors.length > 0) {
  console.error("family-catalog drift:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  console.error("\nRefresh: npx tsx scripts/family-catalog-mesh-export.ts > scripts/family-catalog-snapshot.json");
  process.exit(1);
}

console.log(`family-catalog OK (${live.harnesses.length} featured harnesses)`);