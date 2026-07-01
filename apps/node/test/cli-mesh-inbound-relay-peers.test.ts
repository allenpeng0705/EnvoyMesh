/**
 * Tests for the relay.peers.* arm runtime.
 */
import { describe, expect, it, vi } from "vitest";
import { handleRelayPeersViaRuntime } from "../src/cli-mesh-inbound-relay-peers.js";

function makeMockCtx(overrides: Partial<{ ok: boolean; reason: string }> = {}) {
  return {
    addObservedRelayPeerId: vi.fn(),
    getConnectedRelayPeerIds: vi.fn(() => []),
    getObservedRelayPeerIds: vi.fn(() => []),
    dedupeAddrs: vi.fn((arr: string[]) => [...new Set(arr)]),
    log: vi.fn(),
    logWarn: vi.fn(),
    getProfile: vi.fn(() => ({
      device: { publicKeyPem: "PK", privateKeyPem: "PRIV" },
    })),
    getMesh: vi.fn(() => ({})),
    getTaskStore: vi.fn(() => ({})),
    relayDialMultiaddrsForCircuitRelay: vi.fn(() => []),
    handleInboundRelayPeersIntent: vi.fn(async () => ({
      ok: overrides.ok ?? true,
      reason: overrides.reason ?? "denied",
      responsePayload: { peers: [] },
    })),
    appendAuditEvent: vi.fn(async () => {}),
    parseRelayPeersResponsePayload: vi.fn(() => ({ peers: [] })),
    upsertManyDiscoverySeeds: vi.fn(async () => {}),
    dial: vi.fn(async () => {}),
    createUnsignedEnvelope: vi.fn(() => ({})),
    derivePeerId: vi.fn(() => "local"),
    signUnsignedEnvelope: vi.fn(() => ({
      messageId: "M1",
      intent: "relay.peers.response",
      correlationId: "C1",
      createdAt: "T1",
    })),
    deliverOutboundEnvelope: vi.fn(async () => {}),
    getProtocol: vi.fn(() => "envoy-msg/0.1"),
  };
}

describe("cli-mesh-inbound-relay-peers", () => {
  it("warns + returns silently when the handler rejects", async () => {
    const ctx = makeMockCtx({ ok: false, reason: "policy_denied" });
    await handleRelayPeersViaRuntime(ctx, {
      envelope: { intent: "relay.peers.request" },
      remotePeerId: "rp",
      receivedAt: 1,
      correlationId: "c1",
      advertiseAddrs: [],
    });
    expect(ctx.logWarn).toHaveBeenCalled();
    expect(ctx.deliverOutboundEnvelope).not.toHaveBeenCalled();
  });

  it("builds + signs + delivers a response when the request is accepted", async () => {
    const ctx = makeMockCtx({ ok: true });
    ctx.handleInboundRelayPeersIntent.mockResolvedValueOnce({
      ok: true,
      reason: "",
      responsePayload: { peers: [{ multiaddrs: [] }] },
    });
    await handleRelayPeersViaRuntime(ctx, {
      envelope: { intent: "relay.peers.request" },
      remotePeerId: "rp",
      receivedAt: 1,
      correlationId: "c1",
      advertiseAddrs: [],
    });
    expect(ctx.deliverOutboundEnvelope).toHaveBeenCalledTimes(1);
    expect(ctx.appendAuditEvent).toHaveBeenCalled();
  });
});