/**
 * Phase 60B — publish short-lived signed worker leases to bonded peers.
 *
 * Default TTL 30s; refresh every ~10s with deterministic ±10% jitter from peer id.
 * The signed Envoy envelope authenticates the agent; receivers verify
 * workerPeerId === senderPeerId and store the latest sequence.
 */

import { randomBytes, randomUUID } from "node:crypto";
import {
  createAgentWorkerLeasePayload,
  createUnsignedEnvelope,
  type AgentCredential,
  type AgentRuntime,
  type AgentWorkerLeasePayload,
  type AgentWorkerLeaseRuntime,
  type EnvoyEnvelope,
  type SkillId,
} from "@envoymesh/protocol";
import { signCanonicalPayload } from "@envoymesh/identity";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  sendEnvelopeWithRetry,
  type OutboundDeliverMesh,
} from "./chat-outbound-deliver.js";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";
import {
  WORKER_LEASE_DEFAULT_TTL_MS,
  leaseRefreshIntervalMs,
} from "./worker-lease-store.js";

export interface BuildWorkerLeaseInput {
  workerPeerId: string;
  ownerId: string;
  sequence: number;
  leaseId?: string;
  runtimes: AgentWorkerLeaseRuntime[];
  connectivity: { direct: boolean; relay: boolean };
  now?: () => Date;
  ttlMs?: number;
  nonce?: string;
}

export function buildWorkerLeasePayload(
  input: BuildWorkerLeaseInput,
): AgentWorkerLeasePayload {
  const now = input.now ?? (() => new Date());
  const issued = now();
  const ttlMs = input.ttlMs ?? WORKER_LEASE_DEFAULT_TTL_MS;
  const expires = new Date(issued.getTime() + ttlMs);
  return createAgentWorkerLeasePayload({
    leaseId: input.leaseId ?? `lease_${randomUUID()}`,
    workerPeerId: input.workerPeerId,
    ownerId: input.ownerId,
    issuedAt: issued.toISOString(),
    notBefore: issued.toISOString(),
    expiresAt: expires.toISOString(),
    sequence: input.sequence,
    runtimes: input.runtimes,
    connectivity: input.connectivity,
    nonce: input.nonce ?? randomBytes(16).toString("hex"),
  });
}

/** Map local engine + skills into a single-runtime lease advertisement. */
export function buildLocalLeaseRuntime(input: {
  runtime: AgentRuntime;
  ready: boolean;
  skillIds: SkillId[];
  maxConcurrent?: number;
  availableSlots?: number;
  queueDepth?: number;
  runtimeVersion?: string;
  modelFamily?: string;
  modelIdHash?: string;
}): AgentWorkerLeaseRuntime {
  const maxConcurrent = input.maxConcurrent ?? 1;
  const availableSlots =
    input.availableSlots ?? (input.ready ? maxConcurrent : 0);
  return {
    runtime: input.runtime,
    ...(input.runtimeVersion ? { runtimeVersion: input.runtimeVersion } : {}),
    ...(input.modelFamily ? { modelFamily: input.modelFamily } : {}),
    ...(input.modelIdHash ? { modelIdHash: input.modelIdHash } : {}),
    ready: input.ready,
    capacity: {
      maxConcurrent,
      availableSlots,
      queueDepth: input.queueDepth ?? 0,
    },
    skillIds: input.skillIds,
  };
}

export function buildWorkerLeaseEnvelope(input: {
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  lease: AgentWorkerLeasePayload;
  /** Required for `envoy_agent_*` senderPeerId verification on receivers. */
  agentCredential: AgentCredential;
}): EnvoyEnvelope {
  const unsigned = createUnsignedEnvelope({
    // Must match lease.workerPeerId (agent peer id), not derivePeerId(pubkey).
    senderPeerId: input.lease.workerPeerId,
    senderPublicKey: input.agentPublicKeyPem,
    senderRole: "agent",
    recipientRole: "agent",
    intent: "agent.worker.lease",
    payload: input.lease,
    agentCredential: input.agentCredential,
  });
  return {
    ...unsigned,
    signature: signCanonicalPayload(unsigned, input.agentPrivateKeyPem),
  };
}

export interface WorkerLeaseBroadcastMesh
  extends OutboundDeliverMesh,
    Pick<EnvoyMesh, "mergePeerStoreDialHints"> {}

export interface SendWorkerLeaseInput {
  mesh: WorkerLeaseBroadcastMesh;
  lease: AgentWorkerLeasePayload;
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  agentCredential: AgentCredential;
  bondOwnerIds: string[];
  resolveLibp2pPeer: (
    ownerId: string,
  ) => Promise<{ peerId: string; listenAddrs?: string[] } | undefined>;
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
}

