import { describe, expect, it } from "vitest";
import {
  describePublicDiscoveryReachability,
  hasPublicDiscoveryReachability,
} from "../src/node-service-identity.js";

/**
 * Search and advertise must agree on "can peers outside my LAN find me?".
 *
 * Regression: searching counted an enabled relay config
 * (`canSearchTopics = isPublicNetwork || isPrivateRelay`) while advertising only
 * counted bootstrap presets/peers. A node whose only WAN path was a configured
 * relay could search others but was never findable itself — its relay checkin
 * carried no topicHashes, so a phone searching an interest over WAN got nothing
 * back even though the node was online with that interest set.
 */
describe("hasPublicDiscoveryReachability", () => {
  it("is true with bootstrap presets", () => {
    expect(hasPublicDiscoveryReachability({ bootstrapPresets: ["cn-relay"] })).toBe(true);
  });

  it("is true with bootstrap peers", () => {
    expect(
      hasPublicDiscoveryReachability({ bootstrapPeers: ["/ip4/1.2.3.4/tcp/4001/p2p/x"] }),
    ).toBe(true);
  });

  it("is true for a relay-only node (the regression)", () => {
    expect(
      hasPublicDiscoveryReachability({
        relayEnabled: true,
        configuredRelays: [{ addr: "/ip4/1.2.3.4/tcp/4001/p2p/relay" }],
      }),
    ).toBe(true);
  });

  it("ignores relays that are disabled or empty", () => {
    expect(
      hasPublicDiscoveryReachability({ relayEnabled: false, configuredRelays: [{ addr: "x" }] }),
    ).toBe(false);
    expect(hasPublicDiscoveryReachability({ relayEnabled: true, configuredRelays: [] })).toBe(false);
    expect(hasPublicDiscoveryReachability({ relayEnabled: true })).toBe(false);
  });

  it("is false when there is no WAN path at all", () => {
    expect(hasPublicDiscoveryReachability(null)).toBe(false);
    expect(hasPublicDiscoveryReachability(undefined)).toBe(false);
    expect(hasPublicDiscoveryReachability({})).toBe(false);
    expect(
      hasPublicDiscoveryReachability({ bootstrapPresets: [], bootstrapPeers: [] }),
    ).toBe(false);
  });

  it("describes the decision for logs", () => {
    expect(
      describePublicDiscoveryReachability({
        bootstrapPresets: ["cn-relay", "us-relay"],
        bootstrapPeers: ["a"],
        relayEnabled: true,
        configuredRelays: [{ addr: "x" }, { addr: "y" }],
      }),
    ).toBe("presets=2 peers=1 enabledRelays=2");
    // Disabled relays are not reported as a path.
    expect(
      describePublicDiscoveryReachability({ relayEnabled: false, configuredRelays: [{ addr: "x" }] }),
    ).toBe("presets=0 peers=0 enabledRelays=0");
  });
});
