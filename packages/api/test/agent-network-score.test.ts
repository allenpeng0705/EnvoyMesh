import { describe, expect, it } from "vitest";
import {
  assignWorkersToSteps,
  DEFAULT_WORKER_SCORE_WEIGHTS,
  rankWorkersByScore,
  scoreAgentNetworkWorker,
  throughputFit,
} from "../src/agent-network-score.js";
import { AGENT_NETWORK_WORKER_CAPABILITY } from "../src/agent-network-membership.js";

describe("scoreAgentNetworkWorker", () => {
  it("ranks strength + large context + subscription + freshness + throughput higher", () => {
    const weak = scoreAgentNetworkWorker({
      requiredCapability: "research.web",
      cardCapabilities: ["task.execute", AGENT_NETWORK_WORKER_CAPABILITY],
      profile: {
        modelFreshness: 3,
        spendPosture: "metered",
        contextWindow: "128k",
        strengths: [],
        throughputTokensPerSec: 20,
      },
      displayName: "Weak",
    });
    const strong = scoreAgentNetworkWorker({
      requiredCapability: "research.web",
      cardCapabilities: ["task.execute", "research.web", AGENT_NETWORK_WORKER_CAPABILITY],
      profile: {
        modelFreshness: 9,
        spendPosture: "subscription",
        contextWindow: "1M+",
        strengths: ["research", "research.web"],
        throughputTokensPerSec: 120,
      },
      sameLan: true,
      displayName: "Strong",
    });
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.breakdown.capability).toBeGreaterThan(weak.breakdown.capability);
    expect(strong.breakdown.throughput).toBeGreaterThan(weak.breakdown.throughput);
    expect(DEFAULT_WORKER_SCORE_WEIGHTS.capability).toBeGreaterThan(
      DEFAULT_WORKER_SCORE_WEIGHTS.spendPosture,
    );
  });

  it("throughputFit saturates around 200 tok/s", () => {
    expect(throughputFit(undefined)).toBe(0.35);
    expect(throughputFit(100)).toBeCloseTo(0.5);
    expect(throughputFit(400)).toBe(1);
  });

  it("rankWorkersByScore sorts descending", () => {
    const ranked = rankWorkersByScore([
      { peerId: "b", score: 0.2 },
      { peerId: "a", score: 0.9 },
      { peerId: "c", score: 0.9 },
    ]);
    expect(ranked.map((r) => r.peerId)).toEqual(["a", "c", "b"]);
  });

  it("assignWorkersToSteps never skips when pool is non-empty", () => {
    const all = assignWorkersToSteps({
      steps: [
        { stepKey: "1", requiredCapability: "+" },
        { stepKey: "2", requiredCapability: "/" },
      ],
      rankedPeerIds: ["only"],
      scoreFor: () => 1,
    });
    expect(all).toEqual({ "1": "only", "2": "only" });
  });

  it("assignWorkersToSteps picks best score per step", () => {
    const out = assignWorkersToSteps({
      steps: [
        { stepKey: "add", requiredCapability: "+" },
        { stepKey: "div", requiredCapability: "/" },
      ],
      rankedPeerIds: ["a", "b"],
      scoreFor: (peerId, cap) => {
        if (peerId === "a" && cap === "+") return 5;
        if (peerId === "b" && cap === "/") return 5;
        return 1;
      },
    });
    expect(out.add).toBe("a");
    expect(out.div).toBe("b");
  });
});
