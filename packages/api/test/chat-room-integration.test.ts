import { describe, expect, it, vi } from "vitest";
import type { ChatRoomMessagePayload, ChatRoomSyncPayload, EnvoyEnvelope, EnvoyIntent } from "@envoymesh/protocol";
import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import type { ChatMessage, NodeProfile } from "../src/node-service.js";
import {
  createChatRoomImpl,
  dismissChatRoomImpl,
  flushPendingRoomMessagesImpl,
  handleInboundChatRoomMessageImpl,
  handleInboundChatRoomSyncImpl,
  leaveChatRoomImpl,
  sendChatRoomMessageImpl,
  type ChatRoomRecord,
  type ChatRoomServiceDeps,
  type ChatRoomPendingMessageStoreLike,
  type ChatRoomStoreLike,
} from "../src/chat-room-service.js";

function roomThreadKey(roomId: string): string {
  return `room:${roomId}`;
}

const OWNER_ALICE = "envoy:owner:alice";
const OWNER_BOB = "envoy:owner:bob";
const OWNER_CAROL = "envoy:owner:carol";

function testProfile(ownerId: string): NodeProfile {
  const owner = generateOwnerIdentity();
  owner.ownerId = ownerId;
  const device = generateDeviceIdentity();
  device.ownerId = ownerId;
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["message.send"],
    }),
  };
}

function memoryRoomStore(): ChatRoomStoreLike & { snapshot: () => ChatRoomRecord[] } {
  const map = new Map<string, ChatRoomRecord>();
  return {
    snapshot: () => [...map.values()],
    list: async () => [...map.values()],
    get: async (id) => map.get(id),
    upsert: async (room) => {
      map.set(room.roomId, { ...room });
    },
    remove: async (id) => map.delete(id),
  };
}

function memoryPendingMessageStore(): ChatRoomPendingMessageStoreLike & {
  snapshot: () => Awaited<ReturnType<ChatRoomPendingMessageStoreLike["list"]>>;
} {
  const records: Awaited<ReturnType<ChatRoomPendingMessageStoreLike["list"]>> = [];
  return {
    snapshot: () => [...records],
    list: async () => [...records],
    upsert: async (record) => {
      const idx = records.findIndex(
        (r) => r.messageId === record.messageId && r.targetOwnerId === record.targetOwnerId,
      );
      if (idx >= 0) records[idx] = record;
      else records.push(record);
    },
    remove: async (messageId, targetOwnerId) => {
      const idx = records.findIndex(
        (r) => r.messageId === messageId && r.targetOwnerId === targetOwnerId,
      );
      if (idx >= 0) records.splice(idx, 1);
    },
    removeForMessage: async (messageId) => {
      for (let i = records.length - 1; i >= 0; i--) {
        if (records[i]!.messageId === messageId) records.splice(i, 1);
      }
    },
    removeForRoom: async (roomId) => {
      for (let i = records.length - 1; i >= 0; i--) {
        if (records[i]!.roomId === roomId) records.splice(i, 1);
      }
    },
  };
}

class SimulatedNode {
  readonly ownerId: string;
  readonly peerId: string;
  readonly profile: NodeProfile;
  readonly rooms = memoryRoomStore();
  readonly pendingMessages = memoryPendingMessageStore();
  readonly messages = new Map<string, ChatMessage[]>();
  readonly roomRemoved = vi.fn();
  readonly roomUpdated = vi.fn();
  readonly roomMessage = vi.fn();
  deliverFailOwners = new Set<string>();

  constructor(
    ownerId: string,
    private readonly mesh: SimulatedMesh,
  ) {
    this.ownerId = ownerId;
    this.profile = testProfile(ownerId);
    this.peerId = derivePeerId(this.profile.device.publicKeyPem);
    mesh.register(this);
  }

  deps(): ChatRoomServiceDeps {
    return {
      getProfile: () => this.profile,
      requireMeshPeerId: () => this.peerId,
      trustStore: {
        getTrustRecord: async (id) => ({
          level: "direct",
          displayName: id.split(":").pop() ?? id,
        }),
      },
      humanProfileStore: {
        loadHumanProfile: async () => ({
          displayName: this.ownerId.split(":").pop() ?? this.ownerId,
        }),
      },
      chatRoomStore: this.rooms,
      pendingMessageStore: this.pendingMessages,
      resolvePeerTransportForOwner: async (targetOwnerId) => ({
        transportPeerId: this.mesh.nodeFor(targetOwnerId).peerId,
      }),
      deliverEnvelope: async (targetOwnerId, _transportPeerId, envelope) => {
        if (this.deliverFailOwners.has(targetOwnerId)) {
          return { delivered: false };
        }
        await this.mesh.deliver(targetOwnerId, envelope);
        return { delivered: true, deliveredAt: new Date().toISOString() };
      },
      dialHintsForChat: async () => [],
      persistChatMessage: (threadKey, msg) => {
        const list = this.messages.get(threadKey) ?? [];
        list.push(msg);
        this.messages.set(threadKey, list);
      },
      emitRoomUpdated: (room) => this.roomUpdated(room),
      emitRoomRemoved: (roomId) => this.roomRemoved(roomId),
      emitRoomMessage: (roomId, message) => this.roomMessage(roomId, message),
      assertOnline: () => {},
      formatSenderDisplayName: (name) => name,
      verifyInboundDevice: async () => ({ ok: true as const }),
      verifyInboundSyncAuthor: async () => ({ ok: true as const }),
      replyWithDelivered: async () => {},
      clearChatThread: async (threadKey) => {
        this.messages.delete(threadKey);
      },
    };
  }