export async function sendWorkerLeaseToPeers(
  input: SendWorkerLeaseInput,
): Promise<void> {
  const envelope = buildWorkerLeaseEnvelope({
    agentPublicKeyPem: input.agentPublicKeyPem,
    agentPrivateKeyPem: input.agentPrivateKeyPem,
    lease: input.lease,
    agentCredential: input.agentCredential,
  });
  const seenOwnerIds = new Set<string>();
  for (const ownerId of input.bondOwnerIds) {
    if (seenOwnerIds.has(ownerId)) continue;
    seenOwnerIds.add(ownerId);
    try {
      const resolved = await input.resolveLibp2pPeer(ownerId);
      if (!resolved?.peerId || !isLibp2pPeerId(resolved.peerId)) continue;
      let dialHints: string[] = [];
      try {
        dialHints = await input.dialHintsFor(resolved.peerId, resolved.listenAddrs);
      } catch {
        /* best-effort */
      }
      if (typeof input.mesh.mergePeerStoreDialHints === "function") {
        void Promise.resolve(
          input.mesh.mergePeerStoreDialHints(resolved.peerId, dialHints),
        ).catch(() => undefined);
      }
      await sendEnvelopeWithRetry({
        mesh: input.mesh,
        transportPeerId: resolved.peerId,
        envelope,
        dialHints,
        peerListenAddrs: resolved.listenAddrs,
        rebuildDialHints: () =>
          input.dialHintsFor(resolved.peerId, resolved.listenAddrs),
      });
    } catch {
      /* one bond failure must not stop the cycle */
    }
  }
}

export interface WorkerLeaseBroadcasterDeps {
  mesh: WorkerLeaseBroadcastMesh;
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  agentCredential: AgentCredential;
  workerPeerId: string;
  ownerId: string;
  leaseId?: string;
  buildRuntimes: () => Promise<AgentWorkerLeaseRuntime[]> | AgentWorkerLeaseRuntime[];
  connectivity: () => Promise<{ direct: boolean; relay: boolean }> | {
    direct: boolean;
    relay: boolean;
  };
  bondOwnerIds: () => Promise<string[]>;
  resolveLibp2pPeer: SendWorkerLeaseInput["resolveLibp2pPeer"];
  dialHintsFor: SendWorkerLeaseInput["dialHintsFor"];
  ttlMs?: number;
  /** Override refresh interval (tests). Default: jittered 10s from peer id. */
  intervalMs?: number;
  now?: () => Date;
  onError?: (err: unknown) => void;
  onPublished?: (lease: AgentWorkerLeasePayload) => void;
}

/**
 * Start the periodic lease publisher. Returns `{ stop, publishNow }`.
 */
export function startWorkerLeaseBroadcaster(
  deps: WorkerLeaseBroadcasterDeps,
): { stop: () => void; publishNow: () => Promise<void> } {
  const intervalMs =
    deps.intervalMs ?? leaseRefreshIntervalMs(deps.workerPeerId);
  let sequence = 0;
  const leaseId = deps.leaseId ?? `lease_${randomUUID()}`;
  let timer: ReturnType<typeof setInterval> | undefined;

  const publishNow = async (): Promise<void> => {
    try {
      const bondOwnerIds = await deps.bondOwnerIds();
      if (bondOwnerIds.length === 0) return;
      const runtimes = await deps.buildRuntimes();
      if (runtimes.length === 0) return;
      sequence += 1;
      const connectivity = await deps.connectivity();
      const lease = buildWorkerLeasePayload({
        workerPeerId: deps.workerPeerId,
        ownerId: deps.ownerId,
        sequence,
        leaseId,
        runtimes,
        connectivity,
        now: deps.now,
        ttlMs: deps.ttlMs,
      });
      await sendWorkerLeaseToPeers({
        mesh: deps.mesh,
        lease,
        agentPublicKeyPem: deps.agentPublicKeyPem,
        agentPrivateKeyPem: deps.agentPrivateKeyPem,
        agentCredential: deps.agentCredential,
        bondOwnerIds,
        resolveLibp2pPeer: deps.resolveLibp2pPeer,
        dialHintsFor: deps.dialHintsFor,
      });
      deps.onPublished?.(lease);
    } catch (err) {
      deps.onError?.(err);
    }
  };

  void publishNow();
  timer = setInterval(() => void publishNow(), intervalMs);
  timer.unref?.();

  let stopped = false;
  return {
    publishNow,
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
