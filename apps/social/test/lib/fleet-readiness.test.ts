import { describe, expect, it } from "vitest";
import {
  buildFleetReadinessChecklist,
  summarizeFleetReadinessInput,
  type FleetReadinessInput,
} from "../../src/lib/fleet-readiness.js";
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

const peerCard = {
  ownerId: "envoy:owner:bob",
  displayName: "Bob",
  sourceAgentPeerId: "envoy_agent_bob",
  membership: ["task.execute", "agent-network-worker"],
  cachedAt: new Date().toISOString(),
} as CachedAgentCardSummary;

describe("buildFleetReadinessChecklist", () => {
  it("fails Join and skips preview when local Join is off", () => {
    const input: FleetReadinessInput = {
      localJoin: false,
      engineReady: null,
      bondedPeerCount: 0,
      peersOptedIn: 0,
      peersFreshCard: 0,
      peersStaleCard: 0,
      peersOnline: 0,
      peersOffline: 0,
      selectableCount: 0,
      otherReadyCount: 0,
    };
    const result = buildFleetReadinessChecklist(input);
    expect(result.skipPreview).toBe(true);
    expect(result.blocked).toBe(true);
    expect(result.rows.find((r) => r.id === "join")?.tone).toBe("fail");
    expect(result.rows.find((r) => r.id === "join")?.action).toBe("manageWorkers");
    expect(result.rows.find((r) => r.id === "engine")).toBeUndefined();
  });

  it("surfaces engine fail with Settings CTA when Join is on", () => {
    const result = buildFleetReadinessChecklist({
      localJoin: true,
      engineReady: false,
      bondedPeerCount: 1,
      peersOptedIn: 1,
      peersFreshCard: 1,
      peersStaleCard: 0,
      peersOnline: 1,
      peersOffline: 0,
      selectableCount: 0,
      otherReadyCount: 0,
    });
    expect(result.rows.find((r) => r.id === "engine")).toMatchObject({
      tone: "fail",
      action: "openSettingsAi",
    });
    expect(result.skipPreview).toBe(true);
  });

  it("warns on stale cards with refresh CTA", () => {
    const result = buildFleetReadinessChecklist({
      localJoin: true,
      engineReady: true,
      bondedPeerCount: 2,
      peersOptedIn: 2,
      peersFreshCard: 0,
      peersStaleCard: 2,
      peersOnline: 1,
      peersOffline: 0,
      selectableCount: 1,
      otherReadyCount: 1,
    });
    expect(result.rows.find((r) => r.id === "freshCard")).toMatchObject({
      tone: "warn",
      action: "refreshCards",
    });
    expect(result.blocked).toBe(false);
    expect(result.skipPreview).toBe(false);
  });

  it("peerJoin fail offers Manage workers CTA", () => {
    const result = buildFleetReadinessChecklist({
      localJoin: true,
      engineReady: true,
      bondedPeerCount: 2,
      peersOptedIn: 0,
      peersFreshCard: 0,
      peersStaleCard: 0,
      peersOnline: 0,
      peersOffline: 0,
      selectableCount: 0,
      otherReadyCount: 0,
    });
    expect(result.rows.find((r) => r.id === "peerJoin")).toMatchObject({
      tone: "fail",
      action: "manageWorkers",
    });
  });

  it("passes when another ready peer exists", () => {
    const result = buildFleetReadinessChecklist({
      localJoin: true,
      engineReady: true,
      bondedPeerCount: 1,
      peersOptedIn: 1,
      peersFreshCard: 1,
      peersStaleCard: 0,
      peersOnline: 1,
      peersOffline: 0,
      selectableCount: 2,
      otherReadyCount: 1,
    });
    expect(result.blocked).toBe(false);
    expect(result.rows.every((r) => r.tone === "pass")).toBe(true);
  });
});

describe("summarizeFleetReadinessInput", () => {
  it("counts opted-in peers and selectable workers", () => {
    const summary = summarizeFleetReadinessInput({
      localJoin: true,
      engineReady: true,
      bondedPeerCount: 2,
      candidates: [
        {
          isSelf: true,
          card: {
            ...peerCard,
            ownerId: "envoy:owner:me",
            sourceAgentPeerId: "envoy_agent_me",
          },
          health: health({ engineReady: true }),
        },
        {
          card: peerCard,
          health: health({ onlineStatus: "offline" }),
        },
        {
          card: { ...peerCard, ownerId: "envoy:owner:cara", sourceAgentPeerId: "envoy_agent_cara" },
          health: health({ optIn: false }),
        },
      ],
    });
    expect(summary.peersOptedIn).toBe(1);
    expect(summary.peersOffline).toBe(1);
    expect(summary.selectableCount).toBe(1);
    expect(summary.otherReadyCount).toBe(0);
  });

  it("excludes lease-expired peers from otherReady when diagnostics present", () => {
    const summary = summarizeFleetReadinessInput({
      localJoin: true,
      engineReady: true,
      bondedPeerCount: 1,
      candidates: [
        {
          card: peerCard,
          health: health({}),
        },
      ],
      diagnosticsWorkers: [
        {
          peerId: "envoy_agent_bob",
          ownerId: "envoy:owner:bob",
          membershipOk: true,
          leaseReady: false,
          runtimeReady: false,
          exclusionReasons: ["lease_expired"],
        },
      ],
    });
    expect(summary.selectableCount).toBe(1);
    expect(summary.otherReadyCount).toBe(0);
  });

  it("counts legacy_ready lease as otherReady", () => {
    const summary = summarizeFleetReadinessInput({
      localJoin: true,
      engineReady: true,
      bondedPeerCount: 1,
      candidates: [{ card: peerCard, health: health({}) }],
      diagnosticsWorkers: [
        {
          peerId: "envoy_agent_bob",
          ownerId: "envoy:owner:bob",
          membershipOk: true,
          leaseReady: false,
          runtimeReady: false,
          exclusionReasons: ["lease_legacy_ready"],
        },
      ],
    });
    expect(summary.otherReadyCount).toBe(1);
  });
});
