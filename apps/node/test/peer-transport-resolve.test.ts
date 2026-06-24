import { describe, expect, it } from "vitest";
import {
  pickBestLibp2pPeerDirectoryRecord,
  pickConnectedTransportForOwner,
  pickLibp2pFromConnectedPeers,
  resolveRecipientEnvelopePeerId,
} from "../src/peer-transport-resolve.js";

describe("pickBestLibp2pPeerDirectoryRecord", () => {
  it("prefers libp2p peer id over a newer envoy_* row for the same owner", () => {
    const ownerId = "envoy:owner:mac";
    const records = [
      {
        ownerId,
        peerId: "12D3KooWMacLibp2pOlder",
        lastSeenAt: "2026-05-28T10:00:00.000Z",
      },
      {
        ownerId,
        peerId: "envoy_1KoMqLW3ZC7LAhZGVvWvu7vsSYe7wHnkiVQmby3v_Y0",
        lastSeenAt: "2026-05-28T12:00:00.000Z",
      },
    ];
    const picked = pickBestLibp2pPeerDirectoryRecord(records, ownerId);
    expect(picked?.peerId).toBe("12D3KooWMacLibp2pOlder");
  });

  it("prefers a connected libp2p row over a newer disconnected one", () => {
    const ownerId = "envoy:owner:win";
    const records = [
      {
        ownerId,
        peerId: "12D3KooWWinNewerOffline",
        lastSeenAt: "2026-05-29T12:00:00.000Z",
      },
      {
        ownerId,
        peerId: "12D3KooWWinOlderOnline",
        lastSeenAt: "2026-05-29T10:00:00.000Z",
      },
    ];
    const picked = pickBestLibp2pPeerDirectoryRecord(records, ownerId, {
      isConnected: (peerId) => peerId === "12D3KooWWinOlderOnline",
    });
    expect(picked?.peerId).toBe("12D3KooWWinOlderOnline");
  });

  it("resolveRecipientEnvelopePeerId uses device key for transport row, not a stale connected row", () => {
    const ownerId = "envoy:owner:win";
    const devicePem = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAtest\n-----END PUBLIC KEY-----";
    const records = [
      {
        ownerId,
        peerId: "12D3KooWWinStaleConnected",
        lastSeenAt: "2026-05-29T12:00:00.000Z",
      },
      {
        ownerId,
        peerId: "12D3KooWWinCurrent",
        devicePublicKeyPem: devicePem,
        lastSeenAt: "2026-05-29T10:00:00.000Z",
      },
    ];
    const recipient = resolveRecipientEnvelopePeerId(records, ownerId, "12D3KooWWinCurrent");
    expect(recipient).toBeTruthy();
    expect(recipient).not.toBe("12D3KooWWinStaleConnected");
  });

  it("omits recipientPeerId when no device key is known (avoids misaddressed drops)", () => {
    const ownerId = "envoy_1KoMqLW3ZC7LAhZGVvWvu7vsSYe7wHnkiVQmby3v_Y0";
    const records = [{ ownerId, peerId: "12D3KooWWin", lastSeenAt: "2026-05-29T12:00:00.000Z" }];
    expect(resolveRecipientEnvelopePeerId(records, ownerId, "12D3KooWWin")).toBeUndefined();
  });
});

describe("pickLibp2pFromConnectedPeers", () => {
  it("returns libp2p row for owner when that peer is currently connected", () => {
    const ownerId = "envoy:owner:contact";
    const records = [
      {
        ownerId,
        peerId: "envoy_onlyEnvelopeId",
        lastSeenAt: "2026-05-30T12:00:00.000Z",
      },
      {
        ownerId,
        peerId: "12D3KooWLiveContact",
        lastSeenAt: "2026-05-30T10:00:00.000Z",
      },
    ];
    const picked = pickLibp2pFromConnectedPeers(records, ownerId, ["12D3KooWLiveContact", "12D3KooWOther"]);
    expect(picked?.peerId).toBe("12D3KooWLiveContact");
  });
});

describe("pickConnectedTransportForOwner", () => {
  it("prefers inbound-learned cache when that peer is connected", () => {
    const ownerId = "envoy:owner:win";
    const records = [
      {
        ownerId,
        peerId: "12D3KooWWinStaleOffline",
        lastSeenAt: "2026-05-29T12:00:00.000Z",
      },
    ];
    const cache = new Map([
      [ownerId, { peerId: "12D3KooWWinLiveInbound", listenAddrs: ["/ip4/10.0.0.2/tcp/4001"] }],
    ]);
    const picked = pickConnectedTransportForOwner(
      records,
      ownerId,
      ["12D3KooWWinLiveInbound"],
      cache,
    );
    expect(picked?.peerId).toBe("12D3KooWWinLiveInbound");
  });
});
