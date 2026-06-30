/**
 * Tests for the pairDevice runtime (Step 23).
 */
import { describe, expect, it, vi } from "vitest";

import {
  pairDeviceViaRuntime,
  type PairDeviceContext,
} from "../src/node-service-handlers-pair-device.js";

function makeCtx(overrides: Partial<PairDeviceContext> = {}): {
  ctx: PairDeviceContext;
  spies: {
    validatePairingToken: ReturnType<typeof vi.fn>;
    consumeCompanyInvite: ReturnType<typeof vi.fn>;
    setTrustRecordDirect: ReturnType<typeof vi.fn>;
    mergeInboundDeviceBinding: ReturnType<typeof vi.fn>;
    getSessionTokenStore: ReturnType<typeof vi.fn>;
    getBridgeStatus: ReturnType<typeof vi.fn>;
  };
} {
  const spies = {
    validatePairingToken: vi.fn(async () => true),
    consumeCompanyInvite: vi.fn(async () => undefined),
    setTrustRecordDirect: vi.fn(async () => undefined),
    mergeInboundDeviceBinding: vi.fn(async () => undefined),
    getSessionTokenStore: vi.fn(() => null),
    getBridgeStatus: vi.fn(async () => ({ enabled: false })),
  };
  const ctx: PairDeviceContext = {
    ...spies,
    ...overrides,
  };
  return { ctx, spies };
}

const validParams = {
  requesterOwnerId: "owner-1",
  requesterDeviceId: "device-1",
  requesterDevicePublicKeyPem:
    "-----BEGIN PUBLIC KEY-----\nPK\n-----END PUBLIC KEY-----",
  pairingToken: "token-xyz",
} as never;

describe("pairDeviceViaRuntime", () => {
  it("throws on missing required params", async () => {
    const { ctx } = makeCtx();
    await expect(
      pairDeviceViaRuntime(ctx, { requesterOwnerId: "x" } as never),
    ).rejects.toThrow(/Missing required/);
  });

  it("throws on invalid token", async () => {
    const { ctx, spies } = makeCtx({
      validatePairingToken: async () => false,
    });
    await expect(pairDeviceViaRuntime(ctx, validParams)).rejects.toThrow(
      /Invalid or expired/,
    );
    expect(spies.setTrustRecordDirect).not.toHaveBeenCalled();
  });

  it("happy path: sets trust, binds device, returns session token", async () => {
    const { ctx, spies } = makeCtx();
    const out = await pairDeviceViaRuntime(ctx, validParams);
    expect(typeof out.sessionToken).toBe("string");
    expect(out.sessionToken.length).toBeGreaterThan(20);
    expect(spies.consumeCompanyInvite).toHaveBeenCalledTimes(1);
    expect(spies.setTrustRecordDirect).toHaveBeenCalledTimes(1);
    expect(spies.mergeInboundDeviceBinding).toHaveBeenCalledTimes(1);
  });

  it("includes bridge fields when bridgeStatus.enabled is true", async () => {
    const { ctx } = makeCtx({
      getBridgeStatus: async () => ({
        enabled: true,
        agentPeerId: "agent-1",
        agentPublicKeyPem:
          "-----BEGIN PUBLIC KEY-----\nAGENT\n-----END PUBLIC KEY-----",
        agentName: "MyAgent",
      }),
    });
    const out = (await pairDeviceViaRuntime(ctx, validParams)) as {
      sessionToken: string;
      agentPeerId?: string;
      agentPubKey?: string;
      agentName?: string;
    };
    expect(out.agentPeerId).toBe("agent-1");
    expect(out.agentPubKey).toBe(
      "-----BEGIN PUBLIC KEY-----\nAGENT\n-----END PUBLIC KEY-----",
    );
    expect(out.agentName).toBe("MyAgent");
  });

  it("omits bridge fields when bridgeStatus.enabled is false", async () => {
    const { ctx } = makeCtx();
    const out = (await pairDeviceViaRuntime(ctx, validParams)) as {
      sessionToken: string;
      agentPeerId?: string;
    };
    expect(out.agentPeerId).toBeUndefined();
  });

  it("skips session token store when null", async () => {
    const { ctx } = makeCtx({ getSessionTokenStore: () => null });
    const out = await pairDeviceViaRuntime(ctx, validParams);
    expect(typeof out.sessionToken).toBe("string");
  });
});