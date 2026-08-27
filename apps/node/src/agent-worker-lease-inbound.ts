/**
 * Phase 60B — inbound `agent.worker.lease` / `.revoke` / `.request` handlers.
 *
 * Envelope signature is verified upstream. Here we bind workerPeerId to the
 * envelope sender, parse payloads, and update {@link WorkerLeaseStore}.
 */

import {
  parseAgentWorkerLeasePayload,
  parseAgentWorkerLeaseRequestPayload,
  parseAgentWorkerLeaseRevokePayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import type { WorkerLeaseStore } from "./worker-lease-store.js";

export type HandleInboundWorkerLeaseResult =
  | { handled: true; kind: "lease" | "revoke" | "request"; replaced?: boolean }
  | { handled: false; reason: string };

export async function handleInboundWorkerLease(input: {
  envelope: EnvoyEnvelope;
  store: WorkerLeaseStore;
  now?: () => Date;
  /** Cap live leases (typically bonded worker count). */
  maxWorkers?: number;
  /** Optional: reject when the sender's owner is not bonded. */
  isBondedOwner?: (ownerId: string) => Promise<boolean> | boolean;
  /** Optional: on `.request`, republish a fresh lease toward the requester. */
  onLeaseRequest?: (request: {
    requestId: string;
    runtime?: string;
    requesterPeerId: string;
  }) => Promise<void> | void;
}): Promise<HandleInboundWorkerLeaseResult> {
  const { envelope, store } = input;
  const now = input.now ?? (() => new Date());

  if (envelope.intent === "agent.worker.lease") {
    let lease;
    try {
      lease = parseAgentWorkerLeasePayload(envelope.payload);
    } catch {
      return { handled: false, reason: "invalid_lease_schema" };
    }
    if (lease.workerPeerId !== envelope.senderPeerId) {
      return { handled: false, reason: "worker_peer_mismatch" };
    }
    // Credential (when present) must bind the advertising agent to the claimed owner.
    const credOwner = envelope.agentCredential?.ownerId;
    if (typeof credOwner === "string" && credOwner.length > 0 && credOwner !== lease.ownerId) {
      return { handled: false, reason: "owner_credential_mismatch" };
    }
    if (input.isBondedOwner) {
      const bonded = await input.isBondedOwner(lease.ownerId);
      if (!bonded) return { handled: false, reason: "owner_not_bonded" };
    }
    const accepted = store.accept(lease, {
      now: now(),
      maxWorkers: input.maxWorkers,
    });
    if (!accepted.ok) return { handled: false, reason: accepted.reason };
    store.prune(now());
    return { handled: true, kind: "lease", replaced: accepted.replaced };
  }

  if (envelope.intent === "agent.worker.lease.revoke") {
    let revoke;
    try {
      revoke = parseAgentWorkerLeaseRevokePayload(envelope.payload);
    } catch {
      return { handled: false, reason: "invalid_revoke_schema" };
    }
    if (revoke.workerPeerId !== envelope.senderPeerId) {
      return { handled: false, reason: "worker_peer_mismatch" };
    }
    const result = store.revoke({
      workerPeerId: revoke.workerPeerId,
      leaseId: revoke.leaseId,
      sequence: revoke.sequence,
    });
    if (!result.ok) return { handled: false, reason: result.reason };
    return { handled: true, kind: "revoke" };
  }

  if (envelope.intent === "agent.worker.lease.request") {
    let request;
    try {
      request = parseAgentWorkerLeaseRequestPayload(envelope.payload);
    } catch {
      return { handled: false, reason: "invalid_request_schema" };
    }
    await input.onLeaseRequest?.({
      requestId: request.requestId,
      runtime: request.runtime,
      requesterPeerId: envelope.senderPeerId,
    });
    return { handled: true, kind: "request" };
  }

  return { handled: false, reason: "intent_mismatch" };
}
