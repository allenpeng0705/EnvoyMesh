import {
  getAgentCapabilityRoute,
  resolveRouteStepExecution,
  type DocumentAcquisitionJob,
} from "@envoymesh/api";

export async function tryExecuteDocumentAcquisitionRouteStep(
  deps: {
    executeRouteStep: (
      job: DocumentAcquisitionJob,
      toolName: string,
      params: Record<string, unknown>,
    ) => Promise<{ ok: boolean; summary: string }>;
  },
  job: DocumentAcquisitionJob,
  phase: string,
  targetOwnerId?: string,
): Promise<{ ok: boolean; summary: string } | undefined> {
  if (!job.agentRouteId) return undefined;
  const route = getAgentCapabilityRoute(job.agentRouteId);
  const step = route?.steps.find((row) => row.phase === phase);
  if (!step) return undefined;

  const resolved = resolveRouteStepExecution({
    step,
    goal: job.query,
    targetOwnerId,
    capabilityIds: ["envoymesh.published-library"],
    correlationId: job.correlationId,
  });
  if (resolved.kind !== "execute") return undefined;
  return deps.executeRouteStep(job, resolved.toolName, resolved.params);
}
