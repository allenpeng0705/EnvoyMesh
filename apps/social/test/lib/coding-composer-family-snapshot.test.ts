import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exportFamilyCatalogMesh } from "../../src/lib/family-catalog-mesh-export.js";

const snapshotPath = join(
  import.meta.dirname,
  "../../../../scripts/family-catalog-snapshot.json",
);

describe("family catalog snapshot (FH-P0-C)", () => {
  it("matches committed snapshot JSON", () => {
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const live = exportFamilyCatalogMesh();
    expect(live.harnesses).toEqual(snapshot.harnesses);
  });
});