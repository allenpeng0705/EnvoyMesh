import { describe, expect, it } from "vitest";
import {
  resolveReachabilityDialPolicy,
  shouldIdentifyBeforeVpnSkip,
} from "../src/peer-reachability-policy.js";

const PEER = "12D3KooWPolicyPeer";
const CIRCUIT = `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/${PEER}`;

describe("shouldIdentifyBeforeVpnSkip", () => {
  it("runs identify for any Online-Relay → Direct upgrade (VPN or home LAN)", () => {
    expect(
      shouldIdentifyBeforeVpnSkip({
        upgradeRelayToDirect: true,
        connected: true,
        direct: false,
        likelyVpnActive: true,
      }),
    ).toBe(true);
    expect(
      shouldIdentifyBeforeVpnSkip({
        upgradeRelayToDirect: true,
        connected: true,
        direct: false,
        likelyVpnActive: false,
      }),
    ).toBe(true);
    expect(
      shouldIdentifyBeforeVpnSkip({
        upgradeRelayToDirect: true,
        connected: true,
        direct: true,
        likelyVpnActive: true,
      }),
    ).toBe(false);
    expect(
      shouldIdentifyBeforeVpnSkip({
        upgradeRelayToDirect: false,
        connected: true,
        direct: false,
        likelyVpnActive: false,
      }),
    ).toBe(false);
  });
});

describe("resolveReachabilityDialPolicy", () => {
  it("same-LAN + VPN keeps LAN and allows upgrade", () => {
    const policy = resolveReachabilityDialPolicy({
      transportPeerId: PEER,
      discoveryProfile: "wan-default",
      likelyVpnActive: true,
      localListenAddrs: ["/ip4/192.168.3.85/tcp/4001"],
      peerListenAddrs: [`/ip4/192.168.3.78/tcp/57944/p2p/${PEER}`],
      dialHints: [`/ip4/192.168.3.78/tcp/57944/p2p/${PEER}`, CIRCUIT],
      upgradeRelayToDirect: true,
    });
    expect(policy.skipUpgradeStayOnRelay).toBe(false);
    expect(policy.preferCircuitHints).toBe(false);
    expect(policy.sameSubnetLanFirst).toBe(true);
    expect(policy.dialHints.some((h) => h.includes("192.168.3.78"))).toBe(true);
  });

  it("cross-network VPN skips upgrade and strips home LAN", () => {
    const policy = resolveReachabilityDialPolicy({
      transportPeerId: PEER,
      discoveryProfile: "wan-default",
      likelyVpnActive: true,
      localListenAddrs: ["/ip4/192.168.3.85/tcp/4001"],
      peerListenAddrs: [`/ip4/10.0.0.8/tcp/4011/p2p/${PEER}`],
      dialHints: [`/ip4/10.0.0.8/tcp/4011/p2p/${PEER}`, CIRCUIT],
      upgradeRelayToDirect: true,
    });
    expect(policy.skipUpgradeStayOnRelay).toBe(true);
    expect(policy.vpnSkipHomeLan).toBe(true);
    expect(policy.dialHints.some((h) => h.includes("10.0.0.8"))).toBe(false);
    expect(policy.dialHints.some((h) => h.includes("/p2p-circuit/"))).toBe(true);
  });

  it("Relay→Direct does not treat foreign RFC1918 as same-subnet", () => {
    const policy = resolveReachabilityDialPolicy({
      transportPeerId: PEER,
      discoveryProfile: "wan-default",
      likelyVpnActive: false,
      localListenAddrs: ["/ip4/192.168.3.85/tcp/4001"],
      peerListenAddrs: [],
      dialHints: [`/ip4/10.8.0.2/tcp/57944/p2p/${PEER}`, CIRCUIT],
      upgradeRelayToDirect: true,
    });
    expect(policy.skipUpgradeStayOnRelay).toBe(false);
    expect(policy.sameSubnetLanFirst).toBe(false);
    expect(policy.preferCircuitHints).toBe(false);
  });

  it("offline reconnect with Direct hints prefers Direct (not circuit)", () => {
    const policy = resolveReachabilityDialPolicy({
      transportPeerId: PEER,
      discoveryProfile: "wan-default",
      likelyVpnActive: false,
      localListenAddrs: ["/ip4/192.168.3.85/tcp/4001"],
      peerListenAddrs: [],
      dialHints: [`/ip4/192.168.3.78/tcp/57944/p2p/${PEER}`, CIRCUIT],
      offlineReconnect: true,
    });
    expect(policy.preferCircuitHints).toBe(false);
  });

  it("sticky lastSuccessfulDialPath=direct disables circuit preference", () => {
    const policy = resolveReachabilityDialPolicy({
      transportPeerId: PEER,
      discoveryProfile: "wan-default",
      likelyVpnActive: false,
      localListenAddrs: ["/ip4/192.168.3.85/tcp/4001"],
      peerListenAddrs: [],
      dialHints: [`/ip4/192.168.3.78/tcp/57944/p2p/${PEER}`, CIRCUIT],
      lastSuccessfulDialPath: "direct",
    });
    expect(policy.preferCircuitHints).toBe(false);
  });

  it("resolveSameSubnetLanFirstFromEvidence matches policy same-subnet", async () => {
    const { resolveSameSubnetLanFirstFromEvidence } = await import(
      "../src/peer-reachability-policy.js"
    );
    expect(
      resolveSameSubnetLanFirstFromEvidence({
        likelyVpnActive: false,
        localListenAddrs: ["/ip4/192.168.3.85/tcp/4001"],
        dialHints: [`/ip4/192.168.3.78/tcp/4011/p2p/${PEER}`, CIRCUIT],
      }),
    ).toBe(true);
    expect(
      resolveSameSubnetLanFirstFromEvidence({
        likelyVpnActive: true,
        localListenAddrs: ["/ip4/192.168.3.85/tcp/4001"],
        dialHints: [`/ip4/10.0.0.8/tcp/4011/p2p/${PEER}`, CIRCUIT],
      }),
    ).toBe(false);
    expect(
      resolveSameSubnetLanFirstFromEvidence({
        likelyVpnActive: false,
        localListenAddrs: ["/ip4/192.168.3.85/tcp/4001"],
        dialHints: [`/ip4/192.168.3.78/tcp/4011/p2p/${PEER}`],
        preferCircuitHints: true,
      }),
    ).toBe(false);
  });
});
