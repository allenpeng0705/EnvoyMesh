import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS,
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_ENVOY_COMMUNITY_RELAY_PEER_IDS,
  DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS,
  defaultBootstrapPresetsForDiscoveryProfile,
  isCommunityPresetRelayPeerId,
  mergeCommunityRelaySiblingBootstraps,
  normalizeBootstrapPresetsForContactsOnly,
  peerIdFromBootstrapMultiaddr,
} from "@envoymesh/api";

describe("default bootstrap presets", () => {
  it("maps discovery profiles to preset lists", () => {
    expect(defaultBootstrapPresetsForDiscoveryProfile("wan-default")).toEqual(
      DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS,
    );
    expect(defaultBootstrapPresetsForDiscoveryProfile("contacts-only")).toEqual(
      DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS,
    );
    expect(defaultBootstrapPresetsForDiscoveryProfile("relay-only")).toEqual(
      DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS,
    );
    expect(defaultBootstrapPresetsForDiscoveryProfile("lan-fast")).toEqual([]);
  });

  it("includes both community relays in wan-default and contacts-only", () => {
    expect(DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS).toContain("cn-relay");
    expect(DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS).toContain("us-relay");
    expect(DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS).toEqual(["cn-relay", "us-relay"]);
  });

  it("normalizes contacts-only presets by removing public-libp2p swarm ids", () => {
    expect(normalizeBootstrapPresetsForContactsOnly([...DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS])).toEqual([
      "cn-relay",
      "us-relay",
    ]);
    expect(normalizeBootstrapPresetsForContactsOnly(["cn-relay", "my-org-relay"])).toEqual([
      "cn-relay",
      "us-relay",
      "my-org-relay",
    ]);
  });

  it("merges community sibling bootstraps for public relay fleets", () => {
    expect(mergeCommunityRelaySiblingBootstraps([])).toEqual([
      DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
      DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR,
    ]);
    expect(
      mergeCommunityRelaySiblingBootstraps([DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR, "/ip4/9.9.9.9/tcp/4001/p2p/12D3KooWExtra"]),
    ).toEqual([
      DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
      "/ip4/9.9.9.9/tcp/4001/p2p/12D3KooWExtra",
      DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR,
    ]);
  });

  it("derives community preset relay peer ids", () => {
    const cn = peerIdFromBootstrapMultiaddr(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
    const us = peerIdFromBootstrapMultiaddr(DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR);
    expect(DEFAULT_ENVOY_COMMUNITY_RELAY_PEER_IDS).toEqual([cn, us]);
    expect(isCommunityPresetRelayPeerId(cn!)).toBe(true);
    expect(isCommunityPresetRelayPeerId("12D3KooWNotPreset")).toBe(false);
  });
});
