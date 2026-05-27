import { describe, expect, it } from "vitest";
import {
  buildForwardedDiscoveryPayload,
  shouldQueueDiscoveryForward,
} from "../src/discovery-forward.js";
import { createDiscoveryRequestPayload } from "@envoymesh/protocol";
import {
  ANONYMOUS_DISCOVERY_OWNER_PREFIX,
  isAnonymousDiscoveryOwnerId,
} from "@envoymesh/api";

describe("discovery-forward", () => {
  it("queues forward for bonded hops only", () => {
    const payload = createDiscoveryRequestPayload({
      requesterOwnerId: "envoy:owner:a",
      requestedCapabilities: ["music"],
      maxHops: 2,
      currentHop: 0,
    });
    expect(shouldQueueDiscoveryForward(payload, "direct")).toBe(true);
    expect(shouldQueueDiscoveryForward(payload, "public")).toBe(false);
  });

  it("anonymizes requester and sets referral on forward payload (US-MH2)", () => {
    const payload = createDiscoveryRequestPayload({
      requesterOwnerId: "envoy:owner:a",
      requestedCapabilities: ["music"],
      maxHops: 2,
      currentHop: 0,
    });
    const forward = buildForwardedDiscoveryPayload(
      payload,
      payload.requesterOwnerId,
      "envoy:owner:referrer",
      "corr-123",
    );
    expect(forward.currentHop).toBe(1);
    expect(forward.forwardPrivacy).toBe("anonymous");
    expect(forward.referralOwnerId).toBe("envoy:owner:referrer");
    expect(isAnonymousDiscoveryOwnerId(forward.requesterOwnerId)).toBe(true);
    expect(forward.requesterOwnerId.startsWith(ANONYMOUS_DISCOVERY_OWNER_PREFIX)).toBe(true);
    expect(forward.requesterOwnerId).not.toBe(payload.requesterOwnerId);
  });
});
