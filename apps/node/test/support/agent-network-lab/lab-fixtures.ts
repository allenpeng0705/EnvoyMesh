/**
 * Phase 60F — shared fixtures for the Agent Network three-node lab.
 */
import {
  ChainMandateSignedSchema,
  ChainSubtaskSchema,
  type ChainMandate,
  type ChainSubtask,
} from "@envoymesh/protocol";

export function labChainMandate(overrides?: Partial<ChainMandate>): ChainMandate {
  return ChainMandateSignedSchema.parse({
    version: "0.1",
    chainMandateId: "chainmandate_lab_1",
    chainId: "chain_lab_1",
    issuerOwnerId: "envoy:owner:assigner",
    orchestratorOwnerId: "envoy:owner:assigner",
    maxChainCostUsd: 20,
    costCeilingUsd: 5,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public",
    deadlineAt: "2030-01-02T00:00:00.000Z",
    createdAt: "2030-01-01T00:00:00.000Z",
    signature: "lab_stub",
    maxParallelAttemptsPerStep: 2,
    ...overrides,
  });
}

export function labSubtask(input?: Partial<ChainSubtask>): ChainSubtask {
  return ChainSubtaskSchema.parse({
    version: "0.1",
    subtaskId: "subtask_lab_1",
    chainId: "chain_lab_1",
    chainMandateId: "chainmandate_lab_1",
    depth: 1,
    requiredSkill: "research",
    objective: "lab objective",
    requestedResult: "short answer",
    constraints: [],
    dependsOn: [],
    costCeilingUsd: 5,
    deadlineAt: "2030-01-02T00:00:00.000Z",
    createdAt: "2030-01-01T00:00:00.000Z",
    ...input,
  });
}
