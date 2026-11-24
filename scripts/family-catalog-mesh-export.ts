/**
 * Export Mesh Coding featured-harness composer truth (FH-P0-B / Q1 snapshot source).
 * Run: npx tsx scripts/family-catalog-mesh-export.ts
 */

import { exportFamilyCatalogMesh } from "../apps/social/src/lib/family-catalog-mesh-export.js";

export type { FamilyCatalogHarnessRow } from "../apps/social/src/lib/family-catalog-mesh-export.js";
export { exportFamilyCatalogMesh };

const isMain =
  process.argv[1]?.endsWith("family-catalog-mesh-export.ts") ||
  process.argv[1]?.includes("family-catalog-mesh-export");
if (isMain) {
  process.stdout.write(`${JSON.stringify(exportFamilyCatalogMesh(), null, 2)}\n`);
}