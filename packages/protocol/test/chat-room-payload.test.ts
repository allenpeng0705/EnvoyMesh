import { describe, expect, it } from "vitest";
import {
  createChatRoomMessagePayload,
  createChatRoomSyncPayload,
  parseChatRoomMessagePayload,
  parseChatRoomSyncPayload,
} from "../src/index.js";

describe("chat.room payloads", () => {
  it("parses chat.room.sync", () => {
    const payload = createChatRoomSyncPayload({
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:alice",
      updatedByOwnerId: "envoy:owner:alice",
      memberOwnerIds: ["envoy:owner:alice", "envoy:owner:bob"],
      revision: 1,
      action: "create",
    });
    expect(parseChatRoomSyncPayload(payload)).toEqual(payload);
  });

  it("parses chat.room.sync remove with removedMemberOwnerIds", () => {
    const payload = createChatRoomSyncPayload({
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:alice",
      updatedByOwnerId: "envoy:owner:alice",
      memberOwnerIds: ["envoy:owner:alice"],
      removedMemberOwnerIds: ["envoy:owner:bob"],
      revision: 2,
      action: "remove",
    });
    expect(parseChatRoomSyncPayload(payload)).toEqual(payload);
  });

  it("parses chat.room.sync dismiss with empty members", () => {
    const payload = createChatRoomSyncPayload({
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:alice",
      updatedByOwnerId: "envoy:owner:alice",
      memberOwnerIds: [],
      revision: 3,
      action: "dismiss",
    });
    expect(parseChatRoomSyncPayload(payload)).toEqual(payload);
  });

  it("parses chat.room.sync rename", () => {
    const payload = createChatRoomSyncPayload({
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "New title",
      creatorOwnerId: "envoy:owner:alice",
      updatedByOwnerId: "envoy:owner:alice",
      memberOwnerIds: ["envoy:owner:alice", "envoy:owner:bob"],
      revision: 4,
      action: "rename",
    });
    expect(parseChatRoomSyncPayload(payload)).toEqual(payload);
  });

  it("rejects remove when removed members still listed", () => {
    expect(() =>
      createChatRoomSyncPayload({
        roomId: "11111111-1111-4111-8111-111111111111",
        title: "Plans",
        creatorOwnerId: "envoy:owner:alice",
        updatedByOwnerId: "envoy:owner:alice",
        memberOwnerIds: ["envoy:owner:alice", "envoy:owner:bob"],
        removedMemberOwnerIds: ["envoy:owner:bob"],
        revision: 2,
        action: "remove",
      }),
    ).toThrow();
  });

  it("parses chat.room.message", () => {
    const payload = createChatRoomMessagePayload({
      roomId: "11111111-1111-4111-8111-111111111111",
      senderOwnerId: "envoy:owner:alice",
      text: "hello group",
    });
    expect(parseChatRoomMessagePayload(payload)).toEqual(payload);
  });
});