  async receive(envelope: EnvoyEnvelope): Promise<void> {
    const intent = envelope.intent as EnvoyIntent;
    if (intent === "chat.room.sync") {
      await handleInboundChatRoomSyncImpl(this.deps(), envelope, envelope.payload as ChatRoomSyncPayload);
      return;
    }
    if (intent === "chat.room.message") {
      await handleInboundChatRoomMessageImpl(
        this.deps(),
        envelope,
        envelope.payload as ChatRoomMessagePayload,
        envelope.senderPeerId,
      );
    }
  }
}

class SimulatedMesh {
  private readonly nodes = new Map<string, SimulatedNode>();

  register(node: SimulatedNode): void {
    this.nodes.set(node.ownerId, node);
  }

  nodeFor(ownerId: string): SimulatedNode {
    const node = this.nodes.get(ownerId);
    if (!node) throw new Error(`Unknown node: ${ownerId}`);
    return node;
  }

  async deliver(targetOwnerId: string, envelope: EnvoyEnvelope): Promise<void> {
    await this.nodeFor(targetOwnerId).receive(envelope);
  }
}

describe("chat room multi-node integration", () => {
  it("create → message → leave → dismiss propagates across nodes", async () => {
    const mesh = new SimulatedMesh();
    const alice = new SimulatedNode(OWNER_ALICE, mesh);
    const bob = new SimulatedNode(OWNER_BOB, mesh);
    const carol = new SimulatedNode(OWNER_CAROL, mesh);

    const room = await createChatRoomImpl(alice.deps(), "Weekend", [OWNER_BOB, OWNER_CAROL]);
    expect(room.memberOwnerIds).toEqual([OWNER_ALICE, OWNER_BOB, OWNER_CAROL]);

    const bobRoom = await bob.rooms.get(room.roomId);
    const carolRoom = await carol.rooms.get(room.roomId);
    expect(bobRoom?.title).toBe("Weekend");
    expect(carolRoom?.memberOwnerIds).toContain(OWNER_ALICE);

    const sendResult = await sendChatRoomMessageImpl(alice.deps(), room.roomId, "Hello group");
    expect(sendResult.messageId).toBeTruthy();

    const threadKey = roomThreadKey(room.roomId);
    expect(bob.messages.get(threadKey)?.some((m) => m.content.text === "Hello group")).toBe(true);
    expect(carol.messages.get(threadKey)?.some((m) => m.content.text === "Hello group")).toBe(true);

    await leaveChatRoomImpl(bob.deps(), room.roomId);
    expect(await bob.rooms.get(room.roomId)).toBeUndefined();
    expect(bob.roomRemoved).toHaveBeenCalledWith(room.roomId);

    const aliceAfterLeave = await alice.rooms.get(room.roomId);
    expect(aliceAfterLeave?.memberOwnerIds).toEqual([OWNER_ALICE, OWNER_CAROL]);

    await dismissChatRoomImpl(alice.deps(), room.roomId);
    expect(await alice.rooms.get(room.roomId)).toBeUndefined();
    expect(await carol.rooms.get(room.roomId)).toBeUndefined();
    expect(carol.roomRemoved).toHaveBeenCalledWith(room.roomId);
  });

  it("retries failed message fan-out via pending message store", async () => {
    const mesh = new SimulatedMesh();
    const alice = new SimulatedNode(OWNER_ALICE, mesh);
    const bob = new SimulatedNode(OWNER_BOB, mesh);

    const room = await createChatRoomImpl(alice.deps(), "Retry test", [OWNER_BOB]);
    alice.deliverFailOwners.add(OWNER_BOB);

    const sendResult = await sendChatRoomMessageImpl(alice.deps(), room.roomId, "Retry me");
    expect(sendResult.pendingRecipientOwnerIds).toContain(OWNER_BOB);
    expect(alice.pendingMessages.snapshot()).toHaveLength(1);

    const threadKey = roomThreadKey(room.roomId);
    expect(bob.messages.get(threadKey)).toBeUndefined();

    alice.deliverFailOwners.delete(OWNER_BOB);
    await flushPendingRoomMessagesImpl(alice.deps());

    expect(alice.pendingMessages.snapshot()).toHaveLength(0);
    expect(bob.messages.get(threadKey)?.some((m) => m.content.text === "Retry me")).toBe(true);
  });
});
