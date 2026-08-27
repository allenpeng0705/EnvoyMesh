/**
 * Phase 60F — deterministic Agent Network lab matrix (§10.3 scenarios 1–14).
 *
 * In-process lab (clock + transport + bonds + stores). Scenarios mix full
 * award/partial flows with focused unit slices (ranking / reconcile / journal)
 * on the shared fixtures — not every case is a three-process mesh. No internet,
 * paid models, arbitrary protocol sleeps, or reputation mutations.
 */
import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentWorkerLeasePayload,
  ChainSubtaskSchema,
} from "@envoymesh/protocol";
import {
  compareChainWorkerTies,
  evaluateChainWorkerHardGates,
  getChainTeamStrategyPreset,
  scoreChainWorkerWithStrategy,
} from "@envoymesh/api";
import {
  createChainState,
  directAwardSubtask,
  handleOrchestratorPartial,
  reassignStalledSubtask,
  trackChain,
  type ChainOrchestratorHandlerDeps,
  type ChainState,
} from "../src/chain-orchestrator.js";
import { selectReadyWorkersForSubtask } from "../src/node-service-chain-orchestration.js";
import {
  maybeLaunchDueHedgedAwards,
  maybeScheduleSpeculationAfterAward,
} from "../src/chain-speculation-wire.js";
import { WorkerLeaseStore, WORKER_LEASE_MAX_TTL_MS, WORKER_LEASE_CLOCK_SKEW_MS } from "../src/worker-lease-store.js";
import { WorkerReliabilityStore } from "../src/worker-reliability-store.js";
import {
  applyReconcileReports,
  beginChainRecovery,
  isChainRecovering,
  tickChainRecovery,
} from "../src/chain-reconcile-recovery.js";
import { ChainActiveJournal } from "../src/chain-active-journal.js";
import { createAgentNetworkLabRuntime } from "./support/agent-network-lab/lab-runtime.js";
import {
  attemptAwarded,
  awaitJournalPredicate,
  attemptSelected,
} from "./support/agent-network-lab/lab-events.js";
import { labChainMandate, labSubtask } from "./support/agent-network-lab/lab-fixtures.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

function makeOrchDeps(
  lab: ReturnType<typeof createAgentNetworkLabRuntime>,
  overrides?: Partial<ChainOrchestratorHandlerDeps>,
): ChainOrchestratorHandlerDeps {
  return {
    sendEnvelope: async (recipientPeerId, envelope, payload) =>
      lab.deliver({
        intent: envelope.intent,
        from: lab.nodes.assigner.peerId,
        to: recipientPeerId,
        payload,
      }),
    findWorkers: async () => [lab.nodes.harness.peerId, lab.nodes.openclaw.peerId],
    now: () => lab.clock.now(),
    signingKeyPem: privateKeyPem,
    publicKeyPem,
    orchestratorPeerId: lab.nodes.assigner.peerId,
    orchestratorOwnerId: lab.nodes.assigner.ownerId,
    audit: { record: () => undefined },
    ...overrides,
  };
}

function seedDualWorkers(
  lab: ReturnType<typeof createAgentNetworkLabRuntime>,
  state: ChainState,
  mandate = labChainMandate(),
) {
  const aligned = ChainSubtaskSchema.parse({
    ...labSubtask({ preferredWorkerPeerId: lab.nodes.harness.peerId }),
    chainId: mandate.chainId,
    chainMandateId: mandate.chainMandateId,
    preferredWorkerPeerId: lab.nodes.harness.peerId,
  });
  state.subtasks.set(aligned.subtaskId, aligned);
  state.workersBySubtask.set(aligned.subtaskId, [
    lab.nodes.harness.peerId,
    lab.nodes.openclaw.peerId,
  ]);
  state.proposedSubtasks.add(aligned.subtaskId);
  return aligned;
}

