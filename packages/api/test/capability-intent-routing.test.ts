import { describe, expect, it } from "vitest";
import {
  PUBLISHED_LIBRARY_CAPABILITY,
  getAgentCapabilityRoute,
  matchAgentCapabilityRoutes,
} from "../src/capability-intent-routing.js";

describe("capability-intent-routing", () => {
  it("matches published-library route by capability id", () => {
    const matches = matchAgentCapabilityRoutes({
      capabilityIds: [PUBLISHED_LIBRARY_CAPABILITY],
    });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.routeId).toBe("document.published-library");
    expect(matches[0]?.steps.some((s) => s.intents.includes("share.request"))).toBe(true);
  });

  it("matches task route by goal keywords", () => {
    const matches = matchAgentCapabilityRoutes({
      goal: "delegate a task to another agent",
    });
    expect(matches.some((m) => m.routeId === "service.task-negotiation")).toBe(true);
  });

  it("returns empty when no goal or capability signal", () => {
    expect(matchAgentCapabilityRoutes({})).toEqual([]);
  });

  it("getAgentCapabilityRoute returns steps with mesh tool hints", () => {
    const route = getAgentCapabilityRoute("social.intro-bond");
    expect(route?.empPosture).toBe("social-proxy");
    expect(route?.steps[0]?.meshTools).toContain("mesh.intro.broadcast_search");
  });

  it("ranks capability match above weak keyword overlap", () => {
    const matches = matchAgentCapabilityRoutes({
      goal: "file",
      capabilityIds: [PUBLISHED_LIBRARY_CAPABILITY],
    });
    expect(matches[0]?.routeId).toBe("document.published-library");
  });
});
