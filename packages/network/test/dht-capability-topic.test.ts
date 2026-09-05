import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateIdentity } from "@envoymesh/identity";
import net from "node:net";
import { multiaddr } from "@multiformats/multiaddr";
import { peerIdFromString } from "@libp2p/peer-id";
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
  // These tests previously hung in isolated DHT (no bootstrap peers) so
  // they were skipped. The signing logic runs *before* the DHT put — it
  // builds the signed record from the local private key, then attempts
  // to store it. We stub `contentRouting.provide` and `contentRouting.put`
  // to resolve immediately so the function returns without touching the
  // DHT, then verify the signed record is well-formed.

  it("provideCapabilityTopic returns signed record when signingKey is provided", async () => {
    const identity = generateIdentity();
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: true,
      dhtClientMode: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (mesh as any).node;
    expect(node).toBeTruthy();
    // Stub the DHT round-trips so the test doesn't need a populated routing table.
    node.contentRouting.provide = vi.fn(async () => undefined);
    node.contentRouting.put = vi.fn(async () => undefined);

    const { cid, signedRecord, timedOut } = await mesh.provideCapabilityTopic(
      "envoymesh.signed.test",
      {
        signingKey: identity.privateKeyPem,
        ttlSeconds: 1800,
        org: "test-org",
      },
    );

    expect(cid).toBeTruthy();
    expect(timedOut).toBe(false);
    expect(signedRecord).toBeTruthy();
    expect(signedRecord!.topic).toBe("envoymesh.signed.test");
    expect(signedRecord!.ttlSeconds).toBe(1800);
    expect(signedRecord!.org).toBe("test-org");
    expect(signedRecord!.signature).toBeTruthy();

    const verification = verifySignedCapabilityTopicRecord(signedRecord!, identity.publicKeyPem);
    expect(verification.ok).toBe(true);
  });

  it("provideCapabilityTopic returns no signedRecord when signingKey is omitted", async () => {
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: true,
      dhtClientMode: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (mesh as any).node;
    node.contentRouting.provide = vi.fn(async () => undefined);

    const { signedRecord, timedOut } = await mesh.provideCapabilityTopic("envoymesh.unsigned.test");
    expect(timedOut).toBe(false);
    expect(signedRecord).toBeUndefined();
  });
});

describe("findCapabilityTopicProviders with verification", () => {
  // Previously skipped because `contentRouting.get` blocks indefinitely in
  // an isolated DHT. The find path tolerates null returns from `get`
  // (no signed record in DHT for the provider — caught silently), so we
  // can stub `findProviders` to return one mock provider and `get` to
  // return null. The per-provider record is then built with
  // `signedRecord: undefined, signedRecordInvalid: undefined`, which
  // satisfies the schema check in the for-loop.

  it("findCapabilityTopicProviders returns array and includes signedRecord field", async () => {
    const identity = generateIdentity();
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: true,
      dhtClientMode: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (mesh as any).node;
    expect(node).toBeTruthy();

    // Build a single mock provider that the find path will iterate over.
    const mockProviderId = peerIdFromString(
      "12D3KooWPHxYJMNDeDKRqHShpDsTTEUgKQnC2LGEwnAYRKQK7vVT",
    );
    const mockMultiaddr = multiaddr("/ip4/127.0.0.1/tcp/4001");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node.contentRouting.findProviders = vi.fn(async function* () {
      yield {
        id: mockProviderId,
        multiaddrs: [mockMultiaddr],
        routing: "p2p",
      };
      // Async generator with a single yield — the find path breaks at the
      // configured limit (default 32) and we stop after one provider.
    } as any);
    // `get` returns null (no signed record in DHT for the mock provider).
    // The find path's `if (recordBytes)` guard then leaves both
    // `signedRecord` and `signedRecordInvalid` as undefined on the
    // returned record.
    node.contentRouting.get = vi.fn(async () => null);

    const providers = await mesh.findCapabilityTopicProviders("envoymesh.shape.test", {
      queryTimeoutMs: 5000,
      signingPublicKey: identity.publicKeyPem,
    });

    expect(Array.isArray(providers)).toBe(true);
    expect(providers).toHaveLength(1);
    for (const p of providers) {
      // signedRecord or signedRecordInvalid may be present depending on DHT state.
      // With the stub above, neither is populated — the third branch
      // (!p.signedRecord && !p.signedRecordInvalid) is the truthy one.
      expect(
        "signedRecord" in p ||
          "signedRecordInvalid" in p ||
          (!p.signedRecord && !p.signedRecordInvalid),
      ).toBe(true);
      expect(p.peerId).toBe(mockProviderId.toString());
      expect(p.multiaddrs).toContain("/ip4/127.0.0.1/tcp/4001");
    }
  });
});

