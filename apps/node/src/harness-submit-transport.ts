/**
 * v2.2 — `Libp2pRemoteSubmitterTransport`: the mesh fabric's
 * `RemoteSubmitterTransport` implementation.
 *
 * The parent half of `task.harness.submit.request/response`. A mesh
 * node's `RemoteMeshSubmitter` can target ANOTHER mesh node's envoy-
 * harness worker directly (Pattern B of `distributed-collaboration.md`),
 * instead of a standalone peer cluster.
 *
 * Flow (mirrors `probeChainWorkerReady`, the mesh's proven expect-reply
 * pattern):
 *   1. Map `SubagentInput` → the serializable MAP `ExecuteInput`.
 *   2. Sign the request envelope with the parent's agent key.
 *   3. `sendExpectReplyWithRetry` (same-stream) with the submit deadline.
 *   4. Verify the reply envelope's signature (`verifyInboundEnvelope`,
 *      TOFU — same trust contract as the chain ready probe).
 *   5. Parse `SignedAgentResult`, map back to `SubagentResult`.
 *
 * Abort: the caller's `AbortSignal` is raced against the round-trip, so
 * a parent abort cancels the wait. The in-flight request may still be
 * delivered (expect-reply has no cancel channel), but the caller sees
 * an `AbortError` immediately — same semantics as the peer transport.
 *
 * Local target: when `targetPeerId` resolves to this node's own agent
 * peer, the transport executes through `executeLocally` (the mesh node's
 * own adapter) instead of a mesh loopback.
 */

import {
  signedResultToSubagentResult,
  subagentInputToExecuteInput,
} from "@envoymesh/envoy-harness-peer";
import {
  createTaskHarnessSubmitRequestPayload,
  createUnsignedEnvelope,
  parseTaskHarnessSubmitResponsePayload,
  type EnvoyEnvelope,
  type SignedAgentResult,
} from "@envoymesh/protocol";
import { signUnsignedEnvelope, verifyInboundEnvelope } from "@envoymesh/identity";
import type { ExecuteInput } from "@envoymesh/agent-adapter";
import type { SubagentInput, SubagentResult } from "@envoymesh/envoy-harness";
import type { RemoteSubmitterTransport } from "@envoymesh/envoy-harness-adapter";

import {
  resolveChainTransportPeerId,
  type ChainTransportResolver,
} from "./chain-production.js";
import {
  sendExpectReplyWithRetry,
  type OutboundExpectReplyMesh,
} from "./chat-outbound-deliver.js";
import { chainLog, chainWarn, shortPeerId } from "./chain-debug.js";

export interface Libp2pRemoteSubmitterTransportOptions {
  /** The mesh + peer-directory resolution (same shape the chain workers use). */
  resolver: ChainTransportResolver;
  parentAgentPeerId: string;
  parentAgentPublicKeyPem: string;
  parentAgentPrivateKeyPem: string;
  agentCredential?: EnvoyEnvelope["agentCredential"];
  /**
   * Executes a request whose target resolves to this node (self-submit).
   * When absent, a local target throws `no_local_executor`.
   */
  executeLocally?: (input: ExecuteInput) => Promise<SignedAgentResult>;
}

function abortError(label: string): Error {
  const err = new Error(`${label}: aborted`);
  err.name = "AbortError";
  return err;
}

/** Cap a deadline so `setTimeout` never overflows (hostile/huge inputs). */
const MAX_DEADLINE_MS = 24 * 60 * 60 * 1000;

