import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createChatRoomMessagePayload } from "@envoymesh/protocol";
import {
  CHAT_ROOM_PENDING_MESSAGE_FILE,
  createLocalChatRoomPendingMessageStore,
} from "../src/chat-room-pending-message-store.js";

describe("createLocalChatRoomPendingMessageStore", () => {
  it("upserts, lists, and removes pending message deliveries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-chat-room-pending-msg-"));
    try {
      const store = createLocalChatRoomPendingMessageStore(dir);
      const payload = createChatRoomMessagePayload({
        roomId: "11111111-1111-4111-8111-111111111111",
        senderOwnerId: "envoy:owner:alice",
        text: "Hello",
      });
      const record = {
        messageId: "msg-1",
        roomId: "11111111-1111-4111-8111-111111111111",
        targetOwnerId: "envoy:owner:bob",
        envelopeCreatedAt: "2026-05-28T12:00:00.000Z",
        messagePayload: payload,
        createdAt: "2026-05-28T12:00:01.000Z",
      };

      await store.upsert(record);
      expect(await store.list()).toHaveLength(1);

      await store.upsert({ ...record, createdAt: "2026-05-28T12:00:02.000Z" });
      expect(await store.list()).toHaveLength(1);
      expect((await store.list())[0]?.createdAt).toBe("2026-05-28T12:00:02.000Z");

      await store.remove("msg-1", "envoy:owner:bob");
      expect(await store.list()).toHaveLength(0);

      await store.upsert(record);
      await store.upsert({
        ...record,
        messageId: "msg-2",
        targetOwnerId: "envoy:owner:carol",
      });
      expect(await store.list()).toHaveLength(2);

      await store.removeForMessage("msg-1");
      expect((await store.list()).map((row) => row.messageId)).toEqual(["msg-2"]);

      await store.removeForRoom("11111111-1111-4111-8111-111111111111");
      expect(await store.list()).toHaveLength(0);

      const raw = await readFile(join(dir, CHAT_ROOM_PENDING_MESSAGE_FILE), "utf8");
      expect(raw).toContain('"version": "0.1"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("persists attempts and backoff fields across upserts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-chat-room-pending-msg-"));
    try {
      const store = createLocalChatRoomPendingMessageStore(dir);
      const payload = createChatRoomMessagePayload({
        roomId: "11111111-1111-4111-8111-111111111111",
        senderOwnerId: "envoy:owner:alice",
        text: "Hello",
      });
      const base = {
        messageId: "msg-1",
        roomId: "11111111-1111-4111-8111-111111111111",
        targetOwnerId: "envoy:owner:bob",
        envelopeCreatedAt: "2026-05-28T12:00:00.000Z",
        messagePayload: payload,
        createdAt: "2026-05-28T12:00:01.000Z",
      };
      await store.upsert({ ...base });
      const stored = (await store.list())[0];
      expect(stored?.attempts).toBeUndefined();

      await store.upsert({
        ...base,
        attempts: 3,
        lastAttemptAt: "2026-05-28T12:00:05.000Z",
        nextAttemptAt: "2026-05-28T12:00:35.000Z",
      });
      const updated = (await store.list())[0];
      expect(updated?.attempts).toBe(3);
      expect(updated?.lastAttemptAt).toBe("2026-05-28T12:00:05.000Z");
      expect(updated?.nextAttemptAt).toBe("2026-05-28T12:00:35.000Z");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
