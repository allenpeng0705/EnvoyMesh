import { evaluatePolicy, type BondLevel } from "@envoymesh/bonds";
import {
  createAuditEvent,
  type LocalTaskStore,
  type LocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import {
  parseSocialIntroOwnerReadyPayload,
  parseSocialIntroProposePayload,
  parseSocialIntroSyncPayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";

const SOCIAL_INTRO_RATE_WINDOW_MS = 60_000;
/** Max inbound `social.intro.*` messages per remote peer per sliding window (Phase F). Exported for tests. */
export const SOCIAL_INTRO_RATE_LIMIT_MAX_PER_PEER = 40;
/** Bound for in-memory owner-ready nonce replay map (Phase F residual-risk cap). Exported for tests. */
export const MAX_OWNER_READY_NONCE_ENTRIES = 8192;

type SocialIntroHit = { id: number; t: number };
const socialIntroHitsPerPeer = new Map<string, SocialIntroHit[]>();
const ownerReadyNonceUntil = new Map<string, number>();
let socialIntroHitSeq = 0;

export function __resetSocialIntroInboundTestState(): void {
  socialIntroHitsPerPeer.clear();
  ownerReadyNonceUntil.clear();
  socialIntroHitSeq = 0;
}

/** Test-only: seed owner-ready nonce map (far-future expiries). */
export function __primeOwnerReadyNonceMapForTests(entryCount: number): void {
  const future = Date.now() + 86_400_000;
  for (let i = 0; i < entryCount; i++) {
    ownerReadyNonceUntil.set(`__test_prime:${i}`, future);
  }
}

function pruneOwnerReadyNonceMap(now: number): void {
  for (const [key, until] of ownerReadyNonceUntil.entries()) {
    if (until <= now) {
      ownerReadyNonceUntil.delete(key);
    }
  }
}

/**
 * Reserve one rate-limit slot; returns hit id for rollback on validation failures that return `{ ok: false }`.
 * Returns undefined when over limit (caller should deny without rollback).
 */
function recordSocialIntroHit(remotePeerId: string, now: number): number | undefined {
  let hits = socialIntroHitsPerPeer.get(remotePeerId) ?? [];
  const cutoff = now - SOCIAL_INTRO_RATE_WINDOW_MS;
  hits = hits.filter((h) => h.t >= cutoff);
  if (hits.length >= SOCIAL_INTRO_RATE_LIMIT_MAX_PER_PEER) {
    socialIntroHitsPerPeer.set(remotePeerId, hits);
    return undefined;
  }
  const id = ++socialIntroHitSeq;
  hits.push({ id, t: now });
  socialIntroHitsPerPeer.set(remotePeerId, hits);
  return id;
}

function rollbackSocialIntroHit(remotePeerId: string, hitId: number): void {
  const hits = socialIntroHitsPerPeer.get(remotePeerId);
  if (!hits || hits.length === 0) {
    return;
  }
  const next = hits.filter((h) => h.id !== hitId);
  if (next.length === 0) {
    socialIntroHitsPerPeer.delete(remotePeerId);
  } else {
    socialIntroHitsPerPeer.set(remotePeerId, next);
  }
}

async function trustBondLevel(trustStore: LocalTrustStore, peerOwnerId: string): Promise<BondLevel> {
  const record = await trustStore.getTrustRecord(peerOwnerId);
  return record?.level ?? "public";
}

export type SocialIntroInboundResult = { ok: true } | { ok: false; reason: string };

/**
 * Inbound Trust-mode intents: validate payloads, gate on {@link trustModeEnabled}, apply bonds policy, audit.
 */
export async function handleInboundSocialIntroIntent(input: {
  envelope: EnvoyEnvelope;
  profile: NodeProfile;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: LocalTaskStore;
  trustStore: LocalTrustStore;
  trustModeEnabled: boolean;
  /** When propose passes policy (not deny), emit inbox notification */
  onSocialIntroPropose?: (data: {
    messageId: string;
    introCorrelationId: string;
    candidateOwnerId: string;
    candidatePeerId: string;
    agentPeerId: string;
    agentOwnerId: string;
    rationale?: string;
    receivedAt: string;
  }) => void;
}): Promise<SocialIntroInboundResult> {
  const {
    envelope,
    profile,
    remotePeerId,
    receivedAt,
    correlationId,
    taskStore,
    trustStore,
    trustModeEnabled,
    onSocialIntroPropose,
  } = input;

  const appendAudit = async (opts: {
    outcome: "allow" | "deny" | "record";
    verificationStatus: "verified" | "rejected";
    summary: string;
  }) => {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: opts.verificationStatus === "rejected" ? "message.rejected" : "message.verified",
        intent: envelope.intent,
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: opts.verificationStatus,
        latencyMs: Date.now() - receivedAt,
        outcome: opts.outcome,
        summary: opts.summary,
        createdAt: envelope.createdAt,
      }),
    );
  };

  if (!trustModeEnabled) {
    await appendAudit({
      outcome: "deny",
      verificationStatus: "rejected",
      summary: `${envelope.intent}: trust mode disabled`,
    });
    return { ok: true };
  }

  let rateHitId: number | undefined;
  try {
    const rateLimitNow = Date.now();
    rateHitId = recordSocialIntroHit(remotePeerId, rateLimitNow);
    if (rateHitId === undefined) {
      await appendAudit({
        outcome: "deny",
        verificationStatus: "rejected",
        summary: `${envelope.intent}: rate limit exceeded for peer`,
      });
      return { ok: true };
    }

    pruneOwnerReadyNonceMap(rateLimitNow);

    let ownerReadyDedupKey: string | undefined;
    let ownerReadyExpiryMs = 0;

    let remoteOwnerId: string;
    let summaryExtra = "";
    /** Populated for propose intent — used after policy audit */
    let proposeNotify:
      | {
          introCorrelationId: string;
          candidateOwnerId: string;
          candidatePeerId: string;
          rationale?: string;
        }
      | undefined;

    if (envelope.intent === "social.intro.sync") {
      const payload = parseSocialIntroSyncPayload(envelope.payload);
      remoteOwnerId = payload.ownerId;
      if (envelope.senderRole === "agent") {
        if (!envelope.agentCredential) {
          rollbackSocialIntroHit(remotePeerId, rateHitId);
          return { ok: false, reason: "social.intro.sync from agent requires agentCredential" };
        }
        if (envelope.agentCredential.ownerId !== payload.ownerId) {
          rollbackSocialIntroHit(remotePeerId, rateHitId);
          return { ok: false, reason: "social.intro.sync ownerId does not match agent credential ownerId" };
        }
      }
      summaryExtra = `interest=${payload.interest} refs=${payload.profileFragmentRefs.length}`;
    } else if (envelope.intent === "social.intro.propose") {
      const payload = parseSocialIntroProposePayload(envelope.payload);
      if (envelope.senderRole !== "agent" || !envelope.agentCredential) {
        rollbackSocialIntroHit(remotePeerId, rateHitId);
        return { ok: false, reason: "social.intro.propose requires agent sender with agentCredential" };
      }
      remoteOwnerId = envelope.agentCredential.ownerId;
      if (payload.profileFragment) {
        const exp = new Date(payload.profileFragment.expiresAt).getTime();
        if (!Number.isFinite(exp) || exp <= Date.now()) {
          await appendAudit({
            outcome: "deny",
            verificationStatus: "rejected",
            summary: `${envelope.intent}: expired profileFragment`,
          });
          return { ok: true };
        }
      }
      summaryExtra = `candidate=${payload.candidateOwnerId}`;
      proposeNotify = {
        introCorrelationId: payload.introCorrelationId,
        candidateOwnerId: payload.candidateOwnerId,
        candidatePeerId: payload.candidatePeerId,
        rationale: payload.rationale,
      };
    } else if (envelope.intent === "social.intro.owner-ready") {
      const payload = parseSocialIntroOwnerReadyPayload(envelope.payload);
      const exp = new Date(payload.expiresAt).getTime();
      const nonceNow = Date.now();
      if (!Number.isFinite(exp) || exp <= nonceNow) {
        await appendAudit({
          outcome: "deny",
          verificationStatus: "rejected",
          summary: `${envelope.intent}: expired owner-ready payload`,
        });
        return { ok: true };
      }
      ownerReadyDedupKey = `${payload.introCorrelationId}:${payload.ownerId}:${payload.nonce}`;
      const priorUntil = ownerReadyNonceUntil.get(ownerReadyDedupKey);
      if (priorUntil !== undefined && priorUntil > nonceNow) {
        await appendAudit({
          outcome: "deny",
          verificationStatus: "rejected",
          summary: `${envelope.intent}: duplicate nonce (replay)`,
        });
        return { ok: true };
      }
      pruneOwnerReadyNonceMap(nonceNow);
      const wouldClaimNewNonceSlot =
        priorUntil === undefined || priorUntil <= nonceNow;
      if (
        wouldClaimNewNonceSlot &&
        ownerReadyNonceUntil.size >= MAX_OWNER_READY_NONCE_ENTRIES
      ) {
        await appendAudit({
          outcome: "deny",
          verificationStatus: "rejected",
          summary: `${envelope.intent}: nonce registry at capacity`,
        });
        rollbackSocialIntroHit(remotePeerId, rateHitId);
        return { ok: true };
      }
      ownerReadyExpiryMs = exp;
      remoteOwnerId = payload.ownerId;
      summaryExtra = `nonce=${payload.nonce}`;
    } else {
      rollbackSocialIntroHit(remotePeerId, rateHitId);
      return { ok: false, reason: "not a social.intro intent" };
    }

    if (remoteOwnerId === profile.owner.ownerId) {
      await appendAudit({
        outcome: "deny",
        verificationStatus: "rejected",
        summary: `${envelope.intent}: remote owner equals local owner`,
      });
      return { ok: true };
    }

    const bondLevel = await trustBondLevel(trustStore, remoteOwnerId);
    const decision = evaluatePolicy({
      peerId: envelope.senderPeerId,
      bondLevel,
      intent: envelope.intent,
    });

    let summary: string;
    let outcome: "allow" | "deny" | "record";
    let verificationStatus: "verified" | "rejected";

    if (decision.action === "deny") {
      summary = `${envelope.intent}: policy deny ${decision.reason}. ${summaryExtra}`;
      outcome = "deny";
      verificationStatus = "rejected";
    } else if (decision.action === "allow") {
      summary = `${envelope.intent}: policy allow maxSensitivity=${decision.maxSensitivity}. ${summaryExtra}`;
      outcome = "allow";
      verificationStatus = "verified";
    } else if (decision.action === "challenge") {
      summary = `${envelope.intent}: policy challenge ${decision.challengeType}. ${summaryExtra}`;
      outcome = "record";
      verificationStatus = "verified";
    } else {
      summary = `${envelope.intent}: policy approval_required ${decision.reason}. ${summaryExtra}`;
      outcome = "record";
      verificationStatus = "verified";
    }

    await appendAudit({ outcome, verificationStatus, summary });

    if (
      envelope.intent === "social.intro.owner-ready" &&
      ownerReadyDedupKey &&
      outcome !== "deny"
    ) {
      ownerReadyNonceUntil.set(ownerReadyDedupKey, ownerReadyExpiryMs);
    }

    if (
      proposeNotify &&
      outcome !== "deny" &&
      envelope.agentCredential &&
      onSocialIntroPropose
    ) {
      onSocialIntroPropose({
        messageId: envelope.messageId,
        introCorrelationId: proposeNotify.introCorrelationId,
        candidateOwnerId: proposeNotify.candidateOwnerId,
        candidatePeerId: proposeNotify.candidatePeerId,
        agentPeerId: envelope.senderPeerId,
        agentOwnerId: envelope.agentCredential.ownerId,
        rationale: proposeNotify.rationale,
        receivedAt: envelope.createdAt,
      });
    }

    return { ok: true };
  } catch (error) {
    if (rateHitId !== undefined) {
      rollbackSocialIntroHit(remotePeerId, rateHitId);
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `invalid social.intro payload: ${message}` };
  }
}
