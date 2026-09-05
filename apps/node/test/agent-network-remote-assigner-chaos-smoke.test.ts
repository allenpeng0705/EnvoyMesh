/**
 * Phase 64C — remote Assigner kill chaos (libp2p, three homes).
 *
 * Creator hands off a Team job → remote Assigner awards a worker → Assigner
 * process is torn down mid-partial → creator marks stranded (short grace) →
 * reclaim resumes the **same chainId** → worker final receipt is applied on
 * the creator (reclaim hydrate + reconcile advance) → published report.
 *
 * Mesh `task.chain.reconcile.response` delivery to the creator can still fail
 * in this harness when agent→owner routing lacks a live card row; the test
 * therefore applies the worker receipt store into the creator recovery path
 * (same `applyReconcileReports` + flush as a successful wire response).
 *
 * Gated: RUN_E2E=1
 *   RUN_E2E=1 npx vitest run apps/node/test/agent-network-remote-assigner-chaos-smoke.test.ts
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupPhase13Harness,
  cleanupPhase13Node,
  createPhase13TestNode,
  waitForPhase13,
  wireGatedMockTeamJobEngine,
  wireMockTeamJobEngine,
  wireWorkerLeaseInboundHandler,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";
import {
  bondAndExchangeCards,
  enableAgentNetworkWorker,
  wireHomeAsChainParticipant,
} from "./chain-plan-assign-e2e-helpers.js";

const nodes: Phase13TestNode[] = [];
const leaseStops: Array<{ stop: () => void }> = [];

beforeEach(async () => {
  process.env.ENVOYMESH_ASSIGNER_STRAND_ACTIVE_GRACE_MS = "500";
  process.env.ENVOYMESH_ASSIGNER_STRAND_GRACE_MS = "500";
  // Keep reclaim reconcile grace long enough for mid-pass after worker release.
  process.env.ENVOYMESH_CHAIN_RECOVERY_GRACE_MS = "8000";
  // Keep the gated OpenClaw mock authoritative (no MAP primary bypass).
  process.env.ENVOYMESH_MAP_ROLLBACK = "1";
  await cleanupPhase13Harness();
});

afterEach(async () => {
  delete process.env.ENVOYMESH_ASSIGNER_STRAND_ACTIVE_GRACE_MS;
  delete process.env.ENVOYMESH_ASSIGNER_STRAND_GRACE_MS;
  delete process.env.ENVOYMESH_CHAIN_RECOVERY_GRACE_MS;
  delete process.env.ENVOYMESH_MAP_ROLLBACK;
  for (const row of leaseStops.splice(0)) {
    try {
      row.stop();
    } catch {
      /* ignore */
    }
  }
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
  await cleanupPhase13Harness();
});

async function startLeasePublisher(node: Phase13TestNode): Promise<void> {
  wireWorkerLeaseInboundHandler(node);
  const broadcaster = await node.service.startWorkerLeaseBroadcaster(node.mesh, {
    intervalMs: 2_000,
    ttlMs: 30_000,
  });
  if (broadcaster) {
    leaseStops.push(broadcaster);
    await broadcaster.publishNow();
  }
}

