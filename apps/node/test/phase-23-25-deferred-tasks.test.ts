/**
 * Phase 23–25 deferred tasks tests.
 * Covers: agent-chain-orchestrator (24B), service-mesh-worker (24D), continuity-service (25B), decomposeTask.
 */
import { describe, expect, it, vi } from "vitest";
import {
  runAgentChain,
  decomposeTask,
  type AgentChainDeps,
  type ChainProvider,
  type ChainStep,
} from "../src/agent-chain-orchestrator.js";
import { evaluateServiceTask, type ServiceMeshDeps } from "../src/service-mesh-worker.js";
import {
  startContinuitySession,
  updateContinuitySession,
  completeContinuitySession,
  getResumableSessions,
  type ContinuityDeps,
  type ContinuitySession,
} from "../src/continuity-service.js";

// =========================================================================
// Agent Chain Orchestrator (24B)
// =========================================================================
describe("agent-chain-orchestrator", () => {
  function makeDeps(
    providerMap: Record<string, ChainProvider[]>,
    stepOutputs: Record<string, string | null>,
  ): AgentChainDeps {
    return {
      findProviders: async (tag) => providerMap[tag] ?? [],
      executeStep: async (_provider, step) => stepOutputs[step.label] ?? null,
    };
  }

  const providers: Record<string, ChainProvider[]> = {
    translation: [{ ownerId: "envoy:owner:t1", peerId: "p1", capabilities: ["translation"], reputationScore: 0.9 }],
    code_review: [{ ownerId: "envoy:owner:r1", peerId: "p2", capabilities: ["code_review"], reputationScore: 0.8 }],
    research_synthesis: [{ ownerId: "envoy:owner:s1", peerId: "p3", capabilities: ["research_synthesis"], reputationScore: 0.7 }],
  };

  it("completes a 2-step chain successfully", async () => {
    const deps = makeDeps(providers, { translate: "Bonjour le monde", review: "Approved: Bonjour le monde" });
    const steps: ChainStep[] = [
      { label: "translate", capabilityTag: "translation", description: "Translate to French" },
      { label: "review", capabilityTag: "code_review", description: "Review translation" },
    ];
    const result = await runAgentChain(deps, steps, "Hello world");
    expect(result.ok).toBe(true);
    expect(result.completedSteps).toBe(2);
    expect(result.finalOutput).toBe("Approved: Bonjour le monde");
  });

  it("fails when no providers for a step", async () => {
    const deps = makeDeps({}, {});
    const steps: ChainStep[] = [
      { label: "translate", capabilityTag: "translation", description: "Translate" },
    ];
    const result = await runAgentChain(deps, steps, "input");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no providers");
  });

  it("fails when step execution returns null", async () => {
    const deps = makeDeps(providers, { translate: null });
    const steps: ChainStep[] = [
      { label: "translate", capabilityTag: "translation", description: "Translate" },
    ];
    const result = await runAgentChain(deps, steps, "input");
    expect(result.ok).toBe(false);
    expect(result.steps[0].ok).toBe(false);
  });

  it("respects maxDepth", async () => {
    const deps = makeDeps(providers, {
      translate: "a",
      review: "b",
      synthesize: "c",
      convert: "d",
    });
    const steps: ChainStep[] = [
      { label: "translate", capabilityTag: "translation", description: "t" },
      { label: "review", capabilityTag: "code_review", description: "r" },
      { label: "synthesize", capabilityTag: "research_synthesis", description: "s" },
      { label: "convert", capabilityTag: "data_conversion", description: "c" },
    ];
    const result = await runAgentChain(deps, steps, "input", { maxDepth: 2 });
    expect(result.ok).toBe(true);
    expect(result.completedSteps).toBe(2);
  });

  it("decomposeTask: translate + review", () => {
    const steps = decomposeTask("translate this document to French then review it");
    expect(steps.length).toBe(2);
    expect(steps[0].capabilityTag).toBe("translation");
    expect(steps[1].capabilityTag).toBe("code_review");
  });

  it("decomposeTask: single-step fallback", () => {
    const steps = decomposeTask("do something generic");
    expect(steps.length).toBe(1);
    expect(steps[0].capabilityTag).toBe("task_execute");
  });

  it("decomposeTask: all keywords", () => {
    const steps = decomposeTask("translate, review, synthesize and convert");
    expect(steps.length).toBe(4);
  });
});

