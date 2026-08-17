/**
 * Relay book pollution fixes:
 *  - checkin hints must never admit self or public libp2p bootstrap peers
 *    (previously the relay dialed itself → "Can not dial self", and dialed
 *    bootstrap.libp2p.io → "connection error sv15.bootstrap.libp2p.io").
 *  - repeated gossip failures demote then evict entries (failureCount is
 *    now incremented — previously dead code).
 */
import { describe, expect, it } from "vitest";
import { createRelayRoster, isJunkRelayHint } from "../src/relay-roster.js";
import { ingestSiblingHints } from "../src/standalone-relay-control.js";

const SELF = "12D3KooWSelfRelay";
const expiresAt = () => new Date(Date.now() + 60_000).toISOString();

/** Minimal EnvoyMesh-shaped stub (only peerId is used by ingestSiblingHints). */
const meshStub = { peerId: SELF } as never;

describe("isJunkRelayHint", () => {
  it("flags empty / no-addr hints", () => {
    expect(isJunkRelayHint(undefined, SELF)).toBe(true);
    expect(isJunkRelayHint({ relayId: "x", multiaddrs: [] }, SELF)).toBe(true);
  });

  it("flags self relayId", () => {
    expect(isJunkRelayHint({ relayId: SELF, multiaddrs: ["/ip4/1.1.1.1/tcp/4001/p2p/self"] }, SELF)).toBe(true);
  });

  it("flags public libp2p bootstrap peers by addr marker", () => {
    expect(
      isJunkRelayHint(
        {
          relayId: "QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
          multiaddrs: ["/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN"],
        },
        SELF,
      ),
    ).toBe(true);
  });

  it("accepts a legitimate EnvoyMesh relay hint", () => {
    expect(
      isJunkRelayHint(
        { relayId: "12D3KooWGoodSibling", multiaddrs: ["/ip4/9.9.9.9/tcp/4001/p2p/12D3KooWGoodSibling"] },
        SELF,
      ),
    ).toBe(false);
  });
});

describe("relay roster — checkin hint ingestion filters (book pollution fix)", () => {
  it("does not register self or public bootstrap peers from checkin hints", () => {
    const roster = createRelayRoster({ selfPeerId: SELF });
    roster.checkin({
      peerId: "12D3KooWClient",
      relayReachableAddrs: ["/ip4/10.0.0.1/tcp/4001/p2p/client"],
      capabilities: ["mesh.discovery"],
      advertisements: [{ capability: "mesh.discovery", visibility: "public", expiresAt: expiresAt() }],
      relayHints: [
        { relayId: SELF, multiaddrs: [`/ip4/47.93.11.212/tcp/4001/p2p/${SELF}`], expiresAt: expiresAt() },
        {
          relayId: "QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
          multiaddrs: ["/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN"],
          expiresAt: expiresAt(),
        },
        { relayId: "12D3KooWGoodSibling", multiaddrs: ["/ip4/9.9.9.9/tcp/4001/p2p/12D3KooWGoodSibling"], expiresAt: expiresAt() },
      ],
      expiresAt: expiresAt(),
    });

    const book = roster.relayBook();
    expect(book.some((e) => e.relayId === SELF)).toBe(false);
    expect(book.some((e) => e.relayId.includes("QmNnoo"))).toBe(false);
    expect(book.some((e) => e.relayId === "12D3KooWGoodSibling")).toBe(true);
    expect(book.find((e) => e.relayId === "12D3KooWGoodSibling")?.state).toBe("candidate");
  });

  it("setSelfPeerId applies the self-filter after the fact", () => {
    const roster = createRelayRoster();
    roster.setSelfPeerId(SELF);
    roster.checkin({
      peerId: "12D3KooWClient",
      relayReachableAddrs: [],
      capabilities: [],
      advertisements: [],
      relayHints: [{ relayId: SELF, multiaddrs: [`/ip4/1.2.3.4/tcp/4001/p2p/${SELF}`], expiresAt: expiresAt() }],
      expiresAt: expiresAt(),
    });
    expect(roster.relayBook().some((e) => e.relayId === SELF)).toBe(false);
  });

  it("lookup responses do not echo junk hints from peer-reported checkins", () => {
    const roster = createRelayRoster({ selfPeerId: SELF });
    roster.checkin({
      peerId: "12D3KooWClient",
      relayReachableAddrs: [],
      capabilities: [],
      advertisements: [],
      relayHints: [
        { relayId: SELF, multiaddrs: [`/ip4/47.93.11.212/tcp/4001/p2p/${SELF}`], expiresAt: expiresAt() },
        {
          relayId: "QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
          multiaddrs: ["/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN"],
          expiresAt: expiresAt(),
        },
        { relayId: "12D3KooWGoodSibling", multiaddrs: ["/ip4/9.9.9.9/tcp/4001/p2p/12D3KooWGoodSibling"], expiresAt: expiresAt() },
      ],
      expiresAt: expiresAt(),
    });

    const response = roster.lookup({
      payload: {
        queryId: "lookup-pollution-check",
        capability: "mesh.discovery",
        maxResults: 10,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "public",
        expiresAt: expiresAt(),
      },
      requesterPeerId: "12D3KooWOtherClient",
      relayMultiaddrs: ["/ip4/47.93.11.212/tcp/4001/p2p/relay"],
      relayPeerId: "relay",
      hasLiveReservation: () => false,
    });

    const returnedIds = response.relayHints.map((h) => h.relayId);
    expect(returnedIds).not.toContain(SELF);
    expect(returnedIds.some((id) => id.includes("QmNnoo"))).toBe(false);
    expect(returnedIds).toContain("12D3KooWGoodSibling");
  });
});

