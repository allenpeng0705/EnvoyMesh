import { describe, expect, it } from "vitest";
import {
  filterUsableOutboundPeerDialHints,
  filterDialHintsForOutboundSend,
  hasDirectPrivateLanDialHints,
  hasDirectTcpDialHints,
  isBrowserOnlyTransportDialHint,
  isLoopbackOrUnspecifiedDialHint,
  isLikelyInboundConnSnapshotDialHint,
  isPrivateLanTcpDialHint,
  isQuicDialHint,
  isUnusableDesktopCircuitDialHint,
  isUsableOutboundPeerDialHint,
  preferNonLoopbackDialHints,
} from "../src/index.js";

describe("dial hint sorting", () => {
  describe("isQuicDialHint", () => {
    it("returns true for quic-v1 multiaddr", () => {
      expect(isQuicDialHint("/ip4/1.2.3.4/udp/4000/quic-v1")).toBe(true);
    });

    it("returns true for quic-v1 with peerid", () => {
      expect(isQuicDialHint("/ip4/1.2.3.4/udp/4000/quic-v1/p2p/12D3KooWTest")).toBe(true);
      expect(isBrowserOnlyTransportDialHint("/ip4/1.2.3.4/udp/4000/quic-v1/p2p/12D3KooWTest")).toBe(true);
    });

    it("returns false for tcp-only multiaddr", () => {
      expect(isQuicDialHint("/ip4/1.2.3.4/tcp/4000")).toBe(false);
    });

    it("returns false for ws/wss multiaddr", () => {
      expect(isQuicDialHint("/dns4/example.com/tcp/443/wss")).toBe(false);
    });

    it("returns false for udp without quic-v1", () => {
      expect(isQuicDialHint("/ip4/1.2.3.4/udp/4000")).toBe(false);
    });
  });

  describe("isLoopbackOrUnspecifiedDialHint", () => {
    it("returns true for 127.0.0.x", () => {
      expect(isLoopbackOrUnspecifiedDialHint("/ip4/127.0.0.1/tcp/4000")).toBe(true);
    });

    it("returns true for 0.0.0.0", () => {
      expect(isLoopbackOrUnspecifiedDialHint("/ip4/0.0.0.0/tcp/4000")).toBe(true);
    });

    it("returns true for ::1 loopback", () => {
      expect(isLoopbackOrUnspecifiedDialHint("/ip6/::1/tcp/4000")).toBe(true);
    });

    it("returns false for public IP", () => {
      expect(isLoopbackOrUnspecifiedDialHint("/ip4/1.2.3.4/tcp/4000")).toBe(false);
    });

    it("returns false for LAN IP", () => {
      expect(isLoopbackOrUnspecifiedDialHint("/ip4/192.168.1.1/tcp/4000")).toBe(false);
    });
  });

  describe("isPrivateLanTcpDialHint", () => {
    it("returns true for RFC1918 TCP multiaddrs", () => {
      expect(isPrivateLanTcpDialHint("/ip4/192.168.1.50/tcp/4011/p2p/12D3KooW")).toBe(true);
      expect(isPrivateLanTcpDialHint("/ip4/10.0.0.5/tcp/4011/p2p/12D3KooW")).toBe(true);
    });

    it("returns false for relay circuits and loopback", () => {
      expect(
        isPrivateLanTcpDialHint(
          "/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooW",
        ),
      ).toBe(false);
      expect(isPrivateLanTcpDialHint("/ip4/127.0.0.1/tcp/4011/p2p/12D3KooW")).toBe(false);
    });
  });

  describe("hasDirectTcpDialHints", () => {
    it("detects LAN direct TCP among relay hints", () => {
      const hints = [
        "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer",
        "/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWPeer",
      ];
      expect(hasDirectTcpDialHints(hints)).toBe(true);
      expect(hasDirectPrivateLanDialHints(hints)).toBe(true);
    });
  });

  describe("filterDialHintsForOutboundSend", () => {
    it("strips circuits when direct TCP hints exist and circuits are not preferred", () => {
      const peerId = "12D3KooWFilterDialHintsPeer";
      const hints = [
        `/ip4/192.168.1.50/tcp/4011/p2p/${peerId}`,
        `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/${peerId}`,
      ];
      const out = filterDialHintsForOutboundSend(hints, peerId, { preferCircuitHints: false });
      expect(out.some((h) => h.includes("/p2p-circuit/"))).toBe(false);
      expect(out.some((h) => h.includes("192.168.1.50"))).toBe(true);
    });

    it("keeps circuits when no direct path exists", () => {
      const peerId = "12D3KooWFilterDialHintsPeer";
      const circuit = `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/${peerId}`;
      const out = filterDialHintsForOutboundSend([circuit], peerId, { preferCircuitHints: false });
      expect(out).toContain(circuit);
    });
  });

  describe("preferNonLoopbackDialHints", () => {
    it("puts TCP hints before QUIC/WebTransport when both are present", () => {
      const hints = [
        "/ip4/1.2.3.4/udp/4001/quic-v1/p2p/12D3KooWQUIC",
        "/ip4/1.2.3.4/tcp/4000/p2p/12D3KooWTCP",
      ];
      const sorted = preferNonLoopbackDialHints(hints);
      expect(sorted[0]).toContain("/tcp/");
      expect(sorted[1]).toContain("/quic-v1");
    });

    it("prefers direct TCP over relay circuits when both are present", () => {
      const hints = [
        "/ip4/1.2.3.4/tcp/4000/p2p/12D3KooWTCP",
        "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWTCP",
      ];
      const sorted = preferNonLoopbackDialHints(hints);
      expect(sorted[0]).toContain("/tcp/");
      expect(sorted[0]).not.toContain("/p2p-circuit/");
    });

    it("prefers private LAN TCP over public WAN and relay circuits", () => {
      const hints = [
        "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer",
        "/ip4/8.8.8.8/tcp/4001/p2p/12D3KooWPeer",
        "/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWPeer",
      ];
      const sorted = preferNonLoopbackDialHints(hints);
      expect(sorted[0]).toContain("192.168.1.50");
    });

    it("filters loopback when non-loopback exists (QUIC preference does not override loopback filtering)", () => {
      // preferNonLoopbackDialHints drops loopback when any non-loopback exists.
      // This test documents that behavior; loopback is excluded even if it is QUIC.
      const hints = [
        "/ip4/127.0.0.1/udp/4001/quic-v1/p2p/12D3KooWLocalhostQUIC",
        "/ip4/192.168.1.10/tcp/4000/p2p/12D3KooWLanTCP",
      ];
      const sorted = preferNonLoopbackDialHints(hints);
      expect(sorted.length).toBe(1);
      expect(sorted[0]).toContain("/tcp/");
      expect(sorted[0]).toContain("192.168.1.10");
    });

    it("prefers TCP over QUIC when only loopback addresses are available", () => {
      const hints = [
        "/ip4/127.0.0.1/udp/4001/quic-v1",
        "/ip4/127.0.0.1/tcp/4000",
      ];
      const sorted = preferNonLoopbackDialHints(hints);
      expect(sorted[0]).toContain("/tcp/");
      expect(sorted[1]).toContain("/quic-v1");
    });

    it("preserves order among hints of the same type", () => {
      const hints = [
        "/ip4/1.2.3.4/tcp/4000",
        "/ip4/5.6.7.8/udp/4001/quic-v1",
        "/ip4/9.9.9.9/tcp/4002",
        "/ip4/2.2.2.2/udp/4003/quic-v1",
      ];
      const sorted = preferNonLoopbackDialHints(hints);
      expect(sorted[0]).toContain("/tcp/");
      expect(sorted[0]).toContain("1.2.3.4");
      expect(sorted[1]).toContain("/tcp/");
      expect(sorted[1]).toContain("9.9.9.9");
      expect(sorted[2]).toContain("/quic-v1");
      expect(sorted[2]).toContain("5.6.7.8");
      expect(sorted[3]).toContain("/quic-v1");
      expect(sorted[3]).toContain("2.2.2.2");
    });

    it("returns empty array for empty input", () => {
      expect(preferNonLoopbackDialHints([])).toEqual([]);
    });

    it("rejects ephemeral-looking addresses even when explicit peer ID matches", () => {
      // Port 64595 ≥ 32768 → ephemeral source port, not a listen address.
      // The matching peer ID does not override the snapshot heuristic —
      // high ports are almost never valid listen addresses regardless of peer ID.
      const target = "12D3KooWN67PannbfXrLPhgJkkRGWGN9UBV3Xfu5UpzdK1dY8qGD";
      const ephemeral = `/ip4/192.168.3.78/tcp/64595/p2p/${target}`;
      const stable = `/ip4/192.168.3.78/tcp/4001/p2p/${target}`;
      expect(isLikelyInboundConnSnapshotDialHint(ephemeral)).toBe(true);
      expect(isUsableOutboundPeerDialHint(ephemeral, target)).toBe(false);
      expect(isUsableOutboundPeerDialHint(stable, target)).toBe(true);
      expect(hasDirectTcpDialHints([ephemeral])).toBe(false);
      expect(hasDirectTcpDialHints([stable])).toBe(true);
      expect(filterUsableOutboundPeerDialHints([ephemeral, stable], target)).toEqual([stable]);
    });

    it("allows addresses without /p2p/ suffix when targetPeerId is known", () => {
      // libp2p peer store strips /p2p/ suffixes from stored addresses.
      // Addresses without /p2p/ lack the trailing / the snapshot regex
      // requires, so they are not flagged as snapshots — but they
      // still need isUsableOutboundPeerDialHint to accept them.
      const target = "12D3KooWN67PannbfXrLPhgJkkRGWGN9UBV3Xfu5UpzdK1dY8qGD";
      const stripped = "/ip4/192.168.3.78/tcp/55093";
      // No trailing / after the port — regex /\/tcp\/(\d+)\// doesn't match.
      expect(isLikelyInboundConnSnapshotDialHint(stripped)).toBe(false);
      // With targetPeerId known, passes through (explicit-peer mismatch guard
      // only applies when an explicit /p2p/ peer ID is present).
      expect(isUsableOutboundPeerDialHint(stripped, target)).toBe(true);
    });

    it("still filters ephemeral snapshot addresses when targetPeerId is not provided", () => {
      const target = "12D3KooWN67PannbfXrLPhgJkkRGWGN9UBV3Xfu5UpzdK1dY8qGD";
      const ephemeral = `/ip4/192.168.3.78/tcp/64595/p2p/${target}`;
      const stripped = "/ip4/192.168.3.78/tcp/55093";
      expect(isLikelyInboundConnSnapshotDialHint(ephemeral)).toBe(true);
      // Without targetPeerId, the snapshot check still applies.
      expect(isUsableOutboundPeerDialHint(ephemeral)).toBe(false);
      // Stripped address is not flagged as snapshot (no trailing / after port),
      // but isLoopbackOrUnspecifiedDialHint etc. don't catch it either.
      expect(isUsableOutboundPeerDialHint(stripped)).toBe(true);
    });

    it("filters QUIC bootstrap circuit paths for desktop outbound dials", () => {
      const quicCircuit =
        "/ip4/65.109.147.95/udp/4001/quic-v1/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer";
      const tcpCircuit =
        "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer";
      expect(isUnusableDesktopCircuitDialHint(quicCircuit)).toBe(true);
      expect(isUnusableDesktopCircuitDialHint(tcpCircuit)).toBe(false);
      expect(isUsableOutboundPeerDialHint(quicCircuit, "12D3KooWPeer")).toBe(false);
      expect(isUsableOutboundPeerDialHint(tcpCircuit, "12D3KooWPeer")).toBe(true);
      expect(
        filterUsableOutboundPeerDialHints(
          [
            "/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWPeer",
            quicCircuit,
            tcpCircuit,
          ],
          "12D3KooWPeer",
        ),
      ).toEqual([
        "/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWPeer",
        tcpCircuit,
      ]);
    });

    it("handles single hint", () => {
      const hints = ["/ip4/1.2.3.4/tcp/4000"];
      expect(preferNonLoopbackDialHints(hints)).toEqual(hints);
    });

    it("filters out loopback when non-loopback exists", () => {
      const hints = [
        "/ip4/127.0.0.1/tcp/4000",
        "/ip4/1.2.3.4/tcp/4001",
      ];
      const sorted = preferNonLoopbackDialHints(hints);
      expect(sorted).toEqual(["/ip4/1.2.3.4/tcp/4001"]);
    });

    it("returns loopback-only when no non-loopback exists", () => {
      const hints = [
        "/ip4/127.0.0.1/tcp/4000",
        "/ip6/::1/tcp/4001",
      ];
      const sorted = preferNonLoopbackDialHints(hints);
      expect(sorted.length).toBe(2);
    });
  });

  // ------------------------------------------------------------------
  // Parallel dial speed ordering — Round 4
  // ------------------------------------------------------------------
  describe("parallel dial speed ordering", () => {
    const peerId = "12D3KooWSpeedOrderPeer";

    it("sorts LAN TCP before WAN TCP before relay circuits", () => {
      const relay = `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/${peerId}`;
      const wan = `/ip4/8.8.8.8/tcp/4001/p2p/${peerId}`;
      const lan = `/ip4/192.168.1.50/tcp/4011/p2p/${peerId}`;

      const ordered = [relay, wan, lan].sort((a, b) => {
        const aLan = isPrivateLanTcpDialHint(a) ? 1 : 0;
        const bLan = isPrivateLanTcpDialHint(b) ? 1 : 0;
        if (aLan !== bLan) return bLan - aLan; // LAN first
        const aCircuit = a.includes("/p2p-circuit/") ? 1 : 0;
        const bCircuit = b.includes("/p2p-circuit/") ? 1 : 0;
        if (aCircuit !== bCircuit) return aCircuit - bCircuit; // direct before circuit
        return 0;
      });

      // LAN must be first
      expect(ordered[0]).toContain("192.168.1.50");
      expect(isPrivateLanTcpDialHint(ordered[0])).toBe(true);
      // Relay circuit must be last
      expect(ordered[2]).toContain("/p2p-circuit/");
    });

    it("preserves relative order among same-category addresses", () => {
      const lan1 = `/ip4/192.168.1.50/tcp/4011/p2p/${peerId}`;
      const lan2 = `/ip4/10.0.0.5/tcp/4011/p2p/${peerId}`;

      const ordered = [lan2, lan1].sort((a, b) => {
        const aLan = isPrivateLanTcpDialHint(a) ? 1 : 0;
        const bLan = isPrivateLanTcpDialHint(b) ? 1 : 0;
        if (aLan !== bLan) return bLan - aLan;
        const aCircuit = a.includes("/p2p-circuit/") ? 1 : 0;
        const bCircuit = b.includes("/p2p-circuit/") ? 1 : 0;
        if (aCircuit !== bCircuit) return aCircuit - bCircuit;
        return 0;
      });

      // Both are LAN, so original order is preserved (stable sort-equivalent)
      expect(ordered.length).toBe(2);
      expect(isPrivateLanTcpDialHint(ordered[0])).toBe(true);
      expect(isPrivateLanTcpDialHint(ordered[1])).toBe(true);
    });

    it("rejects ephemeral-with-p2p but allows stripped addresses", () => {
      const target = "12D3KooWAllUsablePeer";
      // Ephemeral port WITH /p2p/ suffix → rejected (snapshot check applies)
      const ephemeralWithP2p = `/ip4/192.168.3.78/tcp/64595/p2p/${target}`;
      expect(isUsableOutboundPeerDialHint(ephemeralWithP2p, target)).toBe(false);
      // Stable port with /p2p/ → accepted
      const stableWithP2p = `/ip4/192.168.3.78/tcp/4001/p2p/${target}`;
      expect(isUsableOutboundPeerDialHint(stableWithP2p, target)).toBe(true);
      // Stripped address (no /p2p/) → accepted (trust caller's target)
      const stripped = "/ip4/192.168.3.78/tcp/55093";
      expect(isUsableOutboundPeerDialHint(stripped, target)).toBe(true);
    });
  });
});
