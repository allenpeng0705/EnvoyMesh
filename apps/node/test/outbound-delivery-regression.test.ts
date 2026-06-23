import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentCredential,
  generateAgentIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import { createLocalPeerDirectoryStore, createLocalTrustStore } from "@envoymesh/local-store";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { ENVOY_MESSAGE_PROTOCOL } from "@envoymesh/network";
import {
  deliverCallEnvelopeWithRetry,
  sendEnvelopeWithRetry,
} from "../src/chat-outbound-deliver.js";
import { executeTool } from "../src/tool-registry.js";
import { createOutboundMeshMock } from "./helpers/outbound-mesh-mock.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("share.request outbound delivery", () => {
  const shareEnvelope = { intent: "share.request", messageId: "share-req-1" } as EnvoyEnvelope;

  it("verifies a connected peer before share.request send", async () => {
    const send = vi.fn().mockResolvedValue(0);
    const ensurePeerReachable = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const mesh = createOutboundMeshMock({
      send,
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
    });

    await deliverCallEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWSharePeer",
      envelope: shareEnvelope,
      dialHints: ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWSharePeer"],
      maxAttempts: 1,
    });

    expect(ensurePeerReachable).toHaveBeenCalledWith(
      "12D3KooWSharePeer",
      ENVOY_MESSAGE_PROTOCOL,
      expect.objectContaining({ verifyConnection: true }),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("retries share.request after first send failure", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("stale connection"))
      .mockResolvedValueOnce(0);
    const mesh = createOutboundMeshMock({
      send,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    });

    await deliverCallEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWShareRetryPeer",
      envelope: shareEnvelope,
      dialHints: ["/p2p/12D3KooWShareRetryPeer"],
      maxAttempts: 3,
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(mesh.closeConnectionsToPeer).toHaveBeenCalledWith("12D3KooWShareRetryPeer");
  });
});

describe("sendEnvelopeWithRetry lock integration", () => {
  it("serializes concurrent sends to the same transport peer", async () => {
    let active = 0;
    let maxActive = 0;
    const send = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(25);
      active -= 1;
      return 0;
    });
    const mesh = createOutboundMeshMock({ send });
    const envelope = { intent: "share.request" } as EnvoyEnvelope;

    await Promise.all([
      sendEnvelopeWithRetry({ mesh, transportPeerId: "12D3KooWLockedPeer", envelope }),
      sendEnvelopeWithRetry({ mesh, transportPeerId: "12D3KooWLockedPeer", envelope }),
    ]);

    expect(maxActive).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("executeTool — mesh.intro.broadcast_search", () => {
  async function meshToolContext(mesh: ReturnType<typeof createOutboundMeshMock>) {
    const dir = await mkdtemp(join(tmpdir(), "broadcast-tool-"));
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    const agentCredential = createAgentCredential({
      owner,
      agent,
      scope: ["chat.message"],
    });
    return {
      dir,
      ctx: {
        mesh,
        trustStore: createLocalTrustStore(dir),
        peerDirectoryStore: createLocalPeerDirectoryStore(dir),
        taskStore: { appendAuditEvent: vi.fn().mockResolvedValue(undefined) },
        agentIdentity: {
          agentId: agent.agentId,
          agentPeerId: agent.agentPeerId,
          privateKeyPem: agent.privateKeyPem,
          publicKeyPem: agent.publicKeyPem,
        },
        ownerIdentity: { ownerId: owner.ownerId },
        agentCredential,
        trustIntro: {
          trustModeEnabled: true,
          friendMatchingPreferencesText: "",
          humanProfileSummary: { displayName: "Test" },
        },
      },
      async cleanup() {
        await rm(dir, { recursive: true, force: true });
      },
    };
  }

  it("returns ok:false when relayPeerId is missing", async () => {
    const mesh = createOutboundMeshMock();
    const { ctx, cleanup } = await meshToolContext(mesh);
    try {
      const result = await executeTool("mesh.intro.broadcast_search", {}, ctx);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("relayPeerId");
      expect(mesh.send).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  });

  it("sends broadcast.request when relayPeerId is provided", async () => {
    const send = vi.fn().mockResolvedValue(0);
    const mesh = createOutboundMeshMock({ send });
    const { ctx, cleanup } = await meshToolContext(mesh);
    try {
      const result = await executeTool(
        "mesh.intro.broadcast_search",
        { relayPeerId: "12D3KooWRelayPeerForBroadcast" },
        ctx,
      );
      expect(result.ok).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
      const envelope = send.mock.calls[0]?.[1] as EnvoyEnvelope;
      expect(envelope.intent).toBe("broadcast.request");
    } finally {
      await cleanup();
    }
  });
});
