import { describe, expect, it } from "vitest";
import { pickBestLibp2pPeerDirectoryRecord } from "../src/peer-transport-resolve.js";

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
});
