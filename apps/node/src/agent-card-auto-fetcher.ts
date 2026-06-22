/**
 * Phase 33 — Agent Card auto-fetch on bond establishment.
 *
 * When `bond:established` fires (for both `bond.request` and `bond.accept` paths), the home
 * node should eagerly fetch the peer's Agent Card so the OpenClaw agent knows what the peer
 * can do. The auto-fetch is **eager** (matches the literal "auto-fetch on bond establishment"
 * wording from the design doc) with these properties:
 *
 *  - Idempotent: skip when a card was cached within `maxAgeMs` (default 24h).
 *  - Skip for public-tier bonds: strangers don't get a card fetch.
 *  - No retry on failure: a failed fetch (timeout, peer offline) is silent in the audit log.
 *    The `mesh.agent_card.request` tool remains available for explicit re-fetches.
 *  - Sender role is `agent` (A2A wire, not human channel).
 *
 * The fetch path is **fire-and-forget at the caller level** — `onBondEstablished` returns a
 * Promise that the caller can ignore. Internally we await the response with a 5s timeout so
 * the bond handler doesn't block on slow peers.
 *
 * The actual `agent.card.response` envelope is handled by the existing
 * `agent-card-inbound.ts` path, which calls `AgentCardStore.upsert`. This module only needs
 * to **send the request** and audit the outcome.
 */

import { randomUUID } from "node:crypto";
import {
  createAgentCardRequestPayload,
  createUnsignedEnvelope,
  type AgentCard,
  type AgentCredential,
} from "@envoymesh/protocol";
import { signUnsignedEnvelope } from "@envoymesh/identity";
import { createAuditEvent, type AgentCardStore, type LocalTaskStore, type LocalTrustStore } from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";

/** Mesh / libp2p transport surface needed to send a signed envelope. */
export interface AgentCardAutoFetcherMesh {
  send(
    transportPeerId: string,
    envelope: ReturnType<typeof signUnsignedEnvelope>,
    options?: { dialHints?: string[] },
  ): Promise<unknown>;
}

/** Bridge identity = the OpenClaw / agent side of the home node. */
export interface AgentCardAutoFetcherBridgeIdentity {
  agentPeerId: string;
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  ownerId: string;
  agentCredential: AgentCredential;
}

/** Resolver = how to translate a target owner into transport peer ID + envelope recipient. */
export type AgentCardAutoFetcherResolver = (targetOwnerId: string) => Promise<{
  transportPeerId: string | undefined;
  recipientEnvelopePeerId: string | undefined;
}>;

export interface AgentCardAutoFetcherDeps {
  mesh: AgentCardAutoFetcherMesh;
  bridgeIdentity: AgentCardAutoFetcherBridgeIdentity;
  agentCardStore: AgentCardStore;
  trustStore: LocalTrustStore;
  taskStore: LocalTaskStore;
  resolvePeerTransport: AgentCardAutoFetcherResolver;
  /** Max age before a cached card is considered stale. Default: 24h. */
  maxAgeMs?: number;
  /** Per-fetch timeout. Default: 5s. */
  fetchTimeoutMs?: number;
  /** Optional clock injection for tests. */
  now?: () => number;
}

export interface AgentCardAutoFetcherResult {
  outcome: "skipped-fresh" | "skipped-public" | "skipped-no-transport" | "sent" | "failed";
  reason?: string;
}

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;

