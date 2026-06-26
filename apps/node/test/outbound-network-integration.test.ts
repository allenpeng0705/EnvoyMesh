/**
 * Integration tests for the outbound network stack (lock + coordinator + prepare + deliver).
 * Guards against regressions when chat/call/attachment paths evolve independently.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { ENVOY_CHAT_PROTOCOL } from "@envoymesh/network";
import { createChatDeliveredPayload } from "@envoymesh/protocol";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import {
  deliverChatEnvelopeWithRetry,
  prepareOutboundPeerConnection,
} from "../src/chat-outbound-deliver.js";
import { withOutboundPeerLock } from "../src/outbound-network/index.js";
import {
  createBoundAckMeshMock,
  resetOutboundNetworkState,
} from "./helpers/outbound-network-harness.js";

const envelope = { intent: "chat.message", messageId: "m1" } as EnvoyEnvelope;
const PEER = "12D3KooWIntegrationPeerId1234567890";

describe("outbound network integration", () => {
  beforeEach(() => {
    resetOutboundNetworkState();
  });

  it("deliverChatEnvelopeWithRetry binds sendChatExpectReply so mesh methods keep this", async () => {
    const mesh = createBoundAckMeshMock({
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
    });

    const result = await deliverChatEnvelopeWithRetry({
      mesh,
      transportPeerId: PEER,
      envelope,
      dialHints: [`/ip4/127.0.0.1/tcp/4011/p2p/${PEER}`],
      chatProtocol: ENVOY_CHAT_PROTOCOL,
      maxAttempts: 1,
    });

    expect(result.delivered).toBe(true);
    expect(mesh.sendChatExpectReply).toHaveBeenCalledTimes(1);
    expect(mesh.sendChat).not.toHaveBeenCalled();
  });

  it("serializes warm prepare and chat send on the same peer via outbound lock", async () => {
    const order: string[] = [];
    const ensurePeerReachable = vi.fn(async () => {
      order.push("warm");
      await new Promise((r) => setTimeout(r, 20));
      return { connected: true, direct: true };
    });
    const sendChatExpectReply = vi.fn(async function (this: unknown) {
      order.push("send");
      void this;
      return {
        intent: "chat.delivered",
        payload: createChatDeliveredPayload({
          messageId: "m1",
          recipientOwnerId: "envoy:owner:test",
          deliveredAt: new Date().toISOString(),
        }),
      };
    });

    const mesh = createBoundAckMeshMock({
      ensurePeerReachable,
      sendChatExpectReply,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    });

    await Promise.all([
      withOutboundPeerLock(PEER, async () => {
        await prepareOutboundPeerConnection({
          mesh,
          transportPeerId: PEER,
          protocol: ENVOY_CHAT_PROTOCOL,
          dialHints: [`/p2p/${PEER}`],
          preferCircuitHints: false,
          forceFreshDial: false,
          warmSource: "open_chat",
        });
      }),
      withOutboundPeerLock(PEER, async () => {
        await deliverChatEnvelopeWithRetry({
          mesh,
          transportPeerId: PEER,
          envelope,
          dialHints: [`/p2p/${PEER}`],
          chatProtocol: ENVOY_CHAT_PROTOCOL,
          maxAttempts: 1,
        });
      }),
    ]);

    expect(order.indexOf("warm")).toBeLessThan(order.indexOf("send"));
    expect(ensurePeerReachable).toHaveBeenCalled();
    expect(sendChatExpectReply).toHaveBeenCalled();
  });

  it("send_prepare bypasses UI warm cooldown but respects outbound lock", async () => {
    const ensurePeerReachable = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const mesh = createBoundAckMeshMock({
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    });

    const { recordWarmDialStarted } = await import("../src/outbound-warm-coordinator.js");
    recordWarmDialStarted({
      transportPeerId: PEER,
      kind: "disconnected_warm",
      now: Date.now(),
    });

    await prepareOutboundPeerConnection({
      mesh,
      transportPeerId: PEER,
      protocol: ENVOY_CHAT_PROTOCOL,
      dialHints: [`/p2p/${PEER}`],
      preferCircuitHints: false,
      forceFreshDial: false,
      warmSource: "send",
    });

    expect(ensurePeerReachable).toHaveBeenCalled();
  });
});
