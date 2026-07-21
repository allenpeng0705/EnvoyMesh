/**
 * Attach standalone relay control-plane handlers (checkin / lookup / hints)
 * to an EnvoyMesh. Used by apps/relay/src/index.ts (production) and
 * in-process E2E tests.
 *
 * This is the SINGLE source of truth for relay.checkin / relay.lookup /
 * relay.hints.request / relay.hints.response handling on the standalone
 * relay binary. The production relay (apps/relay/src/index.ts) must call
 * attachStandaloneRelayControl() rather than inlining its own copy.
 */
import { randomUUID } from "node:crypto";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  createRelayHintsResponsePayload,
  createRelayLookupPayload,
  createRelayLookupResponsePayload,
  parseRelayCheckinPayload,
  parseRelayHintsRequestPayload,
  parseRelayHintsResponsePayload,
  parseRelayLookupPayload,
  parseRelayLookupResponsePayload,
  RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
  RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
  type EnvoyEnvelope,
  type RelayHint,
  type RelayLookupPayload,
  type RelayLookupResponsePayload,
} from "@envoymesh/protocol";
import type { createRelayRoster } from "./relay-roster.js";
import type { createRelayLookupRouter } from "./relay-lookup-router.js";
import type { RelayControlIdentity } from "./relay-control-identity.js";
import { mergeRelayLookupResponses } from "./relay-lookup-response-merge.js";

export interface StandaloneRelayControlDeps {
  mesh: EnvoyMesh;
  roster: ReturnType<typeof createRelayRoster>;
  router: ReturnType<typeof createRelayLookupRouter>;
  identity: RelayControlIdentity;
  /** Dialable circuit bases for /p2p-circuit/ construction. */
  circuitBases: () => string[];
  forwardTimeoutMs?: number;
  bookTtlMs?: number;
  /** Optional metrics hook after checkin. */
  onCheckin?: (info: { peerId: string; topicCount: number; capCount: number; hasLiveHop: boolean; note: string }) => void;
  /** Optional metrics hook after lookup. */
  onLookup?: (info: {
    queryId: string;
    peersReturned: number;
    localCount: number;
    forwardTargetCount: number;
  }) => void;
  /** Optional log function (defaults to console.log). */
  log?: (msg: string) => void;
  /** Optional warn function (defaults to console.warn). */
  warn?: (msg: string) => void;
}

function placeholderReply(
  mesh: EnvoyMesh,
  recipientPeerId: string,
  intent: EnvoyEnvelope["intent"],
  payload: unknown,
): EnvoyEnvelope {
  return {
    version: "0.1",
    messageId: randomUUID(),
    createdAt: new Date().toISOString(),
    senderPeerId: mesh.peerId,
    senderPublicKey: RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
    senderRole: "agent",
    recipientPeerId,
    recipientRole: "agent",
    intent,
    signature: RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
    payload,
  } as EnvoyEnvelope;
}

/**
 * Ingest sibling hints into the relay book. Verified/active/seed siblings
 * get their addrs/TTL refreshed (not re-registered as candidates).
 */
function ingestSiblingHints(
  roster: ReturnType<typeof createRelayRoster>,
  mesh: EnvoyMesh,
  hints: RelayHint[],
  opts: { verified: boolean },
  bookTtlMs: number,
): void {
  const expiresAt = new Date(Date.now() + bookTtlMs).toISOString();
  for (const hint of hints) {
    if (!hint.relayId || hint.multiaddrs.length === 0) continue;
    if (hint.relayId === mesh.peerId) continue;
    const existing = roster.relayBook().find((e) => e.relayId === hint.relayId);
    if (existing && (existing.state === "verified" || existing.state === "active" || existing.state === "seed")) {
      // Refresh addrs / TTL for already-verified siblings
      roster.registerRelay({
        relayId: hint.relayId,
        addrs: hint.multiaddrs,
        relation: existing.relation === "candidate" ? "sibling" : existing.relation,
        state: existing.state,
        level: hint.level ?? existing.level,
        region: hint.region ?? existing.region,
        expiresAt: hint.expiresAt ?? expiresAt,
      });
      continue;
    }
    roster.registerRelay({
      relayId: hint.relayId,
      addrs: hint.multiaddrs,
      relation: "sibling",
      state: opts.verified ? "verified" : "candidate",
      level: hint.level,
      region: hint.region,
      expiresAt: hint.expiresAt ?? expiresAt,
    });
  }
}

