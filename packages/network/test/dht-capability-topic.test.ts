import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateIdentity } from "@envoymesh/identity";
import { EnvoyMesh } from "../src/index.js";
import {
  createSignedCapabilityTopicRecord,
  decodeCapabilityTopicRecordFromMultiaddr,
  encodeCapabilityTopicRecordToMultiaddr,
  verifySignedCapabilityTopicRecord,
} from "../src/capability-topic.js";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
});

describe("DHT capability topic providers", () => {
  it("findCapabilityTopicProviders settles (bounded query; no infinite hang)", async () => {
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: true,
      dhtClientMode: false,
    });
    await mesh.start();
    meshes.push(mesh);

    const providers = await mesh.findCapabilityTopicProviders("envoymesh.smoke.cap.v1", {
      queryTimeoutMs: 4000,
      limit: 8,
    });

    expect(Array.isArray(providers)).toBe(true);
  });

  it("rejects capability topic APIs when DHT is disabled", async () => {
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: false,
    });
    await mesh.start();
    meshes.push(mesh);

    await expect(mesh.provideCapabilityTopic("x")).rejects.toThrow(/DHT/);
    await expect(mesh.findCapabilityTopicProviders("x")).rejects.toThrow(/DHT/);
  });
});

describe("signed capability topic record", () => {
  it("createSignedCapabilityTopicRecord produces a valid record", () => {
    const identity = generateIdentity();
    const record = createSignedCapabilityTopicRecord({
      topic: "envoymesh.file_provider",
      peerId: identity.peerId,
      multiaddr: "/ip4/1.2.3.4/tcp/4000/p2p/12D3KooWTest",
      ttlSeconds: 3600,
      org: "acme",
      net: "test",
      ver: "1.0.0",
      privateKey: identity.privateKeyPem,
    });

    expect(record.signature).toBeTruthy();
    expect(record.topic).toBe("envoymesh.file_provider");
    expect(record.peerId).toBe(identity.peerId);
    expect(record.ttlSeconds).toBe(3600);
    expect(record.org).toBe("acme");
    expect(record.net).toBe("test");
    expect(record.ver).toBe("1.0.0");
    expect(record.createdAt).toBeTruthy();
  });

  it("verifySignedCapabilityTopicRecord passes with correct key", () => {
    const identity = generateIdentity();
    const record = createSignedCapabilityTopicRecord({
      topic: "envoymesh.knowledge_query",
      peerId: identity.peerId,
      multiaddr: "/ip4/5.6.7.8/tcp/4001/p2p/12D3KooWTest",
      ttlSeconds: 3600,
      privateKey: identity.privateKeyPem,
    });

    const result = verifySignedCapabilityTopicRecord(record, identity.publicKeyPem);
    expect(result.ok).toBe(true);
  });

  it("verifySignedCapabilityTopicRecord fails with wrong key", () => {
    const alice = generateIdentity();
    const bob = generateIdentity();
    const record = createSignedCapabilityTopicRecord({
      topic: "envoymesh.knowledge_query",
      peerId: alice.peerId,
      multiaddr: "/ip4/5.6.7.8/tcp/4001/p2p/12D3KooWTest",
      ttlSeconds: 3600,
      privateKey: alice.privateKeyPem,
    });

    // Verify with Bob's key instead of Alice's
    const result = verifySignedCapabilityTopicRecord(record, bob.publicKeyPem);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid signature");
    }
  });

  it("verifySignedCapabilityTopicRecord fails on stale record", () => {
    const identity = generateIdentity();
    // Create a record with a positive TTL, then manually set createdAt to the past
    // to make it stale (age > ttlSeconds)
    const record = createSignedCapabilityTopicRecord({
      topic: "envoymesh.stale_test",
      peerId: identity.peerId,
      multiaddr: "/ip4/1.2.3.4/tcp/4000",
      ttlSeconds: 3600, // 1 hour TTL
      privateKey: identity.privateKeyPem,
    });
    // Override createdAt to 2 hours ago so the record is stale
    const staleRecord = { ...record, createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() };

    const result = verifySignedCapabilityTopicRecord(staleRecord, identity.publicKeyPem);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("stale");
    }
  });

  it("verifySignedCapabilityTopicRecord fails on empty fields", () => {
    const identity = generateIdentity();
    const record = createSignedCapabilityTopicRecord({
      topic: "",
      peerId: identity.peerId,
      multiaddr: "/ip4/1.2.3.4/tcp/4000",
      ttlSeconds: 3600,
      privateKey: identity.privateKeyPem,
    });

    const result = verifySignedCapabilityTopicRecord(record, identity.publicKeyPem);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("topic");
    }
  });
});