// =========================================================================
// Service Mesh Worker (24D)
// =========================================================================
describe("service-mesh-worker", () => {
  function makeDeps(overrides?: Partial<ServiceMeshDeps>): ServiceMeshDeps {
    return {
      hasCapability: (tag) => tag === "rust_reviewer",
      getAutoAcceptPolicy: async () => ({
        enabled: true,
        maxSensitivity: "friends",
        maxConcurrentTasks: 3,
        allowedActions: ["discover", "query", "report"],
      }),
      getActiveTaskCount: async () => 1,
      ...overrides,
    };
  }

  it("accepts task within policy bounds", async () => {
    const deps = makeDeps();
    const result = await evaluateServiceTask(deps, {
      capabilityTags: ["rust_reviewer"],
      requestedSensitivity: "public",
      proposedActions: ["query", "report"],
      proposerBondLevel: "direct",
    });
    expect(result.accept).toBe(true);
  });

  it("rejects when service mesh disabled", async () => {
    const deps = makeDeps({
      getAutoAcceptPolicy: async () => ({ enabled: false, maxSensitivity: "public", maxConcurrentTasks: 5, allowedActions: [] }),
    });
    const result = await evaluateServiceTask(deps, {
      capabilityTags: ["rust_reviewer"],
      requestedSensitivity: "public",
      proposedActions: [],
      proposerBondLevel: "direct",
    });
    expect(result.accept).toBe(false);
    expect(result.reason).toContain("disabled");
  });

  it("rejects when no matching capability", async () => {
    const deps = makeDeps();
    const result = await evaluateServiceTask(deps, {
      capabilityTags: ["translation"],
      requestedSensitivity: "public",
      proposedActions: ["query"],
      proposerBondLevel: "direct",
    });
    expect(result.accept).toBe(false);
    expect(result.reason).toContain("no matching capability");
  });

  it("rejects when sensitivity exceeds ceiling", async () => {
    const deps = makeDeps({
      getAutoAcceptPolicy: async () => ({ enabled: true, maxSensitivity: "public", maxConcurrentTasks: 5, allowedActions: ["query"] }),
    });
    const result = await evaluateServiceTask(deps, {
      capabilityTags: ["rust_reviewer"],
      requestedSensitivity: "private",
      proposedActions: ["query"],
      proposerBondLevel: "direct",
    });
    expect(result.accept).toBe(false);
    expect(result.reason).toContain("sensitivity");
  });

  it("rejects when concurrent task cap reached", async () => {
    const deps = makeDeps({
      getActiveTaskCount: async () => 3,
      getAutoAcceptPolicy: async () => ({ enabled: true, maxSensitivity: "public", maxConcurrentTasks: 3, allowedActions: ["query"] }),
    });
    const result = await evaluateServiceTask(deps, {
      capabilityTags: ["rust_reviewer"],
      requestedSensitivity: "public",
      proposedActions: ["query"],
      proposerBondLevel: "direct",
    });
    expect(result.accept).toBe(false);
    expect(result.reason).toContain("max concurrent");
  });

  it("rejects when actions not in allowlist", async () => {
    const deps = makeDeps({
      getAutoAcceptPolicy: async () => ({ enabled: true, maxSensitivity: "public", maxConcurrentTasks: 5, allowedActions: ["query"] }),
    });
    const result = await evaluateServiceTask(deps, {
      capabilityTags: ["rust_reviewer"],
      requestedSensitivity: "public",
      proposedActions: ["purchase", "share.private_data"],
      proposerBondLevel: "direct",
    });
    expect(result.accept).toBe(false);
    expect(result.reason).toContain("disallowed actions");
  });
});

// =========================================================================
// Continuity Service (25B)
// =========================================================================
describe("continuity-service", () => {
  function makeDeps(existingSessions?: ContinuitySession[]): ContinuityDeps {
    const sessions: ContinuitySession[] = existingSessions ? [...existingSessions] : [];
    return {
      listSessions: async () => [...sessions],
      saveSession: async (s) => {
        const idx = sessions.findIndex((x) => x.sessionId === s.sessionId);
        if (idx >= 0) sessions[idx] = s;
        else sessions.push(s);
      },
      getDeviceId: () => "device-1",
    };
  }

  it("creates and retrieves a continuity session", async () => {
    const deps = makeDeps();
    const session = await startContinuitySession(deps, "Research distributed systems", "corr-1");
    expect(session.sessionId).toBeDefined();
    expect(session.active).toBe(true);
    expect(session.progress).toBe("Starting...");
    expect(session.currentStep).toBe(0);
    expect(session.originDevice).toBe("device-1");

    const resumable = await getResumableSessions(deps);
    expect(resumable.length).toBe(1);
    expect(resumable[0].description).toBe("Research distributed systems");
  });

  it("updates session progress", async () => {
    const deps = makeDeps();
    const session = await startContinuitySession(deps, "Task", "c1");
    const updated = await updateContinuitySession(deps, session.sessionId, {
      progress: "Halfway done",
      currentStep: 1,
    });
    expect(updated).not.toBeNull();
    expect(updated!.progress).toBe("Halfway done");
    expect(updated!.currentStep).toBe(1);
  });

  it("completes a session", async () => {
    const deps = makeDeps();
    const session = await startContinuitySession(deps, "Task", "c1");
    await completeContinuitySession(deps, session.sessionId);

    const resumable = await getResumableSessions(deps);
    expect(resumable).toHaveLength(0); // completed sessions not resumable
  });

  it("returns null when updating non-existent session", async () => {
    const deps = makeDeps();
    const result = await updateContinuitySession(deps, "nonexistent", { progress: "irrelevant" });
    expect(result).toBeNull();
  });

  it("sorts resumable sessions by lastUpdatedAt desc", async () => {
    const deps = makeDeps();
    const s1 = await startContinuitySession(deps, "Older task", "c1");
    await new Promise((r) => setTimeout(r, 10));
    const s2 = await startContinuitySession(deps, "Newer task", "c2");

    const resumable = await getResumableSessions(deps);
    expect(resumable[0].description).toBe("Newer task");
    expect(resumable[1].description).toBe("Older task");
  });

  it("completeContinuitySession is no-op for missing session", async () => {
    const deps = makeDeps();
    await expect(completeContinuitySession(deps, "nonexistent")).resolves.toBeUndefined();
  });
});
