/**
 * pairSharedIdentity runtime (Step 24).
 *
 * Extracted from `node-service-impl.ts`. Handles shared-identity
 * pairing (Phase 11): signs a DeviceCertificate, ECDH-encrypts the
 * owner private key for the mobile device, and returns the
 * bundle for the mobile to decrypt locally.
 */
import { derivePeerId } from "@envoymesh/identity";
import { randomUUID } from "node:crypto";
import type {
  PairSharedIdentityParams,
  PairSharedIdentityResult,
} from "@envoymesh/api";

export interface PairSharedIdentityContext {
  /** Get the local profile (throws if not initialised). */
  requireProfile(): {
    owner: {
      ownerId: string;
      publicKeyPem: string;
      privateKeyPem: string;
    };
  };
  /** Validate the QR pairing token. */
  validatePairingToken(token: string): Promise<boolean>;
  /** Atomically consume a company-invite token (Phase 35A replay guard). */
  consumeCompanyInvite(
    token: string,
    requesterOwnerId: string,
    requesterDeviceId: string,
  ): Promise<void>;
  /** Trust store — set a trust record at "direct" level. */
  setTrustRecordDirect(record: unknown): Promise<unknown>;
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
  /** Device authorization store (or null if not initialised). */
  getDeviceAuthorizationStore(): {
    registerAuthorizedDevice(record: {
      deviceId: string;
      devicePublicKeyPem: string;
      certificateId: string;
      deviceProfile: string;
      displayName: string;
      pairedAt: string;
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

interface OwnerEncryptedKey {
  encryptedKey: string;
  ephemeralPublicKey: string;
  iv: string;
  authTag: string;
}

export async function pairSharedIdentityViaRuntime(
  ctx: PairSharedIdentityContext,
  signDeviceCert: (input: unknown) => unknown,
  encryptOwnerKey: (
    ownerPrivateKeyPem: string,
    peerPubKeyBytes: Uint8Array,
  ) => Promise<OwnerEncryptedKey>,
  params: PairSharedIdentityParams,
): Promise<PairSharedIdentityResult> {
  const {
    requesterOwnerId,
    requesterDeviceId,
    requesterDevicePublicKeyPem,
    keyExchangePublicKey,
    pairingToken,
  } = params;

  if (
    !requesterOwnerId ||
    !requesterDeviceId ||
    !requesterDevicePublicKeyPem ||
    !keyExchangePublicKey ||
    !pairingToken
  ) {
    throw new Error("Missing required pairSharedIdentity params");
  }

  // Verify the ownerId matches — shared identity means the mobile claims the same owner.
  const profile = ctx.requireProfile();
  if (requesterOwnerId !== profile.owner.ownerId) {
    throw new Error(
      `ownerId mismatch — expected ${profile.owner.ownerId}, got ${requesterOwnerId}`,
    );
  }

  // Validate the QR pairing token.
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

  // Sign a device certificate authorizing this mobile device.
  const deviceCert = signDeviceCert({
    owner: {
      ownerId: profile.owner.ownerId,
      publicKeyPem: profile.owner.publicKeyPem,
      privateKeyPem: profile.owner.privateKeyPem,
    },
    device: {
      deviceId: requesterDeviceId,
      publicKeyPem: requesterDevicePublicKeyPem,
      privateKeyPem: "",
    },
    deviceProfile: "satellite",
    capabilities: ["mesh.listen", "message.send", "device.sync"],
  });

  // ECDH-encrypt the owner private key for the mobile device.
  const keyExchangePubKeyBytes = Buffer.from(keyExchangePublicKey, "base64url");
  const encrypted = await encryptOwnerKey(
    profile.owner.privateKeyPem,
    keyExchangePubKeyBytes,
  );

  // Create trust record at "direct" level (same as pairDevice).
  await ctx.setTrustRecordDirect({
    peerOwnerId: requesterOwnerId,
    level: "direct",
    displayName: "Mobile (shared identity)",
    note: "pairSharedIdentity",
    now: new Date().toISOString(),
  });

  // Bind device key only.
  await ctx.mergeInboundDeviceBinding({
    ownerId: requesterOwnerId,
    peerId: derivePeerId(requesterDevicePublicKeyPem),
    devicePublicKeyPem: requesterDevicePublicKeyPem,
  }).catch(() => undefined);

  // Generate persistent session token.
  const sessionToken = randomUUID();
  const now = new Date().toISOString();
  const tokenStore = ctx.getSessionTokenStore();
  if (tokenStore) {
    await tokenStore.setToken({
      token: sessionToken,
      ownerId: requesterOwnerId,
      deviceId: requesterDeviceId,
      displayName: "Mobile (shared identity)",
      createdAt: now,
      lastUsedAt: now,
    });
  }

  // Register the authorized device.
  const authz = ctx.getDeviceAuthorizationStore();
  if (authz) {
    await authz.registerAuthorizedDevice({
      deviceId: requesterDeviceId,
      devicePublicKeyPem: requesterDevicePublicKeyPem,
      certificateId: (deviceCert as { certificateId: string }).certificateId,
      deviceProfile: "satellite",
      displayName: "Mobile (shared identity)",
      pairedAt: now,
    });
  }

  const bridgeStatus = await ctx.getBridgeStatus();
  const result: PairSharedIdentityResult = {
    sessionToken,
    deviceCertificate: deviceCert as Record<string, unknown>,
    encryptedOwnerKey: encrypted.encryptedKey,
    ephemeralPublicKey: encrypted.ephemeralPublicKey,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    ownerPublicKey: profile.owner.publicKeyPem,
    ownerId: profile.owner.ownerId,
  } as unknown as PairSharedIdentityResult;
  if (bridgeStatus.enabled) {
    (result as { agentPeerId?: string }).agentPeerId =
      bridgeStatus.agentPeerId;
    if (bridgeStatus.agentPublicKeyPem) {
      (result as { agentPubKey?: string }).agentPubKey =
        bridgeStatus.agentPublicKeyPem;
    }
    if (bridgeStatus.agentName?.trim()) {
      (result as { agentName?: string }).agentName =
        bridgeStatus.agentName.trim();
    }
  }
  return result;
}