/**
 * v2.2 — worker-side `task.harness.submit.request` handler.
 *
 * The libp2p fabric's worker half of the `RemoteSubmitterTransport`:
 * a parent mesh node sends a serialized `ExecuteInput`; this node runs
 * it through its envoy-harness adapter and replies with the signed
 * `AgentResult` (or a wire error) on the same stream.
 *
 * Trust model (v1): the request envelope is verified by the mesh inbound
 * guard before dispatch; the reply is signed with this node's agent key
 * and verified by the parent via `verifyInboundEnvelope` (same TOFU
 * contract as `task.chain.ready.request/response`). The inner
 * `SignedAgentResult.signature` (owner key) is verified later by the
 * verifier / arbitration path, exactly like the chain-worker MAP path.
 */

import { signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createTaskHarnessSubmitResponsePayload,
  createUnsignedEnvelope,
  parseTaskHarnessSubmitRequestPayload,
  type EnvoyEnvelope,
  type TaskHarnessSubmitRequestPayload,
  type TaskHarnessSubmitResponsePayload,
} from "@envoymesh/protocol";
import type { AgentAdapter } from "@envoymesh/agent-adapter";

export interface HarnessSubmitInboundInput {
  envelope: EnvoyEnvelope;
  replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>;
  agentPeerId: string;
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  agentCredential?: EnvoyEnvelope["agentCredential"];
  /** The live envoy-harness adapter (lazy — may be unavailable). */
  getAdapter: () => AgentAdapter | undefined;
}

export type HarnessSubmitInboundResult =
  | { ok: true; responded: true }
  | { ok: false; reason: string };

/** Reply with a signed `task.harness.submit.response` envelope. */
async function replyToSubmitRequest(input: HarnessSubmitInboundInput, payload: TaskHarnessSubmitResponsePayload): Promise<boolean> {
  if (!input.replyWithEnvelope) return false;
  const unsigned = createUnsignedEnvelope({
    senderPeerId: input.agentPeerId,
    senderPublicKey: input.agentPublicKeyPem,
    senderRole: "agent",
    recipientPeerId: input.envelope.senderPeerId,
    recipientRole: "agent",
    intent: "task.harness.submit.response",
    payload,
    correlationId: input.envelope.correlationId ?? input.envelope.messageId,
    agentCredential: input.agentCredential,
  });
  try {
    await input.replyWithEnvelope(signUnsignedEnvelope(unsigned, input.agentPrivateKeyPem));
    return true;
  } catch {
    return false;
  }
}

export async function handleInboundHarnessSubmitRequest(
  input: HarnessSubmitInboundInput,
): Promise<HarnessSubmitInboundResult> {
  if (input.envelope.intent !== "task.harness.submit.request") {
    return { ok: false, reason: "wrong_intent" };
  }

  let request: TaskHarnessSubmitRequestPayload;
  try {
    request = parseTaskHarnessSubmitRequestPayload(input.envelope.payload);
  } catch {
    // Fail fast on the parent side instead of letting it wait out the
    // deadline: best-effort error reply.
    await replyToSubmitRequest(input, {
      ok: false,
      error: "malformed_payload",
    }).catch(() => undefined);
    return { ok: false, reason: "malformed_payload" };
  }

  if (!input.replyWithEnvelope) {
    return { ok: false, reason: "no_reply_channel" };
  }

  const adapter = input.getAdapter();
  if (!adapter) {
    await replyToSubmitRequest(input, {
      ok: false,
      error: "envoy_harness_unavailable",
    });
    return { ok: false, reason: "envoy_harness_unavailable" };
  }

  // Cap the worker deadline so a hostile/huge deadlineMs cannot overflow
  // setTimeout (Node clamps >2^31-1 ms to 1ms — an immediate abort).
  const budgetMs = Math.min(Math.max(request.deadlineMs, 1), 24 * 60 * 60 * 1000);
  const ac = new AbortController();
  const deadlineTimer = setTimeout(() => {
    ac.abort(new Error("task.harness.submit deadline exceeded"));
  }, budgetMs);
  try {
    const result = await adapter.execute({
      skillId: request.skillId,
      objective: request.objective,
      inputArtifacts: request.inputArtifacts,
      costCeilingUsd: request.costCeilingUsd,
      // Keep the wire's deadline (the adapter owns its own clamping); the
      // local abort timer above is the hard bound.
      deadlineMs: request.deadlineMs,
      correlationId: request.correlationId,
      signal: ac.signal,
      ...(request.verifierModel !== undefined
        ? { verifierModel: request.verifierModel }
        : {}),
    });
    const replied = await replyToSubmitRequest(input, {
      ok: true,
      result,
    });
    return replied
      ? { ok: true, responded: true }
      : { ok: false, reason: "reply_failed" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await replyToSubmitRequest(input, {
      ok: false,
      error: reason.slice(0, 500) || "execute_failed",
    }).catch(() => undefined);
    return { ok: false, reason };
  } finally {
    clearTimeout(deadlineTimer);
    ac.abort();
  }
}
