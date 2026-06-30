/**
 * Tests for pairSharedIdentity runtime.
 */
import { describe, expect, it, vi } from "vitest";

import {
  pairSharedIdentityViaRuntime,
  type PairSharedIdentityContext,
} from "../src/node-service-handlers-pair-shared-identity.js";

function makeCtx(
  overrides: Partial<PairSharedIdentityContext> = {},
): { ctx: PairSharedIdentityContext; spies: Record<string, ReturnType<typeof vi.fn>> } {
  const spies: Record<string, ReturnType<typeof vi.fn>> = {
    validatePairingToken: vi.fn(async () => true),
    consumeCompanyInvite: vi.fn(async () => undefined),
    setTrustRecordDirect: vi.fn(async () => undefined),
    mergeInboundDeviceBinding: vi.fn(async () => undefined),
    getSessionTokenStore: vi.fn(() => null),
    getDeviceAuthorizationStore: vi.fn(() => null),
    getBridgeStatus: vi.fn(async () => ({ enabled: false })),
  };
  const ctx: PairSharedIdentityContext = {
    requireProfile: () => ({
      owner: {
        ownerId: "owner-1",
        publicKeyPem:
          "-----BEGIN PUBLIC KEY-----\nPK\n-----END PUBLIC KEY-----",
        privateKeyPem:
          "-----BEGIN PRIVATE KEY-----\nPRIV\n-----END PRIVATE KEY-----",
      },
    }) as never,
    ...spies,
    ...overrides,
  } as never;
  return { ctx, spies };
}

const validParams = {
  requesterOwnerId: "owner-1",
  requesterDeviceId: "device-1",
  requesterDevicePublicKeyPem:
    "-----BEGIN PUBLIC KEY-----\nDPUB\n-----END PUBLIC KEY-----",
  keyExchangePublicKey: Buffer.from("kex").toString("base64url"),
  pairingToken: "token-xyz",
} as never;

const signCert = vi.fn(() => ({ certificateId: "cert-1" }));
const encryptOwnerKey = vi.fn(async () => ({
  encryptedKey: "enc",
  ephemeralPublicKey: "eph",
  iv: "iv",
  authTag: "tag",
}));

describe("pairSharedIdentityViaRuntime", () => {
  it("throws on missing required params", async () => {
    const { ctx } = makeCtx();
    await expect(
      pairSharedIdentityViaRuntime(ctx, signCert, encryptOwnerKey, {
        requesterOwnerId: "x",
      } as never),
    ).rejects.toThrow(/Missing required/);
  });

  it("throws on ownerId mismatch", async () => {
    const { ctx } = makeCtx();
    await expect(
      pairSharedIdentityViaRuntime(
        ctx,
        signCert,
        encryptOwnerKey,
        { ...validParams, requesterOwnerId: "owner-2" } as never,
      ),
    ).rejects.toThrow(/ownerId mismatch/);
  });

  it("throws on invalid token", async () => {
    const { ctx } = makeCtx({ validatePairingToken: async () => false });
    await expect(
      pairSharedIdentityViaRuntime(ctx, signCert, encryptOwnerKey, validParams),
    ).rejects.toThrow(/Invalid or expired/);
  });

  it("happy path returns a fully-populated result", async () => {
    const { ctx, spies } = makeCtx();
    const out = (await pairSharedIdentityViaRuntime(
      ctx,
      signCert,
      encryptOwnerKey,
      validParams,
    )) as Record<string, unknown>;
    expect(typeof out.sessionToken).toBe("string");
    expect(out.ownerId).toBe("owner-1");
    expect(out.deviceCertificate).toEqual({ certificateId: "cert-1" });
    expect(out.encryptedOwnerKey).toBe("enc");
    expect(spies.consumeCompanyInvite).toHaveBeenCalledTimes(1);
    expect(spies.setTrustRecordDirect).toHaveBeenCalledTimes(1);
    expect(spies.mergeInboundDeviceBinding).toHaveBeenCalledTimes(1);
  });

  it("includes bridge fields when bridgeStatus.enabled is true", async () => {
    const { ctx } = makeCtx({
      getBridgeStatus: async () => ({
        enabled: true,
        agentPeerId: "agent-1",
        agentPublicKeyPem: "APUB",
        agentName: "MyAgent",
      }),
    });
    const out = (await pairSharedIdentityViaRuntime(
      ctx,
      signCert,
      encryptOwnerKey,
      validParams,
    )) as Record<string, unknown>;
    expect(out.agentPeerId).toBe("agent-1");
    expect(out.agentPubKey).toBe("APUB");
    expect(out.agentName).toBe("MyAgent");
  });
});