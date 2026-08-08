import { describe, expect, it, vi } from "vitest";
import {
  chainGetStateViaRuntime,
  type ChainContext,
} from "../src/node-service-chains.js";
import {
  createChainState,
  planChain,
  type ChainOrchestratorHandlerDeps,
} from "../src/chain-orchestrator.js";
import type { ChainMandate } from "@envoymesh/protocol";

function makeMandate(chainId: string): ChainMandate {
  return {
    version: "0.1",
    chainMandateId: `chainmandate_${chainId}`,
    chainId,
    issuerOwnerId: "envoy:owner:a",
    orchestratorOwnerId: "envoy:owner:a",
    maxChainCostUsd: 10,
    costCeilingUsd: 3,
    maxWorkers: 1,
    allowDepth3: false,
    maxSensitivity: "public",
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    signature: "stub",
  };
}

describe("chain plan warning handoff + getState", () => {
  it("chainGetState surfaces per-chain assignmentMode and planWarnings", () => {
    const chainId = "chain_role_state";
    const state = createChainState(makeMandate(chainId));
    const assignmentModes = new Map<string, "skill" | "role">([[chainId, "role"]]);
    const planWarnings = new Map([
      [
        chainId,
        [
          {
            code: "role_substitute",
            message: "No tester — used programmer",
            assignKind: "role_substitute",
          },
        ],
      ],
    ]);

    const ctx = {
      store: {
        getRuntime: (id: string) => (id === chainId ? { state } : undefined),
      },
      snapshotToResult: (snap: Record<string, unknown>) => ({ ...snap }),
      bidsBySubtask: () => [],
      getChainGoal: () => "goal",
      getChainCostEstimate: () => undefined,
      getChainAwardMode: () => "direct" as const,
      getChainShowCostUi: () => false,
      getChainSideState: () => ({
        assignmentModes,
        planWarnings,
      }),
    } as unknown as ChainContext;

    const result = chainGetStateViaRuntime(ctx, { chainId });
    expect(result.assignmentMode).toBe("role");
    expect(result.planWarnings).toHaveLength(1);
    expect(result.planWarnings?.[0]?.code).toBe("role_substitute");
  });

  it("adopting plannedSubtasks persists explicit planWarnings without lastPlanMeta", () => {
    const warnings = [
      {
        code: "skill_fallback" as const,
        message: "No role peers — skill fallback",
        assignKind: "skill_fallback" as const,
      },
    ];
    const assignmentModes = new Map<string, "skill" | "role">();
    const planWarnings = new Map<string, typeof warnings>();
    const chainId = "chain_handoff_1";
    const inputPlanWarnings = warnings;
    const lastPlanMeta: { warnings: typeof warnings } | undefined = undefined;

    assignmentModes.set(chainId, "role");
    if (inputPlanWarnings?.length) {
      planWarnings.set(chainId, inputPlanWarnings);
    } else if (lastPlanMeta?.warnings?.length) {
      planWarnings.set(chainId, lastPlanMeta.warnings);
    }

    expect(planWarnings.get(chainId)).toEqual(warnings);
    expect(assignmentModes.get(chainId)).toBe("role");
  });

  it("concurrent planChain calls keep distinct request-scoped modes", async () => {
    const modes: Array<"skill" | "role" | undefined> = [];
    const llmDecompose = vi.fn(
      async (_goal: string, opts?: { assignmentMode?: "skill" | "role" }) => {
        modes.push(opts?.assignmentMode);
        await new Promise((r) => setTimeout(r, 5));
        return {
          ok: true as const,
          steps: [
            {
              version: "0.1" as const,
              subtaskId: `subtask_${opts?.assignmentMode ?? "x"}`,
              chainId: "chain_concurrent",
              chainMandateId: "chainmandate_concurrent",
              depth: 1,
              requiredSkill: "task.execute",
              objective: String(opts?.assignmentMode),
              requestedResult: "r",
              constraints: [],
              dependsOn: [],
              createdAt: new Date().toISOString(),
            },
          ],
          assignmentMode: opts?.assignmentMode,
          planWarnings:
            opts?.assignmentMode === "role"
              ? [{ code: "no_role_peers", message: "role path" }]
              : undefined,
        };
      },
    );

    const deps = {
      audit: { record: () => undefined },
      storeChainReport: async () => undefined,
      signingKeyPem: "k",
      publicKeyPem: "p",
      orchestratorPeerId: "envoy_agent_orch",
      orchestratorOwnerId: "envoy:owner:a",
      sendEnvelope: async () => true,
      findWorkers: async () => [],
      llmDecompose,
    } as unknown as ChainOrchestratorHandlerDeps;

    const [skill, role] = await Promise.all([
      planChain(deps, createChainState(makeMandate("chain_skill")), "g1", {
        allowLlm: true,
        assignmentMode: "skill",
      }),
      planChain(deps, createChainState(makeMandate("chain_role")), "g2", {
        allowLlm: true,
        assignmentMode: "role",
      }),
    ]);

    expect(modes).toContain("skill");
    expect(modes).toContain("role");
    expect(skill.ok && skill.assignmentMode).toBe("skill");
    expect(role.ok && role.assignmentMode).toBe("role");
    expect(role.ok && role.planWarnings?.[0]?.code).toBe("no_role_peers");
    expect(skill.ok && (skill.planWarnings?.length ?? 0)).toBe(0);
  });
});
