import { describe, expect, it } from "vitest";
import {
  isTeamJobListed,
  isTeamJobReady,
  type ChainBondHealth,
} from "../../src/lib/chain-bond-health.js";
import type { CachedAgentCardSummary } from "@envoymesh/api";

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

const card = {
  ownerId: "envoy:owner:alice",
  displayName: "Alice",
  sourceAgentPeerId: "envoy_agent_abc",
  capabilities: ["research"],
  cachedAt: new Date().toISOString(),
} as CachedAgentCardSummary;

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
