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
import { isLibp2pPeerId } from "./profile-sync-outbound.js";

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
  /**
   * Minimum time between auto-fetch attempts for the same peer. Prevents send
   * storms when bonds re-establish repeatedly (e.g. flapping LAN/relay links).
   * Default: 5 min. The startup/manual `refreshAgentNetworkWorkers` path is
   * NOT subject to this cooldown — it calls `requestAgentCard` directly.
   */
  refetchCooldownMs?: number;
  /** Optional clock injection for tests. */
  now?: () => number;
}

export interface AgentCardAutoFetcherResult {
  outcome: "skipped-fresh" | "skipped-public" | "skipped-no-transport" | "skipped-cooldown" | "sent" | "failed";
  reason?: string;
}

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_REFETCH_COOLDOWN_MS = 5 * 60 * 1000;
/**
 * Issue 4: prune entries older than 2× the cooldown so the map doesn't grow
 * unbounded on long-lived nodes with many bonds/reconnections. The fetcher
 * is created once and lives for the entire process lifetime.
 */
const LAST_FETCH_PRUNE_INTERVAL_MS = 10 * 60 * 1000;
const LAST_FETCH_MAX_AGE_MS = DEFAULT_REFETCH_COOLDOWN_MS * 2;

export function createAgentCardAutoFetcher(
  deps: AgentCardAutoFetcherDeps,
): { onBondEstablished: (input: { peerOwnerId: string; remotePeerId: string }) => Promise<AgentCardAutoFetcherResult> } {
  const maxAgeMs = deps.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const fetchTimeoutMs = deps.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const refetchCooldownMs = deps.refetchCooldownMs ?? DEFAULT_REFETCH_COOLDOWN_MS;
  const now = deps.now ?? (() => Date.now());
  /** Last auto-fetch attempt timestamp per peerOwnerId (ms epoch). */
  const lastFetchAttempt = new Map<string, number>();

  // Issue 4: periodic prune so the map doesn't grow unbounded on long-lived
  // nodes. Entries older than 2× the cooldown are no longer useful (the
  // cooldown has long expired) and can be safely evicted.
  const pruneTimer = setInterval(() => {
    const cutoff = now() - LAST_FETCH_MAX_AGE_MS;
    for (const [key, ts] of lastFetchAttempt) {
      if (ts < cutoff) lastFetchAttempt.delete(key);
    }
  }, LAST_FETCH_PRUNE_INTERVAL_MS);
  pruneTimer.unref?.();

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

      // 3. Refetch cooldown — skip if we attempted recently. Prevents send
      //    storms when bonds re-establish repeatedly on flapping links. The
      //    cooldown is per-ownerId so a healthy peer isn't blocked by a
      //    different peer's failure.
      const lastAttempt = lastFetchAttempt.get(peerOwnerId) ?? 0;
      if (now() - lastAttempt < refetchCooldownMs) {
        // Issue 2: log at debug so flapping-link cooldown skips are
        // diagnosable without flooding the audit log (which would be
        // unreadable under heavy flap). Not an audit event — cooldown is
        // expected behavior, not a failure.
        const elapsed = Math.round((now() - lastAttempt) / 1000);
        console.debug(
          `[agent-card] auto-fetch cooldown: ${peerOwnerId.slice(0, 16)}… last attempt ${elapsed}s ago (cooldown ${refetchCooldownMs / 1000}s)`,
        );
        return { outcome: "skipped-cooldown", reason: "cooldown" };
      }
      lastFetchAttempt.set(peerOwnerId, now());

      // 4. Resolve transport — prefer the remotePeerId from the bond handler
      //    (known-connected libp2p peer) over a peer-directory lookup. The
      //    directory may hold stale listen addrs from a previous session, so
      //    dialing via it can silently fail even though we have a live
      //    inbound connection from the bond handshake.
      let transportPeerId: string | undefined;
      let recipientEnvelopePeerId: string | undefined;
      let listenAddrs: string[] | undefined;
      let dialHints: string[] | undefined;
      if (remotePeerId && isLibp2pPeerId(remotePeerId)) {
        // Issue 1: we know the libp2p transport peer (it's connected right
        // now from the bond handshake), but we do NOT know the device's
        // Envoy peer ID from the bond alone. The envelope's recipientPeerId
        // should be the device peer ID (envoy_<hash>) when known, or
        // undefined when unknown — NOT the raw libp2p ID (12D3KooW...).
        // Setting a libp2p ID as recipientPeerId is incorrect header
        // hygiene for agent intents. Leave it undefined; the recipient
        // resolves via the transport connection, not the envelope header.
        transportPeerId = remotePeerId;
        recipientEnvelopePeerId = undefined;
        dialHints = [`/p2p/${remotePeerId}`];
      } else {
        try {
          const resolved = await deps.resolvePeerTransport(peerOwnerId);
          transportPeerId = resolved.transportPeerId;
          // Issue 1 (complete fix): do NOT fall back to transportPeerId when
          // recipientEnvelopePeerId is undefined. The resolver intentionally
          // returns undefined when the device key is unknown (see
          // peer-transport-resolve.ts). The old `?? resolved.transportPeerId`
          // fallback would set a raw libp2p ID (12D3KooW...) as the envelope
          // recipient — the same header-hygiene bug as the short-circuit path.
          recipientEnvelopePeerId = resolved.recipientEnvelopePeerId;
          listenAddrs = resolved.listenAddrs;
          dialHints = resolved.dialHints;
        } catch {
          // fall through
        }
      }
      // Issue 1: recipientEnvelopePeerId may be legitimately undefined when
      // we have a live libp2p transport but don't know the device's Envoy
      // peer ID. The transport is what matters — the envelope is delivered
      // over the libp2p stream regardless of the recipientPeerId header.
      if (!transportPeerId) {
        await auditFailure(deps.taskStore, remotePeerId, "no-agent-peer");
        return { outcome: "skipped-no-transport", reason: "no-transport" };
      }

      // 5. Build + send the signed agent.card.request envelope.
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
