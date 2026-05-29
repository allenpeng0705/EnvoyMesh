import {
  appendRouteStepResult,
  createCapabilityProviderJob,
  initialRouteExecutionProgress,
  isRouteExecutionComplete,
  matchAgentCapabilityRoutes,
  resolveRouteStepExecution,
  transitionCapabilityProviderJob,
  type CapabilityProviderJob,
  type RouteExecutionProgress,
  type RouteStepExecutionRecord,
} from "@envoymesh/api";
import { executeCapabilityRouteStep } from "./capability-route-executor.js";

export interface CapabilityProviderWorkerDeps {
  capabilityProviderEnabled: boolean;
  autonomousKillSwitch: boolean;
  postureRef: string;
  policy: {
    maxActiveJobs: number;
    jobTtlHours: number;
  };
  localManifestCapabilities?: string[];
  listJobs: (activeOnly?: boolean) => Promise<CapabilityProviderJob[]>;
  saveJob: (job: CapabilityProviderJob) => Promise<void>;
  executeRouteStep?: (
    job: CapabilityProviderJob,
    toolName: string,
    params: Record<string, unknown>,
  ) => Promise<{ ok: boolean; summary: string }>;
  resolveTargetOwnerId?: (
    goal: string,
    capabilityIds: string[],
  ) => Promise<string | undefined>;
  recordActivity: (input: {
    correlationId: string;
    summary: string;
    jobId: string;
  }) => Promise<void>;
}

export async function startCapabilityProviderJob(
  deps: Pick<
    CapabilityProviderWorkerDeps,
    "postureRef" | "policy" | "listJobs" | "saveJob" | "recordActivity"
  >,
  input: { goal: string; capabilityIds?: string[]; targetOwnerId?: string },
): Promise<{ jobId: string; correlationId: string }> {
  const active = await deps.listJobs(true);
  if (active.length >= deps.policy.maxActiveJobs) {
    throw new Error(`Max active capability provider jobs (${deps.policy.maxActiveJobs}) reached`);
  }
  const job = createCapabilityProviderJob({
    postureRef: deps.postureRef,
    goal: input.goal,
    capabilityIds: input.capabilityIds,
    targetOwnerId: input.targetOwnerId,
    jobTtlHours: deps.policy.jobTtlHours,
  });
  await deps.saveJob(job);
  await deps.recordActivity({
    correlationId: job.correlationId,
    summary: `Capability provider queued: ${job.goal.slice(0, 80)}`,
    jobId: job.jobId,
  });
  return { jobId: job.jobId, correlationId: job.correlationId };
}

async function runRouteExecutionLoop(
  deps: CapabilityProviderWorkerDeps,
  job: CapabilityProviderJob,
): Promise<CapabilityProviderJob> {
  if (!deps.executeRouteStep || job.routeSteps.length === 0) {
    return job;
  }

  let current = job;
  let progress: RouteExecutionProgress = {
    routeStepIndex: current.routeStepIndex,
    stepResults: current.stepResults,
    agentRoutePhase: current.agentRoutePhase,
  };

  let targetOwnerId = current.targetOwnerId;
  if (!targetOwnerId && deps.resolveTargetOwnerId) {
    targetOwnerId = await deps.resolveTargetOwnerId(current.goal, current.capabilityIds);
    if (targetOwnerId) {
      current = { ...current, targetOwnerId, updatedAt: new Date().toISOString() };
      await deps.saveJob(current);
    }
  }

  while (!isRouteExecutionComplete(progress, current.routeSteps.length)) {
    const step = current.routeSteps[progress.routeStepIndex];
    if (!step) break;

    const resolved = resolveRouteStepExecution({
      step,
      goal: current.goal,
      targetOwnerId,
      capabilityIds: current.capabilityIds,
      correlationId: current.correlationId,
    });

    let record: RouteStepExecutionRecord;
    if (resolved.kind === "defer") {
      record = {
        phase: step.phase,
        ok: true,
        deferred: true,
        summary: resolved.reason,
      };
      progress = appendRouteStepResult(progress, record);
      current = {
        ...current,
        routeStepIndex: progress.routeStepIndex,
        stepResults: progress.stepResults,
        agentRoutePhase: step.phase,
        updatedAt: new Date().toISOString(),
      };
      await deps.saveJob(current);
      continue;
    }

    if (resolved.kind === "skip") {
      record = {
        phase: step.phase,
        ok: true,
        summary: resolved.reason,
      };
      progress = appendRouteStepResult(progress, record);
      current = {
        ...current,
        routeStepIndex: progress.routeStepIndex,
        stepResults: progress.stepResults,
        agentRoutePhase: step.phase,
        updatedAt: new Date().toISOString(),
      };
      await deps.saveJob(current);
      continue;
    }

    const exec = await deps.executeRouteStep(current, resolved.toolName, resolved.params);
    record = {
      phase: step.phase,
      toolName: resolved.toolName,
      ok: exec.ok,
      summary: exec.summary,
    };
    progress = appendRouteStepResult(progress, record);
    current = {
      ...current,
      routeStepIndex: progress.routeStepIndex,
      stepResults: progress.stepResults,
      agentRoutePhase: step.phase,
      updatedAt: new Date().toISOString(),
    };
    await deps.saveJob(current);

    if (!exec.ok) {
      current = {
        ...current,
        error: exec.summary,
        updatedAt: new Date().toISOString(),
      };
      await deps.saveJob(current);
      return current;
    }
  }

  return current;
}

