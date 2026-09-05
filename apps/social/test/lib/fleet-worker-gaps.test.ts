/**
 * Phase 66A — per-worker fleet gap priority.
 */

import { describe, expect, it } from "vitest";
import { collectFleetWorkerGaps } from "../../src/lib/fleet-worker-gaps.js";
import type { ChainBondHealth } from "../../src/lib/chain-bond-health.js";
import type { CachedAgentCardSummary } from "@envoymesh/api";

function health(partial: Partial<ChainBondHealth>): ChainBondHealth {
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

const card = {
  ownerId: "envoy:owner:bob",
  displayName: "Bob",
  sourceAgentPeerId: "envoy_agent_bob",
  membership: ["task.execute", "agent-network-worker"],
  cachedAt: new Date().toISOString(),
} as CachedAgentCardSummary;

describe("collectFleetWorkerGaps", () => {
  it("prefers join_off over lease and offline", () => {
    const gaps = collectFleetWorkerGaps({
      candidates: [
        {
          ownerId: "envoy:owner:bob",
          displayName: "Bob",
          card,
          health: health({ optIn: false, onlineStatus: "offline", cardStatus: "stale" }),
        },
      ],
      diagnosticsWorkers: [
        {
          peerId: "envoy_agent_bob",
          ownerId: "envoy:owner:bob",
          membershipOk: false,
          leaseReady: false,
          runtimeReady: false,
          exclusionReasons: ["lease_expired"],
        },
      ],
    });
    expect(gaps).toEqual([
      expect.objectContaining({
        displayName: "Bob",
        reasonCode: "join_off",
        action: "manageWorkers",
      }),
    ]);
  });

  it("maps lease_expired from diagnostics after card is fresh", () => {
    const gaps = collectFleetWorkerGaps({
      candidates: [
        {
          ownerId: "envoy:owner:bob",
          displayName: "Bob",
          card,
          health: health(),
        },
      ],
      diagnosticsWorkers: [
        {
          peerId: "envoy_agent_bob",
          ownerId: "envoy:owner:bob",
          membershipOk: true,
          leaseReady: false,
          runtimeReady: true,
          exclusionReasons: ["lease_expired"],
        },
      ],
    });
    expect(gaps[0]?.reasonCode).toBe("lease_expired");
    expect(gaps[0]?.action).toBe("refreshCards");
  });

  it("omits self and fully ready peers", () => {
    const gaps = collectFleetWorkerGaps({
      candidates: [
        {
          isSelf: true,
          ownerId: "envoy:owner:me",
          displayName: "You",
          health: health({ optIn: false }),
        },
        {
          ownerId: "envoy:owner:bob",
          displayName: "Bob",
          card,
          health: health(),
        },
      ],
      diagnosticsWorkers: [
        {
          peerId: "envoy_agent_bob",
          ownerId: "envoy:owner:bob",
          membershipOk: true,
          leaseReady: true,
          runtimeReady: true,
          exclusionReasons: [],
        },
      ],
    });
    expect(gaps).toEqual([]);
  });

  it("reports offline when card and lease are fine", () => {
    const gaps = collectFleetWorkerGaps({
      candidates: [
        {
          ownerId: "envoy:owner:bob",
          displayName: "Bob",
          card,
          health: health({ onlineStatus: "offline" }),
        },
      ],
      diagnosticsWorkers: [
        {
          peerId: "envoy_agent_bob",
          ownerId: "envoy:owner:bob",
          membershipOk: true,
          leaseReady: true,
          runtimeReady: true,
          exclusionReasons: [],
        },
      ],
    });
    expect(gaps[0]?.reasonCode).toBe("offline");
  });
});
