/**
 * Team-job Agent Network engine hello (`task.chain.ready.request/response`).
 *
 * Mesh Online ≠ worker engine ready. The Assigner hellos the peer's Envoy
 * agent; that node answers for **its configured AN worker engine** only:
 * Built-in OpenClaw **or** Ext Agent — never both, never the Assigner's choice
 * (see docs/agent-network-engine.md).
 */

import { signUnsignedEnvelope, verifyInboundEnvelope } from "@envoymesh/identity";
import {
  createTaskChainReadyRequestPayload,
  createTaskChainReadyResponsePayload,
  createUnsignedEnvelope,
  parseTaskChainReadyRequestPayload,
  parseTaskChainReadyResponsePayload,
  type EnvoyEnvelope,
  type TaskChainReadyResponsePayload,
} from "@envoymesh/protocol";
import {
  CHAIN_READY_PROBE_CACHE_MS,
  CHAIN_READY_PROBE_TIMEOUT_MS,
} from "./chain-defaults.js";
import { chainLog, chainWarn, shortPeerId } from "./chain-debug.js";
import {
  sendExpectReplyWithRetry,
  type OutboundExpectReplyMesh,
} from "./chat-outbound-deliver.js";
import {
  resolveChainTransportPeerId,
  type ChainTransportResolver,
} from "./chain-production.js";
import type { AgentNetworkWorkerEngine } from "./agent-network-worker-engine.js";

export type ChainReadyProbeCacheEntry = {
  ready: boolean;
  reason?: string;
  checkedAtMs: number;
};

export type LocalAgentNetworkEngineReadyResult = {
  ready: boolean;
  engine: AgentNetworkWorkerEngine;
  reason?: string;
};

export function createChainReadyProbeCache(): Map<string, ChainReadyProbeCacheEntry> {
  return new Map();
}

/**
 * Local readiness for this node's configured AN worker engine.
 * - `openclaw` → OpenClaw gateway ready
 * - `ext` → Ext bridge configured, then optional live Ext Agent reachability probe
 */
export async function localAgentNetworkEngineReady(input: {
  engine: AgentNetworkWorkerEngine;
  isOpenClawReady: () => boolean;
  isExtAgentBridgeReady: () => boolean;
  /** When engine is Ext: HTTP/sidecar hello to the active Ext Agent. */
  probeExtAgent?: () => Promise<{ reachable: boolean }>;
}): Promise<LocalAgentNetworkEngineReadyResult> {
  const engine = input.engine === "ext" ? "ext" : "openclaw";
  if (engine === "ext") {
    if (!input.isExtAgentBridgeReady()) {
      return { ready: false, engine, reason: "ext_bridge_down" };
    }
    if (input.probeExtAgent) {
      try {
        const probe = await input.probeExtAgent();
        return probe.reachable
          ? { ready: true, engine }
          : { ready: false, engine, reason: "ext_agent_unreachable" };
      } catch {
        return { ready: false, engine, reason: "ext_agent_unreachable" };
      }
    }
    return { ready: true, engine };
  }
  const ready = input.isOpenClawReady();
  return ready
    ? { ready: true, engine }
    : { ready: false, engine, reason: "openclaw_unavailable" };
}

