import { describe, expect, it } from "vitest";
import { bondLevelLabel, nearbyPeerLabel } from "../../src/lib/display.js";
import { peerReachabilityLabel } from "../../src/lib/peer-reachability-label.js";
import type { TFunction } from "../../src/context/i18n-context.js";

/** Minimal stub for `t` — returns the key so tests can also verify the
 *  call site passed the right key. Production callers always pass a real
 *  i18n `t`; tests just need a function that takes a string. */
const t: TFunction = (key) => key;

describe("discover display helpers", () => {
  it("maps bond levels to plain language", () => {
    expect(bondLevelLabel(t, "direct")).toBe("display.bondLevel.direct");
    expect(bondLevelLabel(t, "public")).toBe("display.bondLevel.public");
    expect(bondLevelLabel(t, "referred")).toBe("display.bondLevel.referred");
    expect(bondLevelLabel(t, "blocked")).toBe("display.bondLevel.blocked");
    expect(bondLevelLabel(t, undefined)).toBe("display.bondLevel.unknown");
  });

  it("hides cryptic mDNS peer names", () => {
    expect(nearbyPeerLabel(t, "Peer 12D3KooW", "12D3KooWabc")).toBe(
      "display.nearbyPeerFallback",
    );
    expect(nearbyPeerLabel(t, "Alice", "12D3KooWabc")).toBe("Alice");
  });
});

describe("peer reachability label", () => {
  it("returns checking when no info is available", () => {
    expect(peerReachabilityLabel(t, null)).toBe("contactChat.reachabilityChecking");
  });

  it("returns offline when not connected", () => {
    expect(
      peerReachabilityLabel(t, {
        connected: false,
        direct: false,
        lastSeenMs: 0,
      }),
    ).toBe("contactChat.reachabilityOffline");
  });

  it("returns online direct when connected and direct", () => {
    expect(
      peerReachabilityLabel(t, {
        connected: true,
        direct: true,
        lastSeenMs: 0,
      }),
    ).toBe("contactChat.reachabilityOnlineDirect");
  });

  it("returns online relay when connected via relay", () => {
    expect(
      peerReachabilityLabel(t, {
        connected: true,
        direct: false,
        lastSeenMs: 0,
      }),
    ).toBe("contactChat.reachabilityOnlineRelay");
  });
});