async function forwardRelayLookup(
  deps: StandaloneRelayControlDeps,
  input: {
    payload: RelayLookupPayload;
    targets: RelayHint[];
    correlationId?: string;
  },
): Promise<Array<{ payload: RelayLookupResponsePayload; remotePeerId: string }>> {
  const { payload, targets, correlationId } = input;
  const timeoutMs = deps.forwardTimeoutMs ?? 12_000;
  if (payload.maxHops <= 0 || targets.length === 0) return [];

  // Forward to siblings in PARALLEL (not serial) so a miss-forward round
  // completes in max(timeoutMs) not targets.length × timeoutMs.
  // Design: review finding m3 — two slow siblings serially could exceed
  // the client's 30s reply timeout.
  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const targetAddress = target.multiaddrs[0] ?? target.relayId;
      if (!targetAddress) return null;
      const forwardedPayload = createRelayLookupPayload({
        ...payload,
        maxHops: payload.maxHops - 1,
      });
      const signedEnvelope = deps.identity.signControl({
        intent: "relay.lookup",
        payload: forwardedPayload,
        recipientPeerId: targetAddress.startsWith("/") ? undefined : target.relayId,
        correlationId,
      });
      const remote = target.relayId || targetAddress;
      try {
        deps.router.recordForwardedLookup();
        const reply = await deps.mesh.sendExpectReply(targetAddress, signedEnvelope, {
          timeoutMs,
        });
        if (reply.intent !== "relay.lookup.response") {
          deps.router.recordFailedForward();
          (deps.warn ?? console.warn)(`[relay] lookup forward unexpected intent target=${remote}`);
          return null;
        }
        return {
          payload: parseRelayLookupResponsePayload(reply.payload),
          remotePeerId: remote,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        deps.router.recordFailedForward();
        if (target.relayId) deps.router.recordNegative(payload, target.relayId);
        (deps.warn ?? console.warn)(`[relay] lookup forward failed target=${remote} error=${msg}`);
        return null;
      }
    }),
  );

  const out: Array<{ payload: RelayLookupResponsePayload; remotePeerId: string }> = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      out.push(result.value);
    }
  }
  deps.router.recordCollectedForwardResponse(out.length);
  for (const response of out) {
    if (response.payload.peers.length === 0) {
      deps.router.recordNegative(payload, response.remotePeerId);
    }
  }
  return out;
}

/**
 * Register mesh.onMessage handlers for relay.checkin / lookup / hints.
 * Returns an unsubscribe function.
 */
