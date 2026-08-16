/**
 * LAN auto-bond runtime — Phase 35C (Fleet Onboarding C: LAN Auto-Bond).
 *
 * Two home nodes on the same LAN advertise themselves over mDNS. When both
 * nodes have `lanAutoBondEnabled === true`, they exchange a `device.pair.request`
 * with `note: "lan-auto-bond"` and auto-accept **without** an approval prompt when either:
 *   - both carry a matching fleet-token **HMAC proof** (recommended → `direct` trust), or
 *   - both have **no** token (open LAN → `referred` trust only; trusted Wi‑Fi only).
 *
 * The raw fleet token is **never** placed on the wire. Peers send
 * `lanFleetTokenProof = HMAC-SHA256(token, binding)` bound to requester identity
 * + requestId so a sniffed proof cannot be reused by another peer.
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

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { LocalTaskStore } from "@envoymesh/local-store";
import { createDevicePairRequestPayload, parseDevicePairRequestPayload, type DevicePairRequestPayload } from "@envoymesh/protocol";
import { createAuditEvent } from "@envoymesh/local-store";
import { derivePeerId } from "@envoymesh/identity";
import type { PersistedNodeConfig } from "./node-config-store.js";
import { anLog, anWarn, shortId } from "./agent-network-debug.js";

/** Audit fingerprint when both sides auto-bond with no fleet token. */
export const OPEN_LAN_FINGERPRINT = "open-lan";

/** Pair-request `note` that marks an outbound as LAN auto-bond (not QR/companion). */
export const LAN_AUTO_BOND_NOTE = "lan-auto-bond";

const FLEET_PROOF_PREFIX = "v1.";

/** Compute a stable, short fingerprint of the fleet token for audit only. */
export function fingerprintFleetToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url").slice(0, 12);
}

export function lanFleetProofBinding(input: {
  requesterOwnerId: string;
  requesterDeviceId: string;
  requestId: string;
}): string {
  return `envoy-lan-fleet-v1|${input.requesterOwnerId}|${input.requesterDeviceId}|${input.requestId}`;
}

/** HMAC proof of possession — never send the raw token on the wire. */
export function createLanFleetTokenProof(
  token: string,
  binding: { requesterOwnerId: string; requesterDeviceId: string; requestId: string },
): string {
  const mac = createHmac("sha256", token)
    .update(lanFleetProofBinding(binding))
    .digest("base64url");
  return `${FLEET_PROOF_PREFIX}${mac}`;
}

