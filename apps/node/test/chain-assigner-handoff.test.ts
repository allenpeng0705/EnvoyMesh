/**
 * Whole-job Assigner handoff: trigger sends task.chain.handoff with goal;
 * remote Assigner accepts and runs plan+assign locally.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { ChainHandoffRequestPayloadSchema } from "@envoymesh/protocol";
import { sendChainHandoff, type ChainOrchestratorHandlerDeps } from "../src/chain-orchestrator.js";

let keyPair: { privateKey: string; publicKey: string };

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  keyPair = {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
});

describe("sendChainHandoff — Assigner goal handoff", () => {
  it("sends task.chain.handoff with goal and empty subtaskIds", async () => {
    const sent: Array<{ recipientPeerId: string; intent: string; payload: unknown }> = [];
    const deps: ChainOrchestratorHandlerDeps = {
      sendEnvelope: async (recipientPeerId, envelope, payload) => {
        sent.push({ recipientPeerId, intent: envelope.intent, payload });
        return true;
      },
      findWorkers: async () => [],
      now: () => new Date("2026-07-22T00:00:00.000Z"),
      signingKeyPem: keyPair.privateKey,
      publicKeyPem: keyPair.publicKey,
      orchestratorPeerId: "envoy_agent_trigger",
      orchestratorOwnerId: "envoy:owner:trigger",
      audit: { record: () => undefined },
      storeChainReport: async () => undefined,
    };

    const payload = ChainHandoffRequestPayloadSchema.parse({
      chainId: "chain_assigner_1",
      subtaskIds: [],
      newOrchestratorPeerId: "envoy_agent_assigner",
      newOrchestratorOwnerId: "envoy:owner:assigner",
      goal: "research then write a summary",
      rationale: "assigner_handoff",
      expiresAt: "2026-07-22T00:10:00.000Z",
      createdAt: "2026-07-22T00:00:00.000Z",
      iterationMaxRounds: 2,
      iterationJudgeMode: "always_stop",
      extendMaxStepsPerRound: 1,
    });

    const ok = await sendChainHandoff(deps, "envoy_agent_assigner", payload);
    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.intent).toBe("task.chain.handoff");
    expect(sent[0]!.recipientPeerId).toBe("envoy_agent_assigner");
    const body = sent[0]!.payload as {
      goal?: string;
      iterationMaxRounds?: number;
      iterationJudgeMode?: string;
      extendMaxStepsPerRound?: number;
    };
    expect(body.goal).toContain("research");
    expect(body.iterationMaxRounds).toBe(2);
    expect(body.iterationJudgeMode).toBe("always_stop");
    expect(body.extendMaxStepsPerRound).toBe(1);
  });
});

describe("listAgentNetworkMcpTools", () => {
  it("exposes roster + probe MCP descriptors", async () => {
    const { listAgentNetworkMcpTools } = await import("../src/tool-registry.js");
    const tools = listAgentNetworkMcpTools({ trustModeEnabled: true });
    const names = tools.map((t) => t.name);
    expect(names).toContain("mesh.list_agent_network_workers");
    expect(names).toContain("mesh.probe_peer");
    expect(names).toContain("mesh.get_agent_card");
    const list = tools.find((t) => t.name === "mesh.list_agent_network_workers");
    expect(list?.inputSchema).toHaveProperty("properties");
  });
});

describe("executeTool — agent network roster helpers", () => {
  function toolContext(extra: Record<string, unknown>) {
    return {
      taskStore: { appendAuditEvent: async () => undefined },
      ...extra,
    } as never;
  }

  it("lists workers via context hook", async () => {
    const { executeTool } = await import("../src/tool-registry.js");
    const listAgentNetworkWorkers = vi.fn().mockResolvedValue([
      {
        peerId: "envoy_agent_w1",
        ownerId: "envoy:owner:w1",
        displayName: "Worker One",
        score: 42,
        summary: "fresh + coding",
      },
    ]);
    const result = await executeTool(
      "mesh.list_agent_network_workers",
      { requiredSkill: "coding", limit: 5 },
      toolContext({ listAgentNetworkWorkers }),
    );
    expect(result.ok).toBe(true);
    expect(listAgentNetworkWorkers).toHaveBeenCalledWith({
      requiredSkill: "coding",
      limit: 5,
    });
    expect((result.result as { count: number }).count).toBe(1);
  });

  it("probes a peer via context hook", async () => {
    const { executeTool } = await import("../src/tool-registry.js");
    const probeAgentNetworkPeer = vi.fn().mockResolvedValue({
      ok: true,
      ownerId: "envoy:owner:w1",
      peerId: "envoy_agent_w1",
      score: 10,
      summary: "ok",
    });
    const result = await executeTool(
      "mesh.probe_peer",
      { ownerId: "envoy:owner:w1", refresh: false },
      toolContext({ probeAgentNetworkPeer }),
    );
    expect(result.ok).toBe(true);
    expect(probeAgentNetworkPeer).toHaveBeenCalledWith({
      ownerId: "envoy:owner:w1",
      peerId: undefined,
      refresh: false,
    });
  });
});
