/**
 * pairDevice runtime (Step 23).
 *
 * Extracted from `node-service-impl.ts`. Handles QR-token based pairing
 * of a companion device (mobile app) to the home node. Returns a
 * persistent session token.
 */
import { derivePeerId } from "@envoymesh/identity";
import { randomUUID } from "node:crypto";
import type {
  PairDeviceParams,
  PairDeviceResult,
} from "@envoymesh/api";

export interface PairDeviceContext {
  /** Validate the QR-pairing or company-invite token. */
  validatePairingToken(token: string): Promise<boolean>;
  /** Atomically consume the company-invite token (Phase 35A replay guard). */
  consumeCompanyInvite(
    token: string,
    requesterOwnerId: string,
    requesterDeviceId: string,
  ): Promise<void>;
  /** Trust store — set a trust record at "direct" level. */
  setTrustRecordDirect(record: {
    peerOwnerId: string;
    displayName: string;
    note: string;
    now: string;
  }): Promise<void>;
  /** Peer directory — merge inbound device binding. */
  mergeInboundDeviceBinding(input: {
    ownerId: string;
    peerId: string;
    devicePublicKeyPem: string;
  }): Promise<void>;
  /** Session token store (or null if not initialised). */
  getSessionTokenStore(): {
    setToken(record: {
      token: string;
      ownerId: string;
      deviceId: string;
      displayName: string;
      createdAt: string;
      lastUsedAt: string;
    }): Promise<void>;
  } | null;
  /** Get current bridge status. */
  getBridgeStatus(): Promise<{
    enabled: boolean;
    agentPeerId?: string;
    agentPublicKeyPem?: string;
    agentName?: string;
  }>;
}

export async function pairDeviceViaRuntime(
  ctx: PairDeviceContext,
  params: PairDeviceParams,
): Promise<PairDeviceResult> {
  const {
    requesterOwnerId,
    requesterDeviceId,
    requesterDevicePublicKeyPem,
    pairingToken,
  } = params;

  if (
    !requesterOwnerId ||
    !requesterDeviceId ||
    !requesterDevicePublicKeyPem ||
    !pairingToken
  ) {
    throw new Error("Missing required pairDevice params");
  }

  // Validate the QR pairing token (or a company-invite token — Phase 35A).
  const valid = await ctx.validatePairingToken(pairingToken);
  if (!valid) {
    throw new Error("Invalid or expired pairing token");
  }

  // Phase 35A: atomically consume a company-invite token (replay guard).
  await ctx.consumeCompanyInvite(
    pairingToken,
    requesterOwnerId,
    requesterDeviceId,
  );

  // Derive the requester's envelope peer id (for device binding) — not a libp2p dial target.
  const envelopePeerId = derivePeerId(requesterDevicePublicKeyPem);

  // Create trust record at "direct" level.
  await ctx.setTrustRecordDirect({
    peerOwnerId: requesterOwnerId,
    level: "direct",
    displayName: "Companion",
    note: "pairDevice",
    now: new Date().toISOString(),
  } as never);

  // Bind device key for envelope addressing.
  await ctx.mergeInboundDeviceBinding({
    ownerId: requesterOwnerId,
    peerId: envelopePeerId,
    devicePublicKeyPem: requesterDevicePublicKeyPem,
  }).catch(() => undefined);

  // Generate persistent session token.
  const sessionToken = randomUUID();
  const now = new Date().toISOString();
  const store = ctx.getSessionTokenStore();
  if (store) {
    await store.setToken({
      token: sessionToken,
      ownerId: requesterOwnerId,
      deviceId: requesterDeviceId,
      displayName: "Companion",
      createdAt: now,
      lastUsedAt: now,
    });
  }

  const bridgeStatus = await ctx.getBridgeStatus();
  const result: PairDeviceResult = { sessionToken };
  if (bridgeStatus.enabled) {
    result.agentPeerId = bridgeStatus.agentPeerId;
    if (bridgeStatus.agentPublicKeyPem) {
      result.agentPubKey = bridgeStatus.agentPublicKeyPem;
    }
    if (bridgeStatus.agentName?.trim()) {
      result.agentName = bridgeStatus.agentName.trim();
    }
  }

  return result;
}