export function attachStandaloneRelayControl(deps: StandaloneRelayControlDeps): () => void {
  const bookTtlMs = deps.bookTtlMs ?? 35 * 60_000;
  const log = deps.log ?? console.log;
  const warn = deps.warn ?? console.warn;

  return deps.mesh.onMessage(async (message) => {
    const intent = message.envelope.intent;

    if (intent === "relay.checkin") {
      try {
        const payload = parseRelayCheckinPayload(message.envelope.payload);
        const peerId = payload.peerId || message.envelope.senderPeerId;
        const liveResv = deps.mesh
          .inspectCircuitRelayReservations()
          .find((r) => r.peerId === peerId && r.expireAt > Date.now());
        const { entry, addrChanged, reconnect } = deps.roster.checkin(
          payload,
          message.envelope.senderPeerId,
          liveResv ? { reservationExpireAtMs: liveResv.expireAt } : undefined,
        );
        const topicCount = entry.advertisements.filter((a) => a.topicHash).length;
        const note =
          addrChanged && reconnect
            ? "addr_changed reconnect"
            : addrChanged
              ? "addr_changed"
              : reconnect
                ? "reconnect"
                : "ok";
        deps.onCheckin?.({
          peerId: payload.peerId,
          topicCount,
          capCount: entry.capabilities.length,
          hasLiveHop: !!liveResv,
          note,
        });
        log(
          `[relay] checkin peer=${payload.peerId} topics=${topicCount} cap=${entry.capabilities.length} roster=${deps.roster.size()} hop=${liveResv ? "live" : "none"} ${note}`,
        );
      } catch (error) {
        warn(`[relay] Failed to handle relay.checkin: ${error instanceof Error ? error.message : error}`);
      }
      return;
    }

    if (intent === "relay.lookup") {
      try {
        const payload = parseRelayLookupPayload(message.envelope.payload);
        if (!deps.router.markSeen(payload.queryId)) {
          log(`[relay] lookup duplicate dropped query=${payload.queryId}`);
          if (message.replyWithEnvelope) {
            await message.replyWithEnvelope(
              placeholderReply(
                deps.mesh,
                message.envelope.senderPeerId,
                "relay.lookup.response",
                createRelayLookupResponsePayload({
                  queryId: payload.queryId,
                  peers: [],
                  relayHints: [],
                  truncated: false,
                  expiresAt: payload.expiresAt,
                }),
              ),
            );
          }
          return;
        }
        const livePeerIds = new Set(
          deps.mesh
            .inspectCircuitRelayReservations()
            .filter((r) => r.expireAt > Date.now())
            .map((r) => r.peerId),
        );
        const localResponse = deps.roster.lookup({
          payload,
          requesterPeerId: message.envelope.senderPeerId,
          relayMultiaddrs: deps.circuitBases(),
          relayPeerId: deps.mesh.peerId,
          hasLiveReservation: (id) => livePeerIds.has(id),
        });
        const routeDecision = deps.router.selectForwardTargets({
          payload,
          relayBook: deps.roster.relayBook(),
          selfRelayId: deps.mesh.peerId,
        });
        const forwarded =
          localResponse.peers.length < payload.maxResults && payload.maxHops > 0
            ? await forwardRelayLookup(deps, {
                payload,
                targets: routeDecision.forwardTargets,
                correlationId: message.envelope.correlationId,
              })
            : [];
        const mergedRaw = mergeRelayLookupResponses(payload, [
          localResponse,
          ...forwarded.map((f) => f.payload),
        ]);
        const merged = createRelayLookupResponsePayload({
          ...mergedRaw,
          relayHints:
            mergedRaw.relayHints.length > 0
              ? mergedRaw.relayHints
              : deps.roster.verifiedRelayHints(payload.maxResults),
        });
        deps.onLookup?.({
          queryId: payload.queryId,
          peersReturned: merged.peers.length,
          localCount: localResponse.peers.length,
          forwardTargetCount: routeDecision.forwardTargets.length,
        });
        log(
          `[relay] lookup query=${payload.queryId} peers=${merged.peers.length} local=${localResponse.peers.length} forwards=${routeDecision.forwardTargets.length} roster=${deps.roster.size()} hopLive=${[...livePeerIds].length}`,
        );
        if (message.replyWithEnvelope) {
          await message.replyWithEnvelope(
            placeholderReply(
              deps.mesh,
              message.envelope.senderPeerId,
              "relay.lookup.response",
              merged,
            ),
          );
        }
      } catch (error) {
        warn(`[relay] Failed to handle relay.lookup: ${error instanceof Error ? error.message : error}`);
      }
      return;
    }

    if (intent === "relay.hints.request") {
      try {
        const payload = parseRelayHintsRequestPayload(message.envelope.payload);
        const responsePayload = createRelayHintsResponsePayload({
          relayHints: deps.roster.verifiedRelayHints(payload.maxResults),
          truncated: false,
          expiresAt: new Date(Date.now() + bookTtlMs).toISOString(),
        });
        if (message.replyWithEnvelope) {
          await message.replyWithEnvelope(
            placeholderReply(
              deps.mesh,
              message.envelope.senderPeerId,
              "relay.hints.response",
              responsePayload,
            ),
          );
        }
        log(`[relay] hints.request reason=${payload.reason} returned=${responsePayload.relayHints.length}`);
      } catch (error) {
        warn(`[relay] Failed to handle relay.hints.request: ${error instanceof Error ? error.message : error}`);
      }
      return;
    }

    if (intent === "relay.hints.response") {
      try {
        const payload = parseRelayHintsResponsePayload(message.envelope.payload);
        ingestSiblingHints(deps.roster, deps.mesh, payload.relayHints, { verified: false }, bookTtlMs);
        log(`[relay] hints.response ingested candidates=${payload.relayHints.length}`);
      } catch (error) {
        warn(`[relay] Failed to handle relay.hints.response: ${error instanceof Error ? error.message : error}`);
      }
    }
  });
}
