import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createDeviceCertificate } from "@envoymesh/identity";
import {
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildRelayCircuitMultiaddrs,
  expandCircuitDialCandidates,
  handleInboundDiscoveryIntent,
  handleInboundRelayPeersIntent,
} from "../src/discovery-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-discovery-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function testProfile(): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["message.send", "mesh.listen", "mesh.discovery", "task.execute"],
    }),
  };
}

function signedEnvelope(profile: NodeProfile, intent: EnvoyEnvelope["intent"], payload: unknown): EnvoyEnvelope {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-remote",
      senderPublicKey: profile.device.publicKeyPem,
      intent,
      payload,
      createdAt: "2026-04-27T10:00:00.000Z",
      messageId: "discovery-msg-1",
    }),
    signature: "signature",
  };
}

describe("handleInboundDiscoveryIntent", () => {
  it("accepts referred requester and returns discovery response payload", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:peer-a",
      level: "referred",
    });

    const envelope = signedEnvelope(profile, "discovery.request", {
      requesterOwnerId: "envoy:owner:peer-a",
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: ["task.execute"],
      maxResults: 3,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "disc-corr-1",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload?.responderOwnerId).toBe(profile.owner.ownerId);
      expect(result.responsePayload?.requestMessageId).toBe(envelope.messageId);
      expect(result.responsePayload?.matches.length).toBeGreaterThan(0);
    }
  });

  it("rejects discovery.request from public requester", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const envelope = signedEnvelope(profile, "discovery.request", {
      requesterOwnerId: "envoy:owner:stranger",
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: [],
      maxResults: 2,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
    });

    expect(result).toEqual({
      ok: false,
      reason: "discovery.request requires referred/direct trust (got public)",
    });
  });
});

describe("handleInboundRelayPeersIntent", () => {
  it("returns dialable circuit relay addresses for other relay-connected peers", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const envelope = signedEnvelope(profile, "relay.peers.request", {});

    const result = await handleInboundRelayPeersIntent({
      envelope,
      profile,
      remotePeerId: "peer-a",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      relayPeerIds: ["peer-a", "peer-b"],
      relayMultiaddrs: [
        "/ip4/192.0.2.10/tcp/4001/p2p/relay-peer",
        "/ip4/192.0.2.10/tcp/4001/p2p/relay-peer/p2p-circuit",
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload?.peers).toEqual([
        {
          peerId: "peer-b",
          ownerId: "unknown",
          multiaddrs: ["/ip4/192.0.2.10/tcp/4001/p2p/relay-peer/p2p-circuit/p2p/peer-b"],
        },
      ]);
    }
  });
});

describe("buildRelayCircuitMultiaddrs", () => {
  it("deduplicates relay bases and skips existing circuit addresses", () => {
    expect(
      buildRelayCircuitMultiaddrs(
        [
          "/ip4/192.0.2.10/tcp/4001/p2p/relay-peer",
          "/ip4/192.0.2.10/tcp/4001/p2p/relay-peer",
          "/ip4/192.0.2.10/tcp/4001/p2p/relay-peer/p2p-circuit/p2p/peer-a",
          "/ip4/192.0.2.11/tcp/4001",
        ],
        "peer-b",
      ),
    ).toEqual(["/ip4/192.0.2.10/tcp/4001/p2p/relay-peer/p2p-circuit/p2p/peer-b"]);
  });
});

describe("expandCircuitDialCandidates", () => {
  it("prepends bootstrap-matched relay bases before the original circuit addr", () => {
    const circuit =
      "/ip4/10.0.0.1/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWTarget";
    const publicBootstrap = "/ip4/203.0.113.50/tcp/4001/p2p/12D3KooWRelay";
    expect(expandCircuitDialCandidates(circuit, [publicBootstrap])).toEqual([
      "/ip4/203.0.113.50/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWTarget",
      circuit,
    ]);
  });

  it("returns only the original addr when no seed matches the relay id", () => {
    const circuit =
      "/ip4/10.0.0.1/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWTarget";
    expect(
      expandCircuitDialCandidates(circuit, ["/ip4/203.0.113.50/tcp/4001/p2p/12D3KooWOther"]),
    ).toEqual([circuit]);
  });

  it("dedupes when bootstrap produces the same addr as relay response", () => {
    const circuit =
      "/ip4/203.0.113.50/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWTarget";
    const seed = "/ip4/203.0.113.50/tcp/4001/p2p/12D3KooWRelay";
    expect(expandCircuitDialCandidates(circuit, [seed])).toEqual([circuit]);
  });
});
