/**
 * Phase 17C — hashed geo tags on bond-scoped discovery.request.
 */
import {
  createDeviceCertificate,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import { createLocalTaskStore, createLocalTrustStore, type NodeProfile } from "@envoymesh/local-store";
import {
  createDiscoveryRequestPayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
  type HumanProfilePayload,
} from "@envoymesh/protocol";
import {
  geoDiscoveryTagHashesFromProfile,
  hashDiscoveryTag,
} from "@envoymesh/api";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundDiscoveryIntent, __resetDiscoveryState } from "../src/discovery-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-geo-tags-"));
  await mkdir(profileDir, { recursive: true });
});

afterEach(async () => {
  __resetDiscoveryState();
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
      capabilities: ["mesh.listen", "message.send"],
    }),
  };
}

function signedEnvelope(profile: NodeProfile, payload: unknown): EnvoyEnvelope {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-remote",
      senderPublicKey: profile.device.publicKeyPem,
      intent: "discovery.request",
      payload,
      createdAt: "2026-05-28T10:00:00.000Z",
      messageId: "discovery-geo-msg",
    }),
    signature: "signature",
  };
}

function humanProfile(ownerId: string): HumanProfilePayload {
  return {
    version: "0.1",
    ownerId,
    displayName: "Geo Responder",
    username: "geouser",
    profileVisibility: "public",
    discoveryLocation: { countryCode: "US", city: "Boston" },
    discoveryLocationPrecision: "city",
    signature: "test-signature",
  };
}

describe("discovery.request geo tag hashes", () => {
  it("matches hashed geo tags from responder human profile", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:requester",
      level: "direct",
    });

    const hp = humanProfile(profile.owner.ownerId);
    const geoHash = hashDiscoveryTag("geo:city:US-boston");
    expect(
      geoDiscoveryTagHashesFromProfile({
        location: hp.discoveryLocation,
        precision: hp.discoveryLocationPrecision,
      }),
    ).toContain(geoHash);

    const envelope = signedEnvelope(
      profile,
      createDiscoveryRequestPayload({
        requesterOwnerId: "envoy:owner:requester",
        requestedTagHashes: [geoHash],
        requestedCapabilities: [],
        maxResults: 5,
      }),
    );

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "remote-peer",
      receivedAt: Date.now(),
      correlationId: "corr-geo",
      taskStore,
      trustStore,
      humanProfile: humanProfile(profile.owner.ownerId),
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.responsePayload) {
      expect(result.responsePayload.matches).toHaveLength(1);
      expect(result.responsePayload.matches[0]?.matchedTagHashes).toContain(geoHash);
    }
  });

  it("does not match unrelated tag hashes", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:requester",
      level: "direct",
    });

    const envelope = signedEnvelope(
      profile,
      createDiscoveryRequestPayload({
        requesterOwnerId: "envoy:owner:requester",
        requestedTagHashes: [hashDiscoveryTag("geo:city:US-seattle")],
        requestedCapabilities: [],
        maxResults: 5,
      }),
    );

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "remote-peer",
      receivedAt: Date.now(),
      correlationId: "corr-geo-miss",
      taskStore,
      trustStore,
      humanProfile: humanProfile(profile.owner.ownerId),
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.responsePayload) {
      expect(result.responsePayload.matches).toHaveLength(0);
    }
  });

  it("friend-matching geo tag hashes align with tool-registry matching_context output", async () => {
    const profile = testProfile();
    const hp = humanProfile(profile.owner.ownerId);
    const geoHash = hashDiscoveryTag("geo:city:US-boston");
    const toolHashes = geoDiscoveryTagHashesFromProfile({
      location: hp.discoveryLocation,
      precision: hp.discoveryLocationPrecision,
    });
    expect(toolHashes).toContain(geoHash);

    const envelope = signedEnvelope(
      profile,
      createDiscoveryRequestPayload({
        requesterOwnerId: "envoy:owner:requester",
        requestedTagHashes: toolHashes,
        requestedCapabilities: [],
        maxResults: 5,
      }),
    );

    const trustStore = createLocalTrustStore(profileDir);
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:requester",
      level: "direct",
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "remote-peer",
      receivedAt: Date.now(),
      correlationId: "corr-tool-geo",
      taskStore: createLocalTaskStore(profileDir),
      trustStore,
      humanProfile: hp,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.responsePayload) {
      expect(result.responsePayload.matches[0]?.matchedTagHashes).toContain(geoHash);
    }
  });
});