describe("relay roster — failure demotion and eviction", () => {
  it("demotes verified→candidate after failures, then removes", () => {
    const roster = createRelayRoster({ demoteAfterFailures: 2, removeAfterFailures: 4 });
    const expires = new Date(Date.now() + 60_000).toISOString();
    roster.registerRelay({
      relayId: "peer-flaky",
      addrs: ["/ip4/1.2.3.4/tcp/4001/p2p/peer-flaky"],
      relation: "sibling",
      state: "verified",
      expiresAt: expires,
    });

    const f1 = roster.recordRelayFailure("peer-flaky");
    expect(f1?.state).toBe("verified");
    const f2 = roster.recordRelayFailure("peer-flaky");
    expect(f2?.state).toBe("candidate");
    const f3 = roster.recordRelayFailure("peer-flaky");
    expect(f3?.state).toBe("candidate");
    expect(roster.relayBook().some((e) => e.relayId === "peer-flaky")).toBe(true);
    roster.recordRelayFailure("peer-flaky");
    expect(roster.relayBook().some((e) => e.relayId === "peer-flaky")).toBe(false);
  });

  it("promoteRelay resets failureCount", () => {
    const roster = createRelayRoster({ demoteAfterFailures: 2, removeAfterFailures: 4 });
    const expires = new Date(Date.now() + 60_000).toISOString();
    roster.registerRelay({
      relayId: "peer-recovers",
      addrs: ["/ip4/1.2.3.4/tcp/4001/p2p/peer-recovers"],
      relation: "sibling",
      state: "candidate",
      expiresAt: expires,
    });
    roster.recordRelayFailure("peer-recovers");
    const promoted = roster.promoteRelay("peer-recovers", "verified");
    expect(promoted?.failureCount).toBe(0);
    expect(roster.relayBook().find((e) => e.relayId === "peer-recovers")?.failureCount).toBe(0);
  });

  it("candidate entries are removed after removeAfterFailures", () => {
    const roster = createRelayRoster({ removeAfterFailures: 3 });
    const expires = new Date(Date.now() + 60_000).toISOString();
    roster.registerRelay({
      relayId: "junk-candidate",
      addrs: ["/ip4/1.2.3.4/tcp/4001/p2p/junk-candidate"],
      relation: "candidate",
      state: "candidate",
      expiresAt: expires,
    });
    roster.recordRelayFailure("junk-candidate");
    roster.recordRelayFailure("junk-candidate");
    expect(roster.relayBook().some((e) => e.relayId === "junk-candidate")).toBe(true);
    roster.recordRelayFailure("junk-candidate");
    expect(roster.relayBook().some((e) => e.relayId === "junk-candidate")).toBe(false);
  });
});

describe("ingestSiblingHints — self/bootstrap filtering (book pollution fix)", () => {
  it("skips self and public bootstrap peers from gossip responses", () => {
    const roster = createRelayRoster({ selfPeerId: SELF });
    ingestSiblingHints(
      roster,
      meshStub,
      [
        { relayId: SELF, multiaddrs: [`/ip4/47.93.11.212/tcp/4001/p2p/${SELF}`] },
        {
          relayId: "QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
          multiaddrs: ["/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN"],
        },
        { relayId: "12D3KooWFromGossip", multiaddrs: ["/ip4/8.8.4.4/tcp/4001/p2p/12D3KooWFromGossip"] },
      ],
      { verified: false },
      60_000,
    );
    const book = roster.relayBook();
    expect(book.some((e) => e.relayId === SELF)).toBe(false);
    expect(book.some((e) => e.relayId.includes("QmNnoo"))).toBe(false);
    expect(book.some((e) => e.relayId === "12D3KooWFromGossip")).toBe(true);
  });
});
