/**
 * Tests for the pairing-kiosk runtime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPairingKioskStatusViaRuntime,
  stopPairingKioskViaRuntime,
  syncPairingKioskFromConfigViaRuntime,
  type PairingKioskContext,
} from "../src/node-service-pairing-kiosk.js";

function makeCtx(overrides: Partial<PairingKioskContext> = {}): {
  ctx: PairingKioskContext;
  spies: {
    loadConfig: ReturnType<typeof vi.fn>;
    getKiosk: ReturnType<typeof vi.fn>;
    setKiosk: ReturnType<typeof vi.fn>;
    stopKiosk: ReturnType<typeof vi.fn>;
    getTaskStore: ReturnType<typeof vi.fn>;
    getCompanyInviteContext: ReturnType<typeof vi.fn>;
  };
} {
  const spies = {
    loadConfig: vi.fn(async () => undefined),
    getKiosk: vi.fn(() => null),
    setKiosk: vi.fn(),
    stopKiosk: vi.fn(async () => undefined),
    getTaskStore: vi.fn(() => undefined),
    getCompanyInviteContext: vi.fn(async () => ({
      ownerId: "owner-1",
      wsUrl: "ws://localhost:3030",
    })),
  };
  const ctx: PairingKioskContext = {
    ...spies,
    ...overrides,
  };
  return { ctx, spies };
}

describe("stopPairingKioskViaRuntime", () => {
  it("returns early when no kiosk handle", async () => {
    const { ctx, spies } = makeCtx();
    await stopPairingKioskViaRuntime(ctx);
    expect(spies.setKiosk).not.toHaveBeenCalled();
  });

  it("closes the handle and clears it on success", async () => {
    const close = vi.fn(async () => undefined);
    const { ctx, spies } = makeCtx({ getKiosk: () => ({ close }) as never });
    await stopPairingKioskViaRuntime(ctx);
    expect(close).toHaveBeenCalledTimes(1);
    expect(spies.setKiosk).toHaveBeenCalledWith(null);
  });

  it("still clears the handle even when close() throws", async () => {
    const close = vi.fn(async () => {
      throw new Error("boom");
    });
    const { ctx, spies } = makeCtx({ getKiosk: () => ({ close }) as never });
    // Silence console.warn from the runtime.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await stopPairingKioskViaRuntime(ctx);
    expect(spies.setKiosk).toHaveBeenCalledWith(null);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("getPairingKioskStatusViaRuntime", () => {
  it("returns enabled=false when config missing", async () => {
    const { ctx } = makeCtx({ loadConfig: async () => undefined });
    const out = await getPairingKioskStatusViaRuntime(ctx);
    expect(out.enabled).toBe(false);
    expect(out.running).toBe(false);
  });

  it("returns enabled=false when pairingKioskEnabled is not true", async () => {
    const { ctx } = makeCtx({ loadConfig: async () => ({ pairingKioskEnabled: false }) });
    const out = await getPairingKioskStatusViaRuntime(ctx);
    expect(out.enabled).toBe(false);
  });

  it("returns running=true when getKiosk returns a handle", async () => {
    const { ctx } = makeCtx({
      loadConfig: async () => ({ pairingKioskEnabled: true }),
      getKiosk: () => ({ address: "127.0.0.1", port: 8080 }) as never,
    });
    const out = await getPairingKioskStatusViaRuntime(ctx);
    expect(out.enabled).toBe(true);
    expect(out.running).toBe(true);
    expect(out.address).toBe("127.0.0.1");
    expect(out.port).toBe(8080);
  });

  it("propagates bindLan + expiresAt from config", async () => {
    const { ctx } = makeCtx({
      loadConfig: async () => ({
        pairingKioskEnabled: true,
        pairingKioskAllowLanBind: true,
        pairingKioskExpiresAt: "2099-01-01T00:00:00Z",
      }),
      getKiosk: () => null,
    });
    const out = await getPairingKioskStatusViaRuntime(ctx);
    expect(out.bindLan).toBe(true);
    expect(out.expiresAt).toBe("2099-01-01T00:00:00Z");
  });
});

describe("syncPairingKioskFromConfigViaRuntime", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("stops the kiosk when config is missing", async () => {
    const { ctx, spies } = makeCtx({ loadConfig: async () => undefined });
    await syncPairingKioskFromConfigViaRuntime(ctx);
    expect(spies.stopKiosk).toHaveBeenCalledTimes(1);
    expect(spies.setKiosk).not.toHaveBeenCalled();
  });

  it("stops the kiosk when pairingKioskEnabled is not true", async () => {
    const { ctx, spies } = makeCtx({
      loadConfig: async () => ({ pairingKioskEnabled: false }),
    });
    await syncPairingKioskFromConfigViaRuntime(ctx);
    expect(spies.stopKiosk).toHaveBeenCalledTimes(1);
  });

  it("warns and stops when admin token is too short", async () => {
    const { ctx, spies } = makeCtx({
      loadConfig: async () => ({
        pairingKioskEnabled: true,
        pairingKioskAdminToken: "short",
      }),
    });
    await syncPairingKioskFromConfigViaRuntime(ctx);
    expect(warnSpy).toHaveBeenCalled();
    expect(spies.stopKiosk).toHaveBeenCalledTimes(1);
  });
});