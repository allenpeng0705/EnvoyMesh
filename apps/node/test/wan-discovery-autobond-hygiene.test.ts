/**
 * Production WAN discovery / sponsor-friend dial hygiene — focused E2E-style
 * unit coverage (no live relay required).
 *
 * Scenarios covered (home Mac behind NAT + cloud circuit-relay):
 *  1. Address filter prefers wan-public when circuit exists
 *  2. Bundled backfill strips RFC1918 for WAN packages
 *  3. Topic search normalizes free text → interest:<slug>
 *  4. WAN invite always carries a synthetic circuit when mesh has none
 *  5. Relay roster scoped replace keeps interest + publish, and shrinks
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  replaceRelayClientAdvertisedTopics,
  setRelayClientAdvertisedTopics,
  getRelayClientAdvertisedTopics,
  getRelayClientAdvertisedTopicsForScope,
} from "../src/relay-client-cycle.js";
import { pickAddressFilterForPeer } from "../src/outbound-dial-hints.js";
import { selectBundledSponsorBackfillAddrs } from "../src/bundled-sponsor-friend-loader.js";
import { normalizeDiscoveryTopicQuery, expandDiscoveryTopicQueries } from "../src/capability-discovery.js";
import { relayCircuitToPeer } from "@envoymesh/network";

describe("WAN production discovery + auto-bond hygiene", () => {
  const ALLEN = "12D3KooWQsD3ougrAJjmKeevSiY2azE5CKqLjcijyYreS6fUFYCR";
  const RELAY =
    "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
  const CIRCUIT = `${RELAY}/p2p-circuit/p2p/${ALLEN}`;
  const LAN = `/ip4/192.168.3.85/tcp/64589/p2p/${ALLEN}`;

  beforeEach(() => {
    setRelayClientAdvertisedTopics([]);
  });

  it("sponsor-friend dial filter: circuit+LAN → all (circuit-first) on wan-default", () => {
    expect(pickAddressFilterForPeer([LAN, CIRCUIT], "wan-default")).toBe("all");
    expect(pickAddressFilterForPeer([LAN, CIRCUIT], "lan-fast")).toBe("all");
    expect(pickAddressFilterForPeer([CIRCUIT], "wan-default")).toBe("wan-public");
  });

  it("installer backfill keeps circuit, drops home LAN", () => {
    const addrs = selectBundledSponsorBackfillAddrs([CIRCUIT], [LAN, RELAY]);
    expect(addrs).toContain(CIRCUIT);
    expect(addrs).toContain(RELAY);
    expect(addrs.some((a) => a.includes("192.168."))).toBe(false);
  });

  it("By-topic free text matches advertised interest topics", () => {
    // Advertise side uses interestTopicFor("Music") → interest:music
    // Search side historically sent topic: "music" and missed.
    expect(normalizeDiscoveryTopicQuery("music")).toBe("interest:music");
    expect(normalizeDiscoveryTopicQuery("Music")).toBe("interest:music");
    expect(normalizeDiscoveryTopicQuery("interest:music")).toBe("interest:music");
    expect(normalizeDiscoveryTopicQuery("Interest:Music")).toBe("interest:music");
    expect(normalizeDiscoveryTopicQuery("username:Allen_Peng")).toBe("username:allen_peng");
  });

  it("By-topic bare text also expands to capability tags", () => {
    expect(expandDiscoveryTopicQueries("coding-help")).toEqual([
      "interest:coding-help",
      "capability:coding-help",
      "coding-help",
    ]);
    expect(expandDiscoveryTopicQueries("interest:music")).toEqual(["interest:music"]);
  });

  it("synthetic circuit from community relay base matches invite shape", () => {
    const circuit = relayCircuitToPeer(RELAY, ALLEN);
    expect(circuit).toBe(CIRCUIT);
  });

  it("relay roster scoped replace keeps interest + publish (NAT fallback)", () => {
    replaceRelayClientAdvertisedTopics("identity", [
      "interest:music",
      "displayname:allen-peng",
    ]);
    replaceRelayClientAdvertisedTopics("capability", [
      "capability:envoymesh.web-content",
      "publish:family-photos",
    ]);
    const topics = getRelayClientAdvertisedTopics();
    expect(topics).toEqual(
      expect.arrayContaining([
        "interest:music",
        "displayname:allen-peng",
        "capability:envoymesh.web-content",
        "publish:family-photos",
      ]),
    );
    // Clear on private profile
    setRelayClientAdvertisedTopics([]);
    expect(getRelayClientAdvertisedTopics()).toEqual([]);
  });

  it("relay roster shrinks when an interest or publish tag is removed", () => {
    replaceRelayClientAdvertisedTopics("identity", [
      "interest:music",
      "interest:tech",
    ]);
    replaceRelayClientAdvertisedTopics("capability", [
      "publish:family-photos",
      "publish:old-album",
    ]);
    replaceRelayClientAdvertisedTopics("identity", ["interest:music"]);
    replaceRelayClientAdvertisedTopics("capability", ["publish:family-photos"]);
    expect(getRelayClientAdvertisedTopics()).toEqual([
      "interest:music",
      "publish:family-photos",
    ]);
    expect(getRelayClientAdvertisedTopicsForScope("identity")).toEqual([
      "interest:music",
    ]);
    expect(getRelayClientAdvertisedTopicsForScope("capability")).toEqual([
      "publish:family-photos",
    ]);
  });
});
