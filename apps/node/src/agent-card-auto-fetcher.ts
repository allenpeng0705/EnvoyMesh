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
import {
  sendEnvelopeWithRetry,
  type OutboundDeliverMesh,
} from "./chat-outbound-deliver.js";

/** Mesh / libp2p transport surface needed to send a signed envelope. */
export type AgentCardAutoFetcherMesh = OutboundDeliverMesh & Pick<EnvoyMesh, "peerId">;

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
  listenAddrs?: string[];
  dialHints?: string[];
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
      let listenAddrs: string[] | undefined;
      let dialHints: string[] | undefined;
      try {
        const resolved = await deps.resolvePeerTransport(peerOwnerId);
        transportPeerId = resolved.transportPeerId;
        recipientEnvelopePeerId = resolved.recipientEnvelopePeerId ?? resolved.transportPeerId;
        listenAddrs = resolved.listenAddrs;
        dialHints = resolved.dialHints;
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

      const sendWork = sendEnvelopeWithRetry({
        mesh: deps.mesh,
        transportPeerId,
        envelope,
        dialHints: dialHints ?? [`/p2p/${transportPeerId}`],
        peerListenAddrs: listenAddrs,
      });
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
      } catch (err) {
        await auditFailure(
          deps.taskStore,
          remotePeerId,
          err instanceof Error ? err.message : String(err),
        );
        return { outcome: "failed", reason: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

async function auditFailure(
  taskStore: LocalTaskStore,
  remotePeerId: string,
  reason: string,
): Promise<void> {
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
}

export type { AgentCard };
