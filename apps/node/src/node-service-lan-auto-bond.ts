/**
 * LAN auto-bond runtime — Phase 35C (Fleet Onboarding C: LAN Auto-Bond).
 *
 * Two home nodes on the same LAN advertise themselves over mDNS. When both
 * nodes have `lanAutoBondEnabled === true`, they exchange a `device.pair.request`
 * with `note: "lan-auto-bond"` and auto-accept as "direct" trust **without**
 * an approval prompt when either:
 *   - both carry the same non-empty `lanAutoBondFleetToken` (recommended), or
 *   - both have **no** token (open LAN — any peer on the subnet that also
 *     enabled Office LAN / LAN auto-bond will bond; use only on trusted Wi‑Fi).
 *
 * Mixed modes do not bond: a tokened node will not open-bond with a
 * tokenless peer (and vice versa). Wrong tokens are a silent mismatch.
 *
 * This is **opt-in, disabled by default** — see `createDefaultPersistedNodeConfig`
 * for the default `lanAutoBondEnabled` value of `false`.
 *
 * Auditing: every auto-bond is logged with `summary` containing the source
 * `lan-auto` and the trust level. The fleet token itself is never written
 * to the audit log or any peer-visible field. Open-mode bonds use fingerprint
 * {@link OPEN_LAN_FINGERPRINT}.
 */

import { createHash, randomUUID } from "node:crypto";
import type { LocalTaskStore } from "@envoymesh/local-store";
import { createDevicePairRequestPayload, parseDevicePairRequestPayload, type DevicePairRequestPayload } from "@envoymesh/protocol";
import { createAuditEvent } from "@envoymesh/local-store";
import { derivePeerId } from "@envoymesh/identity";
import type { PersistedNodeConfig } from "./node-config-store.js";
import type { NodeService } from "@envoymesh/api";
import { anLog, anWarn, shortId } from "./agent-network-debug.js";

/** Audit fingerprint when both sides auto-bond with no fleet token. */
export const OPEN_LAN_FINGERPRINT = "open-lan";

/** Pair-request `note` that marks an outbound as LAN auto-bond (not QR/companion). */
export const LAN_AUTO_BOND_NOTE = "lan-auto-bond";

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
  /**
   * Auto-enable `capabilityProviderEnabled` on this node so it joins the
   * Agent Network as a worker. Called when `lanAutoBondAutoJoinAgentNetwork`
   * is not false and the node hasn't already opted in. Optional — if not
   * provided, the auto-join is skipped (useful for tests).
   */
  enableCapabilityProvider?: () => Promise<void>;
}

export interface LanAutoBondSendResult {
  ok: boolean;
  reason?:
    | "disabled"
    | "no-target"
    | "transport-failed"
    | "self-target";
  fingerprint?: string;
}

export interface LanAutoBondReceiveDecision {
  accept: boolean;
  reason:
    | "matched-fleet-token"
    | "matched-open-lan"
    | "no-token-on-envelope"
    | "no-local-token"
    | "disabled"
    | "token-mismatch"
    | "open-mode-mismatch"
    | "self-target";
  fingerprint?: string;
}

/**
 * Decide whether to send a `device.pair.request` to a freshly-discovered peer
 * and, if so, build the payload. We only send when:
 *  1. `lanAutoBondEnabled === true`
 *  2. The target isn't our own peer id
 * Token is optional: present → gated fleet; absent → open LAN mode.
 * The caller is responsible for actually calling `sendPairRequest`.
 */
