/**
 * FH-P1-A — EH Coding tool surface (mirror EnvoyHome `stripHarnessAutoTools`).
 *
 * Mesh pre-registers an explicit per-skill allow-list; `Agent` still widens
 * the registry with harness orchestration tools. Strip everything the EHUI
 * path does not implement, keeping only Mesh-declared tools plus the harness
 * steering pair.
 */

import type { ToolRegistry } from "@envoymesh/envoy-harness";

export const MESH_EH_ALLOWED_AUTO_TOOLS = new Set([
  "suggest_follow_ups",
  "task",
]);

/**
 * Remove every tool the harness added on top of `keep` (the caller's own tool
 * names, snapshotted *before* constructing the `Agent`).
 */
export function stripMeshHarnessAutoTools(
  registry: ToolRegistry,
  keep: Iterable<string>,
): void {
  const allowed = new Set(MESH_EH_ALLOWED_AUTO_TOOLS);
  for (const name of keep) allowed.add(name);
  for (const tool of registry.list()) {
    if (!allowed.has(tool.name)) registry.unregister(tool.name);
  }
}