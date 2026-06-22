import { describe, expect, it } from "vitest";
import { pickBestLibp2pPeerDirectoryRecord, resolveRecipientEnvelopePeerId } from "../src/peer-transport-resolve.js";

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
});
