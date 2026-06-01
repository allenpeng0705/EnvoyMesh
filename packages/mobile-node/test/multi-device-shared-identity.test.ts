/**
 * @vitest-environment jsdom
 *
 * Multi-device shared-identity integration test (Phase 11 — P0 #4).
 *
 * Verifies that two `MobileNode` instances that import the same owner key
 * (e.g. the home node's owner identity) share the same `ownerId` while
 * retaining distinct `deviceId`s, and that a chat sent from one device is
 * recorded in the same thread (ownerId namespace) on the receiving device
 * after delivery — fixing ISSUE #6 where outbound and inbound messages were
 * stored under different thread keys.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileNode, type MobileNodeConfig } from "../src/index.js";

function makeConfig(overrides: Partial<MobileNodeConfig> = {}): MobileNodeConfig {
  return {
    profileDir: "/test-profile",
    relayUrls: ["ws://relay.example.com:9000"],
    ...overrides,
  };
}

describe("Multi-device shared identity", () => {
  const nodes: MobileNode[] = [];

  afterEach(async () => {
    while (nodes.length > 0) {
      const n = nodes.pop();
      if (n) {
        try { await n.stopNode(); } catch { /* ignore */ }
      }
    }
  });

  it("two MobileNodes importing the same owner key share ownerId but have distinct deviceIds", async () => {
    const { generateOwnerIdentity } = await import("@envoymesh/mobile-identity");
    const owner = generateOwnerIdentity();

    const phoneA = new MobileNode(makeConfig({ profileDir: "/shared-profile-phone" }));
    const phoneB = new MobileNode(makeConfig({ profileDir: "/shared-profile-tablet" }));
    nodes.push(phoneA, phoneB);

    await phoneA.importOwnerIdentity(
      "/shared-profile-phone",
      owner.privateKeyPem,
      owner.publicKeyPem,
      "home-node-peer-id",
    );
    await phoneB.importOwnerIdentity(
      "/shared-profile-tablet",
      owner.privateKeyPem,
      owner.publicKeyPem,
      "home-node-peer-id",
    );

    // Same owner identity
    expect(phoneA.state.owner.ownerId).toBe(owner.ownerId);
    expect(phoneB.state.owner.ownerId).toBe(owner.ownerId);
    expect(phoneA.state.owner.ownerId).toBe(phoneB.state.owner.ownerId);
    expect(phoneA.state.sharedIdentity).toBe(true);
    expect(phoneB.state.sharedIdentity).toBe(true);

    // Distinct device identities
    expect(phoneA.state.device.deviceId).not.toBe(phoneB.state.device.deviceId);
    expect(phoneA.state.device.deviceId).toMatch(/^envoy:device:/);
    expect(phoneB.state.device.deviceId).toMatch(/^envoy:device:/);
  });

  it("chat between two shared-identity devices ends up in the same thread (ISSUE #6)", async () => {
    const {
      generateOwnerIdentity,
      generateDeviceIdentity,
      derivePeerId,
      signUnsignedEnvelope,
    } = await import("@envoymesh/mobile-identity");
    const { createUnsignedEnvelope, createChatMessagePayload } = await import("@envoymesh/protocol");

    const sharedOwner = generateOwnerIdentity();
    const phoneA = new MobileNode(makeConfig({ profileDir: "/multi-a" }));
    const phoneB = new MobileNode(makeConfig({ profileDir: "/multi-b" }));
    nodes.push(phoneA, phoneB);

    // Both phones import the same owner key — same ownerId, different deviceId
    await phoneA.importOwnerIdentity(
      "/multi-a",
      sharedOwner.privateKeyPem,
      sharedOwner.publicKeyPem,
      "home-node-peer-id",
    );
    await phoneB.importOwnerIdentity(
      "/multi-b",
      sharedOwner.privateKeyPem,
      sharedOwner.publicKeyPem,
      "home-node-peer-id",
    );

    const ownerId = sharedOwner.ownerId;

    // Phone A sends a chat — persists under the contact's ownerId thread
    await phoneA.sendChat(ownerId, "hello from phone A");

    const outboundThreadA = await phoneA.listChatHistory(ownerId);
    expect(outboundThreadA).toHaveLength(1);
    expect(outboundThreadA[0]!.content.text).toBe("hello from phone A");

    // Phone B sends a chat to the same ownerId — same thread key
    await phoneB.sendChat(ownerId, "hello from phone B");

    const outboundThreadB = await phoneB.listChatHistory(ownerId);
    expect(outboundThreadB).toHaveLength(1);
    expect(outboundThreadB[0]!.content.text).toBe("hello from phone B");

    // Now simulate Phone A's outbound message arriving on Phone B as an
    // inbound envelope. Phone B should store it under ownerId (the
    // ownerId namespace) so the thread joins.
    const phoneADeviceId = phoneA.state.device.deviceId;
    const phoneADevicePubKeyPem = phoneA.state.device.publicKeyPem;
    const phoneADevicePrivKeyPem = phoneA.state.device.privateKeyPem;
    void phoneADeviceId;
    const senderPeerId = derivePeerId(phoneADevicePubKeyPem);

    const inboundEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        intent: "chat.message",
        senderPeerId,
        senderPublicKey: phoneADevicePubKeyPem,
        senderRole: "human",
        recipientPeerId: phoneB.state.agent.agentPeerId,
        recipientRole: "human",
        payload: createChatMessagePayload({
          senderOwnerId: ownerId,
          text: "inbound copy on phone B",
        }),
      }),
      phoneADevicePrivKeyPem,
    );

    const chatEvents: Array<{ content: { text: string }; sender: { ownerId?: string } }> = [];
    phoneB.on("chat:message" as never, (d: unknown) => {
      chatEvents.push(d as { content: { text: string }; sender: { ownerId?: string } });
    });

    (phoneB as unknown as { _handleInboundMessage: (env: unknown) => void })._handleInboundMessage(
      inboundEnvelope,
    );

    await vi.waitFor(() => {
      expect(chatEvents).toHaveLength(1);
    });
    expect(chatEvents[0]!.content.text).toBe("inbound copy on phone B");
    expect(chatEvents[0]!.sender.ownerId).toBe(ownerId);

    // Critical: the inbound message must land in the SAME thread as the
    // outbound one. The thread key is the ownerId, not the libp2p peer id.
    await vi.waitFor(async () => {
      const history = await phoneB.listChatHistory(ownerId);
      expect(history).toHaveLength(2);
    });

    const unifiedThread = await phoneB.listChatHistory(ownerId);
    const texts = unifiedThread.map((m) => m.content.text);
    expect(texts).toContain("hello from phone B");
    expect(texts).toContain("inbound copy on phone B");
  });
});
