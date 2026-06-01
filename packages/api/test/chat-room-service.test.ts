import { describe, expect, it, vi } from "vitest";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import {
  dismissChatRoomImpl,
  handleInboundChatRoomSyncImpl,
  inviteToChatRoomImpl,
  leaveChatRoomImpl,
  removeMembersFromChatRoomImpl,
  renameChatRoomImpl,
  type ChatRoomServiceDeps,
} from "../src/chat-room-service.js";

const mockEnvelope = { senderPeerId: "envoy_peer" } as EnvoyEnvelope;

const mockDeviceCertificate = {
  version: "0.1" as const,
  certificateId: "cert-self",
  ownerId: "envoy:owner:self",
  deviceId: "envoy:device:self",
  devicePublicKeyPem: "devpem",
  deviceProfile: "primary" as const,
  capabilities: ["message.send" as const],
  issuedAt: "2026-05-28T12:00:00.000Z",
  expiresAt: null,
  signature: "sig",
};

function mockDeps(overrides: Partial<ChatRoomServiceDeps> = {}): ChatRoomServiceDeps {
  return {
    getProfile: () =>
      ({
        owner: { ownerId: "envoy:owner:self", publicKeyPem: "pem", privateKeyPem: "pk" },
        device: {
          ownerId: "envoy:owner:self",
          deviceId: "envoy:device:self",
          publicKeyPem: "devpem",
          privateKeyPem: "devpk",
        },
        deviceCertificate: mockDeviceCertificate,
      }) as ReturnType<ChatRoomServiceDeps["getProfile"]>,
    requireMeshPeerId: () => "envoy_self",
    trustStore: {
      getTrustRecord: async () => ({ level: "direct", displayName: "Peer" }),
    },
    humanProfileStore: { loadHumanProfile: async () => ({ displayName: "Self" }) },
    chatRoomStore: {
      list: async () => [],
      get: async () => undefined,
      upsert: async () => {},
      remove: async () => true,
    },
    resolvePeerTransportForOwner: async () => ({ transportPeerId: "envoy_peer" }),
    deliverEnvelope: async () => ({ delivered: true, deliveredAt: new Date().toISOString() }),
    dialHintsForChat: async () => [],
    persistChatMessage: () => {},
    emitRoomUpdated: () => {},
    emitRoomRemoved: vi.fn(),
    emitRoomMessage: () => {},
    assertOnline: () => {},
    formatSenderDisplayName: (name) => name,
    verifyInboundDevice: async () => ({ ok: true as const }),
    verifyInboundSyncAuthor: async () => ({ ok: true as const }),
    ...overrides,
  };
}

const syncDeviceFields = {
  deviceCertificate: {
    version: "0.1" as const,
    certificateId: "cert-1",
    ownerId: "envoy:owner:bob",
    deviceId: "envoy:device:bob",
    devicePublicKeyPem: "bob-dev-pem",
    deviceProfile: "primary" as const,
    capabilities: ["message.send" as const],
    issuedAt: "2026-05-28T12:00:00.000Z",
    expiresAt: null,
    signature: "sig",
  },
  ownerPublicKeyPem: "bob-owner-pem",
};

describe("leaveChatRoomImpl", () => {
  it("removes local room and notifies remaining members", async () => {
    const emitRoomRemoved = vi.fn();
    const remove = vi.fn(async () => true);
    const room = {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:alice",
      memberOwnerIds: ["envoy:owner:self", "envoy:owner:bob"],
      revision: 2,
      updatedAt: "2026-05-28T12:00:00.000Z",
    };
    const deps = mockDeps({
      chatRoomStore: {
        list: async () => [room],
        get: async (id) => (id === room.roomId ? room : undefined),
        upsert: async () => {},
        remove,
      },
      emitRoomRemoved,
    });

    await leaveChatRoomImpl(deps, room.roomId);

    expect(remove).toHaveBeenCalledWith(room.roomId);
    expect(emitRoomRemoved).toHaveBeenCalledWith(room.roomId);
  });

  it("blocks creator from leaving while members remain", async () => {
    const room = {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:self",
      memberOwnerIds: ["envoy:owner:self", "envoy:owner:bob"],
      revision: 2,
      updatedAt: "2026-05-28T12:00:00.000Z",
    };
    const deps = mockDeps({
      chatRoomStore: {
        list: async () => [room],
        get: async (id) => (id === room.roomId ? room : undefined),
        upsert: async () => {},
        remove: async () => true,
      },
    });

    await expect(leaveChatRoomImpl(deps, room.roomId)).rejects.toThrow(/dismiss the group/);
  });
});

