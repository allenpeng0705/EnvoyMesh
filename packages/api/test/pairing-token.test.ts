/**
 * Pairing token encode/decode — multi-relay QR field (`rels`).
 */
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  decodePairingToken,
  encodePairingToken,
  normalizeBootstrapPeers,
  normalizeRelayWsList,
} from "../src/pairing-token.js";
import type { PairingPayload } from "../src/ws-protocol.js";

/** The raw V1 JSON inside a token — used to pin the wire key, not just the round trip. */
function tokenJson(token: string): Record<string, unknown> {
  return JSON.parse(gunzipSync(Buffer.from(token, "base64url")).toString("utf8"));
}

describe("pairing-token multi-relay", () => {
  it("normalizeRelayWsList drops primary duplicates and caps at 8", () => {
    const extras = [
      "ws://a.example/ws?token=x",
      "ws://b.example/ws",
      "ws://a.example/ws",
      ...Array.from({ length: 10 }, (_, i) => `ws://r${i}.example/ws`),
    ];
    const out = normalizeRelayWsList(extras, "ws://a.example/ws");
    expect(out[0]).toBe("ws://b.example/ws");
    expect(out).not.toContain("ws://a.example/ws");
    expect(out.length).toBe(8);
  });

  it("round-trips relayWsUrls as rels in the compressed token", async () => {
    const payload: PairingPayload = {
      wsUrl: "wss://primary.example/ws?target=home&token=tok",
      relayWsUrl: "wss://primary.example/ws",
      relayWsUrls: ["ws://1.2.3.4:15432/ws", "ws://5.6.7.8:15432/ws"],
      token: "pair-token",
      ownerId: "envoy:owner:alice",
      homeNodePeerId: "12D3KooWHome",
    };
    const token = await encodePairingToken(payload);
    const decoded = decodePairingToken(token);
    expect(decoded.relayWsUrl).toBe("wss://primary.example/ws");
    expect(decoded.relayWsUrls).toEqual([
      "ws://1.2.3.4:15432/ws",
      "ws://5.6.7.8:15432/ws",
    ]);
    expect(decoded.token).toBe("pair-token");
  });

  it("omits rels when there are no extras", async () => {
    const payload: PairingPayload = {
      wsUrl: "wss://primary.example/ws",
      relayWsUrl: "wss://primary.example/ws",
      token: "t",
      ownerId: "envoy:owner:bob",
    };
    const token = await encodePairingToken(payload);
    const decoded = decodePairingToken(token);
    expect(decoded.relayWsUrls).toBeUndefined();
  });

  it("carries the app that minted the code, so a phone app can refuse another product's QR", async () => {
    const token = await encodePairingToken({
      wsUrl: "ws://192.168.1.20:3030/ws",
      token: "pair-token",
      ownerId: "envoy:owner:alice",
      app: "EnvoyDev",
    });
    expect(decodePairingToken(token).app).toBe("EnvoyDev");

    // Absent stays absent: codes minted before the field existed must decode unchanged
    // rather than inventing an app name.
    const older = await encodePairingToken({
      wsUrl: "ws://192.168.1.20:3030/ws",
      token: "pair-token",
      ownerId: "envoy:owner:alice",
    });
    expect(decodePairingToken(older).app).toBeUndefined();
  });

  it("carries ownerPublicKey and relayPeerId additively within v1", async () => {
    // These two were the fields the compressed form silently dropped relative to the
    // legacy query form. A new JSON key inside v1 is backward compatible in both
    // directions: old readers ignore unknown keys, and the version the Dart reader
    // requires (`v == 1`) does not change.
    const token = await encodePairingToken({
      wsUrl: "wss://primary.example/ws",
      token: "t",
      ownerId: "envoy:owner:alice",
      ownerPublicKey: "-----BEGIN PUBLIC KEY-----\nkey\n-----END PUBLIC KEY-----",
      relayPeerId: "12D3KooWRelay",
    });
    const decoded = decodePairingToken(token);
    expect(decoded.ownerPublicKey).toBe(
      "-----BEGIN PUBLIC KEY-----\nkey\n-----END PUBLIC KEY-----",
    );
    expect(decoded.relayPeerId).toBe("12D3KooWRelay");

    // A v1 token minted before the keys existed still decodes: absent stays absent.
    const older = await encodePairingToken({
      wsUrl: "wss://primary.example/ws",
      token: "t",
      ownerId: "envoy:owner:alice",
    });
    expect(decodePairingToken(older).ownerPublicKey).toBeUndefined();
    expect(decodePairingToken(older).relayPeerId).toBeUndefined();
  });
});

