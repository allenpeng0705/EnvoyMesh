/**
 * E2E relay-assisted broadcast tests
 *
 * Tests relay-assisted broadcast fan-out:
 * 1. Broadcaster sends broadcast.request to relay
 * 2. Relay fans out to all connected peers
 * 3. Matching peers respond directly to broadcaster (P2P, not via relay)
 *
 * Default relay: community cn-relay. Override with TEST_RELAY_ADDR for a
 * private relay.
 *
 * Usage:
 *   npx vitest run apps/node/test/relay-broadcast-e2e.test.ts
 *   TEST_RELAY_ADDR=/ip4/127.0.0.1/tcp/4001/p2p/... \
 *     npx vitest run apps/node/test/relay-broadcast-e2e.test.ts
 */

import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createBroadcastRequestPayload,
  createBroadcastResponsePayload,
  createUnsignedEnvelope,
  parseBroadcastRequestPayload,
  parseBroadcastResponsePayload,
} from "@envoymesh/protocol";
import { afterEach, describe, expect, it, beforeEach } from "vitest";
import { EnvoyMesh, setAllowLoopbackDialHints } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/local-store";
import { handleInboundBroadcastRequest } from "../src/broadcast-inbound.js";
import { createLocalTaskStore, createLocalTrustStore } from "@envoymesh/local-store";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR } from "@envoymesh/api";

// Default to community cn-relay (same pattern as relay-chat-e2e).
const RELAY_ADDR = process.env.TEST_RELAY_ADDR || DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR;

const meshes: EnvoyMesh[] = [];

const itRelayed = RELAY_ADDR ? it : it.skip;