function leaseFor(
  peerId: string,
  ownerId: string,
  runtime: "envoy-harness" | "openclaw",
  overrides: Partial<ReturnType<typeof createAgentWorkerLeasePayload>> = {},
) {
  const now = Date.parse("2030-01-01T00:00:00.000Z");
  return createAgentWorkerLeasePayload({
    leaseId: `lease_${peerId}`,
    workerPeerId: peerId,
    ownerId,
    issuedAt: new Date(now).toISOString(),
    notBefore: new Date(now).toISOString(),
    expiresAt: new Date(now + 30_000).toISOString(),
    sequence: 1,
    runtimes: [
      {
        runtime,
        ready: true,
        capacity: { maxConcurrent: 1, availableSlots: 1, queueDepth: 0 },
        skillIds: ["research"],
      },
    ],
    connectivity: { direct: true, relay: false },
    nonce: `${peerId.padEnd(16, "0").slice(0, 16)}`,
    ...overrides,
  });
}

describe("agent-network-lab-matrix (§10.3)", () => {
  it("01 lease discovery selects harness + openclaw without legacy probes", async () => {
    const lab = createAgentNetworkLabRuntime();
    const leases = new WorkerLeaseStore();
    const now = lab.clock.now();
    expect(
      leases.accept(
        leaseFor(lab.nodes.harness.peerId, lab.nodes.harness.ownerId, "envoy-harness"),
        { now },
      ).ok,
    ).toBe(true);
    expect(
      leases.accept(
        leaseFor(lab.nodes.openclaw.peerId, lab.nodes.openclaw.ownerId, "openclaw", {
          sequence: 1,
          nonce: "openclaw00000000",
        }),
        { now },
      ).ok,
    ).toBe(true);

    let probed = 0;
    const result = await selectReadyWorkersForSubtask(
      {
        getChainSideState: () => ({ workerLeases: leases }),
      } as never,
      [
        { peerId: lab.nodes.harness.peerId, online: true },
        { peerId: lab.nodes.openclaw.peerId, online: true },
      ] as never,
      undefined,
      2,
      {
        probeWorkerEngineReady: async () => {
          probed += 1;
          return { ready: false, reason: "should_not_probe" };
        },
      },
    );
    expect(result.chosen).toEqual(
      expect.arrayContaining([lab.nodes.harness.peerId, lab.nodes.openclaw.peerId]),
    );
    expect(result.chosen).toHaveLength(2);
    expect(probed).toBe(0);
  });

  it("02 balanced strategy tie-break is deterministic", () => {
    const strategy = getChainTeamStrategyPreset("balanced");
    const a = scoreChainWorkerWithStrategy({
      strategy,
      components: {
        skill: 0.8,
        eta: 0.5,
        cost: 0.5,
        reliability: 0.7,
        transport: 0.9,
        modelDiversity: 0.2,
      },
    });
    const b = scoreChainWorkerWithStrategy({
      strategy,
      components: {
        skill: 0.8,
        eta: 0.5,
        cost: 0.5,
        reliability: 0.7,
        transport: 0.9,
        modelDiversity: 0.2,
      },
    });
    expect(a.score).toBe(b.score);
    const ordered = [
      { peerId: "lab_openclaw", score: a.score, leaseSequence: 1 },
      { peerId: "lab_harness", score: b.score, leaseSequence: 2 },
    ].sort(compareChainWorkerTies);
    expect(ordered[0]!.peerId).toBe("lab_harness");
  });

  it("03 disconnect before award leaves no budget reservation", async () => {
    const lab = createAgentNetworkLabRuntime();
    lab.transport.partition(lab.nodes.assigner.peerId, lab.nodes.harness.peerId);
    const mandate = labChainMandate();
    const state = createChainState(mandate, { awardMode: "direct" });
    const aligned = seedDualWorkers(lab, state, mandate);
    const deps = makeOrchDeps(lab);
    const awarded = await directAwardSubtask(
      deps,
      state,
      aligned.subtaskId,
      lab.nodes.harness.peerId,
    );
    expect(awarded.ok).toBe(false);
    expect(state.awards.has(aligned.subtaskId)).toBe(false);
    expect(state.ledger.snapshot().reservedUsd).toBe(0);
  });

  it("04 disconnect after award triggers stall reassignment once", async () => {
    const lab = createAgentNetworkLabRuntime();
    const mandate = labChainMandate({ stallTimeoutMs: 1_000 });
    const state = createChainState(mandate, { awardMode: "direct" });
    const aligned = seedDualWorkers(lab, state, mandate);
    // Disable speculation so only one award is active.
    state.chainMandate.maxParallelAttemptsPerStep = 1;
    state.chainMandate.teamStrategyId = "cheapest";
    const deps = makeOrchDeps(lab);
    const awarded = await directAwardSubtask(
      deps,
      state,
      aligned.subtaskId,
      lab.nodes.harness.peerId,
    );
    expect(awarded.ok).toBe(true);
    lab.clock.advanceBy(2_000);
    await trackChain(deps, state, { tickMs: 1, maxTicks: 1 });
    expect(state.awards.get(aligned.subtaskId)?.workerPeerId).toBe(lab.nodes.openclaw.peerId);
    expect(
      lab.transport.delivered.some(
        (e) => e.intent === "task.chain.cancel" && e.to === lab.nodes.harness.peerId,
      ),
    ).toBe(true);
    const second = await reassignStalledSubtask(deps, state, aligned.subtaskId);
    expect(second).toMatchObject({ ok: false, reason: "reassign_cap" });
  });

  it("05 assigner restart reconciles final without duplicate ingest", () => {
    const lab = createAgentNetworkLabRuntime();
    const mandate = labChainMandate();
    const state = createChainState(mandate, { awardMode: "direct" });
    const aligned = seedDualWorkers(lab, state, mandate);
    const attemptId = "attempt_lab_1";
    state.attempts.set(attemptId, {
      attemptId,
      chainId: state.chainId,
      subtaskId: aligned.subtaskId,
      workerPeerId: lab.nodes.harness.peerId,
      role: "primary",
      state: "running",
      attemptNumber: 1,
      acceptedCostUsd: 1,
      createdAt: lab.clock.now().toISOString(),
      updatedAt: lab.clock.now().toISOString(),
    });
    state.selectedAttemptBySubtask.set(aligned.subtaskId, attemptId);
    const recovery = beginChainRecovery({
      state,
      orchestratorEpoch: "orch_lab_1",
      now: lab.clock.now(),
    });
    expect(isChainRecovering(recovery)).toBe(true);
    const finalPartial = {
      partial: {
        version: "0.1" as const,
        subtaskId: aligned.subtaskId,
        chainId: state.chainId,
        workerPeerId: lab.nodes.harness.peerId,
        seq: 1,
        isFinal: true,
        note: "recovered",
        createdAt: lab.clock.now().toISOString(),
      },
    };
    const seen = new Set<string>();
    const first = applyReconcileReports({
      state,
      recovery,
      workerPeerId: lab.nodes.harness.peerId,
      workerEpoch: "w1",
      reports: [
        {
          attemptId,
          subtaskId: aligned.subtaskId,
          state: "final",
          lastPartialSeq: 1,
          finalPartial,
        },
      ],
      seenPartialKeys: seen,
      now: lab.clock.now(),
    });
    expect(first.ingestedFinals).toEqual([attemptId]);
    const second = applyReconcileReports({
      state,
      recovery,
      workerPeerId: lab.nodes.harness.peerId,
      workerEpoch: "w1",
      reports: [
        {
          attemptId,
          subtaskId: aligned.subtaskId,
          state: "final",
          lastPartialSeq: 1,
          finalPartial,
        },
      ],
      seenPartialKeys: seen,
      now: lab.clock.now(),
    });
    expect(second.ingestedFinals).toEqual([]);
  });

  it("06 worker unknown after restart times out grace then exits recovering", () => {
    const lab = createAgentNetworkLabRuntime();
    const mandate = labChainMandate();
    const state = createChainState(mandate, { awardMode: "direct" });
    const aligned = seedDualWorkers(lab, state, mandate);
    const attemptId = "attempt_lab_unk";
    state.attempts.set(attemptId, {
      attemptId,
      chainId: state.chainId,
      subtaskId: aligned.subtaskId,
      workerPeerId: lab.nodes.harness.peerId,
      role: "primary",
      state: "running",
      attemptNumber: 1,
      acceptedCostUsd: 1,
      createdAt: lab.clock.now().toISOString(),
      updatedAt: lab.clock.now().toISOString(),
    });
    const recovery = beginChainRecovery({
      state,
      orchestratorEpoch: "orch_lab_2",
      now: lab.clock.now(),
      graceMs: 1_000,
    });
    const applied = applyReconcileReports({
      state,
      recovery,
      workerPeerId: lab.nodes.harness.peerId,
      workerEpoch: "w_restart",
      reports: [
        {
          attemptId,
          subtaskId: aligned.subtaskId,
          state: "unknown",
        },
      ],
      seenPartialKeys: new Set(),
      now: lab.clock.now(),
    });
    expect(applied.unknowns).toEqual([attemptId]);
    // Unknown keeps peer pending and extends grace (CHAIN_RECOVERY_UNKNOWN_GRACE_MS).
    expect(recovery.peers[lab.nodes.harness.peerId]?.status).toBe("pending");
    expect(isChainRecovering(recovery)).toBe(true);
    lab.clock.advanceBy(6_000);
    const tick = tickChainRecovery({ recovery, now: lab.clock.now() });
    expect(tick.timedOutPeers).toContain(lab.nodes.harness.peerId);
    expect(tick.done).toBe(true);
    expect(isChainRecovering(recovery)).toBe(false);
  });

  it("07 late final from replaced attempt is retained without overwrite", async () => {
    const lab = createAgentNetworkLabRuntime();
    const mandate = labChainMandate({
      criticality: "high",
      teamStrategyId: "highest-confidence",
      maxParallelAttemptsPerStep: 2,
      speculationEnabled: true,
    });
    const state = createChainState(mandate, { awardMode: "direct", goal: "late final" });
    state.journalEvent = (type, data) => {
      lab.appendJournal({
        chainId: state.chainId,
        at: lab.clock.now().toISOString(),
        type,
        data,
      });
    };
    const aligned = seedDualWorkers(lab, state, mandate);
    const deps = makeOrchDeps(lab);
    expect((await directAwardSubtask(deps, state, aligned.subtaskId, lab.nodes.harness.peerId)).ok).toBe(
      true,
    );
    const primary = [...state.attempts.values()].find((a) => a.role === "primary")!;
    const speculative = [...state.attempts.values()].find((a) => a.role === "speculative")!;
    primary.acceptedCostUsd = 3;
    speculative.acceptedCostUsd = 1;
    const mkEnv = (peerId: string) =>
      ({ senderPeerId: peerId, correlationId: state.chainId }) as Parameters<
        typeof handleOrchestratorPartial
      >[1];
    const note = "selected answer";
    await handleOrchestratorPartial(
      deps,
      mkEnv(lab.nodes.harness.peerId),
      {
        partial: {
          version: "0.1",
          subtaskId: aligned.subtaskId,
          chainId: state.chainId,
          workerPeerId: lab.nodes.harness.peerId,
          seq: 1,
          isFinal: true,
          note,
          confidence: 0.9,
          createdAt: lab.clock.now().toISOString(),
        },
      },
      state,
    );
    await handleOrchestratorPartial(
      deps,
      mkEnv(lab.nodes.openclaw.peerId),
      {
        partial: {
          version: "0.1",
          subtaskId: aligned.subtaskId,
          chainId: state.chainId,
          workerPeerId: lab.nodes.openclaw.peerId,
          seq: 1,
          isFinal: true,
          note,
          confidence: 0.9,
          createdAt: lab.clock.now().toISOString(),
        },
      },
      state,
    );
    expect(state.partials.get(aligned.subtaskId)?.partial.workerPeerId).toBe(
      lab.nodes.openclaw.peerId,
    );
    await handleOrchestratorPartial(
      deps,
      mkEnv(lab.nodes.harness.peerId),
      {
        partial: {
          version: "0.1",
          subtaskId: aligned.subtaskId,
          chainId: state.chainId,
          workerPeerId: lab.nodes.harness.peerId,
          seq: 2,
          isFinal: true,
          note: "LATE OVERWRITE ATTEMPT",
          confidence: 0.9,
          createdAt: lab.clock.now().toISOString(),
        },
      },
      state,
    );
    expect(state.partials.get(aligned.subtaskId)?.partial.note).toBe(note);
    expect(state.partialsByAttempt.get(primary.attemptId)?.partial.note).toBe(
      "LATE OVERWRITE ATTEMPT",
    );
  });

  it("08 highest-confidence dual award selects cheaper equivalent final", async () => {
    const lab = createAgentNetworkLabRuntime();
    const mandate = labChainMandate({
      criticality: "high",
      teamStrategyId: "highest-confidence",
      maxParallelAttemptsPerStep: 2,
      speculationEnabled: true,
    });
    const state = createChainState(mandate, { awardMode: "direct", goal: "speculate" });
    state.journalEvent = (type, data) => {
      lab.appendJournal({
        chainId: state.chainId,
        at: lab.clock.now().toISOString(),
        type,
        data,
      });
    };
    const aligned = seedDualWorkers(lab, state, mandate);
    const deps = makeOrchDeps(lab);
    expect((await directAwardSubtask(deps, state, aligned.subtaskId, lab.nodes.harness.peerId)).ok).toBe(
      true,
    );
    await awaitJournalPredicate({
      events: () => lab.journal,
      predicate: attemptAwarded(aligned.subtaskId),
      flush: () => lab.flush(),
      timeoutMs: 1000,
    });
    const primary = [...state.attempts.values()].find((a) => a.role === "primary")!;
    const speculative = [...state.attempts.values()].find((a) => a.role === "speculative")!;
    primary.acceptedCostUsd = 3;
    speculative.acceptedCostUsd = 1;
    const mkEnv = (peerId: string) =>
      ({ senderPeerId: peerId, correlationId: state.chainId }) as Parameters<
        typeof handleOrchestratorPartial
      >[1];
    const note = "lab equivalent answer";
    await handleOrchestratorPartial(
      deps,
      mkEnv(lab.nodes.harness.peerId),
      {
        partial: {
          version: "0.1",
          subtaskId: aligned.subtaskId,
          chainId: state.chainId,
          workerPeerId: lab.nodes.harness.peerId,
          seq: 1,
          isFinal: true,
          note,
          confidence: 0.9,
          createdAt: lab.clock.now().toISOString(),
        },
      },
      state,
    );
    lab.clock.advanceBy(5_000);
    await handleOrchestratorPartial(
      deps,
      mkEnv(lab.nodes.openclaw.peerId),
      {
        partial: {
          version: "0.1",
          subtaskId: aligned.subtaskId,
          chainId: state.chainId,
          workerPeerId: lab.nodes.openclaw.peerId,
          seq: 1,
          isFinal: true,
          note,
          confidence: 0.9,
          createdAt: lab.clock.now().toISOString(),
        },
      },
      state,
    );
    await awaitJournalPredicate({
      events: () => lab.journal,
      predicate: attemptSelected(aligned.subtaskId),
      flush: () => lab.flush(),
      timeoutMs: 1000,
    });
    expect(state.selectedAttemptBySubtask.get(aligned.subtaskId)).toBe(speculative.attemptId);
  });

  it("09 diverse-model scoring prefers a different model family", () => {
    const strategy = getChainTeamStrategyPreset("diverse-model");
    const sameFamily = scoreChainWorkerWithStrategy({
      strategy,
      components: {
        skill: 0.7,
        eta: 0.5,
        cost: 0.5,
        reliability: 0.5,
        transport: 0.5,
        modelDiversity: 0.1,
      },
    });
    const diverse = scoreChainWorkerWithStrategy({
      strategy,
      components: {
        skill: 0.7,
        eta: 0.5,
        cost: 0.5,
        reliability: 0.5,
        transport: 0.5,
        modelDiversity: 0.95,
      },
    });
    expect(diverse.score).toBeGreaterThan(sameFamily.score);
  });

  it("10 privacy-local rejects remote workers at the hard gate (before scoring)", () => {
    const strategy = getChainTeamStrategyPreset("privacy-local");
    expect(
      evaluateChainWorkerHardGates({
        strategy,
        isSelf: false,
        sameLan: true,
        viaRelay: false,
      }),
    ).toMatchObject({ ok: false, reason: "local_only" });
    expect(
      evaluateChainWorkerHardGates({
        strategy,
        isSelf: true,
        sameLan: true,
        viaRelay: false,
      }),
    ).toMatchObject({ ok: true });
  });

  it("11 relay vs LAN reliability tracked separately", () => {
    const store = new WorkerReliabilityStore();
    store.record({
      workerPeerId: "lab_harness",
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
      workerPeerId: "lab_harness",
      runtime: "envoy-harness",
      modelFamily: "claude",
      skillId: "research",
      connectivityClass: "relay",
      quality: "fail",
      sourceWeight: 1,
      at: "2030-01-01T00:01:00.000Z",
    });
    const lan = store.project({
      workerPeerId: "lab_harness",
      runtime: "envoy-harness",
      modelFamily: "claude",
      skillId: "research",
      connectivityClass: "lan_direct",
    });
    const relay = store.project({
      workerPeerId: "lab_harness",
      runtime: "envoy-harness",
      modelFamily: "claude",
      skillId: "research",
      connectivityClass: "relay",
    });
    expect(lan.sampleCount).toBe(1);
    expect(relay.sampleCount).toBe(1);
    expect(lan.mean).not.toBe(relay.mean);
  });

  it("12 expired and revoked leases leave selection immediately", () => {
    const lab = createAgentNetworkLabRuntime();
    const store = new WorkerLeaseStore();
    const now = lab.clock.now();
    const peer = lab.nodes.harness.peerId;
    expect(store.accept(leaseFor(peer, lab.nodes.harness.ownerId, "envoy-harness"), { now }).ok).toBe(
      true,
    );
    expect(store.getAvailability(peer, now).state).toBe("ready");
    store.revoke({ workerPeerId: peer, leaseId: `lease_${peer}`, sequence: 1 });
    expect(store.getAvailability(peer, now).state).toBe("revoked");

    const store2 = new WorkerLeaseStore();
    expect(
      store2.accept(leaseFor(peer, lab.nodes.harness.ownerId, "envoy-harness", { sequence: 2, nonce: "expire0000000000" }), {
        now,
      }).ok,
    ).toBe(true);
    lab.clock.advanceBy(30_000 + WORKER_LEASE_CLOCK_SKEW_MS + 1);
    expect(store2.getAvailability(peer, lab.clock.now()).state).toBe("expired");
  });

  it("13 malformed / replay / overlong leases are rejected", () => {
    const store = new WorkerLeaseStore();
    const now = new Date("2030-01-01T00:00:05.000Z");
    const issued = Date.parse("2030-01-01T00:00:00.000Z");
    expect(
      store.accept(
        leaseFor("envoy_worker_a", "envoy:owner:a", "envoy-harness", {
          expiresAt: new Date(issued + WORKER_LEASE_MAX_TTL_MS + 1).toISOString(),
          nonce: "toolong000000000",
        }),
        { now },
      ),
    ).toMatchObject({ ok: false, reason: "ttl_too_long" });
    expect(store.accept(leaseFor("envoy_worker_a", "envoy:owner:a", "envoy-harness"), { now }).ok).toBe(
      true,
    );
    expect(
      store.accept(
        leaseFor("envoy_worker_a", "envoy:owner:a", "envoy-harness", {
          sequence: 1,
          nonce: "aaaaaaaaaaaaaaaa",
        }),
        { now },
      ),
    ).toMatchObject({ ok: false, reason: "duplicate_sequence" });
  });

  it("14 corrupted journal tail stops at last valid event; recover replays tail", async () => {
    const dir = await mkdtemp(join(tmpdir(), "an-lab-journal-"));
    const journal = new ChainActiveJournal(dir);
    const chainId = "chain_lab_corrupt";
    await journal.initChain(chainId);
    await journal.append(chainId, "recovery.started", { orchestratorEpoch: "e1" });
    await journal.append(chainId, "attempt.awarded", { subtaskId: "subtask_lab_1" });
    await journal.writeCheckpoint(chainId, { attempts: {}, selectedAttemptBySubtask: {} }, 1);
    await appendFile(journal.filePath(chainId), "{partial\n", "utf8");
    const events = await journal.read(chainId);
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
    // Truncate to one valid line + corrupt suffix.
    await writeFile(
      journal.filePath(chainId),
      `${JSON.stringify(events[0])}\n{broken\n`,
      { mode: 0o600 },
    );
    const truncated = await journal.read(chainId);
    expect(truncated).toHaveLength(1);
    expect(truncated[0]!.type).toBe("recovery.started");
    const recovered = await journal.recover(chainId);
    expect(recovered.lastSeq).toBe(1);
    expect(recovered.checkpoint?.lastSeq).toBe(1);
  });

  it("15 fastest strategy schedules hedge at award, fires only after delay", async () => {
    // Phase 61A — hedged wire. After primary accept, the orchestrator
    // records a `hedgeSchedule` entry with `hedgeAfterMs = p75×1.25`
    // (default 30s when no history). The speculative sibling is NOT
    // launched at award time — it is launched by the `trackChain` tick
    // (via `maybeLaunchDueHedgedAwards`) only after the deadline elapses.
    // If a primary partial arrives first, the hedge is cancelled.
    const lab = createAgentNetworkLabRuntime();
    const mandate = labChainMandate({
      teamStrategyId: "fastest",
      maxParallelAttemptsPerStep: 2,
      criticality: "high",
      speculationEnabled: true,
    });
    const state = createChainState(mandate, {
      awardMode: "direct",
      goal: "hedge wire",
    });
    state.journalEvent = (type, data) => {
      lab.appendJournal({
        chainId: state.chainId,
        at: lab.clock.now().toISOString(),
        type,
        data,
      });
    };
    const aligned = seedDualWorkers(lab, state, mandate);
    const deps = makeOrchDeps(lab);
    // 1. Primary award: orchestrator records the hedge at award time.
    expect(
      (await directAwardSubtask(deps, state, aligned.subtaskId, lab.nodes.harness.peerId))
        .ok,
    ).toBe(true);
    // Hedge is scheduled (not yet launched — no speculative award yet).
    expect(state.hedgeSchedule.has(aligned.subtaskId)).toBe(true);
    const scheduled = state.hedgeSchedule.get(aligned.subtaskId)!;
    expect(scheduled.hedgeAfterMs).toBeGreaterThan(0);
    expect(state.speculativeAwards.has(aligned.subtaskId)).toBe(false);
    // 2. Advance clock by less than hedgeAfterMs — hedge must NOT fire.
    //    `maybeLaunchDueHedgedAwards` returns no entry for subtasks
    //    whose deadline hasn't elapsed (the function short-circuits
    //    before pushing a result for them).
    lab.clock.advanceBy(Math.max(500, scheduled.hedgeAfterMs - 500));
    const beforeDeadline = await maybeLaunchDueHedgedAwards(deps, state);
    expect(
      beforeDeadline.find((r) => r.subtaskId === aligned.subtaskId),
    ).toBeUndefined();
    expect(state.speculativeAwards.has(aligned.subtaskId)).toBe(false);
    expect(state.hedgeSchedule.has(aligned.subtaskId)).toBe(true);
    // 3. Advance clock past the deadline — hedge fires now.
    lab.clock.advanceBy(5_000);
    const afterDeadline = await maybeLaunchDueHedgedAwards(deps, state);
    expect(afterDeadline.find((r) => r.subtaskId === aligned.subtaskId)?.launched).toBe(
      true,
    );
    expect(state.speculativeAwards.has(aligned.subtaskId)).toBe(true);
    expect(state.hedgeSchedule.has(aligned.subtaskId)).toBe(false);
  });

  it("15b primary partial arriving before hedge deadline cancels the hedge", async () => {
    // Phase 61A — when the primary worker is fast (partial arrives
    // before the hedge deadline), the orchestrator drops the hedge so
    // we never spend on a sibling the primary is already finishing.
    const lab = createAgentNetworkLabRuntime();
    const mandate = labChainMandate({
      teamStrategyId: "fastest",
      maxParallelAttemptsPerStep: 2,
      criticality: "high",
      speculationEnabled: true,
    });
    const state = createChainState(mandate, {
      awardMode: "direct",
      goal: "hedge cancel",
    });
    state.journalEvent = (type, data) => {
      lab.appendJournal({
        chainId: state.chainId,
        at: lab.clock.now().toISOString(),
        type,
        data,
      });
    };
    const aligned = seedDualWorkers(lab, state, mandate);
    const deps = makeOrchDeps(lab);
    expect(
      (await directAwardSubtask(deps, state, aligned.subtaskId, lab.nodes.harness.peerId))
        .ok,
    ).toBe(true);
    expect(state.hedgeSchedule.has(aligned.subtaskId)).toBe(true);
    // Primary partial arrives before the hedge deadline.
    const mkEnv = (peerId: string) =>
      ({ senderPeerId: peerId, correlationId: state.chainId }) as Parameters<
        typeof handleOrchestratorPartial
      >[1];
    await handleOrchestratorPartial(
      deps,
      mkEnv(lab.nodes.harness.peerId),
      {
        partial: {
          version: "0.1",
          subtaskId: aligned.subtaskId,
          chainId: state.chainId,
          workerPeerId: lab.nodes.harness.peerId,
          seq: 1,
          isFinal: true,
          note: "fast primary answer",
          confidence: 0.9,
          createdAt: lab.clock.now().toISOString(),
        },
      },
      state,
    );
    // Hedge cancelled — no speculative award, schedule cleared.
    expect(state.speculativeAwards.has(aligned.subtaskId)).toBe(false);
    expect(state.hedgeSchedule.has(aligned.subtaskId)).toBe(false);
  });

  it("lab foundation: triangle bonds + partition/heal", () => {
    const lab = createAgentNetworkLabRuntime();
    expect(lab.bonds.isDirect(lab.nodes.assigner.ownerId, lab.nodes.harness.ownerId)).toBe(true);
    lab.transport.partition(lab.nodes.assigner.peerId, lab.nodes.openclaw.peerId);
    expect(
      lab.deliver({
        intent: "task.chain.accept",
        from: lab.nodes.assigner.peerId,
        to: lab.nodes.openclaw.peerId,
      }),
    ).toBe(false);
    lab.transport.heal(lab.nodes.assigner.peerId, lab.nodes.openclaw.peerId);
    expect(
      lab.deliver({
        intent: "task.chain.accept",
        from: lab.nodes.assigner.peerId,
        to: lab.nodes.openclaw.peerId,
      }),
    ).toBe(true);
  });
});
