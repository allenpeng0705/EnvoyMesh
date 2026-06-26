import { vi } from "vitest";
import type { EnvoyMesh } from "@envoymesh/network";
import { createChatDeliveredPayload } from "@envoymesh/protocol";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import {
  resetOutboundPeerLockForTests,
  resetOutboundPathMemoryForTests,
  resetOutboundPeerFreshnessForTests,
  resetWarmCoordinatorForTests,
} from "../../src/outbound-network/index.js";
import { createOutboundMeshMock } from "./outbound-mesh-mock.js";

/** Reset all outbound-network module state between tests. */
export function resetOutboundNetworkState(): void {
  resetWarmCoordinatorForTests();
  resetOutboundPeerLockForTests();
  resetOutboundPathMemoryForTests();
  resetOutboundPeerFreshnessForTests();
}

/**
 * Mesh mock with `sendChatExpectReply` that preserves `this` like real EnvoyMesh.
 * Use to catch unbound method extraction bugs in deliverChatEnvelopeWithRetry.
 */
export function createBoundAckMeshMock(
  overrides: Partial<EnvoyMesh> = {},
) {
  const ackReply = {
    intent: "chat.delivered",
    payload: createChatDeliveredPayload({
      messageId: "m1",
      recipientOwnerId: "envoy:owner:test",
      deliveredAt: new Date().toISOString(),
    }),
  } satisfies Pick<EnvoyEnvelope, "intent" | "payload"> as EnvoyEnvelope;
  const { sendChatExpectReply: sendChatExpectReplyOverride, ...restOverrides } = overrides;
  const base = createOutboundMeshMock(restOverrides);
  const defaultSendChatExpectReply = vi.fn(function (this: EnvoyMesh, ...args: unknown[]) {
    void this;
    void args;
    return Promise.resolve(ackReply);
  });
  return {
    ...base,
    sendChatExpectReply: sendChatExpectReplyOverride ?? defaultSendChatExpectReply,
  };
}

/** Minimal fake mesh for NodeServiceImpl E2E-style tests (share inbox, file share). */
export function createNodeServiceMeshFake(
  overrides: Record<string, unknown> = {},
) {
  return {
    peerId: "local-peer",
    send: async () => 12,
    tagContactForPersistentReachability: async () => {},
    untagContactForPersistentReachability: async () => {},
    getPeerConnectionInfo: () => ({ connected: false, direct: false }),
    ensurePeerReachable: async () => ({ connected: true, direct: true }),
    closeConnectionsToPeer: async () => 0,
    mergePeerStoreDialHints: async () => {},
    scrubPeerStoreDialHints: async () => [],
    probeBondedPeerConnection: async () => ({ connected: true, direct: true }),
    ...overrides,
  };
}