/** Race a round-trip against the parent abort + the submit deadline. */
function raceRoundTrip<T>(
  work: Promise<T>,
  signal: AbortSignal,
  deadlineMs: number,
  label: string,
): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(label));
  const budgetMs = Math.min(Math.max(deadlineMs, 1), MAX_DEADLINE_MS);
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      reject(abortError(label));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      reject(new Error(`${label}: deadline exceeded after ${budgetMs}ms`));
    }, budgetMs);
    work.then(
      (value) => {
        if (timer !== undefined) clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err: unknown) => {
        if (timer !== undefined) clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

/** Build the v2.2 fabric transport over the mesh expect-reply seam. */
export function createLibp2pRemoteSubmitterTransport(
  options: Libp2pRemoteSubmitterTransportOptions,
): RemoteSubmitterTransport {
  const { resolver } = options;

  return {
    async send(
      input: SubagentInput,
      targetPeerId: string,
      signal: AbortSignal,
    ): Promise<SubagentResult> {
      const label = `harness.submit to ${shortPeerId(targetPeerId)}`;
      const executeInput = subagentInputToExecuteInput(input, signal);
      if (signal.aborted) {
        throw abortError(label);
      }

      // Self-submit: run through the node's own adapter, no mesh loopback.
      const transportPeerId = await resolveChainTransportPeerId(
        resolver,
        targetPeerId,
      );
      const isLocal =
        targetPeerId === options.parentAgentPeerId ||
        transportPeerId === resolver.mesh.peerId;
      if (isLocal) {
        if (!options.executeLocally) {
          throw new Error(`${label}: local target but no executeLocally`);
        }
        const result = await raceRoundTrip(
          options.executeLocally(executeInput),
          signal,
          input.deadlineMs,
          label,
        );
        return signedResultToSubagentResult(result);
      }

      if (!transportPeerId) {
        throw new Error(`${label}: no transport peer for "${targetPeerId}"`);
      }

      let requestPayload;
      try {
        requestPayload = createTaskHarnessSubmitRequestPayload({
          skillId: executeInput.skillId,
          objective: executeInput.objective,
          inputArtifacts: [...executeInput.inputArtifacts],
          costCeilingUsd: executeInput.costCeilingUsd,
          deadlineMs: executeInput.deadlineMs,
          correlationId: executeInput.correlationId,
          ...(executeInput.verifierModel !== undefined
            ? { verifierModel: executeInput.verifierModel }
            : {}),
        });
      } catch {
        throw new Error(
          `${label}: request payload invalid (objective too large or missing fields)`,
        );
      }
      const envelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: options.parentAgentPeerId,
          senderPublicKey: options.parentAgentPublicKeyPem,
          senderRole: "agent",
          recipientPeerId: targetPeerId,
          recipientRole: "agent",
          intent: "task.harness.submit.request",
          payload: requestPayload,
          correlationId: executeInput.correlationId,
          agentCredential: options.agentCredential,
        }),
        options.parentAgentPrivateKeyPem,
      );

      const dialHints = [`/p2p/${transportPeerId}`];
      if (resolver.resolveDialHints) {
        try {
          const extra = await resolver.resolveDialHints(transportPeerId);
          if (extra.length > 0) {
            dialHints.push(...extra);
          }
        } catch {
          /* best-effort */
        }
      }

      chainLog("submit", "mesh deliver", {
        target: shortPeerId(targetPeerId),
        transport: shortPeerId(transportPeerId),
        correlationId: executeInput.correlationId,
      });

      let reply: EnvoyEnvelope;
      try {
        reply = await raceRoundTrip(
          sendExpectReplyWithRetry({
            mesh: resolver.mesh as unknown as OutboundExpectReplyMesh,
            transportPeerId,
            envelope,
            dialHints,
            timeoutMs: input.deadlineMs,
            maxAttempts: 1,
            preferCircuitHints: false,
          }),
          signal,
          input.deadlineMs,
          label,
        );
      } catch (err) {
        chainWarn("submit", "round-trip failed", {
          target: shortPeerId(targetPeerId),
          correlationId: executeInput.correlationId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }

      if (reply.intent !== "task.harness.submit.response") {
        throw new Error(
          `${label}: unexpected reply intent "${reply.intent}"`,
        );
      }
      // Verify the signature BEFORE trusting any reply content: the
      // envelope must be signed by the peer we dialed (same TOFU
      // contract as the chain ready probe), and the sender must be the
      // worker we asked — otherwise a forged/relayed envelope could
      // impersonate the worker.
      if (!verifyInboundEnvelope(reply)) {
        throw new Error(`${label}: bad reply signature`);
      }
      if (reply.senderPeerId !== targetPeerId) {
        throw new Error(
          `${label}: reply sender mismatch (got "${reply.senderPeerId}")`,
        );
      }
      if (reply.correlationId !== executeInput.correlationId) {
        throw new Error(
          `${label}: correlationId mismatch (got "${reply.correlationId}")`,
        );
      }

      let payload;
      try {
        payload = parseTaskHarnessSubmitResponsePayload(reply.payload);
      } catch {
        throw new Error(`${label}: malformed reply payload`);
      }
      if (!payload.ok) {
        throw new Error(`${label}: worker error: ${payload.error}`);
      }

      chainLog("submit", "result", {
        target: shortPeerId(targetPeerId),
        correlationId: executeInput.correlationId,
        runtime: payload.result.runtime,
        costUsd: payload.result.metrics.costUsd,
      });
      return signedResultToSubagentResult(payload.result);
    },
  };
}
