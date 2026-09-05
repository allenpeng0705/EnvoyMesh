/**
 * Phase 64/65 review P1 — creator-side `task.chain.reconcile.response`
 * inbound wire path (not the chaos-smoke receipt-store shortcut).
 *
 * Proves: signed response envelope → handleInboundChainReconcile →
 * applyReconcileReports on the creator ChainStore while RECOVERING.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import {
  ChainMandateSignedSchema,
  createTaskChainReconcileResponsePayload,
  createUnsignedEnvelope,
  type TaskChainPartialPayload,
} from "@envoymesh/protocol";
import { derivePeerId, generateEd25519KeyPair, signUnsignedEnvelope } from "@envoymesh/identity";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { createChainState, type ChainAttemptState } from "../src/chain-orchestrator.js";
import {
  beginChainRecovery,
  isChainRecovering,
} from "../src/chain-reconcile-recovery.js";

const WORKER_PEER = "envoy_worker_reconcile_wire";
const CHAIN_ID = "chain_reconcile_wire_1";
const SUBTASK_ID = "subtask_reconcile_wire_1";
const ATTEMPT_ID = "attempt_reconcile_wire_1";

const finalPartial = {
  partial: {
    version: "0.1" as const,
    subtaskId: SUBTASK_ID,
    chainId: CHAIN_ID,
    workerPeerId: WORKER_PEER,
    seq: 2,
    isFinal: true,
    note: "wire final",
    createdAt: "2030-01-01T00:00:02.000Z",
  },
} as TaskChainPartialPayload;

describe("creator-side reconcile.response inbound (Phase 64 review P1)", () => {
  let profileDir: string;
  let node: NodeServiceImpl;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "chain-reconcile-inbound-"));
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const humanProfileStore = createHumanProfileStore(profileDir);
    const device = generateEd25519KeyPair();
    const owner = generateEd25519KeyPair();
    const profile = {
      owner: {
        ownerId: "envoy:owner:reconcile-creator",
        publicKeyPem: owner.publicKeyPem,
        privateKeyPem: owner.privateKeyPem,
      },
      device: {
        deviceId: `envoy:device:${device.publicKeyPem.slice(-16)}`,
        publicKeyPem: device.publicKeyPem,
        privateKeyPem: device.privateKeyPem,
      },
    } as never;
    node = new NodeServiceImpl(
      undefined,
      trustStore,
      peerDirectoryStore,
      humanProfileStore,
      profileDir,
      profile,
    );
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("applies worker reconcile.response over the inbound handler wire path", async () => {
    const host = node as unknown as {
      _chainStore: {
        setRuntime: (
          chainId: string,
          entry: { state: ReturnType<typeof createChainState>; bidStrategy: unknown },
        ) => void;
        getRuntime: (
          chainId: string,
        ) => { state: ReturnType<typeof createChainState> } | undefined;
      };
      _chainOrchestrationContext: () => {
        getChainSideState: () => {
          recovery: Map<string, ReturnType<typeof beginChainRecovery>>;
          recoveredPartialKeys: Set<string>;
          recoveryAdvancePending: Set<string>;
          reclaimSeedChains: Set<string>;
          orchestratorEpoch: string;
        };
      };
    };

    const mandate = ChainMandateSignedSchema.parse({
      version: "0.1",
      chainMandateId: "chainmandate_reconcile_wire",
      chainId: CHAIN_ID,
      issuerOwnerId: "envoy:owner:reconcile-creator",
      orchestratorOwnerId: "envoy:owner:reconcile-creator",
      maxChainCostUsd: 10,
      costCeilingUsd: 3,
      maxWorkers: 2,
      allowDepth3: false,
      maxSensitivity: "public",
      deadlineAt: "2030-01-02T00:00:00.000Z",
      createdAt: "2030-01-01T00:00:00.000Z",
      signature: "stub",
    });
    const state = createChainState(mandate, { awardMode: "direct", goal: "reconcile wire" });
    const attempt: ChainAttemptState = {
      attemptId: ATTEMPT_ID,
      chainId: CHAIN_ID,
      subtaskId: SUBTASK_ID,
      workerPeerId: WORKER_PEER,
      role: "primary",
      state: "running",
      attemptNumber: 1,
      acceptedCostUsd: 1,
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-01T00:00:00.000Z",
    };
    state.attempts.set(ATTEMPT_ID, attempt);
    state.awards.set(SUBTASK_ID, {
      version: "0.1",
      awardId: "award_reconcile_wire",
      chainId: CHAIN_ID,
      chainMandateId: mandate.chainMandateId,
      subtaskId: SUBTASK_ID,
      workerPeerId: WORKER_PEER,
      acceptedCostUsd: 1,
      negotiationRound: 1,
      awardedAt: "2030-01-01T00:00:00.000Z",
    } as never);
    state.selectedAttemptBySubtask.set(SUBTASK_ID, ATTEMPT_ID);

    host._chainStore.setRuntime(CHAIN_ID, {
      state,
      bidStrategy: {
        baseCostUsd: 1,
        capabilityLocalEtaMs: 60_000,
        reputationDiscount: 1,
        etaSlackMs: 60_000,
      },
    });

    const side = host._chainOrchestrationContext().getChainSideState();
    const recovery = beginChainRecovery({
      state,
      orchestratorEpoch: side.orchestratorEpoch,
      now: new Date("2030-01-01T00:00:01.000Z"),
      graceMs: 60_000,
    });
    expect(isChainRecovering(recovery)).toBe(true);
    side.recovery.set(CHAIN_ID, recovery);

    const workerKeys = generateEd25519KeyPair();
    // Envelope sender must match attempt.workerPeerId (applyReconcileReports gate).
    const workerPeerId = WORKER_PEER;
    const response = createTaskChainReconcileResponsePayload({
      chainId: CHAIN_ID,
      workerEpoch: "worker_epoch_wire_1",
      attempts: [
        {
          attemptId: ATTEMPT_ID,
          subtaskId: SUBTASK_ID,
          state: "final",
          lastPartialSeq: 2,
          finalPartial,
        },
      ],
      respondedAt: "2030-01-01T00:00:03.000Z",
    });
    const unsigned = createUnsignedEnvelope({
      senderPeerId: workerPeerId,
      senderPublicKey: workerKeys.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: "envoy_creator_agent",
      recipientRole: "agent",
      intent: "task.chain.reconcile.response",
      payload: response,
      correlationId: "corr_reconcile_wire_1",
    });
    const envelope = signUnsignedEnvelope(unsigned, workerKeys.privateKeyPem);

    const handled = await node.handleInboundChainReconcile(envelope);
    expect(handled).toBe(true);

    const entry = host._chainStore.getRuntime(CHAIN_ID);
    expect(entry?.state.attempts.get(ATTEMPT_ID)?.state).toBe("final_received");
    expect(entry?.state.partials.get(SUBTASK_ID)?.partial.isFinal).toBe(true);
    expect(entry?.state.partials.get(SUBTASK_ID)?.partial.note).toBe("wire final");
    expect(side.recoveryAdvancePending.has(`${CHAIN_ID}:${SUBTASK_ID}`)).toBe(true);
  });

  it("returns false for invalid reconcile.response payload schema", async () => {
    const workerKeys = generateEd25519KeyPair();
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(workerKeys.publicKeyPem),
      senderPublicKey: workerKeys.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: "envoy_creator_agent",
      recipientRole: "agent",
      intent: "task.chain.reconcile.response",
      payload: { chainId: CHAIN_ID, bogons: true },
      correlationId: "corr_bad",
    });
    const envelope = signUnsignedEnvelope(unsigned, workerKeys.privateKeyPem);
    const handled = await node.handleInboundChainReconcile(envelope);
    expect(handled).toBe(false);
  });
});