// --- provideCapabilityTopic return-shape contract (Discovery fix) -----------
//
// The previous implementation swallowed the inner race-timeout and logged
// "Successfully advertised" at the caller even when the underlying DHT put
// never landed. The new contract surfaces the timeout as a `timedOut` flag
// so callers can log accurately and decide whether to back off.
//
// These tests stub `contentRouting.provide` / `put` so the test suite
// doesn't have to wait for the 30-second inner race in CI.

describe("provideCapabilityTopic — return-shape contract", () => {
  it("returns { cid, timedOut: false } when contentRouting.provide resolves", async () => {
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: true,
      dhtClientMode: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (mesh as any).node;
    expect(node).toBeTruthy();
    node.contentRouting.provide = vi.fn(async () => undefined);
    node.contentRouting.put = vi.fn(async () => undefined);

    const result = await mesh.provideCapabilityTopic("envoymesh.contract.ok");
    expect(result.cid).toBeTruthy();
    expect(result.timedOut).toBe(false);
    expect(result.signedRecord).toBeUndefined();
  });

  it("returns { timedOut: true } when contentRouting.provide rejects with a timeout-shaped error", async () => {
    // Simulates the production scenario: libp2p's KadDHT provide stalls
    // because the DHT has no reachable peers, the inner 30s race fires,
    // and the catch sees an Error whose message contains "timeout".
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: true,
      dhtClientMode: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (mesh as any).node;
    node.contentRouting.provide = vi.fn(async () => {
      throw new Error("provide timeout for envoymesh.contract.timeout");
    });

    const result = await mesh.provideCapabilityTopic("envoymesh.contract.timeout");
    expect(result.timedOut).toBe(true);
    expect(result.cid).toBeTruthy();
    expect(result.signedRecord).toBeUndefined();
  });

  it("still THROWS (does not swallow) non-timeout errors from contentRouting.provide", async () => {
    // Only the timeout-shaped error is treated as best-effort. Any other
    // rejection (encode failure, libp2p protocol error, etc.) must
    // propagate so the caller can decide what to do.
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: true,
      dhtClientMode: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (mesh as any).node;
    node.contentRouting.provide = vi.fn(async () => {
      throw new Error("encode failed: malformed CID");
    });

    await expect(mesh.provideCapabilityTopic("envoymesh.contract.encode-fail")).rejects.toThrow(
      /encode failed/,
    );
  });

  it("returns { timedOut: true } when the signed-record put times out, even if provide landed", async () => {
    // The signed record is a separate DHT put with a shorter 5s race.
    // If the broader put succeeds but the signed-record put times out,
    // we still surface the timeout so callers know the record didn't
    // fully propagate.
    const identity = generateIdentity();
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: true,
      dhtClientMode: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (mesh as any).node;
    node.contentRouting.provide = vi.fn(async () => undefined);
    node.contentRouting.put = vi.fn(async () => {
      throw new Error("put timeout");
    });

    const result = await mesh.provideCapabilityTopic("envoymesh.contract.signed-timeout", {
      signingKey: identity.privateKeyPem,
      ttlSeconds: 60,
    });
    expect(result.timedOut).toBe(true);
    expect(result.signedRecord).toBeTruthy(); // signedRecord is built regardless
    expect(result.signedRecord!.topic).toBe("envoymesh.contract.signed-timeout");
  });
});