describe("E2E relay-assisted broadcast (live relay)", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-relay-broadcast-"));
  });

  afterEach(async () => {
    await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
    await rm(profileDir, { recursive: true, force: true });
    setAllowLoopbackDialHints(false);
  });

  itRelayed("broadcaster receives broadcast.response from matching peer via relay", async () => {
    // Per-test timeout bumped: relay-reservation handshake (35s) +
    // broadcast round-trip (30s) needs the 60s vitest default exceeded.
    const aliceProfile = testProfile("alice");
    const bobProfile = testProfile("bob");

    // Alice is the broadcaster, Bob is the responder
    const alice = await startMeshWithRelay();
    const bob = await startMeshWithRelay();

    const aliceReceivedResponses: { queryId: string; responderOwnerId: string }[] = [];

    // Alice listens for broadcast.response
    alice.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "broadcast.response") {
        const payload = parseBroadcastResponsePayload(envelope.payload);
        aliceReceivedResponses.push({
          queryId: payload.queryId,
          responderOwnerId: payload.responderOwnerId,
        });
      }
    });

    // Bob sets up his handler to process broadcast.request and respond
    bob.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "broadcast.request") {
        const payload = parseBroadcastRequestPayload(envelope.payload);

        // Bob's task store and trust store
        const bobTaskStore = createLocalTaskStore(profileDir + "-bob");
        const bobTrustStore = createLocalTrustStore(profileDir + "-bob");
        // Strangers default to public + anonymousDiscoveryMode=off → drop.
        // Treat Alice as referred so this E2E exercises relay fanout, not
        // anonymous-discovery settings.
        await bobTrustStore.setTrustRecord({
          peerOwnerId: aliceProfile.owner.ownerId,
          level: "referred",
        });

        // Bob matches the request (has task.execute capability)
        const result = await handleInboundBroadcastRequest({
          envelope,
          profile: bobProfile,
          remotePeerId: alice.peerId,
          receivedAt: Date.now(),
          correlationId: `corr-${randomUUID()}`,
          taskStore: bobTaskStore,
          trustStore: bobTrustStore,
        });

        // If Bob matches, send broadcast.response directly to Alice
        if (result.ok) {
          const responsePayload = createBroadcastResponsePayload({
            queryId: payload.queryId,
            responderOwnerId: bobProfile.owner.ownerId,
            responderPeerId: bob.peerId,
            matchedCapabilities: payload.requestedCapabilities,
            matchedTagHashes: payload.requestedTagHashes,
          });

          const unsignedResponse = createUnsignedEnvelope({
            senderPeerId: derivePeerId(bobProfile.device.publicKeyPem),
            senderPublicKey: bobProfile.device.publicKeyPem,
            recipientPeerId: alice.peerId,
            intent: "broadcast.response",
            payload: responsePayload,
          });

          const signedResponse = signUnsignedEnvelope(unsignedResponse, bobProfile.device.privateKeyPem);
          // Respond directly to Alice (same-host E2E). Circuit-v2 connections
          // are "limited" and cannot open /envoymesh/message streams
          // ("Cannot open protocol stream on limited connection").
          const aliceAddr = alice.multiaddrs[0];
          if (!aliceAddr) throw new Error("alice has no listen multiaddr");
          await bob.send(aliceAddr, signedResponse);
        }
      }
    });

    // Reservation is awaited inside startMeshWithRelay(); short settle for
    // the relay connection manager to list both peers before fanout.
    await new Promise((resolve) => setTimeout(resolve, 2_000));

    // Alice sends broadcast.request to relay
    const queryId = randomUUID();
    const requestPayload = createBroadcastRequestPayload({
      queryId,
      ttl: 1,
      maxResponses: 10,
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: ["task.execute"],
      requestedSensitivity: "public",
      senderOwnerId: aliceProfile.owner.ownerId,
      timeoutMs: 30_000,
    });

    const unsignedRequest = createUnsignedEnvelope({
      senderPeerId: derivePeerId(aliceProfile.device.publicKeyPem),
      senderPublicKey: aliceProfile.device.publicKeyPem,
      intent: "broadcast.request",
      payload: requestPayload,
      createdAt: new Date().toISOString(),
      messageId: randomUUID(),
    });

    const signedRequest = signUnsignedEnvelope(unsignedRequest, aliceProfile.device.privateKeyPem);

    // Send to relay (first peer in bootstrap list)
    await alice.send(RELAY_ADDR!, signedRequest);

    // Wait for Alice to receive broadcast.response. The responder's
    // reply goes via the relay too, so 30s gives the full round-trip
    // a real chance.
    await waitFor(async () => aliceReceivedResponses.length > 0, 30_000);

    expect(aliceReceivedResponses.length).toBeGreaterThan(0);
    expect(aliceReceivedResponses[0].queryId).toBe(queryId);
    expect(aliceReceivedResponses[0].responderOwnerId).toBe(bobProfile.owner.ownerId);
  }, 120_000);

  itRelayed("only matching peers respond to broadcast.request", async () => {
    // Same 120s budget as the first test — see comment there.
    const aliceProfile = testProfile("alice");
    const bobProfile = testProfile("bob", ["task.execute"]); // Bob matches
    const carolProfile = testProfile("carol", ["mesh.listen"]); // Carol doesn't match

    const alice = await startMeshWithRelay();
    const bob = await startMeshWithRelay();
    const carol = await startMeshWithRelay();

    const aliceReceivedResponses: string[] = [];

    alice.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "broadcast.response") {
        const payload = parseBroadcastResponsePayload(envelope.payload);
        aliceReceivedResponses.push(payload.responderOwnerId);
      }
    });

    // Bob's handler - matches
    bob.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "broadcast.request") {
        const payload = parseBroadcastRequestPayload(envelope.payload);
        const bobTaskStore = createLocalTaskStore(profileDir + "-bob");
        const bobTrustStore = createLocalTrustStore(profileDir + "-bob");
        await bobTrustStore.setTrustRecord({
          peerOwnerId: aliceProfile.owner.ownerId,
          level: "referred",
        });

        const result = await handleInboundBroadcastRequest({
          envelope,
          profile: bobProfile,
          remotePeerId: alice.peerId,
          receivedAt: Date.now(),
          correlationId: `corr-${randomUUID()}`,
          taskStore: bobTaskStore,
          trustStore: bobTrustStore,
        });

        if (result.ok) {
          const responsePayload = createBroadcastResponsePayload({
            queryId: payload.queryId,
            responderOwnerId: bobProfile.owner.ownerId,
            responderPeerId: bob.peerId,
            matchedCapabilities: payload.requestedCapabilities,
            matchedTagHashes: payload.requestedTagHashes,
          });

          const unsignedResponse = createUnsignedEnvelope({
            senderPeerId: derivePeerId(bobProfile.device.publicKeyPem),
            senderPublicKey: bobProfile.device.publicKeyPem,
            recipientPeerId: alice.peerId,
            intent: "broadcast.response",
            payload: responsePayload,
          });

          const signedResponse = signUnsignedEnvelope(unsignedResponse, bobProfile.device.privateKeyPem);
          // Direct reply — see note in the first test (circuit = limited conn).
          const aliceAddr = alice.multiaddrs[0];
          if (!aliceAddr) throw new Error("alice has no listen multiaddr");
          await bob.send(aliceAddr, signedResponse);
        }
      }
    });

    // Carol's handler - doesn't match (no task.execute)
    carol.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "broadcast.request") {
        const payload = parseBroadcastRequestPayload(envelope.payload);
        const carolTaskStore = createLocalTaskStore(profileDir + "-carol");
        const carolTrustStore = createLocalTrustStore(profileDir + "-carol");
        await carolTrustStore.setTrustRecord({
          peerOwnerId: aliceProfile.owner.ownerId,
          level: "referred",
        });

        const result = await handleInboundBroadcastRequest({
          envelope,
          profile: carolProfile,
          remotePeerId: alice.peerId,
          receivedAt: Date.now(),
          correlationId: `corr-${randomUUID()}`,
          taskStore: carolTaskStore,
          trustStore: carolTrustStore,
        });

        // Carol does NOT respond because she doesn't match
        // (her capabilities don't include task.execute)
      }
    });

    // See note on settle in the first test.
    await new Promise((resolve) => setTimeout(resolve, 2_000));

    const queryId = randomUUID();
    const requestPayload = createBroadcastRequestPayload({
      queryId,
      ttl: 1,
      maxResponses: 10,
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: ["task.execute"], // Only Bob matches this
      requestedSensitivity: "public",
      senderOwnerId: aliceProfile.owner.ownerId,
      timeoutMs: 30_000,
    });

    const unsignedRequest = createUnsignedEnvelope({
      senderPeerId: derivePeerId(aliceProfile.device.publicKeyPem),
      senderPublicKey: aliceProfile.device.publicKeyPem,
      intent: "broadcast.request",
      payload: requestPayload,
      createdAt: new Date().toISOString(),
      messageId: randomUUID(),
    });

    const signedRequest = signUnsignedEnvelope(unsignedRequest, aliceProfile.device.privateKeyPem);
    await alice.send(RELAY_ADDR!, signedRequest);

    // See note on the broadcast.response wait in the first test — the
    // round-trip is via the relay, so 30s gives it room to complete.
    await waitFor(async () => aliceReceivedResponses.length > 0, 30_000);

    // Only Bob should have responded, not Carol
    expect(aliceReceivedResponses).toContain(bobProfile.owner.ownerId);
    expect(aliceReceivedResponses).not.toContain(carolProfile.owner.ownerId);
  }, 120_000);
});

async function startMeshWithRelay(): Promise<EnvoyMesh> {
  setAllowLoopbackDialHints(true);
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
    // The broadcast fanout goes through the relay. Without `enableRelay: true`
    // this mesh never obtains a circuit-relay-v2 reservation and the responder
    // can't reply to a behind-NAT broadcaster — the waitFor(predicate, 30s)
    // below would then time out.
    enableRelay: true,
    bootstrapPeers: RELAY_ADDR ? [RELAY_ADDR] : [],
  });

  await mesh.start();
  meshes.push(mesh);

  // Eagerly connect + reserve so the relay's getConnectedPeerIds() sees this
  // node and Bob can reply via /p2p-circuit.
  if (RELAY_ADDR) {
    try {
      await mesh.eagerConnectToRelays([RELAY_ADDR], { timeoutMs: 15_000 });
      await mesh.requestRelayReservation([RELAY_ADDR]);
    } catch {
      // Fall through to waitFor below.
    }
    await waitFor(() => mesh.hasRelayReservation(), 35_000);
  }

  return mesh;
}

function testProfile(name: string, capabilities: string[] = ["mesh.listen", "mesh.discovery", "task.execute"]): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();

  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities,
    }),
  };
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("Timed out waiting for condition");
}
