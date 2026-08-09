/**
 * Wire-level regression: Team-job envelopes must carry agentCredential so
 * remote peers can verify envoy_agent_* senders (see Win "invalid signature").
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  createAgentCredential,
  generateAgentIdentity,
  generateOwnerIdentity,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  ChainHandoffRequestPayloadSchema,
  ChainMandateSignedSchema,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { BRIDGE_AGENT_SCOPE } from "../src/bridge/agent-scope.js";
import {
  broadcastChainStatus,
  createChainState,
  sendChainHandoff,
  type ChainOrchestratorHandlerDeps,
} from "../src/chain-orchestrator.js";

const NOW = new Date("2026-06-18T00:00:00.000Z");

describe("chain envelope agentCredential", () => {
  let owner: ReturnType<typeof generateOwnerIdentity>;
  let agent: ReturnType<typeof generateAgentIdentity>;
  let deps: ChainOrchestratorHandlerDeps;
  let sent: EnvoyEnvelope[];

  beforeAll(() => {
    owner = generateOwnerIdentity();
    agent = generateAgentIdentity(owner.ownerId);
    const credential = createAgentCredential({
      owner,
      agent,
      scope: [...BRIDGE_AGENT_SCOPE],
    });
    sent = [];
    deps = {
      sendEnvelope: async (_peerId, envelope) => {
        sent.push(envelope);
        return true;
      },
      findWorkers: async () => [],
      signingKeyPem: agent.privateKeyPem,
      publicKeyPem: agent.publicKeyPem,
      orchestratorPeerId: agent.agentPeerId,
      orchestratorOwnerId: owner.ownerId,
      agentCredential: credential,
      now: () => NOW,
      audit: { record: () => {} },
      storeChainReport: async () => {},
    };
  });

  it("status fan-out envelopes verify on the inbound agent path", async () => {
    sent.length = 0;
    const mandate = ChainMandateSignedSchema.parse({
      version: "0.1",
      chainMandateId: "chainmandate_cred-1",
      chainId: "chain_cred-1",
      issuerOwnerId: owner.ownerId,
      orchestratorOwnerId: owner.ownerId,
      maxChainCostUsd: 10,
      costCeilingUsd: 3,
      maxWorkers: 2,
      allowDepth3: false,
      maxSensitivity: "public",
      deadlineAt: "2026-06-18T01:00:00.000Z",
      createdAt: NOW.toISOString(),
      signature: "stub",
    });
    const state = createChainState(mandate, { awardMode: "direct" });
    state.workersBySubtask.set("subtask_a", ["envoy_agent_remote"]);
    await broadcastChainStatus(deps, state, { goal: "test", awardMode: "direct" });
    expect(sent.length).toBeGreaterThan(0);
    for (const envelope of sent) {
      expect(envelope.agentCredential).toBeDefined();
      expect(envelope.intent).toBe("task.chain.status");
      expect(verifyInboundEnvelope(envelope)).toBe(true);
    }
  });

  it("handoff envelopes verify on the inbound agent path", async () => {
    sent.length = 0;
    const handoff = ChainHandoffRequestPayloadSchema.parse({
      chainId: "chain_cred-2",
      subtaskIds: ["subtask_cred_2"],
      newOrchestratorPeerId: "envoy_agent_remote",
      newOrchestratorOwnerId: "envoy:owner:remote",
      expiresAt: "2026-06-18T01:00:00.000Z",
      createdAt: NOW.toISOString(),
    });
    await sendChainHandoff(deps, "envoy_agent_remote", handoff);
    expect(sent.length).toBe(1);
    expect(sent[0]!.agentCredential).toBeDefined();
    expect(verifyInboundEnvelope(sent[0]!)).toBe(true);
  });

  it("without credential, agent envelopes fail remote verify", async () => {
    sent.length = 0;
    const bare: ChainOrchestratorHandlerDeps = {
      ...deps,
      agentCredential: undefined,
    };
    const handoff = ChainHandoffRequestPayloadSchema.parse({
      chainId: "chain_cred-3",
      subtaskIds: ["subtask_cred_3"],
      newOrchestratorPeerId: "envoy_agent_remote",
      newOrchestratorOwnerId: "envoy:owner:remote",
      expiresAt: "2026-06-18T01:00:00.000Z",
      createdAt: NOW.toISOString(),
    });
    await sendChainHandoff(bare, "envoy_agent_remote", handoff);
    expect(sent.length).toBe(1);
    expect(sent[0]!.agentCredential).toBeUndefined();
    expect(verifyInboundEnvelope(sent[0]!)).toBe(false);
  });
});
