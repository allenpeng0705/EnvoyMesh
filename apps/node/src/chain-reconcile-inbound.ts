/**
 * Phase 60D — worker-side reconcile request handler.
 *
 * Envelope signature verified upstream. Bind responses to this worker's
 * receipt store; unknown attempts report `state: "unknown"`.
 */

import {
  createTaskChainReconcileResponsePayload,
  parseTaskChainReconcileRequestPayload,
  type EnvoyEnvelope,
  type TaskChainReconcileResponsePayload,
} from "@envoymesh/protocol";
import type { WorkerAttemptReceiptStore } from "./worker-attempt-receipt-store.js";

export type HandleInboundChainReconcileRequestResult =
  | {
      handled: true;
      response: TaskChainReconcileResponsePayload;
    }
  | { handled: false; reason: string };

export function handleInboundChainReconcileRequest(input: {
  envelope: EnvoyEnvelope;
  store: WorkerAttemptReceiptStore;
  workerEpoch: string;
  now?: () => Date;
}): HandleInboundChainReconcileRequestResult {
  if (input.envelope.intent !== "task.chain.reconcile.request") {
    return { handled: false, reason: "wrong_intent" };
  }
  let request;
  try {
    request = parseTaskChainReconcileRequestPayload(input.envelope.payload);
  } catch {
    return { handled: false, reason: "invalid_reconcile_request_schema" };
  }
  const now = input.now ?? (() => new Date());
  const attempts = input.store.buildReports({
    chainId: request.chainId,
    knownAttempts: request.knownAttempts.map((a) => ({
      attemptId: a.attemptId,
      subtaskId: a.subtaskId,
    })),
    now: now(),
  });
  const response = createTaskChainReconcileResponsePayload({
    chainId: request.chainId,
    workerEpoch: input.workerEpoch,
    attempts,
    respondedAt: now().toISOString(),
  });
  return { handled: true, response };
}
