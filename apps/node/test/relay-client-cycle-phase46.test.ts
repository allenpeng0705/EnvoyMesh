/**
 * Phase 46A client-cycle unit coverage: maxHops default + parallel targets.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateIdentity } from "@envoymesh/identity";
import {
  queryRelayLookupWithDeps,
  resolveRelayClientControlTargets,
  type RelayClientCycleDeps,
} from "../src/relay-client-cycle.js";
import { collectRelayControlTargets } from "../src/relay-reservation-health.js";

vi.mock("../src/chat-outbound-deliver.js", () => ({
  sendEnvelopeWithRetry: vi.fn(async () => undefined),
  sendExpectReplyWithRetry: vi.fn(),
}));

import { sendExpectReplyWithRetry } from "../src/chat-outbound-deliver.js";

describe("Phase 46A client cycle wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolveRelayClientControlTargets matches collectRelayControlTargets", () => {
    const RELAY =
      "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
    const config = {
      bootstrapPeers: [RELAY],
      configuredRelays: [{ enabled: true, addr: RELAY }],
      bootstrapPresets: ["cn-relay"] as string[],
    };
    expect(resolveRelayClientControlTargets(config)).toEqual(collectRelayControlTargets(config));
  });

  it("queryRelayLookupWithDeps sends maxHops=1 in parallel to all targets", async () => {
    const id = generateIdentity();
    const captured: unknown[] = [];
    vi.mocked(sendExpectReplyWithRetry).mockImplementation(async (opts) => {
      captured.push(opts.envelope.payload);
      return {
        version: "0.1",
        messageId: "reply",
        createdAt: new Date().toISOString(),
        senderPeerId: "relay",
        senderPublicKey: id.publicKeyPem,
        senderRole: "system",
        recipientRole: "system",
        intent: "relay.lookup.response",
        signature: "sig",
        payload: {
          queryId: (opts.envelope.payload as { queryId: string }).queryId,
          peers: [],
          relayHints: [],
          truncated: false,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      };
    });

    const t1 = "/ip4/1.1.1.1/tcp/4001/p2p/12D3KooWAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const t2 = "/ip4/2.2.2.2/tcp/4001/p2p/12D3KooWBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    const deps = {
      mesh: { peerId: "12D3KooWClient", multiaddrs: [] } as never,
      profile: {
        owner: { ownerId: "envoy:owner:x" },
        device: {
          publicKeyPem: id.publicKeyPem,
          privateKeyPem: id.privateKeyPem,
        },
        deviceCertificate: { capabilities: ["mesh.discovery"] },
      },
      bootstrapPeers: [t1, t2],
      inboundGuard: {
        inspect: (input) => ({ action: "allow" as const, envelope: input as never }),
      },
      discoverySeedStore: { upsertMany: vi.fn(async () => undefined) },
    } as unknown as RelayClientCycleDeps;

    const responses = await queryRelayLookupWithDeps(deps, [t1, t2], {
      capability: "mesh.discovery",
      maxResults: 4,
    });
    expect(responses).toHaveLength(2);
    expect(vi.mocked(sendExpectReplyWithRetry)).toHaveBeenCalledTimes(2);
    for (const p of captured) {
      expect(p).toMatchObject({ maxHops: 1, maxFanout: 2 });
    }
  });
});
