/**
 * CGNAT auto-apply wiring tests.
 *
 * Tests the decision boundary of `detectCgnatAtStartup`: it should auto-apply
 * quietWan ONLY on a definitive CGNAT classification AND when the operator has
 * not explicitly chosen a mode. The network round-trips (STUN/UPnP) are mocked
 * so the tests are fast and deterministic.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the network dependencies before importing the module under test.
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

const { detectCgnatAtStartup } = await import("../src/cgnat-detection.js");

describe("detectCgnatAtStartup — auto-apply decision boundary", () => {
  beforeEach(() => {
    mocks.detectNatType.mockReset();
    mocks.raceStunServers.mockReset();
    mocks.upnpDiscoverAndMap.mockReset();
  });

  it("auto-applies quietWan on symmetric NAT (definitive CGNAT)", async () => {
    mocks.detectNatType.mockResolvedValue("symmetric");
    mocks.raceStunServers.mockResolvedValue({ ip: "203.0.113.5", port: 4001 });
    mocks.upnpDiscoverAndMap.mockResolvedValue(null);

    const result = await detectCgnatAtStartup({ explicitMode: false });

    expect(result.classification).toBe("cgnat");
    expect(result.shouldAutoApplyQuietWan).toBe(true);
  });

  it("does NOT auto-apply when the operator explicitly chose a mode", async () => {
    mocks.detectNatType.mockResolvedValue("symmetric"); // definitive CGNAT
    mocks.raceStunServers.mockResolvedValue({ ip: "100.64.0.1", port: 4001 });

    const result = await detectCgnatAtStartup({ explicitMode: true });

    expect(result.classification).toBe("cgnat");
    // Explicit mode → respect it, don't override.
    expect(result.shouldAutoApplyQuietWan).toBe(false);
  });

  it("auto-applies on RFC 6598 CGNAT range IP from STUN", async () => {
    mocks.detectNatType.mockResolvedValue("full-cone"); // same mapping (mocked)
    mocks.raceStunServers.mockResolvedValue({ ip: "100.64.5.5", port: 4001 });
    mocks.upnpDiscoverAndMap.mockResolvedValue(null);

    const result = await detectCgnatAtStartup({ explicitMode: false });

    expect(result.classification).toBe("cgnat");
    expect(result.shouldAutoApplyQuietWan).toBe(true);
  });

  it("auto-applies on UPnP returning RFC1918 private external IP (Allen's case)", async () => {
    mocks.detectNatType.mockResolvedValue("unknown"); // STUN couldn't classify
    mocks.raceStunServers.mockResolvedValue(null);
    mocks.upnpDiscoverAndMap.mockResolvedValue({ ip: "192.168.1.6", port: 4001 });

    const result = await detectCgnatAtStartup({ explicitMode: false, upnpEnabled: true });

    expect(result.classification).toBe("cgnat");
    expect(result.shouldAutoApplyQuietWan).toBe(true);
  });

  it("does NOT auto-apply on ambiguous signals (STUN failed, no UPnP)", async () => {
    mocks.detectNatType.mockResolvedValue("unknown");
    mocks.raceStunServers.mockResolvedValue(null);
    mocks.upnpDiscoverAndMap.mockResolvedValue(null);

    const result = await detectCgnatAtStartup({ explicitMode: false });

    expect(result.classification).toBe("unknown");
    expect(result.shouldAutoApplyQuietWan).toBe(false);
  });

  it("does NOT auto-apply on a healthy full-cone NAT (not CGNAT)", async () => {
    mocks.detectNatType.mockResolvedValue("full-cone");
    mocks.raceStunServers.mockResolvedValue({ ip: "203.0.113.5", port: 4001 });
    mocks.upnpDiscoverAndMap.mockResolvedValue(null);

    const result = await detectCgnatAtStartup({ explicitMode: false });

    expect(result.classification).toBe("not-cgnat");
    expect(result.shouldAutoApplyQuietWan).toBe(false);
  });

  it("does not run UPnP probe when upnpEnabled is false", async () => {
    mocks.detectNatType.mockResolvedValue("unknown");
    mocks.raceStunServers.mockResolvedValue(null);

    await detectCgnatAtStartup({ explicitMode: false, upnpEnabled: false });

    expect(mocks.upnpDiscoverAndMap).not.toHaveBeenCalled();
  });
});
