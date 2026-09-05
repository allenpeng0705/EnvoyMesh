import { describe, expect, it } from "vitest";
import { evaluateWanPeerOnlineGate } from "../src/wan-peer-online-gate.js";

const CIRCUIT = "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer";
const LAN = "/ip4/192.168.1.20/tcp/4001/p2p/12D3KooWPeer";
const PUBLIC_TCP = "/ip4/203.0.113.10/tcp/4001/p2p/12D3KooWPeer";

describe("evaluateWanPeerOnlineGate", () => {
  it("keeps same-LAN peers online without reservation", () => {
    expect(
      evaluateWanPeerOnlineGate({
        meshConnected: true,
        sameLan: true,
        discoveryProfile: "wan-default",
        hasLiveRelayReservation: false,
        dialHints: [LAN],
      }).online,
    ).toBe(true);
  });

  it("treats loopback TCP as local (Phase13 / same-host)", () => {
    expect(
      evaluateWanPeerOnlineGate({
        meshConnected: true,
        sameLan: false,
        discoveryProfile: "wan-default",
        hasLiveRelayReservation: false,
        dialHints: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWPeer"],
      }).online,
    ).toBe(true);
  });

  it("does not gate lan-fast when connected", () => {
    expect(
      evaluateWanPeerOnlineGate({
        meshConnected: true,
        sameLan: false,
        discoveryProfile: "lan-fast",
        hasLiveRelayReservation: false,
        dialHints: [],
      }).online,
    ).toBe(true);
  });

  it("marks WAN connected peers offline without a live reservation", () => {
    const r = evaluateWanPeerOnlineGate({
      meshConnected: true,
      sameLan: false,
      discoveryProfile: "wan-default",
      hasLiveRelayReservation: false,
      dialHints: [CIRCUIT],
    });
    expect(r.online).toBe(false);
    expect(r.reason).toBe("no-live-relay-reservation");
  });

  it("marks WAN peers offline when reservation is live but no dial path", () => {
    const r = evaluateWanPeerOnlineGate({
      meshConnected: true,
      sameLan: false,
      discoveryProfile: "wan-default",
      hasLiveRelayReservation: true,
      dialHints: [LAN],
    });
    expect(r.online).toBe(false);
    expect(r.reason).toBe("no-wan-dial-hints");
  });

  it("is online when reservation + public circuit hint", () => {
    expect(
      evaluateWanPeerOnlineGate({
        meshConnected: true,
        sameLan: false,
        discoveryProfile: "wan-default",
        hasLiveRelayReservation: true,
        dialHints: [CIRCUIT],
      }).online,
    ).toBe(true);
  });

  it("is online when reservation + already viaRelay", () => {
    expect(
      evaluateWanPeerOnlineGate({
        meshConnected: true,
        sameLan: false,
        viaRelay: true,
        discoveryProfile: "wan-default",
        hasLiveRelayReservation: true,
        dialHints: [],
      }).online,
    ).toBe(true);
  });

  it("is online when reservation + public direct TCP", () => {
    expect(
      evaluateWanPeerOnlineGate({
        meshConnected: true,
        sameLan: false,
        discoveryProfile: "wan-default",
        hasLiveRelayReservation: true,
        dialHints: [PUBLIC_TCP],
      }).online,
    ).toBe(true);
  });

  it("is offline when not mesh-connected", () => {
    expect(
      evaluateWanPeerOnlineGate({
        meshConnected: false,
        sameLan: false,
        discoveryProfile: "wan-default",
        hasLiveRelayReservation: true,
        dialHints: [CIRCUIT],
      }).online,
    ).toBe(false);
  });
});
