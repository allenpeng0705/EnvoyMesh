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
      // ISP CGNAT: STUN sees 100.64, LAN stays 192.168 (no local overlay NIC).
      localInterfaceIps: ["192.168.1.20"],
      likelyVpnActive: false,
    });

    expect(result.classification).toBe("cgnat");
    expect(result.shouldAutoApplyQuietWan).toBe(true);
  });

  it("does NOT auto-apply RFC 6598 STUN when commercial VPN is active (no local 100.64)", async () => {
    mocks.detectNatType.mockResolvedValue("full-cone");
    mocks.raceStunServers.mockResolvedValue({ ip: "100.64.5.5", port: 4001 });
    mocks.upnpDiscoverAndMap.mockResolvedValue(null);

    const result = await detectCgnatAtStartup({
      connectivityMode: "optimized",
      localInterfaceIps: ["10.8.0.2", "192.168.1.20"],
      likelyVpnActive: true,
    });

    expect(result.classification).toBe("unknown");
    expect(result.shouldAutoApplyQuietWan).toBe(false);
  });

  it("does NOT auto-apply RFC 6598 STUN when a local Tailscale NIC is present", async () => {
    mocks.detectNatType.mockResolvedValue("full-cone");
    mocks.raceStunServers.mockResolvedValue({ ip: "100.64.5.5", port: 4001 });
    mocks.upnpDiscoverAndMap.mockResolvedValue(null);

    const result = await detectCgnatAtStartup({
      connectivityMode: "optimized",
      localInterfaceIps: ["100.64.1.10", "192.168.1.20"],
      likelyVpnActive: true,
    });

    expect(result.classification).toBe("unknown");
    expect(result.shouldAutoApplyQuietWan).toBe(false);
  });

  it("does NOT auto-apply symmetric+UPnP when VPN is active", async () => {
    mocks.detectNatType.mockResolvedValue("symmetric");
    mocks.raceStunServers.mockResolvedValue({ ip: "203.0.113.5", port: 4001 });
    mocks.upnpDiscoverAndMap.mockResolvedValue({ ip: "192.168.1.6", port: 4001 });

    const result = await detectCgnatAtStartup({
      connectivityMode: "optimized",
      upnpEnabled: true,
      localInterfaceIps: ["10.8.0.2"],
      likelyVpnActive: true,
    });

    expect(result.classification).toBe("unknown");
    expect(result.shouldAutoApplyQuietWan).toBe(false);
  });

  it("auto-applies when symmetric NAT AND UPnP-private corroborate", async () => {
    mocks.detectNatType.mockResolvedValue("symmetric");
    mocks.raceStunServers.mockResolvedValue({ ip: "203.0.113.5", port: 4001 });
    mocks.upnpDiscoverAndMap.mockResolvedValue({ ip: "192.168.1.6", port: 4001 });

    const result = await detectCgnatAtStartup({
      connectivityMode: "optimized",
      upnpEnabled: true,
      localInterfaceIps: ["192.168.1.20"],
      likelyVpnActive: false,
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
      localInterfaceIps: ["192.168.1.20"],
      likelyVpnActive: false,
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
      localInterfaceIps: ["192.168.1.20"],
      likelyVpnActive: false,
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

describe("detectLikelyVpnActive / maybeRevertCgnatQuietWanForVpn", () => {
  it("detects Tailscale via RFC6598 local address", async () => {
    const { detectLikelyVpnActive } = await import("../src/cgnat-detection.js");
    expect(
      detectLikelyVpnActive({
        en0: [{ address: "192.168.1.20", family: "IPv4", internal: false } as NodeJS.NetworkInterfaceInfo],
        utun4: [{ address: "100.64.1.10", family: "IPv4", internal: false } as NodeJS.NetworkInterfaceInfo],
      }),
    ).toBe(true);
  });

  it("detects commercial VPN via utun with assigned IPv4", async () => {
    const { detectLikelyVpnActive } = await import("../src/cgnat-detection.js");
    expect(
      detectLikelyVpnActive({
        en0: [{ address: "192.168.1.20", family: "IPv4", internal: false } as NodeJS.NetworkInterfaceInfo],
        utun3: [{ address: "10.8.0.2", family: "IPv4", internal: false } as NodeJS.NetworkInterfaceInfo],
      }),
    ).toBe(true);
  });

  it("ignores empty utun (macOS always has them)", async () => {
    const { detectLikelyVpnActive } = await import("../src/cgnat-detection.js");
    expect(
      detectLikelyVpnActive({
        en0: [{ address: "192.168.1.20", family: "IPv4", internal: false } as NodeJS.NetworkInterfaceInfo],
        utun0: [],
      }),
    ).toBe(false);
  });

  it("ignores idle utun that has no private tunnel address", async () => {
    const { detectLikelyVpnActive } = await import("../src/cgnat-detection.js");
    expect(
      detectLikelyVpnActive({
        en0: [{ address: "192.168.1.20", family: "IPv4", internal: false } as NodeJS.NetworkInterfaceInfo],
        // Public-looking address on utun is not a typical VPN client assignment.
        utun2: [{ address: "203.0.113.9", family: "IPv4", internal: false } as NodeJS.NetworkInterfaceInfo],
      }),
    ).toBe(false);
  });

  it("reverts persisted cgnat-quietWan to optimized when VPN is active", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { createNodeConfigStore } = await import("../src/node-config-store.js");
    const { maybeRevertCgnatQuietWanForVpn } = await import("../src/cgnat-detection.js");

    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-cgnat-revert-"));
    try {
      const store = createNodeConfigStore(profileDir);
      await store.save({
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: ["cn-relay"],
        configuredRelays: [],
        modelProviders: { mode: "mock" },
        chatAssistEnabled: false,
        contactAiPreferences: [],
        connectivityMode: "quietWan",
        connectivityModeExplicit: false,
        connectivityModeAutoAppliedReason: "cgnat",
        updatedAt: new Date().toISOString(),
      });

      expect(await maybeRevertCgnatQuietWanForVpn(profileDir, { likelyVpnActive: false })).toBe(
        false,
      );
      expect((await store.load())?.connectivityMode).toBe("quietWan");

      expect(await maybeRevertCgnatQuietWanForVpn(profileDir, { likelyVpnActive: true })).toBe(true);
      const after = await store.load();
      expect(after?.connectivityMode).toBe("optimized");
      expect(after?.connectivityModeAutoAppliedReason).toBeUndefined();
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("does not revert operator-explicit quietWan", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { createNodeConfigStore } = await import("../src/node-config-store.js");
    const { maybeRevertCgnatQuietWanForVpn } = await import("../src/cgnat-detection.js");

    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-cgnat-revert-explicit-"));
    try {
      const store = createNodeConfigStore(profileDir);
      await store.save({
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: ["cn-relay"],
        configuredRelays: [],
        modelProviders: { mode: "mock" },
        chatAssistEnabled: false,
        contactAiPreferences: [],
        connectivityMode: "quietWan",
        connectivityModeExplicit: true,
        connectivityModeAutoAppliedReason: "cgnat",
        updatedAt: new Date().toISOString(),
      });
      expect(await maybeRevertCgnatQuietWanForVpn(profileDir, { likelyVpnActive: true })).toBe(
        false,
      );
      expect((await store.load())?.connectivityMode).toBe("quietWan");
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });
});