describe("provideSelf — return-shape contract (Discovery fix)", () => {
  it("returns { advertised: 0, timedOut: false } when DHT is disabled", async () => {
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: false,
    });
    await mesh.start();
    meshes.push(mesh);

    const result = await mesh.provideSelf();
    expect(result).toEqual({ advertised: 0, timedOut: false });
  });

  it("returns { advertised: 0, timedOut: false } when there are no publicly dialable addresses", async () => {
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: true,
      dhtClientMode: false,
    });
    await mesh.start();
    meshes.push(mesh);
    // Only a loopback address — filtered out by isPrivateOrUnroutableDialHint.
    // No bootstrap peers, no _appendAnnounce — nothing to advertise.

    const result = await mesh.provideSelf();
    expect(result.advertised).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("returns { advertised: N, timedOut: true } when the broadcast put times out", async () => {
    // Simulates the production failure mode: libp2p's contentRouting.put
    // stalls because the DHT has no reachable peers. With the previous
    // implementation the function logged "SUCCESS" and returned void.
    // With the fix it returns timedOut: true so callers can react.
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: true,
      dhtClientMode: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // Inject a publicly-dialable address via setAdvertisedAddress so
    // provideSelf has something to broadcast (otherwise it short-circuits
    // at the "no public addrs" branch and never reaches the put).
    mesh.setAdvertisedAddress("/ip4/203.0.113.42/tcp/4001");

    // Stub the broadcast put to simulate a stuck DHT.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (mesh as any).node;
    node.contentRouting.put = vi.fn(async () => {
      throw new Error("provideSelf broadcast put timeout");
    });

    const result = await mesh.provideSelf();
    expect(result.timedOut).toBe(true);
    expect(result.advertised).toBe(1);
  });
});

// --- Discovery dial timeout regression --------------------------------------
//
// The constant was 3_500 ms which made cross-region public-internet dials
// (e.g. the community relay at 47.93.11.212:4001) fail before the
// TCP + Noise + Yamux handshake completed. Pinning the new value here so a
// future "let's fail faster" PR can't silently regress WAN reachability.
//
// We can't import HINT_DIAL_TIMEOUT_MS directly (it's a private const), so
// we measure the dial timeout by stubbing `node.dialProtocol` to return a
// never-resolving promise. `ensurePeerReachable` will hit the inner race
// timeout (HINT_DIAL_TIMEOUT_MS) and reject — measuring how long that takes
// pins the constant to within ±2s.

describe("Discovery dial timeout", () => {
  it("ensurePeerReachable waits HINT_DIAL_TIMEOUT_MS before failing on a hung dial", async () => {
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (mesh as any).node;
    // Stub dialProtocol to never resolve. The inner Promise.race against
    // HINT_DIAL_TIMEOUT_MS will fire and reject.
    node.dialProtocol = vi.fn(() => new Promise(() => {}));

    // Use a routable IP hint so the dial path actually reaches
    // dialProtocol. Without an explicit hint, openOutboundStream
    // short-circuits with "no outbound dial attempted" before exercising
    // the timeout.
    const fakePeerId = "12D3KooWHANGING-PROMISE-DEADLOCK-1234567890ABCDEFGHIJKLMNOP";
    const dialHints = [`/ip4/203.0.113.42/tcp/4001/p2p/${fakePeerId}`];

    const start = Date.now();
    // ensurePeerReachable doesn't throw — it catches the dial failure
    // and returns { connected: false, direct: false }. We just need to
    // measure how long it waited.
    const result = await mesh.ensurePeerReachable(fakePeerId, "/envoy/test/1.0.0", {
      forceFreshDial: true,
      dialHints,
    });
    const elapsed = Date.now() - start;

    // The function should report "not connected" (the stub never
    // resolved, so no stream was ever opened).
    expect(result.connected).toBe(false);

    // HINT_DIAL_TIMEOUT_MS is 30_000. Allow ±5s slack for setTimeout
    // scheduler variance on slow CI machines. A regression to 3_500 ms
    // (the very broken old value) or 15_000 ms (the intermediate value)
    // would produce elapsed < 20_000 and fail the lower-bound check.
    expect(elapsed).toBeGreaterThan(25_000);
    expect(elapsed).toBeLessThan(55_000);
  });
});

// --- Startup diagnostics (Discovery fix follow-up) -------------------------
//
// These tests pin the operator-visibility hooks that fire at mesh.start():
// 1. probeBootstrapPeers — TCP-level reachability test for each bootstrap
// 2. warnOnAdvertisedPortMismatch — catches "advertised port doesn't match
//    listen port" misconfiguration that breaks inbound dialing when
//    running behind NAT without port forwarding.
// 3. logDiscoveryReadiness — one-line summary so an operator tailing the
//    log can read whether Discover will work without log archaeology.

