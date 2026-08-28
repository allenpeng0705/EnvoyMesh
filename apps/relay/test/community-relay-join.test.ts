/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_ENVOY_COMMUNITY_RELAY_PEER_IDS,
  isCommunityPresetRelayPeerId,
  peerIdFromBootstrapMultiaddr,
} from "@envoymesh/api";
import { createRelayJoinRequestPayload } from "@envoymesh/protocol";
import {
  communityPresetJoinTargets,
  evaluateCommunityRelayJoinRequest,
} from "../src/community-relay-join.js";

const CN_PEER = peerIdFromBootstrapMultiaddr(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR)!;
const US_PEER = peerIdFromBootstrapMultiaddr(DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR)!;
const JOINER = "12D3KooWJoinerRelayPeerIdExample000000000000000000000";

function joinRequest(overrides?: { token?: string; addrs?: string[]; relayId?: string }) {
  return createRelayJoinRequestPayload({
    relay: {
      relayId: overrides?.relayId ?? JOINER,
      level: 1,
      publicAddrs: overrides?.addrs ?? ["/ip4/203.0.113.10/tcp/4001/p2p/" + JOINER],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    joinToken: overrides?.token ?? "super-secret-join-token",
  });
}

describe("community preset peer ids", () => {
  it("extracts cn and us peer ids from shipped bootstraps", () => {
    expect(DEFAULT_ENVOY_COMMUNITY_RELAY_PEER_IDS).toEqual([CN_PEER, US_PEER]);
    expect(isCommunityPresetRelayPeerId(CN_PEER)).toBe(true);
    expect(isCommunityPresetRelayPeerId(US_PEER)).toBe(true);
    expect(isCommunityPresetRelayPeerId(JOINER)).toBe(false);
  });

  it("lists join targets excluding self", () => {
    expect(communityPresetJoinTargets(CN_PEER)).toEqual([DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR]);
    expect(communityPresetJoinTargets(JOINER)).toEqual([
      DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
      DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR,
    ]);
  });
});

describe("evaluateCommunityRelayJoinRequest", () => {
  it("accepts valid join on community preset gatekeeper", () => {
    const decision = evaluateCommunityRelayJoinRequest({
      gatekeeperPeerId: CN_PEER,
      relayPublicMode: true,
      configuredJoinToken: "super-secret-join-token",
      request: joinRequest(),
      requesterPeerId: JOINER,
    });
    expect(decision).toEqual({ accept: true });
  });

  it("rejects join without token on gatekeeper", () => {
    const decision = evaluateCommunityRelayJoinRequest({
      gatekeeperPeerId: CN_PEER,
      relayPublicMode: true,
      configuredJoinToken: null,
      request: joinRequest(),
      requesterPeerId: JOINER,
    });
    expect(decision.accept).toBe(false);
  });

  it("rejects wrong join token", () => {
    const decision = evaluateCommunityRelayJoinRequest({
      gatekeeperPeerId: US_PEER,
      relayPublicMode: true,
      configuredJoinToken: "expected-token-value",
      request: joinRequest({ token: "wrong-token-value" }),
      requesterPeerId: JOINER,
    });
    expect(decision).toEqual({ accept: false, reason: "invalid join token" });
  });

  it("rejects join on non-preset relay", () => {
    const decision = evaluateCommunityRelayJoinRequest({
      gatekeeperPeerId: JOINER,
      relayPublicMode: true,
      configuredJoinToken: "super-secret-join-token",
      request: joinRequest(),
      requesterPeerId: JOINER,
    });
    expect(decision.accept).toBe(false);
  });

  it("rejects join without public addrs", () => {
    const decision = evaluateCommunityRelayJoinRequest({
      gatekeeperPeerId: CN_PEER,
      relayPublicMode: true,
      configuredJoinToken: "super-secret-join-token",
      request: joinRequest({ addrs: [] }),
      requesterPeerId: JOINER,
    });
    expect(decision).toEqual({ accept: false, reason: "joiner must publish public addrs" });
  });
});
