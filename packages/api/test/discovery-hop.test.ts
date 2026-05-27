import { describe, expect, it } from "vitest";
import {
  canForwardDiscoveryHop,
  discoveryHopDefaults,
  nextDiscoveryHop,
  responseHopDistance,
} from "../src/discovery-hop.js";
import { createDiscoveryRequestPayload } from "@envoymesh/protocol";

describe("discovery-hop", () => {
  it("defaults maxHops=1 and currentHop=0", () => {
    expect(discoveryHopDefaults({})).toEqual({ maxHops: 1, currentHop: 0 });
  });

  it("allows forward when currentHop < maxHops", () => {
    expect(canForwardDiscoveryHop({ maxHops: 2, currentHop: 0 })).toBe(true);
    expect(canForwardDiscoveryHop({ maxHops: 2, currentHop: 2 })).toBe(false);
  });

  it("computes next hop and response distance", () => {
    const payload = createDiscoveryRequestPayload({
      requesterOwnerId: "envoy:owner:x",
      requestedCapabilities: ["a"],
      maxHops: 2,
      currentHop: 0,
    });
    expect(nextDiscoveryHop(payload)).toBe(1);
    expect(responseHopDistance({ ...payload, currentHop: 1 })).toBe(2);
  });
});
