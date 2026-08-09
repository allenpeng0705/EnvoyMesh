import { describe, expect, it, beforeEach } from "vitest";
import {
  peerDiscoverySourceFromMultiaddrs,
  resetPeerDiscoveryAuditStateForTests,
  seedAddrsForDiscoveryProfile,
  shouldPersistPeerDiscoverySeeds,
  shouldRecordPeerDiscoveryAudit,
  shouldRunCapabilityTopicFind,
} from "../src/peer-discovery-telemetry.js";

beforeEach(() => {
  resetPeerDiscoveryAuditStateForTests();
});

describe("peer-discovery-telemetry", () => {
  it("audits each peer id once (including relay-sourced)", () => {
    expect(shouldRecordPeerDiscoveryAudit("peer-a", "unknown")).toBe(true);
    expect(shouldRecordPeerDiscoveryAudit("peer-a", "unknown")).toBe(false);
    expect(shouldRecordPeerDiscoveryAudit("peer-a", "relay")).toBe(false);
    expect(shouldRecordPeerDiscoveryAudit("peer-b", "relay")).toBe(true);
    expect(shouldRecordPeerDiscoveryAudit("peer-b", "relay")).toBe(false);
  });

  it("detects relay source from circuit multiaddrs", () => {
    expect(
      peerDiscoverySourceFromMultiaddrs(["/ip4/1.1.1.1/tcp/4001/p2p-circuit/p2p/peer-a"]),
    ).toBe("relay");
    expect(peerDiscoverySourceFromMultiaddrs(["/ip4/1.1.1.1/tcp/4001/p2p/peer-a"])).toBe("unknown");
  });

  it("skips non-relay peer.discovery seeds on contacts-only profile", () => {
    expect(shouldPersistPeerDiscoverySeeds("wan-default", "unknown")).toBe(false);
    expect(shouldPersistPeerDiscoverySeeds("wan-default", "mdns")).toBe(true);
    expect(shouldPersistPeerDiscoverySeeds("wan-default", "relay")).toBe(true);
    expect(shouldPersistPeerDiscoverySeeds("contacts-only", "unknown")).toBe(false);
    expect(shouldPersistPeerDiscoverySeeds("contacts-only", "relay")).toBe(true);
    expect(shouldPersistPeerDiscoverySeeds("relay-only", "unknown")).toBe(false);
    expect(shouldPersistPeerDiscoverySeeds("relay-only", "relay")).toBe(true);
  });

  it("filters persisted seeds for contacts-only profile", () => {
    const addrs = seedAddrsForDiscoveryProfile("contacts-only", [
      { addr: "/ip4/1.1.1.1/tcp/4001/p2p/relay", source: "relay-peers" },
      { addr: "/ip4/2.2.2.2/tcp/4001/p2p/swarm", source: "peer.discovery" },
      { addr: "/ip4/3.3.3.3/tcp/4001/p2p/topic", source: "capability-topic" },
    ]);
    expect(addrs).toEqual(["/ip4/1.1.1.1/tcp/4001/p2p/relay"]);
  });

  it("skips capability topic find on contacts-only and relay-only profiles", () => {
    expect(shouldRunCapabilityTopicFind("wan-default")).toBe(true);
    expect(shouldRunCapabilityTopicFind("contacts-only")).toBe(false);
    expect(shouldRunCapabilityTopicFind("relay-only")).toBe(false);
  });
});
