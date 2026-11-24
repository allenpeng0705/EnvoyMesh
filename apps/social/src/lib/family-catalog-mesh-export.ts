/**
 * Export Mesh Coding featured-harness composer truth (FH-P0-B / Q1 snapshot source).
 * CLI wrapper: `npx tsx scripts/family-catalog-mesh-export.ts`
 */

import { familyAskingControl } from "@envoymesh/agent-catalog";
import {
  CODING_FEATURED_HARNESSES,
  codingHarnessToExtAgentId,
} from "@envoymesh/api";
import { codingComposerCapabilities } from "./coding-composer-capabilities.js";

export type FamilyCatalogHarnessRow = {
  id: string;
  extAgentId: string | null;
  canSetMode: boolean;
  permissions: boolean;
  agentModeIds: string[];
  askingControl: string;
};

export function exportFamilyCatalogMesh(): {
  schemaVersion: 1;
  generatedBy: string;
  harnesses: FamilyCatalogHarnessRow[];
} {
  const harnesses: FamilyCatalogHarnessRow[] = [];
  for (const id of CODING_FEATURED_HARNESSES) {
    const caps = codingComposerCapabilities(id);
    harnesses.push({
      id,
      extAgentId: codingHarnessToExtAgentId(id),
      canSetMode: caps.canSetMode,
      permissions: caps.permissions,
      agentModeIds: caps.agentModes.map((m) => m.id),
      askingControl: familyAskingControl(id),
    });
  }
  return {
    schemaVersion: 1,
    generatedBy: "scripts/family-catalog-mesh-export.ts",
    harnesses,
  };
}