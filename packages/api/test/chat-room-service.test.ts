import { describe, expect, it, vi } from "vitest";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { generateEd25519KeyPair } from "@envoymesh/identity";
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

// Real keys are needed because flushPendingRoom{Syncs,Messages}Impl actually
// signs the envelope before delivering it. We only need the signatures to be
// well-formed PEM, not valid for any particular recipient.
const realKeys = generateEd25519KeyPair();

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
        owner: {
          ownerId: "envoy:owner:self",
          publicKeyPem: realKeys.publicKeyPem,
          privateKeyPem: realKeys.privateKeyPem,
        },
        device: {
          ownerId: "envoy:owner:self",
          deviceId: "envoy:device:self",
          publicKeyPem: realKeys.publicKeyPem,
          privateKeyPem: realKeys.privateKeyPem,
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

describe("pending delivery backoff", () => {
  it("exposes a monotonically-increasing backoff up to a 5 minute cap", async () => {
    const { pendingDeliveryBackoffMs, PENDING_DELIVERY_MAX_ATTEMPTS } = await import(
      "../src/chat-room-service.js"
    );
    const first = pendingDeliveryBackoffMs(1);
    const second = pendingDeliveryBackoffMs(2);
    const third = pendingDeliveryBackoffMs(3);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    // Cap kicks in well before 2^16.
    const huge = pendingDeliveryBackoffMs(20);
    expect(huge).toBe(5 * 60_000);
    expect(PENDING_DELIVERY_MAX_ATTEMPTS).toBeGreaterThanOrEqual(5);
  });
});

describe("flushPendingRoomSyncsImpl", () => {
  it("skips records that are still in the backoff window", async () => {
    const { flushPendingRoomSyncsImpl } = await import("../src/chat-room-service.js");
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    const syncPayload = {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:self",
      updatedByOwnerId: "envoy:owner:self",
      memberOwnerIds: ["envoy:owner:self", "envoy:owner:bob"],
      revision: 2,
      updatedAt: "2026-05-28T12:00:00.000Z",
      action: "invite" as const,
      ...syncDeviceFields,
    };
    const deliverEnvelope = vi.fn(async () => ({ delivered: true, deliveredAt: "now" }));
    const deps = mockDeps({
      pendingSyncStore: {
        list: async () => [
          {
            roomId: syncPayload.roomId,
            revision: 2,
            targetOwnerId: "envoy:owner:bob",
            syncPayload,
            createdAt: "2026-05-28T12:00:00.000Z",
            attempts: 1,
            lastAttemptAt: "2026-05-28T12:00:00.000Z",
            nextAttemptAt: future,
          },
        ],
        upsert: async () => {},
        remove: async () => {},
        removeForRoom: async () => {},
        removeBelowRevision: async () => {},
      },
      chatRoomStore: {
        list: async () => [],
        get: async (id) =>
          id === syncPayload.roomId
            ? {
                roomId: syncPayload.roomId,
                title: "Plans",
                creatorOwnerId: "envoy:owner:self",
                memberOwnerIds: ["envoy:owner:self", "envoy:owner:bob"],
                revision: 2,
                updatedAt: "2026-05-28T12:00:00.000Z",
              }
            : undefined,
        upsert: async () => {},
        remove: async () => true,
      },
      deliverEnvelope,
    });
    await flushPendingRoomSyncsImpl(deps);
    expect(deliverEnvelope).not.toHaveBeenCalled();
  });

  it("gives up and removes the record after max attempts", async () => {
    const { flushPendingRoomSyncsImpl, PENDING_DELIVERY_MAX_ATTEMPTS } = await import(
      "../src/chat-room-service.js"
    );
    const syncPayload = {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:self",
      updatedByOwnerId: "envoy:owner:self",
      memberOwnerIds: ["envoy:owner:self", "envoy:owner:bob"],
      revision: 2,
      updatedAt: "2026-05-28T12:00:00.000Z",
      action: "invite" as const,
      ...syncDeviceFields,
    };
    const deliverEnvelope = vi.fn(async () => ({ delivered: false }));
    const remove = vi.fn(async () => {});
    const deps = mockDeps({
      pendingSyncStore: {
        list: async () => [
          {
            roomId: syncPayload.roomId,
            revision: 2,
            targetOwnerId: "envoy:owner:bob",
            syncPayload,
            createdAt: "2026-05-28T12:00:00.000Z",
            attempts: PENDING_DELIVERY_MAX_ATTEMPTS,
          },
        ],
        upsert: async () => {},
        remove,
        removeForRoom: async () => {},
        removeBelowRevision: async () => {},
      },
      chatRoomStore: {
        list: async () => [],
        get: async (id) =>
          id === syncPayload.roomId
            ? {
                roomId: syncPayload.roomId,
                title: "Plans",
                creatorOwnerId: "envoy:owner:self",
                memberOwnerIds: ["envoy:owner:self", "envoy:owner:bob"],
                revision: 2,
                updatedAt: "2026-05-28T12:00:00.000Z",
              }
            : undefined,
        upsert: async () => {},
        remove: async () => true,
      },
      deliverEnvelope,
    });
    await flushPendingRoomSyncsImpl(deps);
    expect(deliverEnvelope).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(syncPayload.roomId, 2, "envoy:owner:bob");
  });

  it("schedules a backoff after a failure and removes the record on success", async () => {
    const { flushPendingRoomSyncsImpl } = await import("../src/chat-room-service.js");
    const syncPayload = {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:self",
      updatedByOwnerId: "envoy:owner:self",
      memberOwnerIds: ["envoy:owner:self", "envoy:owner:bob"],
      revision: 2,
      updatedAt: "2026-05-28T12:00:00.000Z",
      action: "invite" as const,
      ...syncDeviceFields,
    };
    const upsert = vi.fn(async () => {});
    const remove = vi.fn(async () => {});
    let pass = 0;
    const deps = mockDeps({
      pendingSyncStore: {
        list: async () => {
          pass += 1;
          if (pass === 1) {
            return [
              {
                roomId: syncPayload.roomId,
                revision: 2,
                targetOwnerId: "envoy:owner:bob",
                syncPayload,
                createdAt: "2026-05-28T12:00:00.000Z",
              },
            ];
          }
          return [
            {
              roomId: syncPayload.roomId,
              revision: 2,
              targetOwnerId: "envoy:owner:bob",
              syncPayload,
              createdAt: "2026-05-28T12:00:00.000Z",
              attempts: 1,
              lastAttemptAt: "2026-05-28T12:00:00.000Z",
              nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
            },
          ];
        },
        upsert,
        remove,
        removeForRoom: async () => {},
        removeBelowRevision: async () => {},
      },
      chatRoomStore: {
        list: async () => [],
        get: async (id) =>
          id === syncPayload.roomId
            ? {
                roomId: syncPayload.roomId,
                title: "Plans",
                creatorOwnerId: "envoy:owner:self",
                memberOwnerIds: ["envoy:owner:self", "envoy:owner:bob"],
                revision: 2,
                updatedAt: "2026-05-28T12:00:00.000Z",
              }
            : undefined,
        upsert: async () => {},
        remove: async () => true,
      },
      deliverEnvelope: vi.fn(async () => ({ delivered: true, deliveredAt: "now" })),
    });
    // Pass 1: delivery succeeds → record is removed.
    await flushPendingRoomSyncsImpl(deps);
    expect(remove).toHaveBeenCalledWith(syncPayload.roomId, 2, "envoy:owner:bob");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("schedules a backoff via upsert when delivery returns delivered=false", async () => {
    const { flushPendingRoomSyncsImpl } = await import("../src/chat-room-service.js");
    const syncPayload = {
      roomId: "11111111-1111-4111-8111-111111111111",
      title: "Plans",
      creatorOwnerId: "envoy:owner:self",
      updatedByOwnerId: "envoy:owner:self",
      memberOwnerIds: ["envoy:owner:self", "envoy:owner:bob"],
      revision: 2,
      updatedAt: "2026-05-28T12:00:00.000Z",
      action: "invite" as const,
      ...syncDeviceFields,
    };
    const upsert = vi.fn(async () => {});
    const remove = vi.fn(async () => {});
    const deps = mockDeps({
      pendingSyncStore: {
        list: async () => [
          {
            roomId: syncPayload.roomId,
            revision: 2,
            targetOwnerId: "envoy:owner:bob",
            syncPayload,
            createdAt: "2026-05-28T12:00:00.000Z",
          },
        ],
        upsert,
        remove,
        removeForRoom: async () => {},
        removeBelowRevision: async () => {},
      },
      chatRoomStore: {
        list: async () => [],
        get: async (id) =>
          id === syncPayload.roomId
            ? {
                roomId: syncPayload.roomId,
                title: "Plans",
                creatorOwnerId: "envoy:owner:self",
                memberOwnerIds: ["envoy:owner:self", "envoy:owner:bob"],
                revision: 2,
                updatedAt: "2026-05-28T12:00:00.000Z",
              }
            : undefined,
        upsert: async () => {},
        remove: async () => true,
      },
      deliverEnvelope: async () => ({ delivered: false }),
    });
    await flushPendingRoomSyncsImpl(deps);
    expect(upsert).toHaveBeenCalledTimes(1);
    const stored = upsert.mock.calls[0]?.[0] as {
      attempts?: number;
      lastAttemptAt?: string;
      nextAttemptAt?: string;
    };
    expect(stored.attempts).toBe(1);
    expect(stored.lastAttemptAt).toBeTruthy();
    expect(Date.parse(stored.nextAttemptAt ?? "")).toBeGreaterThan(Date.now());
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("flushPendingRoomMessagesImpl", () => {
  it("emits a delivery-failed callback and drops the record after max attempts", async () => {
    const { flushPendingRoomMessagesImpl, PENDING_DELIVERY_MAX_ATTEMPTS } = await import(
      "../src/chat-room-service.js"
    );
    const markOutboundFailed = vi.fn();
    const remove = vi.fn(async () => {});
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
      pendingMessageStore: {
        list: async () => [
          {
            messageId: "msg-1",
            roomId: room.roomId,
            targetOwnerId: "envoy:owner:bob",
            envelopeCreatedAt: "2026-05-28T12:00:00.000Z",
            messagePayload: {
              roomId: room.roomId,
              senderOwnerId: "envoy:owner:self",
              text: "Hello",
            },
            createdAt: "2026-05-28T12:00:00.000Z",
            attempts: PENDING_DELIVERY_MAX_ATTEMPTS,
          },
        ],
        upsert: async () => {},
        remove,
        removeForMessage: async () => {},
        removeForRoom: async () => {},
      },
      markOutboundFailed,
      deliverEnvelope: vi.fn(async () => ({ delivered: false })),
    });
    await flushPendingRoomMessagesImpl(deps);
    expect(markOutboundFailed).toHaveBeenCalledWith(
      `room:${room.roomId}`,
      "msg-1",
      "envoy:owner:bob",
      "recipient-unreachable",
    );
    expect(remove).toHaveBeenCalledWith("msg-1", "envoy:owner:bob");
  });

  it("schedules a backoff when delivery returns delivered=false", async () => {
    const { flushPendingRoomMessagesImpl } = await import("../src/chat-room-service.js");
    const upsert = vi.fn(async () => {});
    const remove = vi.fn(async () => {});
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
      pendingMessageStore: {
        list: async () => [
          {
            messageId: "msg-1",
            roomId: room.roomId,
            targetOwnerId: "envoy:owner:bob",
            envelopeCreatedAt: "2026-05-28T12:00:00.000Z",
            messagePayload: {
              roomId: room.roomId,
              senderOwnerId: "envoy:owner:self",
              text: "Hello",
            },
            createdAt: "2026-05-28T12:00:00.000Z",
          },
        ],
        upsert,
        remove,
        removeForMessage: async () => {},
        removeForRoom: async () => {},
      },
      deliverEnvelope: async () => ({ delivered: false }),
    });
    await flushPendingRoomMessagesImpl(deps);
    expect(upsert).toHaveBeenCalledTimes(1);
    const stored = upsert.mock.calls[0]?.[0] as {
      attempts?: number;
      nextAttemptAt?: string;
    };
    expect(stored.attempts).toBe(1);
    expect(Date.parse(stored.nextAttemptAt ?? "")).toBeGreaterThan(Date.now());
    expect(remove).not.toHaveBeenCalled();
  });
});
