import type { CapabilityProviderJob } from "@envoymesh/api";
import { executeTool, type MeshToolContext } from "./tool-registry.js";

export interface CapabilityRouteExecutorDeps {
  getToolContext: () => Promise<MeshToolContext | null>;
}

export async function executeCapabilityRouteStep(
  deps: CapabilityRouteExecutorDeps,
  _job: Pick<CapabilityProviderJob, "correlationId">,
  toolName: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; summary: string }> {
  const context = await deps.getToolContext();
  if (!context) {
    return { ok: false, summary: "tool execution context unavailable" };
  }
  const result = await executeTool(toolName, params, { ...context, approvalGranted: true });
  if (!result.ok) {
    return {
      ok: false,
      summary: result.error ?? `tool ${toolName} failed`,
    };
  }
  const summary =
    typeof result.result === "string"
      ? result.result.slice(0, 200)
      : JSON.stringify(result.result ?? {}).slice(0, 200);
  return { ok: true, summary: summary || `${toolName} ok` };
}
