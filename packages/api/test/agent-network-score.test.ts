import { describe, expect, it } from "vitest";
import {
  assignWorkersToSteps,
  DEFAULT_WORKER_SCORE_WEIGHTS,
  rankWorkersByScore,
  scoreAgentNetworkWorker,
  throughputFit,
} from "../src/agent-network-score.js";
import { AGENT_NETWORK_WORKER_MEMBERSHIP } from "../src/agent-network-membership.js";

describe("scoreAgentNetworkWorker", () => {
  it("ranks skills + large context + subscription + freshness + throughput higher", () => {
    const weak = scoreAgentNetworkWorker({
      requiredSkill: "research.web",
      membership: ["task.execute", AGENT_NETWORK_WORKER_MEMBERSHIP],
      profile: {
        modelFreshness: 3,
        spendPosture: "metered",
        contextWindow: "128k",
        skills: [],
        throughputTokensPerSec: 20,
      },
      displayName: "Weak",
    });
    const strong = scoreAgentNetworkWorker({
      requiredSkill: "research.web",
      // Mesh membership must not create a specialty match — only skills do.
      membership: ["task.execute", "research.web", AGENT_NETWORK_WORKER_MEMBERSHIP],
      profile: {
        modelFreshness: 9,
        spendPosture: "subscription",
        contextWindow: "1M+",
        skills: ["research", "research.web"],
        throughputTokensPerSec: 120,
      },
      sameLan: true,
      displayName: "Strong",
    });
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.breakdown.skill).toBe(1);
    expect(weak.breakdown.skill).toBe(0.45);
    expect(strong.breakdown.throughput).toBeGreaterThan(weak.breakdown.throughput);
    expect(DEFAULT_WORKER_SCORE_WEIGHTS.skill).toBeGreaterThan(
      DEFAULT_WORKER_SCORE_WEIGHTS.spendPosture,
    );
  });

  it("does not treat membership tags as specialty factors", () => {
    const withMembershipOnly = scoreAgentNetworkWorker({
      requiredSkill: "coding",
      membership: ["task.execute", "coding", AGENT_NETWORK_WORKER_MEMBERSHIP],
      profile: { skills: [], modelFreshness: 5, spendPosture: "unknown", contextWindow: "128k" },
      displayName: "MembershipOnly",
    });
    const withSkills = scoreAgentNetworkWorker({
      requiredSkill: "coding",
      membership: ["task.execute", AGENT_NETWORK_WORKER_MEMBERSHIP],
      profile: {
        skills: ["coding"],
        modelFreshness: 5,
        spendPosture: "unknown",
        contextWindow: "128k",
      },
      displayName: "Skills",
    });
    expect(withSkills.breakdown.skill).toBe(1);
    expect(withMembershipOnly.breakdown.skill).toBe(0.45);
    expect(withSkills.score).toBeGreaterThan(withMembershipOnly.score);
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
        { stepKey: "1", requiredSkill: "+" },
        { stepKey: "2", requiredSkill: "/" },
      ],
      rankedPeerIds: ["only"],
      scoreFor: () => 1,
    });
    expect(all).toEqual({ "1": "only", "2": "only" });
  });

  it("assignWorkersToSteps picks best score per step", () => {
    const out = assignWorkersToSteps({
      steps: [
        { stepKey: "add", requiredSkill: "+" },
        { stepKey: "div", requiredSkill: "/" },
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
