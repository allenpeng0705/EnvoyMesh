/**
 * Unit tests for strict-dial allow-set helpers.
 */
import { describe, expect, it } from "vitest";
import {
  buildAllowedDialPeerIds,
  peerIdsFromMultiaddrs,
  shouldEnableStrictDialPolicy,
} from "../src/allowed-dial-peer-ids.js";
import { DEFAULT_ENVOY_COMMUNITY_RELAY_PEER_IDS } from "@envoymesh/api";

describe("shouldEnableStrictDialPolicy", () => {
  it("never enables on relay-server", () => {
    expect(
      shouldEnableStrictDialPolicy({
        connectivityMode: "quietWan",
        discoveryProfile: "contacts-only",
        relayServerEnabled: true,
      }),
    ).toBe(false);
  });

  it("enables for quietWan / aggressive / contacts-only", () => {
    expect(
      shouldEnableStrictDialPolicy({
        connectivityMode: "quietWan",
        discoveryProfile: "wan-default",
        relayServerEnabled: false,
      }),
    ).toBe(true);
    expect(
      shouldEnableStrictDialPolicy({
        connectivityMode: "aggressive",
        discoveryProfile: "wan-default",
        relayServerEnabled: false,
      }),
    ).toBe(true);
    expect(
      shouldEnableStrictDialPolicy({
        connectivityMode: "optimized",
        discoveryProfile: "contacts-only",
        relayServerEnabled: false,
      }),
    ).toBe(true);
  });

  it("stays off for optimized wan-default", () => {
    expect(
      shouldEnableStrictDialPolicy({
        connectivityMode: "optimized",
        discoveryProfile: "wan-default",
        relayServerEnabled: false,
      }),
    ).toBe(false);
  });
});

describe("buildAllowedDialPeerIds", () => {
  it("includes self, community relays, bootstrap, seeds, bonds", () => {
    const allowed = buildAllowedDialPeerIds({
      selfPeerId: "self-peer",
      bootstrapPeerIds: ["boot-1"],
      bondedTransportPeerIds: ["bond-1"],
      seedAddrs: ["/ip4/1.2.3.4/tcp/4001/p2p/seed-peer"],
      nearbyOrConnectedPeerIds: ["nearby-1"],
      extraPeerIds: ["search-target"],
    });
    expect(allowed.has("self-peer")).toBe(true);
    expect(allowed.has("boot-1")).toBe(true);
    expect(allowed.has("bond-1")).toBe(true);
    expect(allowed.has("seed-peer")).toBe(true);
    expect(allowed.has("nearby-1")).toBe(true);
    expect(allowed.has("search-target")).toBe(true);
    for (const id of DEFAULT_ENVOY_COMMUNITY_RELAY_PEER_IDS) {
      expect(allowed.has(id)).toBe(true);
    }
    expect(allowed.size).toBeGreaterThanOrEqual(2);
  });

  it("extracts peer ids from circuit multiaddrs", () => {
    expect(
      peerIdsFromMultiaddrs([
        "/ip4/1.2.3.4/tcp/4001/p2p/relayA/p2p-circuit/p2p/targetB",
      ]),
    ).toContain("targetB");
  });
});
