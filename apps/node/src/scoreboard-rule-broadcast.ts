/**
 * Federated scoreboard rule broadcast (design §9.2, libp2p round-trip).
 *
 * Periodically pushes the node's latest `kept` verifier-ruleset experiment
 * to bonded peers as an owner-signed `FederatedRule` (`scoreboard.rule`
 * intent, agent→agent) — the mirror of the `adapter.manifest` broadcast.
 * The receiver never adopts blind: the local validation gate
 * (`pullScoreboardRule`) decides, so this is opt-in pull-by-broadcast.
 *
 * Cycles with nothing to share (no `kept` scoreboard entry for any runtime
 * the node runs) are skipped.
 *
 * Design doc: `docs/improving-agent-network.en.md` §9.2.
 */

import { createUnsignedEnvelope, type AgentRuntime, type EnvoyEnvelope } from "@envoymesh/protocol";
import { derivePeerId, signCanonicalPayload } from "@envoymesh/identity";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  sendEnvelopeWithRetry,
  type OutboundDeliverMesh,
} from "./chat-outbound-deliver.js";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";
import { scoreboardEntryToFederatedRule } from "./scoreboard-rule-inbound.js";
import type { VerifierScoreboard } from "./verifier-scoreboard.js";

/** Broadcast interval — matches the manifest broadcaster cadence. */
export const SCOREBOARD_BROADCAST_INTERVAL_MS = 150_000;

export interface ScoreboardRuleBroadcastMesh
  extends OutboundDeliverMesh,
    Pick<EnvoyMesh, "mergePeerStoreDialHints"> {}

/** One agent-signed envelope reused for every bond (mirrors the manifest broadcast). */
export function buildScoreboardRuleEnvelope(input: {
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  rule: unknown;
}): EnvoyEnvelope {
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.agentPublicKeyPem),
    senderPublicKey: input.agentPublicKeyPem,
    senderRole: "agent",
    recipientRole: "agent",
    intent: "scoreboard.rule",
    payload: input.rule,
  });
  return {
    ...unsigned,
    signature: signCanonicalPayload(unsigned, input.agentPrivateKeyPem),
  };
}

export interface SendScoreboardRuleInput {
  mesh: ScoreboardRuleBroadcastMesh;
  rule: unknown;
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  /** Bonded peers to notify (dedup by ownerId). */
  bondOwnerIds: string[];
  resolveLibp2pPeer: (
    ownerId: string,
  ) => Promise<{ peerId: string; listenAddrs?: string[] } | undefined>;
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
}

export async function sendScoreboardRuleToPeers(input: SendScoreboardRuleInput): Promise<void> {
  const envelope = buildScoreboardRuleEnvelope({
    agentPublicKeyPem: input.agentPublicKeyPem,
    agentPrivateKeyPem: input.agentPrivateKeyPem,
    rule: input.rule,
  });
  const seenOwnerIds = new Set<string>();
  for (const ownerId of input.bondOwnerIds) {
    if (seenOwnerIds.has(ownerId)) continue;
    seenOwnerIds.add(ownerId);
    try {
      const resolved = await input.resolveLibp2pPeer(ownerId);
      if (!resolved?.peerId || !isLibp2pPeerId(resolved.peerId)) {
        continue;
      }
      let dialHints: string[] = [];
      try {
        dialHints = await input.dialHintsFor(resolved.peerId, resolved.listenAddrs);
      } catch {
        // Best-effort dial hints; sendEnvelopeWithRetry rebuilds on failure.
      }
      if (typeof input.mesh.mergePeerStoreDialHints === "function") {
        void Promise.resolve(
          input.mesh.mergePeerStoreDialHints(resolved.peerId, dialHints),
        ).catch(() => undefined);
      }
      await sendEnvelopeWithRetry({
        mesh: input.mesh,
        transportPeerId: resolved.peerId,
        envelope,
        dialHints,
        peerListenAddrs: resolved.listenAddrs,
        rebuildDialHints: () => input.dialHintsFor(resolved.peerId, resolved.listenAddrs),
      });
    } catch {
      // A failed broadcast to one bond must not break the cycle.
    }
  }
}

export interface ScoreboardBroadcasterDeps {
  mesh: ScoreboardRuleBroadcastMesh;
  /** Local scoreboard — the latest `kept` entry per runtime is what we share. */
  scoreboard: VerifierScoreboard;
  /** Runtimes the node runs; cycles are skipped when none has a kept entry. */
  runtimes: () => readonly AgentRuntime[];
  ownerPrivateKeyPem: string;
  signerOwnerId: string;
  publisherPeerId: string;
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  bondOwnerIds: () => Promise<string[]>;
  resolveLibp2pPeer: SendScoreboardRuleInput["resolveLibp2pPeer"];
  dialHintsFor: SendScoreboardRuleInput["dialHintsFor"];
  intervalMs?: number;
  onError?: (err: unknown) => void;
}

/**
 * Start the periodic scoreboard-rule broadcaster. Each cycle shares the
 * latest `kept` entry per runtime the node runs; cycles with nothing to
 * share are skipped. Returns `{ stop }`; `stop()` clears the timer and is
 * idempotent.
 */
export function startScoreboardRuleBroadcaster(
  deps: ScoreboardBroadcasterDeps,
): { stop: () => void } {
  const intervalMs = deps.intervalMs ?? SCOREBOARD_BROADCAST_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | undefined;

  const run = async (): Promise<void> => {
    try {
      for (const runtime of deps.runtimes()) {
        const latest = await deps.scoreboard.latest(runtime);
        if (!latest || latest.status !== "kept") continue;
        const rule = scoreboardEntryToFederatedRule({
          entry: latest,
          publisherPeerId: deps.publisherPeerId,
          ownerPrivateKeyPem: deps.ownerPrivateKeyPem,
          signerOwnerId: deps.signerOwnerId,
        });
        const bondOwnerIds = await deps.bondOwnerIds();
        await sendScoreboardRuleToPeers({
          mesh: deps.mesh,
          rule,
          agentPublicKeyPem: deps.agentPublicKeyPem,
          agentPrivateKeyPem: deps.agentPrivateKeyPem,
          bondOwnerIds,
          resolveLibp2pPeer: deps.resolveLibp2pPeer,
          dialHintsFor: deps.dialHintsFor,
        });
      }
    } catch (err) {
      deps.onError?.(err);
    }
  };

  void run();
  timer = setInterval(() => void run(), intervalMs);
  if (timer.unref) timer.unref();
  return {
    stop: () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}
