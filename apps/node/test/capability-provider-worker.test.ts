import { describe, expect, it, vi } from "vitest";
import { createCapabilityProviderJob } from "@envoymesh/api";
import { advanceCapabilityProviderJob } from "../src/capability-provider-worker.js";

describe("capability provider worker route executor", () => {
  it("completes task route with executed task.propose step", async () => {
    let job = createCapabilityProviderJob({
      postureRef: "m1",
      goal: "delegate a task to another agent",
    });
    const executeRouteStep = vi.fn().mockResolvedValue({ ok: true, summary: "ok" });

    const deps = {
      capabilityProviderEnabled: true,
      autonomousKillSwitch: false,
      postureRef: "m1",
      policy: { maxActiveJobs: 3, jobTtlHours: 72 },
      listJobs: async () => [job],
      saveJob: async (j: typeof job) => {
        job = j;
      },
      executeRouteStep: vi.fn().mockResolvedValue({ ok: true, summary: "ok" }),
      resolveTargetOwnerId: async () => "envoy:owner:bob",
      recordActivity: vi.fn(),
    };

    const result = await advanceCapabilityProviderJob(deps, job.jobId);
    expect(result?.stage).toBe("completed");
    expect(result?.agentRouteId).toBe("service.task-negotiation");
    expect(result?.stepResults.some((s) => s.toolName === "mesh.task.propose")).toBe(true);
  });

  it("runs discover tool for document library goal when executor wired", async () => {
    let job = createCapabilityProviderJob({
      postureRef: "m1",
      goal: "acquire published paper on mesh networking",
      capabilityIds: ["envoymesh.published-library"],
    });
    const executeRouteStep = vi.fn().mockResolvedValue({ ok: true, summary: "discovered" });

    const deps = {
      capabilityProviderEnabled: true,
      autonomousKillSwitch: false,
      postureRef: "m1",
      policy: { maxActiveJobs: 3, jobTtlHours: 72 },
      listJobs: async () => [job],
      saveJob: async (j: typeof job) => {
        job = j;
      },
      executeRouteStep,
      resolveTargetOwnerId: async () => "envoy:owner:bob",
      recordActivity: vi.fn(),
    };

    const result = await advanceCapabilityProviderJob(deps, job.jobId);
    expect(result?.stage).toBe("completed");
    expect(result?.agentRouteId).toBe("document.published-library");
    expect(executeRouteStep).toHaveBeenCalled();
  });
});