/** Same-stream reply for inbound `task.chain.ready.request`. */
export async function handleChainReadyRequestInbound(input: {
  envelope: EnvoyEnvelope;
  replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>;
  agentPeerId: string;
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  agentCredential?: EnvoyEnvelope["agentCredential"];
  engine: AgentNetworkWorkerEngine;
  isOpenClawReady: () => boolean;
  isExtAgentBridgeReady: () => boolean;
  probeExtAgent?: () => Promise<{ reachable: boolean }>;
}): Promise<{ ok: true; responded: boolean } | { ok: false; reason: string }> {
  if (input.envelope.intent !== "task.chain.ready.request") {
    return { ok: false, reason: "wrong_intent" };
  }
  let request;
  try {
    request = parseTaskChainReadyRequestPayload(input.envelope.payload);
  } catch {
    return { ok: false, reason: "malformed_payload" };
  }

  const local = await localAgentNetworkEngineReady({
    engine: input.engine,
    isOpenClawReady: input.isOpenClawReady,
    isExtAgentBridgeReady: input.isExtAgentBridgeReady,
    probeExtAgent: input.probeExtAgent,
  });
  const responsePayload = createTaskChainReadyResponsePayload({
    probeId: request.probeId,
    ready: local.ready,
    engine: local.engine,
    reason: local.reason,
  });
  const unsigned = createUnsignedEnvelope({
    senderPeerId: input.agentPeerId,
    senderPublicKey: input.agentPublicKeyPem,
    senderRole: "agent",
    recipientPeerId: input.envelope.senderPeerId,
    recipientRole: "agent",
    intent: "task.chain.ready.response",
    payload: responsePayload,
    correlationId: input.envelope.correlationId ?? input.envelope.messageId,
    agentCredential: input.agentCredential,
  });
  const signed = signUnsignedEnvelope(unsigned, input.agentPrivateKeyPem);

  if (!input.replyWithEnvelope) {
    chainWarn("ready", "no replyWithEnvelope for ready.request", {
      from: shortPeerId(input.envelope.senderPeerId),
    });
    return { ok: false, reason: "no_reply_channel" };
  }
  try {
    await input.replyWithEnvelope(signed);
    chainLog("ready", "replied", {
      to: shortPeerId(input.envelope.senderPeerId),
      ready: local.ready,
      engine: local.engine,
      reason: local.reason,
    });
    return { ok: true, responded: true };
  } catch (err) {
    chainWarn("ready", "reply failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "reply_failed" };
  }
}

export async function probeChainWorkerReady(input: {
  transport: ChainTransportResolver;
  workerPeerId: string;
  orchestratorPeerId: string;
  orchestratorPublicKeyPem: string;
  orchestratorPrivateKeyPem: string;
  agentCredential?: EnvoyEnvelope["agentCredential"];
  /** Local readiness when probing self (skip mesh). */
  localReady: () => Promise<LocalAgentNetworkEngineReadyResult>;
  cache?: Map<string, ChainReadyProbeCacheEntry>;
  nowMs?: number;
  timeoutMs?: number;
  cacheTtlMs?: number;
}): Promise<{ ready: boolean; reason?: string; cached?: boolean }> {
  const nowMs = input.nowMs ?? Date.now();
  const cacheTtlMs = input.cacheTtlMs ?? CHAIN_READY_PROBE_CACHE_MS;
  const cached = input.cache?.get(input.workerPeerId);
  if (cached && nowMs - cached.checkedAtMs < cacheTtlMs) {
    return { ready: cached.ready, reason: cached.reason, cached: true };
  }

  if (input.workerPeerId === input.orchestratorPeerId) {
    const local = await input.localReady();
    input.cache?.set(input.workerPeerId, {
      ready: local.ready,
      reason: local.reason,
      checkedAtMs: nowMs,
    });
    return { ready: local.ready, reason: local.reason };
  }

  const transportPeerId = await resolveChainTransportPeerId(
    input.transport,
    input.workerPeerId,
  );
  if (!transportPeerId) {
    const result = { ready: false, reason: "no_transport" as const };
    input.cache?.set(input.workerPeerId, {
      ready: false,
      reason: result.reason,
      checkedAtMs: nowMs,
    });
    return result;
  }

  const requestPayload = createTaskChainReadyRequestPayload();
  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: input.orchestratorPeerId,
      senderPublicKey: input.orchestratorPublicKeyPem,
      senderRole: "agent",
      recipientPeerId: input.workerPeerId,
      recipientRole: "agent",
      intent: "task.chain.ready.request",
      payload: requestPayload,
      correlationId: requestPayload.probeId,
      agentCredential: input.agentCredential,
    }),
    input.orchestratorPrivateKeyPem,
  );

  const dialHints = input.transport.resolveDialHints
    ? await input.transport.resolveDialHints(transportPeerId)
    : [];

  try {
    const expectMesh = input.transport.mesh as unknown as OutboundExpectReplyMesh;
    const reply = await sendExpectReplyWithRetry({
      mesh: expectMesh,
      transportPeerId,
      envelope,
      dialHints,
      timeoutMs: input.timeoutMs ?? CHAIN_READY_PROBE_TIMEOUT_MS,
      rebuildDialHints: input.transport.resolveDialHints
        ? () => input.transport.resolveDialHints!(transportPeerId)
        : undefined,
      preferCircuitHints: false,
      maxAttempts: 1,
    });
    if (reply.intent !== "task.chain.ready.response") {
      const result = { ready: false, reason: `unexpected_intent:${reply.intent}` };
      input.cache?.set(input.workerPeerId, {
        ready: false,
        reason: result.reason,
        checkedAtMs: nowMs,
      });
      return result;
    }
    if (!verifyInboundEnvelope(reply)) {
      const result = { ready: false, reason: "bad_signature" };
      input.cache?.set(input.workerPeerId, {
        ready: false,
        reason: result.reason,
        checkedAtMs: nowMs,
      });
      return result;
    }
    let payload: TaskChainReadyResponsePayload;
    try {
      payload = parseTaskChainReadyResponsePayload(reply.payload);
    } catch {
      const result = { ready: false, reason: "malformed_response" };
      input.cache?.set(input.workerPeerId, {
        ready: false,
        reason: result.reason,
        checkedAtMs: nowMs,
      });
      return result;
    }
    if (payload.probeId !== requestPayload.probeId) {
      const result = { ready: false, reason: "probe_id_mismatch" };
      input.cache?.set(input.workerPeerId, {
        ready: false,
        reason: result.reason,
        checkedAtMs: nowMs,
      });
      return result;
    }
    input.cache?.set(input.workerPeerId, {
      ready: payload.ready,
      reason: payload.reason,
      checkedAtMs: nowMs,
    });
    chainLog("ready", "probe result", {
      worker: shortPeerId(input.workerPeerId),
      ready: payload.ready,
      engine: payload.engine,
      reason: payload.reason,
    });
    return { ready: payload.ready, reason: payload.reason };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    input.cache?.set(input.workerPeerId, {
      ready: false,
      reason: "probe_timeout",
      checkedAtMs: nowMs,
    });
    chainWarn("ready", "probe failed", {
      worker: shortPeerId(input.workerPeerId),
      error: reason.slice(0, 120),
    });
    return { ready: false, reason: "probe_timeout" };
  }
}
