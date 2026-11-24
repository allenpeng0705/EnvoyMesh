/**
 * Export Mesh Coding featured-harness composer truth (FH-P0-B / Q1 snapshot source).
 * CLI wrapper: `npx tsx scripts/family-catalog-mesh-export.ts`
 */

import {
  CODING_FEATURED_HARNESSES,
  codingHarnessToExtAgentId,
} from "@envoymesh/api";
import { codingComposerCapabilities } from "./coding-composer-capabilities.js";

/**
 * EnvoyCoder `asking-control.ts` values for featured ids (manual sync on Coder change).
 * @see ../EnvoyCoder/packages/agent-catalog/src/asking-control.ts
 */
const CODER_ASKING_CONTROL: Record<string, string> = {
  "envoy-harness": "policy",
  "deepseek-harness": "unattended-mode",
  claudecode: "unattended-mode",
  codex: "unattended-mode",
  cursor: "launch-force",
  opencode: "session-auto",
  copilot: "none",
  pi: "none",
};

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
      askingControl: CODER_ASKING_CONTROL[id] ?? "catalog-acp",
    });
  }
  return {
    schemaVersion: 1,
    generatedBy: "scripts/family-catalog-mesh-export.ts",
    harnesses,
  };
}