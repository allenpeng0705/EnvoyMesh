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
  CHAIN_READY_PROBE_MAX_ATTEMPTS,
  CHAIN_READY_PROBE_OVERALL_MS,
  CHAIN_READY_PROBE_SOFT_CACHE_MS,
  CHAIN_READY_PROBE_TIMEOUT_MS,
} from "./chain-defaults.js";

function raceWithTimeout<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(label)), timeoutMs);
    work.then(
      (v) => {
        if (timer !== undefined) clearTimeout(timer);
        resolve(v);
      },
      (err: unknown) => {
        if (timer !== undefined) clearTimeout(timer);
        reject(err);
      },
    );
  });
}
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

/**
 * Probe failures that do not prove the peer's AN engine is down.
 * Typical causes: peer on an older build without ready.request, dial glitch,
 * or expect-reply closing early. Prefer optimistic award + silent reassign.
 */
export function isSoftEngineProbeFailure(reason?: string): boolean {
  if (!reason) return false;
  return (
    reason === "probe_timeout" ||
    reason === "no_transport" ||
    reason === "bad_signature" ||
    reason === "malformed_response" ||
    reason === "probe_id_mismatch" ||
    reason.startsWith("unexpected_intent:")
  );
}

/** Hard skip only when the peer (or local check) explicitly reports engine down. */
export function shouldSkipWorkerForEngineProbe(probe: {
  ready: boolean;
  reason?: string;
}): boolean {
  if (probe.ready) return false;
  if (isSoftEngineProbeFailure(probe.reason)) return false;
  return true;
}

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
  /** When engine is envoy-harness: model adapter reachability probe. */
  isEnvoyHarnessReady?: () => boolean;
}): Promise<LocalAgentNetworkEngineReadyResult> {
  if (input.engine === "ext") {
    if (!input.isExtAgentBridgeReady()) {
      return { ready: false, engine: "ext", reason: "ext_bridge_down" };
    }
    if (input.probeExtAgent) {
      try {
        const probe = await input.probeExtAgent();
        return probe.reachable
          ? { ready: true, engine: "ext" }
          : { ready: false, engine: "ext", reason: "ext_agent_unreachable" };
      } catch {
        return { ready: false, engine: "ext", reason: "ext_agent_unreachable" };
      }
    }
    return { ready: true, engine: "ext" };
  }
  if (input.engine === "envoy-harness") {
    const ready = input.isEnvoyHarnessReady?.() ?? false;
    return ready
      ? { ready: true, engine: "envoy-harness" }
      : { ready: false, engine: "envoy-harness", reason: "envoy_harness_unavailable" };
  }
  const ready = input.isOpenClawReady();
  return ready
    ? { ready: true, engine: "openclaw" }
    : { ready: false, engine: "openclaw", reason: "openclaw_unavailable" };
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
  isEnvoyHarnessReady?: () => boolean;
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
    isEnvoyHarnessReady: input.isEnvoyHarnessReady,
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
  const softCacheTtlMs = CHAIN_READY_PROBE_SOFT_CACHE_MS;
  const cached = input.cache?.get(input.workerPeerId);
  if (cached) {
    const age = nowMs - cached.checkedAtMs;
    const definitive = cached.ready || !isSoftEngineProbeFailure(cached.reason);
    if (definitive && age < cacheTtlMs) {
      return { ready: cached.ready, reason: cached.reason, cached: true };
    }
    // Soft fail: short cache so plan ranking does not re-dial 4×.
    if (!definitive && age < softCacheTtlMs) {
      return { ready: cached.ready, reason: cached.reason, cached: true };
    }
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
    // Soft — do not cache (transport map may warm a moment later).
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
    const perAttemptMs = input.timeoutMs ?? CHAIN_READY_PROBE_TIMEOUT_MS;
    const overallMs = Math.max(CHAIN_READY_PROBE_OVERALL_MS, perAttemptMs);
    const reply = await raceWithTimeout(
      sendExpectReplyWithRetry({
        mesh: expectMesh,
        transportPeerId,
        envelope,
        dialHints,
        timeoutMs: perAttemptMs,
        rebuildDialHints: input.transport.resolveDialHints
          ? () => input.transport.resolveDialHints!(transportPeerId)
          : undefined,
        preferCircuitHints: false,
        maxAttempts: CHAIN_READY_PROBE_MAX_ATTEMPTS,
      }),
      overallMs,
      `ready_probe_overall_timeout after ${overallMs}ms`,
    );
    if (reply.intent !== "task.chain.ready.response") {
      // Soft — peer may be on a build that echoes another intent / closes early.
      input.cache?.set(input.workerPeerId, {
        ready: false,
        reason: `unexpected_intent:${reply.intent}`,
        checkedAtMs: nowMs,
      });
      return { ready: false, reason: `unexpected_intent:${reply.intent}` };
    }
    if (!verifyInboundEnvelope(reply)) {
      input.cache?.set(input.workerPeerId, {
        ready: false,
        reason: "bad_signature",
        checkedAtMs: nowMs,
      });
      return { ready: false, reason: "bad_signature" };
    }
    let payload: TaskChainReadyResponsePayload;
    try {
      payload = parseTaskChainReadyResponsePayload(reply.payload);
    } catch {
      input.cache?.set(input.workerPeerId, {
        ready: false,
        reason: "malformed_response",
        checkedAtMs: nowMs,
      });
      return { ready: false, reason: "malformed_response" };
    }
    if (payload.probeId !== requestPayload.probeId) {
      input.cache?.set(input.workerPeerId, {
        ready: false,
        reason: "probe_id_mismatch",
        checkedAtMs: nowMs,
      });
      return { ready: false, reason: "probe_id_mismatch" };
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
    const detail = err instanceof Error ? err.message : String(err);
    // Normalize to soft probe_timeout so selection soft-allows; keep detail in logs.
    input.cache?.set(input.workerPeerId, {
      ready: false,
      reason: "probe_timeout",
      checkedAtMs: nowMs,
    });
    chainWarn("ready", "probe failed", {
      worker: shortPeerId(input.workerPeerId),
      transport: shortPeerId(transportPeerId),
      error: detail.slice(0, 160),
    });
    return { ready: false, reason: "probe_timeout" };
  }
}
