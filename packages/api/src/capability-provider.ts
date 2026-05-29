import { randomUUID } from "node:crypto";
import type { AgentRouteStep } from "./capability-intent-routing.js";
import type { RouteStepExecutionRecord } from "./capability-route-executor.js";

export type CapabilityProviderStage =
  | "queued"
  | "routing"
  | "routed"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export type CapabilityProviderEvent =
  | "START"
  | "ROUTE_OK"
  | "ROUTE_FAIL"
  | "EXECUTE_START"
  | "EXECUTE_OK"
  | "EXECUTE_FAIL"
  | "KILL_SWITCH";

export interface CapabilityProviderJob {
  jobId: string;
  correlationId: string;
  postureRef: string;
  goal: string;
  capabilityIds: string[];
  targetOwnerId?: string;
  stage: CapabilityProviderStage;
  agentRouteId?: string;
  agentRoutePhase?: string;
  routeSteps: AgentRouteStep[];
  routeStepIndex: number;
  stepResults: RouteStepExecutionRecord[];
  error?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

const TERMINAL: ReadonlySet<CapabilityProviderStage> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export function isCapabilityProviderTerminal(stage: CapabilityProviderStage): boolean {
  return TERMINAL.has(stage);
}

export function transitionCapabilityProviderJob(
  job: CapabilityProviderJob,
  event: CapabilityProviderEvent,
): { job: CapabilityProviderJob; changed: boolean } {
  if (isCapabilityProviderTerminal(job.stage) && event !== "KILL_SWITCH") {
    return { job, changed: false };
  }

  const now = new Date().toISOString();
  let nextStage = job.stage;

  switch (event) {
    case "KILL_SWITCH":
      nextStage = "cancelled";
      break;
    case "START":
      if (job.stage === "queued") nextStage = "routing";
      break;
    case "ROUTE_OK":
      if (job.stage === "routing") nextStage = "routed";
      break;
    case "ROUTE_FAIL":
      if (job.stage === "routing") nextStage = "failed";
      break;
    case "EXECUTE_START":
      if (job.stage === "routed") nextStage = "executing";
      break;
    case "EXECUTE_OK":
      if (job.stage === "executing" || job.stage === "routed") nextStage = "completed";
      break;
    case "EXECUTE_FAIL":
      if (job.stage === "executing") nextStage = "failed";
      break;
    default:
      break;
  }

  if (nextStage === job.stage) return { job, changed: false };
  return {
    job: { ...job, stage: nextStage, updatedAt: now },
    changed: true,
  };
}

export function createCapabilityProviderJob(input: {
  postureRef: string;
  goal: string;
  capabilityIds?: string[];
  targetOwnerId?: string;
  correlationId?: string;
  jobTtlHours?: number;
}): CapabilityProviderJob {
  const now = new Date().toISOString();
  const ttlHours = input.jobTtlHours ?? 72;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  return {
    jobId: randomUUID(),
    correlationId: input.correlationId ?? randomUUID(),
    postureRef: input.postureRef,
    goal: input.goal.trim(),
    capabilityIds: input.capabilityIds ?? [],
    targetOwnerId: input.targetOwnerId,
    stage: "queued",
    routeSteps: [],
    routeStepIndex: 0,
    stepResults: [],
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };
}
