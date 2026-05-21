/**
 * CI guard: mobile code must not import the @envoymesh/network barrel (node:crypto).
 * Prefer package.json `#network/*` imports mapped to browser-safe subpaths.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const SCAN_ROOTS = [
  join(REPO_ROOT, "packages/mobile-node/src"),
  join(REPO_ROOT, "apps/mobile"),
];

const BARREL_IMPORT = /from\s+["']@envoymesh\/network["']/g;
const ALLOWED_SUBPATH = /^@envoymesh\/network\//;

function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      out.push(...walkSourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

function findBarrelImportViolations(filePath: string): string[] {
  const content = readFileSync(filePath, "utf8");
  const violations: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.includes("@envoymesh/network")) continue;
    if (ALLOWED_SUBPATH.test(trimmed) || trimmed.includes("#network/")) continue;
    if (BARREL_IMPORT.test(line) || /import\s+["']@envoymesh\/network["']/.test(line)) {
      violations.push(trimmed);
    }
    BARREL_IMPORT.lastIndex = 0;
  }
  return violations;
}

describe("mobile browser-safe @envoymesh/network imports", () => {
  it("mobile-node and apps/mobile never import the @envoymesh/network barrel", () => {
    const violations: Array<{ file: string; lines: string[] }> = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walkSourceFiles(root)) {
        const lines = findBarrelImportViolations(file);
        if (lines.length > 0) violations.push({ file, lines });
      }
    }
    expect(violations).toEqual([]);
  });
});