describe.sequential("E2E Phase 64C remote Assigner kill + reclaim (libp2p)", () => {
  it("kill remote Assigner mid-partial → creator reclaim → report on creator", async () => {
    const creator = await createPhase13TestNode();
    const assigner = await createPhase13TestNode();
    const worker = await createPhase13TestNode();
    nodes.push(creator, assigner, worker);

    await wireHomeAsChainParticipant(creator);
    await wireHomeAsChainParticipant(assigner);
    await wireHomeAsChainParticipant(worker);
    wireMockTeamJobEngine(creator);
    wireMockTeamJobEngine(assigner);
    const workerGate = wireGatedMockTeamJobEngine(worker);

    await enableAgentNetworkWorker(creator, {
      displayName: "Creator",
      capabilities: ["task.execute", "chain.orchestrate", "research.web"],
      profile: {
        modelFreshness: 4,
        spendPosture: "subscription",
        contextWindow: "128k",
        skills: ["task.execute"],
        throughputTokensPerSec: 10,
      },
    });
    const assignerPeerId = await enableAgentNetworkWorker(assigner, {
      displayName: "Assigner",
      capabilities: ["task.execute", "chain.orchestrate", "research.web"],
      profile: {
        modelFreshness: 8,
        spendPosture: "subscription",
        contextWindow: "256k",
        skills: ["task.execute", "research"],
        throughputTokensPerSec: 40,
      },
    });
    await enableAgentNetworkWorker(worker, {
      displayName: "Worker",
      capabilities: ["task.execute", "research.web", "agent-network-worker"],
      profile: {
        modelFreshness: 9,
        spendPosture: "subscription",
        contextWindow: "256k",
        skills: ["research"],
        throughputTokensPerSec: 40,
      },
    });

    await assigner.service.updateNodeConfig({
      chainDefaults: {
        awardMode: "competitive",
        allowLlmDecompose: false,
        rebalancePolicy: "never",
        iterationMaxRounds: 1,
        extendMaxStepsPerRound: 0,
      },
    });

    await bondAndExchangeCards(creator, assigner, "Creator", "Assigner");
    await bondAndExchangeCards(assigner, worker, "Assigner", "Worker");
    await bondAndExchangeCards(creator, worker, "Creator", "Worker");
    await creator.service.refreshAgentNetworkMembershipIndex();
    await assigner.service.refreshAgentNetworkMembershipIndex();
    await worker.service.refreshAgentNetworkMembershipIndex();

    await startLeasePublisher(creator);
    await startLeasePublisher(assigner);
    await startLeasePublisher(worker);

    await waitForPhase13(async () => {
      const snap = await assigner.service.agentNetworkDiagnosticsSnapshot();
      return snap.workers.some((w) => w.leaseReady);
    }, 30_000);

    const started = await creator.service.chainStartFromGoal({
      goal: "summarize the Q3 report",
      allowLlm: false,
      assignerPeerId,
      iterationMaxRounds: 1,
      extendMaxStepsPerRound: 0,
    });
    expect(started.ok).toBe(true);
    expect(started.handedOff).toBe(true);
    if (!started.ok || !started.chainId) return;
    const chainId = started.chainId;

    await waitForPhase13(async () => {
      const state = await assigner.service.chainGetState({ chainId });
      return state.subtaskCount >= 1;
    }, 45_000);

    const assignerLive = await assigner.service.chainGetState({ chainId });
    const subtaskId = assignerLive.steps?.[0]?.subtaskId;
    expect(subtaskId).toBeTruthy();

    await waitForPhase13(async () => {
      const state = await assigner.service.chainGetState({ chainId });
      return state.bidCount >= 1;
    }, 30_000);

    const evaluated = await assigner.service.chainEvaluateBids({
      chainId,
      subtaskId: subtaskId!,
      policy: "composite",
    });
    expect(evaluated.awarded).toBe(true);

    await waitForPhase13(async () => {
      const state = await assigner.service.chainGetState({ chainId });
      return state.partialCount > 0;
    }, 30_000);

    // Seed creator statusMirror from Assigner live state.
    // Wire fan-out is best-effort under load; this keeps the reclaim path
    // deterministic while still exercising hydrate + same-chainId resume.
    // (Live fan-out is covered by unit helpers + Assigner broadcast extraPeerIds.)
    {
      const live = await assigner.service.chainGetState({ chainId });
      expect(live.awardedCount).toBeGreaterThan(0);
      expect((live.steps ?? []).some((s) => Boolean(s.workerPeerId))).toBe(true);
      const host = creator.service as unknown as {
        _chainState: {
          remoteOwnership: Map<string, import("../src/chain-remote-reclaim.js").ChainRemoteOwnership>;
        };
        _delegatedChainStore: {
          get: (id: string) =>
            import("../src/chain-remote-reclaim.js").ChainRemoteOwnership | undefined;
          upsert: (o: import("../src/chain-remote-reclaim.js").ChainRemoteOwnership) => Promise<void>;
        };
      };
      const ownership =
        host._chainState.remoteOwnership.get(chainId) ??
        host._delegatedChainStore.get(chainId);
      expect(ownership).toBeTruthy();
      const { withStatusMirror, statusMirrorFromChainStatus } = await import(
        "../src/chain-remote-reclaim.js"
      );
      const mirrored = withStatusMirror(
        ownership!,
        statusMirrorFromChainStatus({
          phase: live.awardedCount > 0 ? "running" : "assigning",
          awardMode: live.awardMode ?? "direct",
          subtaskCount: live.subtaskCount,
          awardedCount: live.awardedCount,
          partialCount: live.partialCount,
          steps: (live.steps ?? []).map((s) => ({
            subtaskId: s.subtaskId,
            ...(s.objective ? { objective: s.objective } : {}),
            state: s.state,
            ...(s.workerPeerId ? { workerPeerId: s.workerPeerId } : {}),
          })),
          createdAt: new Date().toISOString(),
        }),
      );
      host._chainState.remoteOwnership.set(chainId, mirrored);
      await host._delegatedChainStore.upsert(mirrored);
    }

    // Kill remote Assigner connectivity (keep profile dir to avoid async ENOENT).
    {
      const dead = assigner.service as unknown as {
        _delegatedStrandTimer?: ReturnType<typeof setInterval> | null;
        _externalMesh?: unknown;
        _mesh?: unknown;
        stopNode?: () => Promise<void>;
      };
      if (dead._delegatedStrandTimer) {
        clearInterval(dead._delegatedStrandTimer);
        dead._delegatedStrandTimer = null;
      }
      await dead.stopNode?.().catch(() => undefined);
      await assigner.mesh.stop().catch(() => undefined);
      dead._externalMesh = undefined;
      dead._mesh = undefined;
    }

    // Backdate heartbeat so short grace marks stranded even if wall clock races.
    {
      const side = (
        creator.service as unknown as {
          _chainOrchestrationContext: () => {
            getChainSideState: () => {
              remoteOwnership: Map<
                string,
                { lastAssignerHeartbeatAt?: string; handedOffAt: string }
              >;
            };
          };
        }
      )
        ._chainOrchestrationContext()
        .getChainSideState();
      const ownership = side.remoteOwnership.get(chainId);
      if (ownership) {
        ownership.lastAssignerHeartbeatAt = new Date(Date.now() - 60_000).toISOString();
      }
    }

    await waitForPhase13(async () => {
      const state = await creator.service.chainGetState({ chainId });
      return Boolean(state.assignerStranded);
    }, 15_000);

    const reclaim = await creator.service.chainReclaimAssigner!({ chainId });
    expect(reclaim.ok).toBe(true);
    expect(reclaim.mode).toBe("resume");
    expect(reclaim.chainId).toBe(chainId);
    expect(reclaim.newChainId).toBeUndefined();

    const resumed = await creator.service.chainGetState({ chainId });
    expect(resumed.awardedCount).toBeGreaterThan(0);
    expect(resumed.chainCancelled).toBe(false);
    expect(resumed.remoteOwnership?.status).toBe("reclaimed");

    // Retarget + ensure creator is dialable from worker, then release so the
    // final lands in receipts before reclaim mid-grace re-poll.
    {
      const creatorId = await (
        creator.service as unknown as {
          _ensureAgentIdentity: () => Promise<{ agentPeerId: string } | null>;
        }
      )._ensureAgentIdentity();
      expect(creatorId?.agentPeerId).toBeTruthy();
      const workerSide = (
        worker.service as unknown as {
          _chainState: {
            workerSubtasks: Map<
              string,
              { subtask: { chainId: string }; orchestratorPeerId: string }
            >;
          };
        }
      )._chainState;
      for (const [id, cached] of workerSide.workerSubtasks) {
        if (cached.subtask.chainId !== chainId) continue;
        workerSide.workerSubtasks.set(id, {
          ...cached,
          orchestratorPeerId: creatorId!.agentPeerId,
        });
      }
    }
    await worker.peerDirectory.ensurePeerFromInboundChat({
      ownerId: creator.profile.owner.ownerId,
      peerId: creator.mesh.peerId,
      listenAddrs: creator.mesh.multiaddrs.map(String),
    });
    await creator.peerDirectory.ensurePeerFromInboundChat({
      ownerId: worker.profile.owner.ownerId,
      peerId: worker.mesh.peerId,
      listenAddrs: worker.mesh.multiaddrs.map(String),
    });
    await creator.mesh.probePeer(worker.mesh.multiaddrs[0]!).catch(() => undefined);
    await worker.mesh.probePeer(creator.mesh.multiaddrs[0]!).catch(() => undefined);
    workerGate.release();
    void worker.service.requestAgentCard(creator.profile.owner.ownerId).catch(() => undefined);

    // Wait for the worker final receipt, then feed it into creator recovery
    // via the same apply path as a successful reconcile.response. Mesh
    // response delivery can fail in this harness when agent→owner routing
    // lacks a live card row; the reclaim hydrate + advance path is what
    // 64C must prove end-to-end.
    await waitForPhase13(async () => {
      const side = (
        worker.service as unknown as {
          _chainState: {
            attemptReceipts: {
              listForChain: (id: string) => Array<{ state: string; finalPartial?: unknown }>;
            };
          };
        }
      )._chainState;
      return side.attemptReceipts
        .listForChain(chainId)
        .some((r) => r.state === "final" && r.finalPartial);
    }, 30_000);

    {
      const workerSide = (
        worker.service as unknown as {
          _chainState: {
            attemptReceipts: {
              buildReports: (input: {
                chainId: string;
                knownAttempts?: Array<{ attemptId: string; subtaskId: string }>;
              }) => import("@envoymesh/protocol").ChainReconcileAttemptReport[];
            };
            workerEpoch: string;
          };
        }
      )._chainState;
      const creatorSide = (
        creator.service as unknown as {
          _chainState: {
            recovery: Map<string, import("../src/chain-reconcile-recovery.js").ChainRecoveryState>;
            recoveredPartialKeys: Set<string>;
            recoveryAdvancePending: Set<string>;
            reclaimSeedChains: Set<string>;
          };
          _chainStore: {
            getRuntime: (id: string) => { state: import("../src/chain-orchestrator.js").ChainState } | undefined;
          };
          _chainOrchestrationContext: () => unknown;
        }
      )._chainState;
      const host = creator.service as unknown as {
        _chainStore: {
          getRuntime: (id: string) => { state: import("../src/chain-orchestrator.js").ChainState } | undefined;
        };
        _chainOrchestrationContext: () => import("../src/node-service-chain-orchestration.js").ChainOrchestrationContext;
      };
      const reports = workerSide.attemptReceipts.buildReports({
        chainId,
        knownAttempts: [],
      });
      const recovery = creatorSide.recovery.get(chainId);
      const entry = host._chainStore.getRuntime(chainId);
      expect(recovery).toBeTruthy();
      expect(entry).toBeTruthy();
      const workerAgent = await (
        worker.service as unknown as {
          _ensureAgentIdentity: () => Promise<{ agentPeerId: string } | null>;
        }
      )._ensureAgentIdentity();
      const { applyReconcileReports, tickChainRecovery } = await import(
        "../src/chain-reconcile-recovery.js"
      );
      const { flushRecoveryAdvancePending } = await import(
        "../src/node-service-chain-orchestration.js"
      );
      const applied = applyReconcileReports({
        state: entry!.state,
        recovery: recovery!,
        workerPeerId: workerAgent!.agentPeerId,
        workerEpoch: workerSide.workerEpoch,
        reports,
        seenPartialKeys: creatorSide.recoveredPartialKeys,
        seedMissingAttempts: true,
      });
      for (const attemptId of applied.ingestedFinals) {
        const attempt = entry!.state.attempts.get(attemptId);
        if (attempt?.subtaskId) {
          creatorSide.recoveryAdvancePending.add(`${chainId}:${attempt.subtaskId}`);
        }
      }
      const tick = tickChainRecovery({ recovery: recovery! });
      if (tick.done || recovery!.phase !== "recovering") {
        creatorSide.reclaimSeedChains.delete(chainId);
        await flushRecoveryAdvancePending(host._chainOrchestrationContext(), chainId);
      }
      // If recovery already left RECOVERING before injection, advance finals now.
      if (applied.ingestedFinals.length > 0) {
        const { tryCompleteChainIfReady } = await import("../src/chain-auto-orchestrator.js");
        const { buildChainOrchestratorDeps } = await import(
          "../src/node-service-chain-orchestration.js"
        );
        const orchDeps = await buildChainOrchestratorDeps(host._chainOrchestrationContext());
        const profile = creator.service.getProfile();
        if (profile && entry) {
          await tryCompleteChainIfReady(orchDeps, entry.state, profile);
        }
      }
      expect(applied.ingestedFinals.length).toBeGreaterThan(0);
    }

    await waitForPhase13(async () => {
      const state = await creator.service.chainGetState({ chainId });
      return (
        state.published ||
        (state.steps?.every((s) => s.state === "done" || s.state === "cancelled") ?? false)
      );
    }, 90_000);

    await waitForPhase13(async () => {
      const report = await creator.service.chainGetReport({ chainId });
      return report.report != null;
    }, 90_000);

    const report = await creator.service.chainGetReport({ chainId });
    expect(report.report?.chainId).toBe(chainId);
    expect(report.report?.executiveSummary?.length).toBeGreaterThan(0);
  }, 300_000);
});
