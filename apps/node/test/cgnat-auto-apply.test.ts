/**
 * CGNAT auto-apply wiring tests.
 *
 * Tests the decision boundary of `detectCgnatAtStartup` / `shouldAllowCgnatQuietWanAutoApply`:
 * auto-apply quietWan ONLY on a definitive CGNAT classification AND when the
 * operator has not explicitly chosen a mode (default optimized is eligible).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  detectNatType: vi.fn(async () => "unknown" as const),
  raceStunServers: vi.fn(async () => null as { ip: string; port: number } | null),
  upnpDiscoverAndMap: vi.fn(async () => null as { ip: string; port: number } | null),
}));

vi.mock("../src/stun.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  detectNatType: mocks.detectNatType,
  raceStunServers: mocks.raceStunServers,
}));
vi.mock("../src/upnp.js", () => ({
  upnpDiscoverAndMap: mocks.upnpDiscoverAndMap,
}));

const {
  detectCgnatAtStartup,
  shouldAllowCgnatQuietWanAutoApply,
} = await import("../src/cgnat-detection.js");

describe("shouldAllowCgnatQuietWanAutoApply", () => {
  it("allows default optimized / unset", () => {
    expect(shouldAllowCgnatQuietWanAutoApply({})).toBe(true);
    expect(shouldAllowCgnatQuietWanAutoApply({ connectivityMode: "optimized" })).toBe(true);
  });

  it("blocks operator-explicit modes including optimized", () => {
    expect(
      shouldAllowCgnatQuietWanAutoApply({
        connectivityMode: "optimized",
        connectivityModeExplicit: true,
      }),
    ).toBe(false);
  });

  it("blocks smart/normal/quietWan/aggressive without needing the explicit flag", () => {
    expect(shouldAllowCgnatQuietWanAutoApply({ connectivityMode: "smart" })).toBe(false);
    expect(shouldAllowCgnatQuietWanAutoApply({ connectivityMode: "normal" })).toBe(false);
    expect(shouldAllowCgnatQuietWanAutoApply({ connectivityMode: "quietWan" })).toBe(false);
    expect(shouldAllowCgnatQuietWanAutoApply({ connectivityMode: "aggressive" })).toBe(false);
  });
});

describe("detectCgnatAtStartup — auto-apply decision boundary", () => {
  beforeEach(() => {
    mocks.detectNatType.mockReset();
    mocks.raceStunServers.mockReset();
    mocks.upnpDiscoverAndMap.mockReset();
  });

  it("auto-applies quietWan on RFC 6598 CGNAT range when mode is default optimized", async () => {
    mocks.detectNatType.mockResolvedValue("full-cone");
    mocks.raceStunServers.mockResolvedValue({ ip: "100.64.5.5", port: 4001 });
    mocks.upnpDiscoverAndMap.mockResolvedValue(null);

    const result = await detectCgnatAtStartup({
      connectivityMode: "optimized",
      connectivityModeExplicit: false,
    });

    expect(result.classification).toBe("cgnat");
    expect(result.shouldAutoApplyQuietWan).toBe(true);
  });

  it("auto-applies when symmetric NAT AND UPnP-private corroborate", async () => {
    mocks.detectNatType.mockResolvedValue("symmetric");
    mocks.raceStunServers.mockResolvedValue({ ip: "203.0.113.5", port: 4001 });
    mocks.upnpDiscoverAndMap.mockResolvedValue({ ip: "192.168.1.6", port: 4001 });

    const result = await detectCgnatAtStartup({
      connectivityMode: "optimized",
      upnpEnabled: true,
    });

    expect(result.classification).toBe("cgnat");
    expect(result.shouldAutoApplyQuietWan).toBe(true);
  });

  it("does NOT auto-apply on symmetric NAT ALONE", async () => {
    mocks.detectNatType.mockResolvedValue("symmetric");
    mocks.raceStunServers.mockResolvedValue({ ip: "203.0.113.5", port: 4001 });
    mocks.upnpDiscoverAndMap.mockResolvedValue(null);

    const result = await detectCgnatAtStartup({ connectivityMode: "optimized" });

    expect(result.classification).toBe("unknown");
    expect(result.shouldAutoApplyQuietWan).toBe(false);
  });

  it("does NOT auto-apply when the operator explicitly chose a mode", async () => {
    mocks.detectNatType.mockResolvedValue("symmetric");
    mocks.raceStunServers.mockResolvedValue({ ip: "100.64.0.1", port: 4001 });
    mocks.upnpDiscoverAndMap.mockResolvedValue({ ip: "192.168.1.6", port: 4001 });

    const result = await detectCgnatAtStartup({
      connectivityMode: "optimized",
      connectivityModeExplicit: true,
      upnpEnabled: true,
    });

    expect(result.classification).toBe("cgnat");
    expect(result.shouldAutoApplyQuietWan).toBe(false);
  });

  it("does NOT auto-apply when legacy explicitMode flag is true", async () => {
    mocks.detectNatType.mockResolvedValue("unknown");
    mocks.raceStunServers.mockResolvedValue({ ip: "100.64.0.1", port: 4001 });

    const result = await detectCgnatAtStartup({
      connectivityMode: "optimized",
      explicitMode: true,
    });

    expect(result.classification).toBe("cgnat");
    expect(result.shouldAutoApplyQuietWan).toBe(false);
  });

  it("does NOT auto-apply on ambiguous signals", async () => {
    mocks.detectNatType.mockResolvedValue("unknown");
    mocks.raceStunServers.mockResolvedValue(null);
    mocks.upnpDiscoverAndMap.mockResolvedValue(null);

    const result = await detectCgnatAtStartup({ connectivityMode: "optimized" });

    expect(result.classification).toBe("unknown");
    expect(result.shouldAutoApplyQuietWan).toBe(false);
  });

  it("does NOT auto-apply on a healthy full-cone NAT", async () => {
    mocks.detectNatType.mockResolvedValue("full-cone");
    mocks.raceStunServers.mockResolvedValue({ ip: "203.0.113.5", port: 4001 });
    mocks.upnpDiscoverAndMap.mockResolvedValue(null);

    const result = await detectCgnatAtStartup({ connectivityMode: "optimized" });

    expect(result.classification).toBe("not-cgnat");
    expect(result.shouldAutoApplyQuietWan).toBe(false);
  });

  it("does not run UPnP probe when upnpEnabled is false", async () => {
    mocks.detectNatType.mockResolvedValue("unknown");
    mocks.raceStunServers.mockResolvedValue(null);

    await detectCgnatAtStartup({ connectivityMode: "optimized", upnpEnabled: false });

    expect(mocks.upnpDiscoverAndMap).not.toHaveBeenCalled();
  });
});