describe("pairing-token dial addresses", () => {
  const multiaddrs = [
    "/ip4/192.168.1.20/tcp/4001/p2p/12D3KooWHome",
    "/ip4/203.0.113.10/udp/4001/quic-v1/p2p/12D3KooWHome",
    "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo/p2p-circuit/p2p/12D3KooWHome",
  ];

  it("round-trips a multi-entry bootstrapPeers list alongside the relay hints", async () => {
    // `homeNodePeerId` says who to dial; these are where. The compressed form carried the
    // first and not the second, so a relay-free libp2p dial had no address at all. Both
    // lists are multi-entry on purpose: one entry hides a "picks the first" bug.
    const payload: PairingPayload = {
      wsUrl: "wss://primary.example/ws",
      relayWsUrl: "wss://primary.example/ws",
      relayWsUrls: ["wss://relay-us.example/ws", "wss://relay-eu.example/ws"],
      token: "t",
      ownerId: "envoy:owner:alice",
      homeNodePeerId: "12D3KooWHome",
      bootstrapPeers: multiaddrs,
    };
    const decoded = decodePairingToken(await encodePairingToken(payload));
    expect(decoded.homeNodePeerId).toBe("12D3KooWHome");
    expect(decoded.bootstrapPeers).toEqual(multiaddrs);
    // The relay hints and the dial addresses are two different lists; reading one must
    // not consume or replace the other.
    expect(decoded.relayWsUrls).toEqual(payload.relayWsUrls);
  });

  it("writes them under the v1 key `bp`, the name the Dart reader reads", async () => {
    // Pins the *wire* name, not just the round trip: a rename here would still round-trip
    // through this encoder/decoder pair while every phone in the field saw nothing.
    const token = await encodePairingToken({
      wsUrl: "wss://primary.example/ws",
      token: "t",
      ownerId: "envoy:owner:alice",
      bootstrapPeers: multiaddrs,
    });
    const obj = tokenJson(token);
    expect(obj.v).toBe(1);
    expect(obj.bp).toEqual(multiaddrs);
    // Still no version bump — the whole additivity rule.
    expect(obj.v).not.toBe(2);
  });

  it("omits bp when there are no multiaddrs, so an old v1 token shape is unchanged", async () => {
    const token = await encodePairingToken({
      wsUrl: "wss://primary.example/ws",
      token: "t",
      ownerId: "envoy:owner:alice",
    });
    const obj = tokenJson(token);
    expect(obj.bp).toBeUndefined();
    expect(decodePairingToken(token).bootstrapPeers).toBeUndefined();
  });

  it("normalizeBootstrapPeers trims, drops blanks/duplicates and caps at 8", () => {
    const out = normalizeBootstrapPeers([
      "  /ip4/10.0.0.1/tcp/4001  ",
      "",
      "   ",
      "/ip4/10.0.0.1/tcp/4001",
      ...Array.from({ length: 10 }, (_, i) => `/ip4/10.0.0.${i + 2}/tcp/4001`),
    ]);
    expect(out[0]).toBe("/ip4/10.0.0.1/tcp/4001");
    expect(out).not.toContain("");
    expect(new Set(out).size).toBe(out.length);
    expect(out.length).toBe(8);
    expect(normalizeBootstrapPeers(undefined)).toEqual([]);
  });
});
