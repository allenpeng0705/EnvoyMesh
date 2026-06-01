import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chatRoomThreadKey,
  createLocalChatRoomStore,
  isChatRoomThreadKey,
  parseChatRoomThreadKey,
} from "../src/chat-room-store.js";

describe("createLocalChatRoomStore", () => {
  it("upserts and lists rooms", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-chat-room-"));
    try {
      const store = createLocalChatRoomStore(dir);
      const room = {
        roomId: "11111111-1111-4111-8111-111111111111",
        title: "Weekend",
        creatorOwnerId: "envoy:owner:alice",
        memberOwnerIds: ["envoy:owner:alice", "envoy:owner:bob"],
        revision: 1,
        updatedAt: "2026-05-28T12:00:00.000Z",
      };
      await store.upsert(room);
      const listed = await store.list();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.title).toBe("Weekend");
      expect(await store.get(room.roomId)).toEqual(room);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("chat room thread keys", () => {
  it("round-trips room thread keys", () => {
    const key = chatRoomThreadKey("11111111-1111-4111-8111-111111111111");
    expect(isChatRoomThreadKey(key)).toBe(true);
    expect(parseChatRoomThreadKey(key)).toBe("11111111-1111-4111-8111-111111111111");
  });
});
