import { describe, expect, it } from "vitest";
import {
  createCapabilityProviderJob,
  transitionCapabilityProviderJob,
} from "../src/capability-provider.js";

describe("agent-network-worker", () => {
  it("transitions queued -> routing -> routed on ROUTE_OK", () => {
    let job = createCapabilityProviderJob({ postureRef: "m1", goal: "delegate task" });
    const start = transitionCapabilityProviderJob(job, "START");
    expect(start.job.stage).toBe("routing");
    job = start.job;
    const routed = transitionCapabilityProviderJob(
      {
        ...job,
        agentRouteId: "service.task-negotiation",
        routeSteps: [{ phase: "discover", description: "d", intents: ["discovery.request"] }],
      },
      "ROUTE_OK",
    );
    expect(routed.job.stage).toBe("routed");
  });
});