export async function buildLanAutoBondRequest(
  deps: LanAutoBondDeps,
  targetPeerId: string,
): Promise<{ ok: true; payload: DevicePairRequestPayload; fingerprint: string } | { ok: false; reason: LanAutoBondSendResult["reason"] }> {
  const cfg = await deps.loadConfig();
  if (!cfg?.lanAutoBondEnabled) return { ok: false, reason: "disabled" };
  const token = cfg.lanAutoBondFleetToken?.trim() ?? "";
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
    note: LAN_AUTO_BOND_NOTE,
    ...(token ? { lanFleetToken: token } : {}),
  });
  return {
    ok: true,
    payload,
    fingerprint: token ? fingerprintFleetToken(token) : OPEN_LAN_FINGERPRINT,
  };
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
    anLog("lan-auto-bond", "send skipped", {
      reason: built.reason,
      target: shortId(targetPeerId),
    });
    return { ok: false, reason: built.reason };
  }
  let result: { ok: boolean; error?: string };
  try {
    result = await deps.sendPairRequest({ toPeerId: targetPeerId, payload: built.payload });
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  anLog("lan-auto-bond", result.ok ? "pair-request sent" : "pair-request send failed", {
    target: shortId(targetPeerId),
    fingerprint: built.fingerprint,
    error: result.error,
  });
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
 * when LAN auto-bond is on and either:
 *   - both sides share the same non-empty fleet token, or
 *   - the envelope is a lan-auto-bond note with no token and local has no token
 *     (open LAN).
 *
 * Ordinary pair requests (QR / companion) without the lan-auto note and
 * without a fleet token stay `no-token-on-envelope` so the normal approval
 * path can handle them.
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
    // Ordinary pair requests without a fleet token are common (QR / companion).
    // Stay silent — not a LAN auto-bond event.
    return { accept: false, reason: "no-token-on-envelope" };
  }

  const remoteToken = payload.lanFleetToken?.trim() ?? "";
  const isLanAutoNote = payload.note === LAN_AUTO_BOND_NOTE;

  if (!remoteToken && !isLanAutoNote) {
    return { accept: false, reason: "no-token-on-envelope" };
  }

  // Self-bond guard: reject pair-requests from our own owner identity.
  // This can happen via mDNS loopback or relay echo.
  const ownOwnerId = deps.getOwnOwnerId();
  if (payload.requesterOwnerId && payload.requesterOwnerId === ownOwnerId) {
    anLog("lan-auto-bond", "receive reject", { reason: "self-target" });
    return { accept: false, reason: "self-target" };
  }

  const cfg = await deps.loadConfig();
  if (!cfg?.lanAutoBondEnabled) {
    anWarn("lan-auto-bond", "receive reject — LAN auto-bond off", {
      reason: "disabled",
      from: shortId(payload.requesterOwnerId),
      hadRemoteToken: Boolean(remoteToken),
    });
    return { accept: false, reason: "disabled" };
  }
  const own = cfg.lanAutoBondFleetToken?.trim() ?? "";

  // Open LAN: both sides enabled with no token.
  if (!remoteToken && !own) {
    const decision = {
      accept: true as const,
      reason: "matched-open-lan" as const,
      fingerprint: OPEN_LAN_FINGERPRINT,
    };
    anLog("lan-auto-bond", "receive accept (open LAN)", {
      fingerprint: decision.fingerprint,
      from: shortId(payload.requesterOwnerId),
    });
    return decision;
  }

  // Remote open, local tokened — do not dilute a gated fleet.
  if (!remoteToken && own) {
    anWarn("lan-auto-bond", "receive reject — open peer vs local token", {
      reason: "open-mode-mismatch",
      from: shortId(payload.requesterOwnerId),
    });
    return { accept: false, reason: "open-mode-mismatch" };
  }

  // Remote tokened, local open — require them to clear/match first.
  if (remoteToken && !own) {
    anWarn("lan-auto-bond", "receive reject — fleet token present but no local token", {
      reason: "no-local-token",
      from: shortId(payload.requesterOwnerId),
    });
    return { accept: false, reason: "no-local-token" };
  }

  if (own !== remoteToken) {
    const fp = fingerprintFleetToken(remoteToken);
    anWarn("lan-auto-bond", "receive reject — token mismatch", {
      reason: "token-mismatch",
      fingerprint: fp,
      from: shortId(payload.requesterOwnerId),
    });
    return { accept: false, reason: "token-mismatch", fingerprint: fp };
  }
  const decision = {
    accept: true as const,
    reason: "matched-fleet-token" as const,
    fingerprint: fingerprintFleetToken(own),
  };
  anLog("lan-auto-bond", "receive accept", {
    fingerprint: decision.fingerprint,
    from: shortId(payload.requesterOwnerId),
  });
  return decision;
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
  anLog("lan-auto-bond", "apply accept — writing direct trust", {
    peer: shortId(params.requesterOwnerId),
    fingerprint: params.fingerprint,
  });
  await params.trustStore.setTrustRecord({
    peerOwnerId: params.requesterOwnerId,
    level: "direct",
    displayName: "Fleet peer",
    note: LAN_AUTO_BOND_NOTE,
  });
  try {
    await params.peerDirectory.ensurePeerFromInboundChat({
      ownerId: params.requesterOwnerId,
      peerId: params.requesterPeerId,
      listenAddrs: params.remoteAddr?.trim() ? [params.remoteAddr.trim()] : [],
    });
  } catch (err) {
    // Non-fatal: the joiner will fill this in on first contact.
    anWarn("lan-auto-bond", "peer directory pre-fill failed", {
      peer: shortId(params.requesterOwnerId),
      error: err instanceof Error ? err.message : String(err),
    });
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

  // Auto-join Agent Network: when the node accepted a fleet-token bond and
  // `lanAutoBondAutoJoinAgentNetwork` is not explicitly false, auto-enable
  // `capabilityProviderEnabled` so this node participates as a chain worker
  // without a manual toggle. This is the "fleet onboarding = one-click agent
  // network" behavior the Office LAN preset relies on.
  if (deps.enableCapabilityProvider) {
    const cfg = await deps.loadConfig();
    const autoJoin = cfg?.lanAutoBondAutoJoinAgentNetwork !== false;
    const alreadyOn = cfg?.capabilityProviderEnabled === true;
    if (autoJoin && !alreadyOn) {
      try {
        anLog("lan-auto-bond", "auto-join Agent Network after fleet bond", {
          peer: shortId(params.requesterOwnerId),
        });
        await deps.enableCapabilityProvider();
        await deps.taskStore.appendAuditEvent(
          createAuditEvent({
            type: "agent.card.auto_fetched",
            intent: "device.pair.request",
            outcome: "record",
            summary: `lan-auto: auto-enabled Agent Network (capabilityProvider) after fleet bond with ${params.requesterOwnerId}.`,
            correlationId: params.correlationId,
            remotePeerId: params.requesterPeerId,
          }),
        );
      } catch (err) {
        // Non-fatal: the bond succeeded; only the auto-join failed. The
        // owner can still enable it manually in Team jobs → Worker profile.
        anWarn("lan-auto-bond", "auto-join Agent Network failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        await deps.taskStore.appendAuditEvent(
          createAuditEvent({
            type: "agent.card.auto_fetch_failed",
            intent: "device.pair.request",
            outcome: "record",
            summary: `lan-auto: auto-join Agent Network failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
            correlationId: params.correlationId,
            remotePeerId: params.requesterPeerId,
          }),
        );
      }
    } else {
      anLog("lan-auto-bond", "skip auto-join", {
        autoJoin,
        alreadyOn,
        hasHook: true,
      });
    }
  } else {
    anLog("lan-auto-bond", "skip auto-join — no enableCapabilityProvider hook");
  }
}

export type LanAutoBondInboundHandleResult =
  | { outcome: "accepted"; payload: DevicePairRequestPayload; fingerprint: string }
  | {
      outcome: "declined";
      reason: Exclude<
        LanAutoBondReceiveDecision["reason"],
        "no-token-on-envelope" | "matched-fleet-token" | "matched-open-lan"
      >;
      fingerprint?: string;
      payload: DevicePairRequestPayload;
    }
  | { outcome: "not-applicable" }
  | { outcome: "sender-mismatch"; payload: DevicePairRequestPayload };

/**
 * Shared production path for inbound `device.pair.request` LAN auto-bond.
 * Used by the daemon (`index.ts`) and Phase13 E2E so accept / auto-join /
 * audit behavior cannot drift.
 *
 * Verifies `envelope.senderPeerId` matches `requesterDevicePublicKeyPem` when
 * `senderPeerId` is provided on the envelope.
 */
export async function handleLanAutoBondInbound(input: {
  deps: LanAutoBondDeps;
  envelope: {
    payload: unknown;
    messageId: string;
    correlationId?: string;
    senderPeerId?: string;
  };
  remotePeerId: string;
  remoteAddr?: string;
  trustStore: Parameters<typeof applyLanAutoBondAccept>[1]["trustStore"];
  peerDirectory: Parameters<typeof applyLanAutoBondAccept>[1]["peerDirectory"];
  /** After trust write — emit UI events, refresh workers, etc. */
  onAccepted?: (info: {
    payload: DevicePairRequestPayload;
    fingerprint: string;
  }) => void | Promise<void>;
}): Promise<LanAutoBondInboundHandleResult> {
  let payload: DevicePairRequestPayload;
  try {
    payload = parseDevicePairRequestPayload(input.envelope.payload);
  } catch {
    return { outcome: "not-applicable" };
  }

  if (input.envelope.senderPeerId) {
    const expectedRequester = derivePeerId(payload.requesterDevicePublicKeyPem);
    if (expectedRequester !== input.envelope.senderPeerId) {
      return { outcome: "sender-mismatch", payload };
    }
  }

  const decision = await evaluateLanAutoBondReceipt(input.deps, input.envelope);
  if (decision.reason === "no-token-on-envelope") {
    return { outcome: "not-applicable" };
  }

  if (!decision.accept) {
    return {
      outcome: "declined",
      reason: decision.reason as Exclude<
        LanAutoBondReceiveDecision["reason"],
        "no-token-on-envelope" | "matched-fleet-token" | "matched-open-lan"
      >,
      fingerprint: decision.fingerprint,
      payload,
    };
  }

  const fingerprint = decision.fingerprint ?? "";
  anLog("lan-auto-bond", "accept path", {
    from: shortId(payload.requesterOwnerId),
    fingerprint,
  });
  await applyLanAutoBondAccept(input.deps, {
    requesterOwnerId: payload.requesterOwnerId,
    requesterDeviceId: payload.requesterDeviceId,
    requesterPeerId: input.remotePeerId,
    remoteAddr: input.remoteAddr,
    fingerprint,
    correlationId: input.envelope.correlationId,
    messageId: input.envelope.messageId,
    trustStore: input.trustStore,
    peerDirectory: input.peerDirectory,
  });
  if (input.onAccepted) {
    await input.onAccepted({ payload, fingerprint });
  }
  return { outcome: "accepted", payload, fingerprint };
}

/** Re-export the NodeService type for convenience to callers wiring this up. */
export type { NodeService };
