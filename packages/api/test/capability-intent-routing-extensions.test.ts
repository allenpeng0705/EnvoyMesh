import { describe, expect, it, beforeEach } from "vitest";
import {
  buildCustomCapabilityRoute,
  deriveRoutesFromManifestCapabilities,
  matchAgentCapabilityRoutes,
  registerAgentCapabilityRoute,
  resolveAgentCapabilityRouteById,
  unregisterAgentCapabilityRoute,
} from "../src/capability-intent-routing.js";

describe("capability-intent-routing extensions", () => {
  beforeEach(() => {
    unregisterAgentCapabilityRoute("custom:acme-billing");
  });

  it("derives custom routes for unknown manifest capabilities", () => {
    const routes = deriveRoutesFromManifestCapabilities(["acme.billing.v1"]);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.routeId).toBe("custom:acme-billing-v1");
    expect(routes[0]?.steps.some((s) => s.intents.includes("task.mandate"))).toBe(true);
  });

  it("matches custom manifest capability via localManifestCapabilities", () => {
    const matches = matchAgentCapabilityRoutes({
      capabilityIds: ["acme.billing.v1"],
      localManifestCapabilities: ["acme.billing.v1"],
      maxResults: 1,
    });
    expect(matches[0]?.routeId).toBe("custom:acme-billing-v1");
  });

  it("registerAgentCapabilityRoute overrides lookup", () => {
    registerAgentCapabilityRoute({
      ...buildCustomCapabilityRoute("acme.billing"),
      routeId: "custom:acme-billing",
      label: "Registered billing route",
    });
    const route = resolveAgentCapabilityRouteById("custom:acme-billing");
    expect(route?.label).toBe("Registered billing route");
  });
});