export function createAgentCardAutoFetcher(
  deps: AgentCardAutoFetcherDeps,
): { onBondEstablished: (input: { peerOwnerId: string; remotePeerId: string }) => Promise<AgentCardAutoFetcherResult> } {
  const maxAgeMs = deps.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const fetchTimeoutMs = deps.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const now = deps.now ?? (() => Date.now());

  return {
    async onBondEstablished({ peerOwnerId, remotePeerId }) {
      // 1. Trust-tier check — don't fetch from public bonds.
      try {
        const trust = await deps.trustStore.getTrustRecord(peerOwnerId);
        const level = trust?.level ?? "public";
        if (level === "public" || level === "blocked") {
          await deps.taskStore.appendAuditEvent(
            createAuditEvent({
              type: "agent.card.auto_fetch_failed",
              intent: "agent.card.request",
              correlationId: randomUUID(),
              remotePeerId,
              direction: "outbound",
              outcome: "deny",
              summary: `Skip auto-fetch: peer trust level ${level}.`,
              createdAt: new Date().toISOString(),
            }),
          );
          return { outcome: "skipped-public", reason: `trust-level-${level}` };
        }
      } catch {
        // If trust-store read fails, fall through to freshness check (fail open on trust).
      }

      // 2. Freshness check — skip if a card was cached within maxAgeMs.
      try {
        const cached = await deps.agentCardStore.get(peerOwnerId);
        if (cached) {
          const cachedAtMs = new Date(cached.cachedAt).getTime();
          if (Number.isFinite(cachedAtMs) && now() - cachedAtMs < maxAgeMs) {
            return { outcome: "skipped-fresh", reason: "cache-fresh" };
          }
        }
      } catch {
        // Ignore cache-read errors and proceed with the fetch.
      }

      // 3. Resolve transport.
      let transportPeerId: string | undefined;
      let recipientEnvelopePeerId: string | undefined;
      try {
        const resolved = await deps.resolvePeerTransport(peerOwnerId);
        transportPeerId = resolved.transportPeerId;
        recipientEnvelopePeerId = resolved.recipientEnvelopePeerId ?? resolved.transportPeerId;
      } catch {
        // fall through
      }
      if (!transportPeerId || !recipientEnvelopePeerId) {
        await auditFailure(deps.taskStore, remotePeerId, "no-agent-peer");
        return { outcome: "skipped-no-transport", reason: "no-transport" };
      }

      // 4. Build + send the signed agent.card.request envelope.
      const envelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: deps.bridgeIdentity.agentPeerId,
          senderPublicKey: deps.bridgeIdentity.agentPublicKeyPem,
          senderRole: "agent",
          recipientPeerId: recipientEnvelopePeerId,
          recipientRole: "agent",
          intent: "agent.card.request",
          payload: createAgentCardRequestPayload({
            requesterOwnerId: deps.bridgeIdentity.ownerId,
          }),
          correlationId: randomUUID(),
          agentCredential: deps.bridgeIdentity.agentCredential,
        }),
        deps.bridgeIdentity.agentPrivateKeyPem,
      );

      const sendWork = deps.mesh.send(transportPeerId, envelope);
      void sendWork.catch(() => {
        /* late failure after Promise.race timeout — must not crash the process */
      });
      try {
        await Promise.race([
          sendWork,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("agent-card-auto-fetch-timeout")), fetchTimeoutMs).unref?.(),
          ),
        ]);
        await deps.taskStore.appendAuditEvent(
          createAuditEvent({
            type: "agent.card.auto_fetched",
            intent: "agent.card.request",
            correlationId: envelope.correlationId,
            remotePeerId,
            direction: "outbound",
            outcome: "allow",
            summary: `Sent agent.card.request to ${peerOwnerId}.`,
            createdAt: new Date().toISOString(),
          }),
        );
        return { outcome: "sent" };
      } catch (error) {
        const reason =
          error instanceof Error && error.message.includes("timeout")
            ? "timeout"
            : "send-failed";
        await auditFailure(deps.taskStore, remotePeerId, reason);
        return { outcome: "failed", reason };
      }
    },
  };
}

async function auditFailure(
  taskStore: LocalTaskStore,
  remotePeerId: string,
  reason: string,
): Promise<void> {
  try {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "agent.card.auto_fetch_failed",
        intent: "agent.card.request",
        correlationId: randomUUID(),
        remotePeerId,
        direction: "outbound",
        outcome: "deny",
        summary: `Auto-fetch failed: ${reason}.`,
        createdAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Audit failure is non-fatal.
  }
}

/** Re-export the cached card type for tests. */
export type { AgentCard };
