import { describe, expect, it } from "vitest";
import { createRelayJoinRequestPayload } from "@envoymesh/protocol";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  peerIdFromBootstrapMultiaddr,
} from "@envoymesh/api";
import {
  createRelayJoinRateLimiter,
  evaluateCommunityRelayJoinRequest,
} from "@envoymesh/api/community-relay-join";

const CN_PEER = peerIdFromBootstrapMultiaddr(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR)!;
const JOINER = "12D3KooWJoinerRelayPeerIdExample000000000000000000000";

describe("evaluateCommunityRelayJoinRequest", () => {
  it("accepts valid join on community preset gatekeeper", () => {
    const request = createRelayJoinRequestPayload({
      relay: {
        relayId: JOINER,
        level: 1,
        publicAddrs: ["/ip4/203.0.113.10/tcp/4001/p2p/" + JOINER],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      joinToken: "super-secret-join-token",
    });
    expect(
      evaluateCommunityRelayJoinRequest({
        gatekeeperPeerId: CN_PEER,
        relayPublicMode: true,
        configuredJoinToken: "super-secret-join-token",
        request,
        requesterPeerId: JOINER,
      }),
    ).toEqual({ accept: true });
  });
});

describe("createRelayJoinRateLimiter", () => {
  it("allows attempts up to the window limit per peer", () => {
    const limiter = createRelayJoinRateLimiter({ windowMs: 60_000, maxAttempts: 3 });
    expect(limiter.allow("peer-a")).toBe(true);
    expect(limiter.allow("peer-a")).toBe(true);
    expect(limiter.allow("peer-a")).toBe(true);
    expect(limiter.allow("peer-a")).toBe(false);
    expect(limiter.allow("peer-b")).toBe(true);
  });

  it("rejects invalid peer ids", () => {
    const limiter = createRelayJoinRateLimiter();
    expect(limiter.allow("")).toBe(false);
  });
});