describe("handleInboundChatRoomSyncImpl leave", () => {
  it("drops room locally when self is no longer a member", async () => {
    const remove = vi.fn(async () => true);
    const emitRoomRemoved = vi.fn();
    const deps = mockDeps({
      chatRoomStore: {
        list: async () => [],
        get: async () => ({
          roomId: "11111111-1111-4111-8111-111111111111",
          title: "Plans",
          creatorOwnerId: "envoy:owner:alice",
          memberOwnerIds: ["envoy:owner:self", "envoy:owner:bob"],
          revision: 1,
          updatedAt: "2026-05-28T12:00:00.000Z",
        }),
        upsert: async () => {},
        remove,
      },
      emitRoomRemoved,
    });

    await handleInboundChatRoomSyncImpl(deps, mockEnvelope, {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:alice",
      updatedByOwnerId: "envoy:owner:bob",
      memberOwnerIds: ["envoy:owner:alice", "envoy:owner:bob"],
      revision: 3,
      updatedAt: "2026-05-28T12:01:00.000Z",
      action: "leave",
      ...syncDeviceFields,
    });

    expect(remove).toHaveBeenCalled();
    expect(emitRoomRemoved).toHaveBeenCalled();
  });

  it("applies leave sync to remaining members", async () => {
    const upsert = vi.fn(async () => {});
    const deps = mockDeps({
      chatRoomStore: {
        list: async () => [],
        get: async () => ({
          roomId: "11111111-1111-4111-8111-111111111111",
          title: "Plans",
          creatorOwnerId: "envoy:owner:alice",
          memberOwnerIds: ["envoy:owner:self", "envoy:owner:alice", "envoy:owner:bob"],
          revision: 1,
          updatedAt: "2026-05-28T12:00:00.000Z",
        }),
        upsert,
        remove: async () => true,
      },
    });

    await handleInboundChatRoomSyncImpl(deps, mockEnvelope, {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:alice",
      updatedByOwnerId: "envoy:owner:bob",
      memberOwnerIds: ["envoy:owner:self", "envoy:owner:alice"],
      revision: 2,
      updatedAt: "2026-05-28T12:01:00.000Z",
      action: "leave",
      ...syncDeviceFields,
    });

    expect(upsert).toHaveBeenCalled();
  });

  it("rejects sync without device certificate", async () => {
    const upsert = vi.fn(async () => {});
    const deps = mockDeps({
      chatRoomStore: {
        list: async () => [],
        get: async () => undefined,
        upsert,
        remove: async () => true,
      },
    });

    await handleInboundChatRoomSyncImpl(deps, mockEnvelope, {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:alice",
      updatedByOwnerId: "envoy:owner:alice",
      memberOwnerIds: ["envoy:owner:alice", "envoy:owner:self"],
      revision: 1,
      updatedAt: "2026-05-28T12:01:00.000Z",
      action: "create",
    });

    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("inviteToChatRoomImpl", () => {
  it("requires creator", async () => {
    const room = {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:alice",
      memberOwnerIds: ["envoy:owner:self", "envoy:owner:alice"],
      revision: 1,
      updatedAt: "2026-05-28T12:00:00.000Z",
    };
    const deps = mockDeps({
      chatRoomStore: {
        list: async () => [room],
        get: async () => room,
        upsert: async () => {},
        remove: async () => true,
      },
    });
    await expect(
      inviteToChatRoomImpl(deps, room.roomId, ["envoy:owner:carol"]),
    ).rejects.toThrow(/creator/);
  });
});

describe("removeMembersFromChatRoomImpl", () => {
  it("requires creator and removes selected members", async () => {
    const upsert = vi.fn(async () => {});
    const room = {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:self",
      memberOwnerIds: ["envoy:owner:self", "envoy:owner:bob", "envoy:owner:carol"],
      revision: 2,
      updatedAt: "2026-05-28T12:00:00.000Z",
    };
    const deps = mockDeps({
      chatRoomStore: {
        list: async () => [room],
        get: async (id) => (id === room.roomId ? room : undefined),
        upsert,
        remove: async () => true,
      },
    });

    const updated = await removeMembersFromChatRoomImpl(deps, room.roomId, ["envoy:owner:bob"]);

    expect(updated.memberOwnerIds).toEqual(["envoy:owner:self", "envoy:owner:carol"]);
    expect(upsert).toHaveBeenCalled();
  });
});

describe("renameChatRoomImpl", () => {
  it("updates title for creator", async () => {
    const upsert = vi.fn(async () => {});
    const room = {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:self",
      memberOwnerIds: ["envoy:owner:self", "envoy:owner:bob"],
      revision: 2,
      updatedAt: "2026-05-28T12:00:00.000Z",
    };
    const deps = mockDeps({
      chatRoomStore: {
        list: async () => [room],
        get: async (id) => (id === room.roomId ? room : undefined),
        upsert,
        remove: async () => true,
      },
    });

    const updated = await renameChatRoomImpl(deps, room.roomId, "Weekend");

    expect(updated.title).toBe("Weekend");
    expect(upsert).toHaveBeenCalled();
  });
});

describe("dismissChatRoomImpl", () => {
  it("removes local room after fan-out", async () => {
    const remove = vi.fn(async () => true);
    const emitRoomRemoved = vi.fn();
    const room = {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:self",
      memberOwnerIds: ["envoy:owner:self", "envoy:owner:bob"],
      revision: 2,
      updatedAt: "2026-05-28T12:00:00.000Z",
    };
    const deps = mockDeps({
      chatRoomStore: {
        list: async () => [room],
        get: async (id) => (id === room.roomId ? room : undefined),
        upsert: async () => {},
        remove,
      },
      emitRoomRemoved,
    });

    await dismissChatRoomImpl(deps, room.roomId);

    expect(remove).toHaveBeenCalledWith(room.roomId);
    expect(emitRoomRemoved).toHaveBeenCalledWith(room.roomId);
  });
});

describe("handleInboundChatRoomSyncImpl dismiss", () => {
  it("drops room locally on dismiss sync", async () => {
    const remove = vi.fn(async () => true);
    const emitRoomRemoved = vi.fn();
    const deps = mockDeps({
      chatRoomStore: {
        list: async () => [],
        get: async () => ({
          roomId: "11111111-1111-4111-8111-111111111111",
          title: "Plans",
          creatorOwnerId: "envoy:owner:alice",
          memberOwnerIds: ["envoy:owner:self", "envoy:owner:alice"],
          revision: 1,
          updatedAt: "2026-05-28T12:00:00.000Z",
        }),
        upsert: async () => {},
        remove,
      },
      emitRoomRemoved,
    });

    await handleInboundChatRoomSyncImpl(deps, mockEnvelope, {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:alice",
      updatedByOwnerId: "envoy:owner:alice",
      memberOwnerIds: [],
      revision: 2,
      updatedAt: "2026-05-28T12:01:00.000Z",
      action: "dismiss",
      deviceCertificate: {
        ...syncDeviceFields.deviceCertificate,
        ownerId: "envoy:owner:alice",
      },
      ownerPublicKeyPem: "alice-owner-pem",
    });

    expect(remove).toHaveBeenCalled();
    expect(emitRoomRemoved).toHaveBeenCalled();
  });

  it("applies leave sync to remaining members", async () => {
    const upsert = vi.fn(async () => {});
    const deps = mockDeps({
      chatRoomStore: {
        list: async () => [],
        get: async () => ({
          roomId: "11111111-1111-4111-8111-111111111111",
          title: "Plans",
          creatorOwnerId: "envoy:owner:alice",
          memberOwnerIds: ["envoy:owner:self", "envoy:owner:alice", "envoy:owner:bob"],
          revision: 1,
          updatedAt: "2026-05-28T12:00:00.000Z",
        }),
        upsert,
        remove: async () => true,
      },
    });

    await handleInboundChatRoomSyncImpl(deps, mockEnvelope, {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:alice",
      updatedByOwnerId: "envoy:owner:bob",
      memberOwnerIds: ["envoy:owner:self", "envoy:owner:alice"],
      revision: 2,
      updatedAt: "2026-05-28T12:01:00.000Z",
      action: "leave",
      ...syncDeviceFields,
    });

    expect(upsert).toHaveBeenCalled();
  });
});
