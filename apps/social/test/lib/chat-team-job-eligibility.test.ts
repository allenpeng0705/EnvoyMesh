import { describe, expect, it } from "vitest";
import {
  evaluateChatTeamJobEligibility,
  isChatScopedPeerReady,
  toChatTeamJobPeerCandidate,
} from "../../src/lib/chat-team-job-eligibility.js";
import type { ChainBondHealth } from "../../src/lib/chain-bond-health.js";
import type { CachedAgentCardSummary } from "@envoymesh/api";

function health(partial: Partial<ChainBondHealth> = {}): ChainBondHealth {
  return {
    status: "ready",
    cardStatus: "ready",
    onlineStatus: "online",
    optIn: true,
    capabilityCount: 1,
    label: "Ready",
    ...partial,
  };
}

const readyCard = {
  ownerId: "envoy:owner:bob",
  displayName: "Bob",
  sourceAgentPeerId: "envoy_agent_bob",
  membership: ["task.execute", "agent-network-worker"],
  cachedAt: new Date().toISOString(),
} as CachedAgentCardSummary;

describe("isChatScopedPeerReady", () => {
  it("requires Join + fresh card + online", () => {
    const ready = toChatTeamJobPeerCandidate({
      ownerId: readyCard.ownerId,
      displayName: "Bob",
      card: readyCard,
      health: health(),
    });
    expect(isChatScopedPeerReady(ready)).toBe(true);

    expect(
      isChatScopedPeerReady({
        ...ready,
        health: health({ optIn: false, cardStatus: "missing", status: "missing" }),
      }),
    ).toBe(false);

    expect(
      isChatScopedPeerReady({
        ...ready,
        health: health({ cardStatus: "stale", status: "stale" }),
      }),
    ).toBe(false);

    expect(
      isChatScopedPeerReady({
        ...ready,
        health: health({ onlineStatus: "offline" }),
      }),
    ).toBe(false);
  });

  it("honors lease exclusions when diagnostics are present", () => {
    const ready = toChatTeamJobPeerCandidate({
      ownerId: readyCard.ownerId,
      displayName: "Bob",
      card: readyCard,
      health: health(),
    });
    expect(
      isChatScopedPeerReady(ready, [
        {
          peerId: "envoy_agent_bob",
          ownerId: readyCard.ownerId,
          leaseReady: false,
          exclusionReasons: ["lease_busy"],
        } as never,
      ]),
    ).toBe(false);
  });
});

describe("evaluateChatTeamJobEligibility", () => {
  it("blocks when local Join is off", () => {
    const peer = toChatTeamJobPeerCandidate({
      ownerId: readyCard.ownerId,
      displayName: "Bob",
      card: readyCard,
      health: health(),
    });
    const out = evaluateChatTeamJobEligibility({
      localJoin: false,
      engineReady: null,
      scopedPeers: [peer],
    });
    expect(out.eligible).toBe(false);
    expect(out.localBlocked).toBe(true);
  });

  it("is eligible when local Join + engine OK and every scoped peer is ready", () => {
    const peer = toChatTeamJobPeerCandidate({
      ownerId: readyCard.ownerId,
      displayName: "Bob",
      card: readyCard,
      health: health(),
    });
    const out = evaluateChatTeamJobEligibility({
      localJoin: true,
      engineReady: true,
      scopedPeers: [peer],
    });
    expect(out.eligible).toBe(true);
    expect(out.preferredPeerIds).toEqual(["envoy_agent_bob"]);
    expect(out.gaps).toEqual([]);
  });

  it("returns gaps when a scoped peer has not joined", () => {
    const peer = toChatTeamJobPeerCandidate({
      ownerId: readyCard.ownerId,
      displayName: "Bob",
      card: readyCard,
      health: health({ optIn: false }),
    });
    const out = evaluateChatTeamJobEligibility({
      localJoin: true,
      engineReady: true,
      scopedPeers: [peer],
    });
    expect(out.eligible).toBe(false);
    expect(out.gaps[0]?.reasonCode).toBe("join_off");
  });
});
