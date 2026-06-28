/**
 * E2E: three-node group chat over libp2p + NodeServiceImpl.
 *
 * create → message → leave → dismiss, with real mesh delivery and on-disk stores.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Node,
  createPhase13TestNode,
  registerBondedPeer,
  waitForPhase13,
  wireNodeServiceInboundHandlers,
} from "./phase13-e2e-harness.js";

function roomThreadKey(roomId: string): string {
  return `room:${roomId}`;
}

const nodes: Awaited<ReturnType<typeof createPhase13TestNode>>[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
});

describe.sequential("E2E group chat (three-node libp2p)", () => {
  it("create → message → leave → dismiss propagates via chat.room.*", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    const carol = await createPhase13TestNode();
    nodes.push(alice, bob, carol);

    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(alice, carol, "Carol");
    await registerBondedPeer(bob, alice, "Alice");
    await registerBondedPeer(bob, carol, "Carol");
    await registerBondedPeer(carol, alice, "Alice");
    await registerBondedPeer(carol, bob, "Bob");

    wireNodeServiceInboundHandlers(alice);
    wireNodeServiceInboundHandlers(bob);
    wireNodeServiceInboundHandlers(carol);

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);
    await alice.mesh.dial(carol.mesh.multiaddrs[0]!);
    await bob.mesh.dial(carol.mesh.multiaddrs[0]!);

    const room = await alice.service.createChatRoom("Weekend", [
      bob.profile.owner.ownerId,
      carol.profile.owner.ownerId,
    ]);
    expect(room.memberOwnerIds).toContain(alice.profile.owner.ownerId);

    await waitForPhase13(async () => {
      const bobRooms = await bob.service.listChatRooms();
      const carolRooms = await carol.service.listChatRooms();
      return (
        bobRooms.some((r) => r.roomId === room.roomId) &&
        carolRooms.some((r) => r.roomId === room.roomId)
      );
    }, 10_000);

    const bobRoom = (await bob.service.listChatRooms()).find((r) => r.roomId === room.roomId);
    expect(bobRoom?.title).toBe("Weekend");

    const sendResult = await alice.service.sendChatRoomMessage(room.roomId, "Hello group");
    expect(sendResult.messageId).toBeTruthy();

    const threadKey = roomThreadKey(room.roomId);
    await waitForPhase13(async () => {
      const bobHistory = await bob.service.listChatHistory(threadKey);
      const carolHistory = await carol.service.listChatHistory(threadKey);
      return (
        bobHistory.some((m) => m.content.text === "Hello group") &&
        carolHistory.some((m) => m.content.text === "Hello group")
      );
    }, 10_000);

    await bob.service.leaveChatRoom(room.roomId);

    await waitForPhase13(async () => {
      const bobRooms = await bob.service.listChatRooms();
      const aliceRoom = (await alice.service.listChatRooms()).find((r) => r.roomId === room.roomId);
      return (
        !bobRooms.some((r) => r.roomId === room.roomId) &&
        aliceRoom?.memberOwnerIds.includes(carol.profile.owner.ownerId) === true &&
        !aliceRoom?.memberOwnerIds.includes(bob.profile.owner.ownerId)
      );
    }, 10_000);

    await alice.service.dismissChatRoom(room.roomId);

    await waitForPhase13(async () => {
      const aliceRooms = await alice.service.listChatRooms();
      const carolRooms = await carol.service.listChatRooms();
      return (
        !aliceRooms.some((r) => r.roomId === room.roomId) &&
        !carolRooms.some((r) => r.roomId === room.roomId)
      );
    }, 10_000);
  });

  it("persists partial group delivery metadata in chat history", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);

    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireNodeServiceInboundHandlers(alice);
    wireNodeServiceInboundHandlers(bob);
    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);

    const room = await alice.service.createChatRoom("Delivery", [bob.profile.owner.ownerId]);
    await waitForPhase13(async () => {
      return (await bob.service.listChatRooms()).some((r) => r.roomId === room.roomId);
    }, 10_000);

    const sendResult = await alice.service.sendChatRoomMessage(room.roomId, "Ack me");
    const threadKey = roomThreadKey(room.roomId);

    await waitForPhase13(async () => {
      const history = await alice.service.listChatHistory(threadKey);
      const msg = history.find((m) => m.messageId === sendResult.messageId);
      if (!msg) return false;
      return (
        msg.metadata.deliveryReceipt === "delivered" ||
        (msg.metadata.deliveredToOwnerIds?.includes(bob.profile.owner.ownerId) ?? false)
      );
    }, 10_000);

    const aliceHistory = await alice.service.listChatHistory(threadKey);
    const outbound = aliceHistory.find((m) => m.messageId === sendResult.messageId);
    expect(outbound?.metadata.deliveryReceipt).toBe("delivered");
  });
});
