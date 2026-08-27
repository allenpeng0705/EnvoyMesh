/**
 * Phase 60C — Beta reliability store + hierarchical fallback.
 */
import { describe, expect, it } from "vitest";
import { WorkerReliabilityStore } from "../src/worker-reliability-store.js";

describe("WorkerReliabilityStore", () => {
  it("updates Beta posterior on pass/fail and exposes lower bound", () => {
    const store = new WorkerReliabilityStore();
    store.record({
      workerPeerId: "w1",
      runtime: "envoy-harness",
      modelFamily: "claude",
      skillId: "research",
      connectivityClass: "lan_direct",
      quality: "pass",
      score: 1,
      sourceWeight: 1,
      at: "2030-01-01T00:00:00.000Z",
    });
    store.record({
      workerPeerId: "w1",
      runtime: "envoy-harness",
      modelFamily: "claude",
      skillId: "research",
      connectivityClass: "lan_direct",
      quality: "fail",
      sourceWeight: 1,
      at: "2030-01-01T00:01:00.000Z",
    });
    const proj = store.project({
      workerPeerId: "w1",
      runtime: "envoy-harness",
      modelFamily: "claude",
      skillId: "research",
      connectivityClass: "lan_direct",
    });
    expect(proj.fallbackLevel).toBe("exact");
    expect(proj.sampleCount).toBe(2);
    expect(proj.mean).toBeCloseTo(0.5, 5); // prior Beta(2,2) + pass + fail → α=3 β=3
    expect(proj.lowerBound).toBeLessThan(proj.mean);
  });

  it("does not count censored/cancel as worker failures", () => {
    const store = new WorkerReliabilityStore();
    store.record({
      workerPeerId: "w1",
      runtime: "openclaw",
      modelFamily: "unknown",
      skillId: "research",
      connectivityClass: "relay",
      quality: "cancel",
      censored: true,
      at: "2030-01-01T00:00:00.000Z",
    });
    const proj = store.project({
      workerPeerId: "w1",
      runtime: "openclaw",
      modelFamily: "unknown",
      skillId: "research",
      connectivityClass: "relay",
    });
    // Cancel is censored → bucket stays at prior with sampleCount 0 → prior fallback.
    expect(proj.fallbackLevel).toBe("prior");
    expect(proj.mean).toBe(0.5);
  });

  it("falls back hierarchically when exact tuple is sparse", () => {
    const store = new WorkerReliabilityStore();
    store.record({
      workerPeerId: "w1",
      runtime: "envoy-harness",
      modelFamily: "claude",
      skillId: "research",
      connectivityClass: "lan_direct",
      quality: "pass",
      score: 1,
      at: "2030-01-01T00:00:00.000Z",
    });
    const viaPeerRuntimeSkill = store.project({
      workerPeerId: "w1",
      runtime: "envoy-harness",
      modelFamily: "other-family",
      skillId: "research",
      connectivityClass: "relay",
    });
    expect(viaPeerRuntimeSkill.fallbackLevel).toBe("peer_runtime_skill");
    expect(viaPeerRuntimeSkill.sampleCount).toBeGreaterThan(0);

    const viaRuntimeSkill = store.project({
      workerPeerId: "w-other",
      runtime: "envoy-harness",
      modelFamily: "x",
      skillId: "research",
      connectivityClass: "wan_direct",
    });
    expect(viaRuntimeSkill.fallbackLevel).toBe("runtime_skill");
  });

  it("tracks latency EWMA for eta estimates", () => {
    const store = new WorkerReliabilityStore();
    store.record({
      workerPeerId: "w1",
      runtime: "openclaw",
      modelFamily: "unknown",
      skillId: "research",
      connectivityClass: "wan_direct",
      quality: "pass",
      score: 1,
      latencyMs: 10_000,
      at: "2030-01-01T00:00:00.000Z",
    });
    store.record({
      workerPeerId: "w1",
      runtime: "openclaw",
      modelFamily: "unknown",
      skillId: "research",
      connectivityClass: "wan_direct",
      quality: "pass",
      score: 1,
      latencyMs: 20_000,
      at: "2030-01-01T00:01:00.000Z",
    });
    const proj = store.project({
      workerPeerId: "w1",
      runtime: "openclaw",
      modelFamily: "unknown",
      skillId: "research",
      connectivityClass: "wan_direct",
    });
    expect(proj.latencyEwmaMs).toBeCloseTo(0.3 * 20_000 + 0.7 * 10_000, 5);
  });
});
