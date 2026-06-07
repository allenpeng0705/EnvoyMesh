import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createChatRoomSyncPayload } from "@envoymesh/protocol";
import {
  CHAT_ROOM_PENDING_SYNC_FILE,
  createLocalChatRoomPendingSyncStore,
} from "../src/chat-room-pending-sync-store.js";

describe("createLocalChatRoomPendingSyncStore", () => {
  it("upserts, lists, and removes pending sync deliveries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-chat-room-pending-sync-"));
    try {
      const store = createLocalChatRoomPendingSyncStore(dir);
      const syncPayload = createChatRoomSyncPayload({
        roomId: "11111111-1111-4111-8111-111111111111",
        title: "Plans",
        creatorOwnerId: "envoy:owner:alice",
        updatedByOwnerId: "envoy:owner:alice",
        memberOwnerIds: ["envoy:owner:alice", "envoy:owner:bob"],
        revision: 2,
        action: "invite",
        deviceCertificate: {
          version: "0.1",
          certificateId: "cert-1",
          ownerId: "envoy:owner:alice",
          deviceId: "envoy:device:alice",
          devicePublicKeyPem: "alice-dev-pem",
          deviceProfile: "primary",
          capabilities: ["message.send"],
          issuedAt: "2026-05-28T12:00:00.000Z",
          expiresAt: null,
          signature: "sig",
        },
        ownerPublicKeyPem: "alice-owner-pem",
      });
      const base = {
        roomId: "11111111-1111-4111-8111-111111111111",
        revision: 2,
        targetOwnerId: "envoy:owner:bob",
        syncPayload,
        createdAt: "2026-05-28T12:00:01.000Z",
      };
      await store.upsert(base);
      expect(await store.list()).toHaveLength(1);

      await store.upsert({ ...base, targetOwnerId: "envoy:owner:carol" });
      expect((await store.list()).map((r) => r.targetOwnerId).sort()).toEqual([
        "envoy:owner:bob",
        "envoy:owner:carol",
      ]);

      await store.remove(base.roomId, 2, "envoy:owner:bob");
      expect((await store.list()).map((r) => r.targetOwnerId)).toEqual(["envoy:owner:carol"]);

      await store.removeForRoom(base.roomId);
      expect(await store.list()).toHaveLength(0);

      const raw = await readFile(join(dir, CHAT_ROOM_PENDING_SYNC_FILE), "utf8");
      expect(raw).toContain('"version": "0.1"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("persists attempts and backoff fields across upserts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-chat-room-pending-sync-"));
    try {
      const store = createLocalChatRoomPendingSyncStore(dir);
      const syncPayload = createChatRoomSyncPayload({
        roomId: "11111111-1111-4111-8111-111111111111",
        title: "Plans",
        creatorOwnerId: "envoy:owner:alice",
        updatedByOwnerId: "envoy:owner:alice",
        memberOwnerIds: ["envoy:owner:alice", "envoy:owner:bob"],
        revision: 2,
        action: "invite",
        deviceCertificate: {
          version: "0.1",
          certificateId: "cert-1",
          ownerId: "envoy:owner:alice",
          deviceId: "envoy:device:alice",
          devicePublicKeyPem: "alice-dev-pem",
          deviceProfile: "primary",
          capabilities: ["message.send"],
          issuedAt: "2026-05-28T12:00:00.000Z",
          expiresAt: null,
          signature: "sig",
        },
        ownerPublicKeyPem: "alice-owner-pem",
      });
      await store.upsert({
        roomId: "11111111-1111-4111-8111-111111111111",
        revision: 2,
        targetOwnerId: "envoy:owner:bob",
        syncPayload,
        createdAt: "2026-05-28T12:00:00.000Z",
        attempts: 4,
        lastAttemptAt: "2026-05-28T12:00:10.000Z",
        nextAttemptAt: "2026-05-28T12:01:30.000Z",
      });
      const stored = (await store.list())[0];
      expect(stored?.attempts).toBe(4);
      expect(stored?.lastAttemptAt).toBe("2026-05-28T12:00:10.000Z");
      expect(stored?.nextAttemptAt).toBe("2026-05-28T12:01:30.000Z");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
