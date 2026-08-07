import { describe, expect, it } from "vitest";
import {
  computeChainBondHealth,
  isTeamJobListed,
  isTeamJobReady,
  type ChainBondHealth,
} from "../../src/lib/chain-bond-health.js";
import type { BondRecord, CachedAgentCardSummary } from "@envoymesh/api";

function health(partial: Partial<ChainBondHealth>): ChainBondHealth {
  return {
    status: "ready",
    cardStatus: "ready",
    onlineStatus: "online",
    optIn: true,
    capabilityCount: 1,
    lastSyncedAt: new Date().toISOString(),
    label: "Ready for chains",
    ...partial,
  };
}

const bond = {
  peerOwnerId: "envoy:owner:alice",
  level: "direct",
} as BondRecord;

const card = {
  ownerId: "envoy:owner:alice",
  displayName: "Alice",
  sourceAgentPeerId: "envoy_agent_abc",
  membership: ["task.execute", "agent-network-worker"],
  cachedAt: new Date().toISOString(),
} as CachedAgentCardSummary;

describe("computeChainBondHealth", () => {
  it("does not throw when membership is missing on a cached card", () => {
    const broken = {
      ...card,
      membership: undefined,
    } as unknown as CachedAgentCardSummary;
    const h = computeChainBondHealth(bond, broken);
    expect(h.cardStatus).toBe("missing");
    expect(h.capabilityCount).toBe(0);
    expect(h.optIn).toBe(false);
  });

  it("maps legacy capability-provider into opt-in", () => {
    const legacy = {
      ...card,
      membership: ["task.execute", "capability-provider"],
    } as CachedAgentCardSummary;
    const h = computeChainBondHealth(bond, legacy);
    expect(h.optIn).toBe(true);
    expect(h.capabilityCount).toBe(2);
  });
});

describe("isTeamJobListed / isTeamJobReady", () => {
  it("lists opted-in contacts with a card even when offline", () => {
    const h = health({ onlineStatus: "offline" });
    expect(isTeamJobListed(card, h)).toBe(true);
    expect(isTeamJobReady(card, h)).toBe(false);
  });

  it("treats unknown reachability as selectable when listed", () => {
    const h = health({ onlineStatus: "unknown" });
    expect(isTeamJobListed(card, h)).toBe(true);
    expect(isTeamJobReady(card, h)).toBe(true);
  });

  it("hides contacts that have not opted in", () => {
    const h = health({ optIn: false });
    expect(isTeamJobListed(card, h)).toBe(false);
    expect(isTeamJobReady(card, h)).toBe(false);
  });

  it("hides contacts without an agent peer id on the card", () => {
    const bare = { ...card, sourceAgentPeerId: undefined } as CachedAgentCardSummary;
    const h = health({});
    expect(isTeamJobListed(bare, h)).toBe(false);
    expect(isTeamJobReady(bare, h)).toBe(false);
  });
});
