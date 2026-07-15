/**
 * LAN auto-bond runtime — Phase 35C (Fleet Onboarding C: LAN Auto-Bond).
 *
 * Two home nodes on the same LAN advertise themselves over mDNS. When both
 * nodes have:
 *   - `lanAutoBondEnabled === true`, and
 *   - the same non-empty `lanAutoBondFleetToken`,
 * they exchange a `device.pair.request` envelope carrying that token in the
 * new `lanFleetToken` field. The recipient auto-accepts the bond as "direct"
 * trust, **without** an approval prompt.
 *
 * This is **opt-in, disabled by default** — see `createDefaultPersistedNodeConfig`
 * for the default `lanAutoBondEnabled` value of `false`. A node with the
 * feature enabled but no token configured will not auto-bond (the token
 * check is a hard fail, not a warning).
 *
 * Auditing: every auto-bond is logged with `summary` containing the source
 * `lan-auto` and the trust level. The fleet token itself is never written
 * to the audit log or any peer-visible field.
 */

import { createHash, randomUUID } from "node:crypto";
import type { LocalTaskStore } from "@envoymesh/local-store";
import { createDevicePairRequestPayload, parseDevicePairRequestPayload, type DevicePairRequestPayload } from "@envoymesh/protocol";
import { createAuditEvent } from "@envoymesh/local-store";
import type { PersistedNodeConfig } from "./node-config-store.js";
import type { NodeService } from "@envoymesh/api";

/**
 * Compute a stable, short fingerprint of the fleet token. Stored in the
 * audit event `summary` so a human can correlate "did both sides use the
 * same token" without exposing the secret itself. We never store the raw
 * token in any audit field.
 */
export function fingerprintFleetToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url").slice(0, 12);
}

export interface LanAutoBondDeps {
  taskStore: LocalTaskStore;
  /** Pulled on every call so a config change (Settings → toggle) is honoured live. */
  loadConfig: () => Promise<PersistedNodeConfig | undefined>;
  /**
   * Sign + dispatch a `device.pair.request` envelope to the given peer. The
   * home node already has outbound envelope helpers, but they vary by mesh
   * version, so we inject the transport for testability.
   */
  sendPairRequest: (params: {
    toPeerId: string;
    payload: DevicePairRequestPayload;
  }) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Our own owner/device identity for the `requesterOwnerId` / `requesterDeviceId`
   * fields. Throws if the node isn't initialised yet.
   */
  getLocalIdentity: () => {
    ownerId: string;
    deviceId: string;
    devicePublicKeyPem: string;
  };
  /**
   * Owner profile reference. Used to check the recipient isn't `me` and to
   * pick a sensible display name when seeding the trust record.
   */
  getOwnOwnerId: () => string;
}

export interface LanAutoBondSendResult {
  ok: boolean;
  reason?:
    | "disabled"
    | "no-token"
    | "no-target"
    | "transport-failed"
    | "self-target";
  fingerprint?: string;
}

export interface LanAutoBondReceiveDecision {
  accept: boolean;
  reason:
    | "matched-fleet-token"
    | "no-token-on-envelope"
    | "no-local-token"
    | "disabled"
    | "token-mismatch"
    | "self-target";
  fingerprint?: string;
}

/**
 * Decide whether to send a `device.pair.request` to a freshly-discovered peer
 * and, if so, build the payload. We only send when:
 *  1. `lanAutoBondEnabled === true`
 *  2. `lanAutoBondFleetToken` is set
 *  3. The target isn't our own peer id
 * The caller is responsible for actually calling `sendPairRequest`.
 */
export async function buildLanAutoBondRequest(
  deps: LanAutoBondDeps,
  targetPeerId: string,
): Promise<{ ok: true; payload: DevicePairRequestPayload; fingerprint: string } | { ok: false; reason: LanAutoBondSendResult["reason"] }> {
  const cfg = await deps.loadConfig();
  if (!cfg?.lanAutoBondEnabled) return { ok: false, reason: "disabled" };
  const token = cfg.lanAutoBondFleetToken?.trim();
  if (!token) return { ok: false, reason: "no-token" };
  const ownOwner = deps.getOwnOwnerId();
  if (!targetPeerId) return { ok: false, reason: "self-target" };
  // Self-bond guard: targetPeerId is a libp2p transport ID — also compare
  // against our ownerId (human identity DID).  The receive side
  // (evaluateLanAutoBondReceipt) gets a second guard with requesterOwnerId.
  if (targetPeerId === ownOwner) return { ok: false, reason: "self-target" };

  const identity = deps.getLocalIdentity();
  const payload = createDevicePairRequestPayload({
    requesterOwnerId: identity.ownerId,
    requesterDeviceId: identity.deviceId,
    requesterDevicePublicKeyPem: identity.devicePublicKeyPem,
    note: "lan-auto-bond",
    lanFleetToken: token,
  });
  return { ok: true, payload, fingerprint: fingerprintFleetToken(token) };
}

/**
 * Send the actual pair-request envelope to a freshly-discovered peer.
 * Emits an audit event on both success and failure.
 */
