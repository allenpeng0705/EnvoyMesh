/**
 * Tests for the wireMeshEvents runtime.
 */
import { describe, expect, it, vi } from "vitest";

import {
  handleInboundMessageViaRuntime,
  handlePeerDiscoveredViaRuntime,
  wireMeshEventsViaRuntime,
} from "../src/node-service-wire-mesh-events.js";

describe("wireMeshEventsViaRuntime", () => {
  it("registers onMessage and onPeerDiscovered handlers with the mesh", () => {
    const onMessage = vi.fn(async () => undefined);
    const onPeerDiscovered = vi.fn(async () => undefined);
    const mesh = {
      onMessage: vi.fn(),
      onPeerDiscovered: vi.fn(),
    };
    wireMeshEventsViaRuntime({ mesh, onMessage, onPeerDiscovered });
    expect(mesh.onMessage).toHaveBeenCalledTimes(1);
    expect(mesh.onPeerDiscovered).toHaveBeenCalledTimes(1);
    expect(mesh.onMessage).toHaveBeenCalledWith(onMessage);
    expect(mesh.onPeerDiscovered).toHaveBeenCalledWith(onPeerDiscovered);
  });

  it("passes the same handler references that were provided", () => {
    const onMessage = vi.fn(async () => undefined);
    const onPeerDiscovered = vi.fn(async () => undefined);
    const mesh = {
      onMessage: vi.fn(),
      onPeerDiscovered: vi.fn(),
    };
    wireMeshEventsViaRuntime({ mesh, onMessage, onPeerDiscovered });
    // The registered handler is exactly the function we passed.
    const registeredMessageHandler = (mesh.onMessage as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(registeredMessageHandler).toBe(onMessage);
    const registeredPeerHandler = (mesh.onPeerDiscovered as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(registeredPeerHandler).toBe(onPeerDiscovered);
  });
});

describe("handleInboundMessageViaRuntime", () => {
  it("returns early when inbound guard rejects the envelope", async () => {
    const learnInboundDialHints = vi.fn(async () => undefined);
    const emit = vi.fn();
    await handleInboundMessageViaRuntime(
      {
        inspectInbound: () => ({ action: "reject" }),
        learnInboundDialHints,
        emit,
        getProfile: () => ({ owner: { ownerId: "envoy:owner:me" } }) as never,
        getTaskStore: () => ({}) as never,
        trustStore: {} as never,
        peerDirectoryStore: {} as never,
        getNodeConfig: async () => ({}) as never,
        storePendingSocialIntroProposal: vi.fn(),
        handleSocialProxyPeerOwnerReady: vi.fn(),
        getSharePreviewContext: () => ({}) as never,
        getBondHandlerContext: () => ({}) as never,
        handleInboundProfileIntent: vi.fn(async () => undefined),
        getChatRoomSyncContext: () => ({}) as never,
        getChatRoomMessageContext: () => ({}) as never,
        getChatMessageContext: () => ({}) as never,
      },
      {
        envelope: { intent: "chat.message", payload: {} },
        remotePeerId: "12D3KooTest",
      },
    );
    expect(learnInboundDialHints).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("handlePeerDiscoveredViaRuntime", () => {
  it("delegates to handleMeshPeerDiscovered", async () => {
    const handleMeshPeerDiscovered = vi.fn(async () => undefined);
    await handlePeerDiscoveredViaRuntime(
      { handleMeshPeerDiscovered },
      { peerId: "12D3KooPeer", multiaddrs: ["/ip4/127.0.0.1/tcp/4001"] },
    );
    expect(handleMeshPeerDiscovered).toHaveBeenCalledWith("12D3KooPeer", [
      "/ip4/127.0.0.1/tcp/4001",
    ]);
  });
});