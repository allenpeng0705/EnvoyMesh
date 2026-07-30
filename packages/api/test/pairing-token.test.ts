/**
 * Pairing token encode/decode — multi-relay QR field (`rels`).
 */
import { describe, expect, it } from "vitest";
import {
  decodePairingToken,
  encodePairingToken,
  normalizeRelayWsList,
} from "../src/pairing-token.js";
import type { PairingPayload } from "../src/ws-protocol.js";

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
});
