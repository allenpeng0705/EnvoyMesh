/**
 * E2E relay-assisted broadcast tests
 *
 * Tests relay-assisted broadcast fan-out:
 * 1. Broadcaster sends broadcast.request to relay
 * 2. Relay fans out to all connected peers
 * 3. Matching peers respond directly to broadcaster (P2P, not via relay)
 *
 * Requirements:
 * - A running relay server accessible at TEST_RELAY_ADDR environment variable
 *
 * Usage:
 *   TEST_RELAY_ADDR=/ip4/127.0.0.1/tcp/4001/p2p/... npm test -- apps/node/test/relay-broadcast-e2e.test.ts
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
import { EnvoyMesh } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/local-store";
import { handleInboundBroadcastRequest } from "../src/broadcast-inbound.js";
import { createLocalTaskStore, createLocalTrustStore } from "@envoymesh/local-store";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const RELAY_ADDR = process.env.TEST_RELAY_ADDR || null;

const meshes: EnvoyMesh[] = [];

const itRelayed = RELAY_ADDR ? it : it.skip;

describe.skip("E2E relay-assisted broadcast — see docs/known-broken-e2e.md", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-relay-broadcast-"));
  });

  afterEach(async () => {
    await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
    await rm(profileDir, { recursive: true, force: true });
  });

  itRelayed("broadcaster receives broadcast.response from matching peer via relay", async () => {
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
            matchedCapabilities: payload.requestedCapabilities,
            matchedKeywords: payload.requestedTagHashes,
          });

          const unsignedResponse = createUnsignedEnvelope({
            senderPeerId: derivePeerId(bobProfile.device.publicKeyPem),
            senderPublicKey: bobProfile.device.publicKeyPem,
            recipientPeerId: alice.peerId,
            intent: "broadcast.response",
            payload: responsePayload,
          });

          const signedResponse = signUnsignedEnvelope(unsignedResponse, bobProfile.device.privateKeyPem);
          await bob.send(alice.multiaddrs[0], signedResponse);
        }
      }
    });

    // Give nodes time to connect via relay
    await new Promise((resolve) => setTimeout(resolve, 2000));

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

    // Wait for Alice to receive broadcast.response
    await waitFor(async () => aliceReceivedResponses.length > 0, 5000);

    expect(aliceReceivedResponses.length).toBeGreaterThan(0);
    expect(aliceReceivedResponses[0].queryId).toBe(queryId);
    expect(aliceReceivedResponses[0].responderOwnerId).toBe(bobProfile.owner.ownerId);
  });

  itRelayed("only matching peers respond to broadcast.request", async () => {
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
            matchedCapabilities: payload.requestedCapabilities,
            matchedKeywords: payload.requestedTagHashes,
          });

          const unsignedResponse = createUnsignedEnvelope({
            senderPeerId: derivePeerId(bobProfile.device.publicKeyPem),
            senderPublicKey: bobProfile.device.publicKeyPem,
            recipientPeerId: alice.peerId,
            intent: "broadcast.response",
            payload: responsePayload,
          });

          const signedResponse = signUnsignedEnvelope(unsignedResponse, bobProfile.device.privateKeyPem);
          await bob.send(alice.multiaddrs[0], signedResponse);
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

    await new Promise((resolve) => setTimeout(resolve, 2000));

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

    await waitFor(async () => aliceReceivedResponses.length > 0, 5000);

    // Only Bob should have responded, not Carol
    expect(aliceReceivedResponses).toContain(bobProfile.owner.ownerId);
    expect(aliceReceivedResponses).not.toContain(carolProfile.owner.ownerId);
  });
});

async function startMeshWithRelay(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
    bootstrapPeers: RELAY_ADDR ? [RELAY_ADDR] : [],
  });

  await mesh.start();
  meshes.push(mesh);
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
