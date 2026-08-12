/**
 * In-memory Ext Agent project paths (hydrated from bridge-config extAgents).
 * Backends resolve cwd via {@link getExtAgentProjectPathCwd}.
 */
import { extAgentUsesProjectPath } from "@envoymesh/api";
import type { ExtAgentDefinition } from "@envoymesh/api";
import { resolveHomeFsDirectory } from "../home-fs.js";

const paths = new Map<string, string>();

export function syncExtAgentProjectPathsFromAgents(
  agents: ExtAgentDefinition[] | undefined,
): void {
  paths.clear();
  for (const agent of agents ?? []) {
    const id = agent.id?.trim();
    if (!id || !extAgentUsesProjectPath(id)) continue;
    const resolved = resolveHomeFsDirectory(agent.projectPath);
    if (resolved) paths.set(id, resolved);
  }
}

export function setExtAgentProjectPathInStore(
  agentId: string,
  absolutePath: string | null | undefined,
): string | undefined {
  const id = agentId.trim();
  if (!id) return undefined;
  if (!absolutePath) {
    paths.delete(id);
    return undefined;
  }
  paths.set(id, absolutePath);
  return absolutePath;
}

export function getExtAgentProjectPathCwd(agentId: string): string | undefined {
  return paths.get(agentId.trim());
}