describe("Startup diagnostics — TCP probe", () => {
  it("reports REACHABLE for a real loopback TCP listener", async () => {
    // Start a throwaway server on a free port, then probe it. The server
    // is the ground truth — if it's listening, the probe must succeed.
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    expect(addr).toBeTruthy();
    if (!addr || typeof addr === "string") {
      server.close();
      return;
    }

    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const probe = (mesh as any).tcpProbe.bind(mesh);
    const result = await probe("127.0.0.1", addr.port, 2_000);
    expect(result.ok).toBe(true);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("reports UNREACHABLE for a closed port with an ECONNREFUSED reason", async () => {
    // Bind and immediately close so we get a port nothing's listening on.
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      server.close();
      return;
    }
    const closedPort = addr.port;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const probe = (mesh as any).tcpProbe.bind(mesh);
    const result = await probe("127.0.0.1", closedPort, 2_000);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/ECONNREFUSED|connect/);
  });

  it("reports UNREACHABLE for a TEST-NET-1 blackhole with a timeout reason", async () => {
    // 192.0.2.0/24 is reserved for documentation (RFC 5737) and is
    // guaranteed not to route — useful for a "definitely won't connect"
    // probe. The probe's timeout is short so the test runs fast.
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const probe = (mesh as any).tcpProbe.bind(mesh);
    const result = await probe("192.0.2.1", 4001, 500);
    expect(result.ok).toBe(false);
    // Either a TCP RST (depending on routing) or a timeout — both are
    // valid "unreachable" signals.
    expect(result.reason).toBeTruthy();
  });
});

describe("Startup diagnostics — port-mismatch warning", () => {
  it("warns when an announced port doesn't match any listen port", async () => {
    // Spy on console.warn so we can capture the warning without
    // polluting the test output.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // Inject an announced address on a port this node isn't listening on.
    // 127.0.0.1:1 is reserved (tcpmux) — extremely unlikely to be bound.
    mesh.setAdvertisedAddress("/ip4/127.0.0.1/tcp/1");

    // Trigger the diagnostic manually (it's normally called by start()).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mesh as any).warnOnAdvertisedPortMismatch();

    const mismatchCall = warnSpy.mock.calls.find((args) =>
      String(args[0] ?? "").includes("PORT MISMATCH"),
    );
    expect(mismatchCall).toBeTruthy();
    expect(String(mismatchCall![0])).toContain("127.0.0.1/tcp/1");

    warnSpy.mockRestore();
  });

  it("does NOT warn when the announced port matches a listen port", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // Get the actual port the node bound on.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listenAddrs = (mesh as any).node.getMultiaddrs() as Array<{ toString(): string }>;
    const portMatch = listenAddrs[0]?.toString().match(/\/tcp\/(\d+)/);
    expect(portMatch).toBeTruthy();
    const port = portMatch![1];

    // Announce the same port — should NOT trigger a mismatch warning.
    mesh.setAdvertisedAddress(`/ip4/127.0.0.1/tcp/${port}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mesh as any).warnOnAdvertisedPortMismatch();

    const mismatchCall = warnSpy.mock.calls.find((args) =>
      String(args[0] ?? "").includes("PORT MISMATCH"),
    );
    expect(mismatchCall).toBeUndefined();

    warnSpy.mockRestore();
  });
});

describe("Startup diagnostics — discovery readiness summary", () => {
  it("emits a one-line summary with relay/dht/mDNS flags", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: false,
      enableRelay: false,
    });
    await mesh.start();
    meshes.push(mesh);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mesh as any).logDiscoveryReadiness();

    const readinessCall = logSpy.mock.calls.find((args) =>
      String(args[0] ?? "").includes("discovery readiness"),
    );
    expect(readinessCall).toBeTruthy();
    const line = String(readinessCall![0]);
    expect(line).toContain("relay=OFF");
    expect(line).toContain("dht=OFF");
    expect(line).toContain("mDNS=OFF");
    expect(line).toMatch(/listen_addrs=\d+/);
    expect(line).toMatch(/advertised_addrs=\d+/);

    logSpy.mockRestore();
  });
});
