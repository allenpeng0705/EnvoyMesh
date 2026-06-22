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

    it("filters ephemeral inbound TCP snapshot ports for desktop outbound dials", () => {
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
});