export async function advanceCapabilityProviderJob(
  deps: CapabilityProviderWorkerDeps,
  jobId: string,
): Promise<CapabilityProviderJob | undefined> {
  if (deps.autonomousKillSwitch || !deps.capabilityProviderEnabled) return undefined;

  const job = await deps.listJobs().then((jobs) => jobs.find((j) => j.jobId === jobId));
  if (!job || job.stage === "completed" || job.stage === "failed" || job.stage === "cancelled") {
    return job;
  }

  let current = job;
  const apply = async (event: Parameters<typeof transitionCapabilityProviderJob>[1]) => {
    const result = transitionCapabilityProviderJob(current, event);
    if (result.changed) {
      current = result.job;
      await deps.saveJob(current);
      await deps.recordActivity({
        correlationId: current.correlationId,
        summary: `Capability provider: ${current.stage}`,
        jobId: current.jobId,
      });
    }
  };

  if (current.stage === "queued") {
    await apply("START");
  }

  if (current.stage === "routing") {
    const matches = matchAgentCapabilityRoutes({
      goal: current.goal,
      capabilityIds: current.capabilityIds,
      localManifestCapabilities: deps.localManifestCapabilities,
      maxResults: 1,
    });
    if (matches.length === 0) {
      current = {
        ...current,
        error: "No agent capability route matched goal",
        updatedAt: new Date().toISOString(),
      };
      await deps.saveJob(current);
      await apply("ROUTE_FAIL");
      return current;
    }
    const top = matches[0]!;
    current = {
      ...current,
      agentRouteId: top.routeId,
      agentRoutePhase: top.steps[0]?.phase,
      routeSteps: top.steps,
      routeStepIndex: 0,
      stepResults: [],
      updatedAt: new Date().toISOString(),
    };
    await deps.saveJob(current);
    await apply("ROUTE_OK");
  }

  if (current.stage === "routed" || current.stage === "executing") {
    if (current.stage === "routed") {
      await apply("EXECUTE_START");
      current = (await deps.listJobs()).find((j) => j.jobId === jobId) ?? current;
      if (current.stage !== "executing") return current;
    }

    const afterSteps = await runRouteExecutionLoop(deps, current);
    current = afterSteps;
    if (current.error) {
      await apply("EXECUTE_FAIL");
      return current;
    }
    await apply("EXECUTE_OK");
  }

  return current;
}

export async function runCapabilityProviderWorkerTick(
  deps: CapabilityProviderWorkerDeps,
): Promise<number> {
  if (deps.autonomousKillSwitch || !deps.capabilityProviderEnabled) return 0;
  const active = await deps.listJobs(true);
  let advanced = 0;
  for (const job of active) {
    await advanceCapabilityProviderJob(deps, job.jobId);
    advanced += 1;
  }
  return advanced;
}
