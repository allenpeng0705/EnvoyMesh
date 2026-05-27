import { describe, expect, it } from "vitest";
import {
  anonymizeDiscoveryRequesterOwnerId,
  discoveryRequesterAuditLabel,
  isAnonymousDiscoveryOwnerId,
} from "../src/discovery-privacy.js";

describe("discovery-privacy", () => {
  it("derives stable anonymous owner ids per correlation", () => {
    const a = anonymizeDiscoveryRequesterOwnerId("envoy:owner:alice", "corr-1");
    const b = anonymizeDiscoveryRequesterOwnerId("envoy:owner:alice", "corr-2");
    const c = anonymizeDiscoveryRequesterOwnerId("envoy:owner:alice", "corr-1");
    expect(isAnonymousDiscoveryOwnerId(a)).toBe(true);
    expect(a).toBe(c);
    expect(a).not.toBe(b);
  });

  it("formats audit labels without leaking anonymous token", () => {
    const anon = anonymizeDiscoveryRequesterOwnerId("envoy:owner:alice", "corr-1");
    const label = discoveryRequesterAuditLabel({
      requesterOwnerId: anon,
      referralOwnerId: "envoy:owner:referrer",
      currentHop: 1,
    });
    expect(label).toContain("anonymous(hop=1");
    expect(label).toContain("referral=envoy:owner:referrer");
    expect(label).not.toContain(anon);
  });
});