export function timingSafeEqualUtf8(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyLanFleetTokenProof(
  token: string,
  proof: string,
  binding: { requesterOwnerId: string; requesterDeviceId: string; requestId: string },
): boolean {
  const expected = createLanFleetTokenProof(token, binding);
  return timingSafeEqualUtf8(expected, proof.trim());
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
   * Agent Network as a worker. Called only after a **tokened** fleet bond when
   * `lanAutoBondAutoJoinAgentNetwork` is not false. Optional — if not
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
  /** Trust tier to write on accept. */
  bondLevel?: "direct" | "referred";
}

/**
 * Decide whether to send a `device.pair.request` to a freshly-discovered peer
 * and, if so, build the payload. We only send when:
 *  1. `lanAutoBondEnabled === true`
 *  2. The target isn't our own peer id
 * Token is optional: present → gated fleet (HMAC proof on wire); absent → open LAN.
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
  const requestId = `pair_req_${randomUUID()}`;
  const proof = token
    ? createLanFleetTokenProof(token, {
        requesterOwnerId: identity.ownerId,
        requesterDeviceId: identity.deviceId,
        requestId,
      })
    : undefined;
  const payload = createDevicePairRequestPayload({
    requestId,
    requesterOwnerId: identity.ownerId,
    requesterDeviceId: identity.deviceId,
    requesterDevicePublicKeyPem: identity.devicePublicKeyPem,
    note: LAN_AUTO_BOND_NOTE,
    // Never put the raw fleet token on the wire.
    ...(proof ? { lanFleetTokenProof: proof } : {}),
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
 *   - remote proof (or legacy plaintext token) matches local fleet token → direct, or
 *   - the envelope is a lan-auto-bond note with no proof/token and local has no token
 *     (open LAN → referred).
 *
 * Ordinary pair requests (QR / companion) without the lan-auto note and
 * without a fleet proof/token stay `no-token-on-envelope` so the normal approval
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

  const remoteProof = payload.lanFleetTokenProof?.trim() ?? "";
  const remoteLegacyToken = payload.lanFleetToken?.trim() ?? "";
  const hasFleetCredential = Boolean(remoteProof || remoteLegacyToken);
  const isLanAutoNote = payload.note === LAN_AUTO_BOND_NOTE;

  if (!hasFleetCredential && !isLanAutoNote) {
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
      hadRemoteCredential: hasFleetCredential,
    });
    return { accept: false, reason: "disabled" };
  }
  const own = cfg.lanAutoBondFleetToken?.trim() ?? "";

  // Open LAN: both sides enabled with no token / no proof.
  if (!hasFleetCredential && !own) {
    const decision = {
      accept: true as const,
      reason: "matched-open-lan" as const,
      fingerprint: OPEN_LAN_FINGERPRINT,
      bondLevel: "referred" as const,
    };
    anLog("lan-auto-bond", "receive accept (open LAN → referred)", {
      fingerprint: decision.fingerprint,
      from: shortId(payload.requesterOwnerId),
    });
    return decision;
  }

  // Remote open, local tokened — do not dilute a gated fleet.
  if (!hasFleetCredential && own) {
    anWarn("lan-auto-bond", "receive reject — open peer vs local token", {
      reason: "open-mode-mismatch",
      from: shortId(payload.requesterOwnerId),
    });
    return { accept: false, reason: "open-mode-mismatch" };
  }

  // Remote credentialed, local open — require them to clear/match first.
  if (hasFleetCredential && !own) {
    anWarn("lan-auto-bond", "receive reject — fleet credential present but no local token", {
      reason: "no-local-token",
      from: shortId(payload.requesterOwnerId),
    });
    return { accept: false, reason: "no-local-token" };
  }

  const binding = {
    requesterOwnerId: payload.requesterOwnerId,
    requesterDeviceId: payload.requesterDeviceId,
    requestId: payload.requestId,
  };
  let matched = false;
  if (remoteProof) {
    matched = verifyLanFleetTokenProof(own, remoteProof, binding);
  } else if (remoteLegacyToken) {
    // Legacy peers still send plaintext — accept for interop, never echo it.
    matched = timingSafeEqualUtf8(own, remoteLegacyToken);
  }

  if (!matched) {
    const fp = remoteLegacyToken
      ? fingerprintFleetToken(remoteLegacyToken)
      : fingerprintFleetToken(own);
    anWarn("lan-auto-bond", "receive reject — token mismatch", {
      reason: "token-mismatch",
      fingerprint: fp,
      from: shortId(payload.requesterOwnerId),
      usedProof: Boolean(remoteProof),
    });
    return { accept: false, reason: "token-mismatch", fingerprint: fp };
  }
  const decision = {
    accept: true as const,
    reason: "matched-fleet-token" as const,
    fingerprint: fingerprintFleetToken(own),
    bondLevel: "direct" as const,
  };
  anLog("lan-auto-bond", "receive accept (tokened → direct)", {
    fingerprint: decision.fingerprint,
    from: shortId(payload.requesterOwnerId),
    usedProof: Boolean(remoteProof),
  });
  return decision;
}

/**
 * Apply an auto-bond decision: create a trust record for the
 * requester, register them in the peer directory, and emit an audit event.
 *
 * Tokened fleet bonds → `direct`. Open LAN → `referred` (lower sensitivity).
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
    bondLevel?: "direct" | "referred";
    /** When true, may auto-join Agent Network (tokened bonds only). */
    allowAutoJoinAgentNetwork?: boolean;
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
  const bondLevel = params.bondLevel ?? "direct";
  anLog("lan-auto-bond", "apply accept — writing trust", {
    peer: shortId(params.requesterOwnerId),
    fingerprint: params.fingerprint,
    bondLevel,
  });
  await params.trustStore.setTrustRecord({
    peerOwnerId: params.requesterOwnerId,
    level: bondLevel,
    displayName: bondLevel === "direct" ? "Fleet peer" : "LAN peer",
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
      summary: `lan-auto: auto-bonded (${bondLevel}) with ${params.requesterOwnerId} (fleetTokenFingerprint=${params.fingerprint}).`,
    }),
  );

  // Auto-join Agent Network only for tokened fleet bonds — open LAN must not
  // silently recruit workers on a shared Wi‑Fi.
  if (deps.enableCapabilityProvider && params.allowAutoJoinAgentNetwork === true) {
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
        anWarn("lan-auto-bond", "auto-join Agent Network failed", {
          peer: shortId(params.requesterOwnerId),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      anLog("lan-auto-bond", "skip auto-join", {
        autoJoin,
        alreadyOn,
        peer: shortId(params.requesterOwnerId),
      });
    }
  } else if (!params.allowAutoJoinAgentNetwork) {
    anLog("lan-auto-bond", "skip auto-join — open LAN or not allowed", {
      peer: shortId(params.requesterOwnerId),
    });
  } else {
    anLog("lan-auto-bond", "skip auto-join — no enableCapabilityProvider hook");
  }
}

export type LanAutoBondInboundHandleResult =
  | {
      outcome: "accepted";
      payload: DevicePairRequestPayload;
      fingerprint: string;
      bondLevel: "direct" | "referred";
    }
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
    bondLevel: "direct" | "referred";
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
  const bondLevel = decision.bondLevel ?? "referred";
  const allowAutoJoin = decision.reason === "matched-fleet-token";
  anLog("lan-auto-bond", "accept path", {
    from: shortId(payload.requesterOwnerId),
    fingerprint,
    bondLevel,
    allowAutoJoin,
  });
  await applyLanAutoBondAccept(input.deps, {
    requesterOwnerId: payload.requesterOwnerId,
    requesterDeviceId: payload.requesterDeviceId,
    requesterPeerId: input.remotePeerId,
    remoteAddr: input.remoteAddr,
    fingerprint,
    correlationId: input.envelope.correlationId,
    messageId: input.envelope.messageId,
    bondLevel,
    allowAutoJoinAgentNetwork: allowAutoJoin,
    trustStore: input.trustStore,
    peerDirectory: input.peerDirectory,
  });
  await input.onAccepted?.({ payload, fingerprint, bondLevel });
  return { outcome: "accepted", payload, fingerprint, bondLevel };
}