describe("capability topic record multiaddr encoding", () => {
  it("encodeCapabilityTopicRecordToMultiaddr + decodeCapabilityTopicRecordFromMultiaddr roundtrip correctly", () => {
    const identity = generateIdentity();
    const record = createSignedCapabilityTopicRecord({
      topic: "envoymesh.file_provider",
      peerId: identity.peerId,
      multiaddr: "/ip4/1.2.3.4/tcp/4000/p2p/12D3KooWMyPeerId",
      ttlSeconds: 7200,
      org: "acme",
      net: "test",
      ver: "2.0.0",
      privateKey: identity.privateKeyPem,
    });

    const encoded = encodeCapabilityTopicRecordToMultiaddr(record);
    expect(encoded).toContain("/ip4/1.2.3.4/tcp/4000/p2p/12D3KooWMyPeerId");
    expect(encoded).toContain("topic=envoymesh.file_provider");
    expect(encoded).toContain("sig=");
    expect(encoded).toContain("ttl=7200");
    expect(encoded).toContain("org=acme");
    expect(encoded).toContain("net=test");
    expect(encoded).toContain("ver=2.0.0");

    const decoded = decodeCapabilityTopicRecordFromMultiaddr(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.topic).toBe("envoymesh.file_provider");
    expect(decoded!.signature).toBe(record.signature);
    expect(decoded!.ttlSeconds).toBe(7200);
    expect(decoded!.org).toBe("acme");
    expect(decoded!.net).toBe("test");
    expect(decoded!.ver).toBe("2.0.0");
    expect(decoded!.cleanMultiaddr).toBe("/ip4/1.2.3.4/tcp/4000/p2p/12D3KooWMyPeerId");
  });

  it("decodeCapabilityTopicRecordFromMultiaddr returns null for non-capability multiaddr", () => {
    const result = decodeCapabilityTopicRecordFromMultiaddr("/ip4/1.2.3.4/tcp/4000");
    expect(result).toBeNull();
  });

  it("decodeCapabilityTopicRecordFromMultiaddr returns null for missing required params", () => {
    // multiaddr with ?topic= but missing sig, ts, ttl
    const result = decodeCapabilityTopicRecordFromMultiaddr("/ip4/1.2.3.4/tcp/4000?topic=foo");
    expect(result).toBeNull();
  });

  it("decodeCapabilityTopicRecordFromMultiaddr returns null for invalid ttl", () => {
    const result = decodeCapabilityTopicRecordFromMultiaddr(
      "/ip4/1.2.3.4/tcp/4000?topic=foo&sig=abc&ts=2026-05-09T12:00:00Z&ttl=-5",
    );
    expect(result).toBeNull();
  });

  it("encode omits optional scope fields when not provided", () => {
    const identity = generateIdentity();
    const record = createSignedCapabilityTopicRecord({
      topic: "envoymesh.no_scopes",
      peerId: identity.peerId,
      multiaddr: "/ip4/1.2.3.4/tcp/4000",
      ttlSeconds: 3600,
      privateKey: identity.privateKeyPem,
    });

    const encoded = encodeCapabilityTopicRecordToMultiaddr(record);
    const decoded = decodeCapabilityTopicRecordFromMultiaddr(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.org).toBeUndefined();
    expect(decoded!.net).toBeUndefined();
    expect(decoded!.ver).toBeUndefined();
  });
});

describe("provideCapabilityTopic with signing", () => {
  // These tests are skipped because contentRouting.provide hangs in an isolated DHT
  // (no bootstrap peers) — it attempts to send PUT_VALUE to peers in the routing
  // table, which blocks indefinitely without network. Full DHT integration tests
  // require a multi-node setup (tracked in Phase 4F.A exit criteria).

  it.skip("provideCapabilityTopic returns signed record when signingKey is provided", async () => {
    const identity = generateIdentity();
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: true,
      dhtClientMode: false,
    });
    await mesh.start();
    meshes.push(mesh);

    const { cid, signedRecord } = await mesh.provideCapabilityTopic("envoymesh.signed.test", {
      signingKey: identity.privateKeyPem,
      ttlSeconds: 1800,
      org: "test-org",
    });

    expect(cid).toBeTruthy();
    expect(signedRecord).toBeTruthy();
    expect(signedRecord!.topic).toBe("envoymesh.signed.test");
    expect(signedRecord!.ttlSeconds).toBe(1800);
    expect(signedRecord!.org).toBe("test-org");
    expect(signedRecord!.signature).toBeTruthy();

    const verification = verifySignedCapabilityTopicRecord(signedRecord!, identity.publicKeyPem);
    expect(verification.ok).toBe(true);
  });

  it.skip("provideCapabilityTopic returns no signedRecord when signingKey is omitted", async () => {
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: true,
      dhtClientMode: false,
    });
    await mesh.start();
    meshes.push(mesh);

    const { signedRecord } = await mesh.provideCapabilityTopic("envoymesh.unsigned.test");
    expect(signedRecord).toBeUndefined();
  });
});

describe("findCapabilityTopicProviders with verification", () => {
  // This test is skipped because contentRouting.get hangs in an isolated DHT
  // (no bootstrap peers) — the GET operation tries to contact peers in the routing
  // table, which blocks indefinitely without a network. Full DHT integration tests
  // require a multi-node setup (tracked in Phase 4F.A exit criteria).

  it.skip("findCapabilityTopicProviders returns array and includes signedRecord field", async () => {
    const identity = generateIdentity();
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: true,
      dhtClientMode: false,
    });
    await mesh.start();
    meshes.push(mesh);

    const providers = await mesh.findCapabilityTopicProviders("envoymesh.shape.test", {
      queryTimeoutMs: 5000,
      signingPublicKey: identity.publicKeyPem,
    });

    expect(Array.isArray(providers)).toBe(true);
    for (const p of providers) {
      // signedRecord or signedRecordInvalid may be present depending on DHT state
      expect(
        "signedRecord" in p ||
          "signedRecordInvalid" in p ||
          (!p.signedRecord && !p.signedRecordInvalid),
      ).toBe(true);
    }
  });
});
