/**
 * Live-LLM Team jobs plan+assign E2E (libp2p).
 *
 * Gated on Phase 18 live model config (`ENVOY_PHASE18_LIVE_TESTS=1` +
 * `ENVOY_MODEL_*` / node-config). Assigner home uses the live model for
 * plan+assign + merge; worker homes stay on the roster mock so execution
 * stays fast/cheap while the live plan quality is what we assert.
 *
 * Run:
 *   ENVOY_PHASE18_LIVE_TESTS=1 RUN_E2E=1 npx vitest run \
 *     apps/node/test/chain-plan-assign-live-llm-e2e.test.ts
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupPhase13Harness,
  cleanupPhase13Node,
  createPhase13TestNode,
  waitForPhase13,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";
import {
  bondAndExchangeCards,
  enableAgentNetworkWorker,
  SHARED_PLAN_ASSIGN_AI,
  wireHomeAsChainParticipant,
} from "./chain-plan-assign-e2e-helpers.js";
import {
  getPhase18ModelProviders,
  isPhase18LiveModelConfigured,
  phase18MinimaxSkipMessage,
} from "./phase18-minimax-config.js";

const nodes: Phase13TestNode[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
  await cleanupPhase13Harness();
});

describe.sequential.skipIf(!isPhase18LiveModelConfigured())(
  `E2E plan+assign live LLM three-home (${phase18MinimaxSkipMessage()})`,
  () => {
    const liveAi = getPhase18ModelProviders();

    it("live Assigner plans named steps from roster and completes to report", async () => {
      const orch = await createPhase13TestNode();
      const coder = await createPhase13TestNode();
      const research = await createPhase13TestNode();
      nodes.push(orch, coder, research);

      await wireHomeAsChainParticipant(orch);
      await wireHomeAsChainParticipant(coder);
      await wireHomeAsChainParticipant(research);

      const orchPeerId = await enableAgentNetworkWorker(orch, {
        displayName: "Orchestrator",
        membership: ["task.execute", "chain.orchestrate", "agent-network-worker"],
        profile: {
          modelFreshness: 6,
          spendPosture: "subscription",
          contextWindow: "512k",
          skills: ["task.execute"],
          throughputTokensPerSec: 30,
        },
        modelProviders: liveAi,
      });
      const coderPeerId = await enableAgentNetworkWorker(coder, {
        displayName: "Coder Home",
        membership: ["task.execute", "coding", "agent-network-worker"],
        profile: {
          modelFreshness: 9,
          spendPosture: "subscription",
          contextWindow: "1M+",
          skills: ["coding"],
          throughputTokensPerSec: 90,
        },
        modelProviders: SHARED_PLAN_ASSIGN_AI,
      });
      const researchPeerId = await enableAgentNetworkWorker(research, {
        displayName: "Research Home",
        membership: ["task.execute", "research.web", "agent-network-worker"],
        profile: {
          modelFreshness: 8,
          spendPosture: "metered",
          contextWindow: "512k",
          skills: ["research.web"],
          throughputTokensPerSec: 45,
        },
        modelProviders: SHARED_PLAN_ASSIGN_AI,
      });

      await bondAndExchangeCards(orch, coder, "Orchestrator", "Coder Home");
      await bondAndExchangeCards(orch, research, "Orchestrator", "Research Home");
      await bondAndExchangeCards(coder, research, "Coder Home", "Research Home");
      await orch.service.refreshAgentNetworkMembershipIndex();

      const roster = new Set([orchPeerId, coderPeerId, researchPeerId]);

      const started = await orch.service.chainStartFromGoal({
        goal:
          "Team job with THREE required phases (do not collapse into one step): " +
          "(1) research.web — gather brief background facts on peer-to-peer agent networks; " +
          "(2) coding — draft a short structured/coded outline of those facts; " +
          "(3) task.execute — merge research + outline into one final owner summary. " +
          "Assign each phase to the best matching worker from the roster.",
        allowLlm: true,
      });
      expect(started.ok, `plan failed: ${started.error ?? "unknown"}`).toBe(true);
      if (!started.ok || !started.chainId) return;

      const chainId = started.chainId;
      const subtasks = started.subtasks ?? [];
      expect(
        subtasks.length,
        `live plan too thin (${subtasks.length}): ${JSON.stringify(
          subtasks.map((s) => ({
            cap: s.requiredSkill,
            obj: s.objective,
            peer: s.preferredWorkerPeerId,
          })),
        )}`,
      ).toBeGreaterThanOrEqual(2);

      for (const step of subtasks) {
        expect(step.objective.trim().length).toBeGreaterThan(0);
        expect(
          step.preferredWorkerPeerId,
          `missing assignee (keyword fallback?) for: ${step.objective.slice(0, 80)}`,
        ).toBeTruthy();
        expect(
          roster.has(step.preferredWorkerPeerId!),
          `assignee ${step.preferredWorkerPeerId} not in roster for: ${step.objective}`,
        ).toBe(true);
      }

      // Soft specialty signal: when the live plan names coding / research caps,
      // prefer the matching specialist (mock E2E asserts this hard; live is soft).
      const codingStep = subtasks.find((s) => /cod/i.test(s.requiredSkill) || /cod/i.test(s.objective));
      const researchStep = subtasks.find(
        (s) => /research/i.test(s.requiredSkill) || /research/i.test(s.objective),
      );
      if (codingStep?.preferredWorkerPeerId) {
        expect(
          [coderPeerId, orchPeerId].includes(codingStep.preferredWorkerPeerId),
          `coding-ish step assigned outside coder/orch: ${codingStep.preferredWorkerPeerId}`,
        ).toBe(true);
      }
      if (researchStep?.preferredWorkerPeerId) {
        expect(
          [researchPeerId, orchPeerId].includes(researchStep.preferredWorkerPeerId),
          `research-ish step assigned outside research/orch: ${researchStep.preferredWorkerPeerId}`,
        ).toBe(true);
      }

      // At least one step should leave the Assigner when specialists are available.
      const assignedPeers = new Set(
        subtasks.map((s) => s.preferredWorkerPeerId).filter(Boolean),
      );
      expect(assignedPeers.size).toBeGreaterThanOrEqual(1);
      if (subtasks.length >= 3) {
        expect(
          [...assignedPeers].some((p) => p === coderPeerId || p === researchPeerId),
          "expected at least one specialist assignment on a 3+ step live plan",
        ).toBe(true);
      }

      await waitForPhase13(async () => {
        const state = await orch.service.chainGetState({ chainId });
        return state.published || (state.partialCount ?? 0) >= 1 || (state.awardedCount ?? 0) >= 1;
      }, 60_000);

      await waitForPhase13(async () => {
        const report = await orch.service.chainGetReport({ chainId });
        return report.report != null;
      }, 180_000);

      const report = await orch.service.chainGetReport({ chainId });
      expect(report.report?.chainId).toBe(chainId);
      expect(report.report?.executiveSummary?.length).toBeGreaterThan(0);
    }, 300_000);
  },
);