export async function sendLanAutoBondRequest(
  deps: LanAutoBondDeps,
  targetPeerId: string,
  correlationId: string = randomUUID(),
): Promise<LanAutoBondSendResult> {
  const built = await buildLanAutoBondRequest(deps, targetPeerId);
  if (!built.ok) {
    return { ok: false, reason: built.reason };
  }
  let result: { ok: boolean; error?: string };
  try {
    result = await deps.sendPairRequest({ toPeerId: targetPeerId, payload: built.payload });
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  await deps.taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: "device.pair.request",
      messageId: built.payload.requestId,
      correlationId,
      remotePeerId: targetPeerId,
      direction: "outbound",
      verificationStatus: result.ok ? "verified" : "rejected",
      outcome: result.ok ? "allow" : "deny",
      summary: result.ok
        ? `lan-auto: sent pair-request (fleetTokenFingerprint=${built.fingerprint}) to ${targetPeerId}.`
        : `lan-auto: failed to send pair-request to ${targetPeerId} — ${result.error ?? "unknown error"}.`,
    }),
  );
  return { ok: result.ok, fingerprint: built.fingerprint };
}

/**
 * Evaluate an inbound `device.pair.request` envelope. Returns `accept: true`
 * only when the envelope carries a `lanFleetToken` that exactly matches
 * our own configured `lanAutoBondFleetToken` *and* the local feature is on.
 *
 * Auditing is performed by the caller (the dispatcher) — we keep this pure
 * so it's easy to unit-test.
 */
export async function evaluateLanAutoBondReceipt(
  deps: LanAutoBondDeps,
  envelope: { payload: unknown },
): Promise<LanAutoBondReceiveDecision> {
  let payload: DevicePairRequestPayload;
  try {
    payload = parseDevicePairRequestPayload(envelope.payload);
  } catch {
    return { accept: false, reason: "no-token-on-envelope" };
  }
  if (!payload.lanFleetToken) return { accept: false, reason: "no-token-on-envelope" };

  // Self-bond guard: reject pair-requests from our own owner identity.
  // This can happen via mDNS loopback or relay echo.
  const ownOwnerId = deps.getOwnOwnerId();
  if (payload.requesterOwnerId && payload.requesterOwnerId === ownOwnerId) {
    return { accept: false, reason: "self-target" };
  }

  const cfg = await deps.loadConfig();
  if (!cfg?.lanAutoBondEnabled) return { accept: false, reason: "disabled" };
  const own = cfg.lanAutoBondFleetToken?.trim();
  if (!own) return { accept: false, reason: "no-local-token" };
  if (own !== payload.lanFleetToken) {
    return { accept: false, reason: "token-mismatch", fingerprint: fingerprintFleetToken(payload.lanFleetToken) };
  }
  return { accept: true, reason: "matched-fleet-token", fingerprint: fingerprintFleetToken(own) };
}

/**
 * Apply an auto-bond decision: create a "direct" trust record for the
 * requester, register them in the peer directory, and emit an audit event.
 *
 * The trust record + peer directory stores are passed in `params` (rather
 * than via `deps`) so the helper stays decoupled from the dispatcher —
 * each call-site already has the right `LocalTrustStore` and
 * `LocalPeerDirectoryStore` references in scope. The peer-directory write
 * is best-effort: a failure is logged but does not abort the trust
 * record write, because the joiner will fill in their `peerId` /
 * `listenAddrs` on first inbound chat.
 */
export async function applyLanAutoBondAccept(
  deps: LanAutoBondDeps,
  params: {
    requesterOwnerId: string;
    requesterDeviceId: string;
    requesterPeerId: string;
    remoteAddr?: string;
    fingerprint: string;
    correlationId?: string;
    messageId: string;
    trustStore: {
      setTrustRecord: (input: {
        peerOwnerId: string;
        level: "direct" | "referred" | "public" | "blocked";
        displayName?: string;
        note?: string;
        now?: string;
      }) => Promise<unknown>;
    };
    peerDirectory: {
      ensurePeerFromInboundChat: (input: {
        ownerId: string;
        peerId: string;
        listenAddrs: string[];
      }) => Promise<unknown>;
    };
  },
): Promise<void> {
  await params.trustStore.setTrustRecord({
    peerOwnerId: params.requesterOwnerId,
    level: "direct",
    displayName: "Fleet peer",
    note: "lan-auto-bond",
  });
  try {
    await params.peerDirectory.ensurePeerFromInboundChat({
      ownerId: params.requesterOwnerId,
      peerId: params.requesterPeerId,
      listenAddrs: params.remoteAddr?.trim() ? [params.remoteAddr.trim()] : [],
    });
  } catch (err) {
    // Non-fatal: the joiner will fill this in on first contact.
    await deps.taskStore.appendAuditEvent(
      createAuditEvent({
        type: "agent.card.auto_fetch_failed",
        intent: "device.pair.request",
        outcome: "record",
        summary: `lan-auto: peer directory pre-fill failed for ${params.requesterOwnerId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        correlationId: params.correlationId,
        remotePeerId: params.requesterPeerId,
      }),
    );
  }
  await deps.taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.verified",
      intent: "device.pair.request",
      messageId: params.messageId,
      correlationId: params.correlationId,
      remotePeerId: params.requesterPeerId,
      direction: "inbound",
      verificationStatus: "verified",
      outcome: "allow",
      summary: `lan-auto: auto-bonded with ${params.requesterOwnerId} (fleetTokenFingerprint=${params.fingerprint}).`,
    }),
  );
}

/** Re-export the NodeService type for convenience to callers wiring this up. */
export type { NodeService };
