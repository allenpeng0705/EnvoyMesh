import { generateDeviceIdentity } from "@envoymesh/identity";
import { createLocalPeerDirectoryStore } from "../src/index.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-peerdir-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("peer directory store", () => {
  it("upserts peer mappings from system.signal payloads", async () => {
    const store = createLocalPeerDirectoryStore(profileDir);

    await store.upsertPeerFromSignal({
      peerId: "12D3KooWPeer1",
      seenAt: "2026-04-27T10:00:00.000Z",
      payload: {
        ownerId: "envoy:owner:alice",
        ownerPublicKeyPem: "owner-key",
        deviceId: "envoy:device:laptop",
        deviceCertificate: {
          version: "0.1",
          certificateId: "cert-1",
          ownerId: "envoy:owner:alice",
          deviceId: "envoy:device:laptop",
          devicePublicKeyPem: "device-key",
          deviceProfile: "primary",
          capabilities: ["mesh.discovery"],
          issuedAt: "2026-04-27T10:00:00.000Z",
          expiresAt: null,
          signature: "sig",
        },
        deviceProfile: "primary",
        capabilities: ["mesh.discovery"],
        supportedProtocolVersions: ["emp/0.1"],
        listenAddrs: ["/ip4/127.0.0.1/tcp/4001"],
        publicTopics: [],
        status: "online",
      },
    });

    const found = await store.getPeerByOwnerId("envoy:owner:alice");
    expect(found?.peerId).toBe("12D3KooWPeer1");
    expect(found?.deviceId).toBe("envoy:device:laptop");
    expect(found?.devicePublicKeyPem).toBe("device-key");

    await store.upsertPeerFromSignal({
      peerId: "12D3KooWPeer2",
      seenAt: "2026-04-27T10:05:00.000Z",
      payload: {
        ownerId: "envoy:owner:alice",
        ownerPublicKeyPem: "owner-key",
        deviceId: "envoy:device:phone",
        deviceCertificate: {
          version: "0.1",
          certificateId: "cert-2",
          ownerId: "envoy:owner:alice",
          deviceId: "envoy:device:phone",
          devicePublicKeyPem: "device-key-2",
          deviceProfile: "satellite",
          capabilities: ["ui.channel"],
          issuedAt: "2026-04-27T10:05:00.000Z",
          expiresAt: null,
          signature: "sig2",
        },
        deviceProfile: "satellite",
        capabilities: ["ui.channel"],
        supportedProtocolVersions: ["emp/0.1"],
        listenAddrs: ["/ip4/127.0.0.1/tcp/4002"],
        publicTopics: [],
        status: "online",
      },
    });

    const updated = await store.getPeerByOwnerId("envoy:owner:alice");
    expect(updated?.peerId).toBe("12D3KooWPeer2");
    expect(updated?.deviceId).toBe("envoy:device:phone");
    expect(updated?.devicePublicKeyPem).toBe("device-key-2");
  });

  it("ensurePeerFromInboundChat creates a row so reply-by-ownerId can resolve libp2p peer id", async () => {
    const store = createLocalPeerDirectoryStore(profileDir);

    expect(await store.getPeerByOwnerId("envoy:owner:bob")).toBeUndefined();

    await store.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:bob",
      peerId: "12D3KooWChatBob",
      listenAddrs: ["/ip4/10.0.0.2/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWChatBob"],
    });

    const found = await store.getPeerByOwnerId("envoy:owner:bob");
    expect(found?.peerId).toBe("12D3KooWChatBob");
    expect(found?.deviceId).toBe("chat-inbound");
    expect(found?.listenAddrs.length).toBe(1);
  });

  it("mergeInboundDeviceBinding repairs chat-inbound placeholder with device signing key", async () => {
    const store = createLocalPeerDirectoryStore(profileDir);
    const device = generateDeviceIdentity();

    await writeFile(
      join(profileDir, "peer-directory.json"),
      JSON.stringify(
        {
          version: "0.1",
          records: [
            {
              version: "0.1",
              ownerId: "envoy:owner:alice",
              peerId: "12D3KooWAlice",
              deviceId: "chat-inbound",
              lastSeenAt: new Date().toISOString(),
              listenAddrs: [],
            },
          ],
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );

    await store.mergeInboundDeviceBinding({
      peerId: "12D3KooWAlice",
      devicePublicKeyPem: device.publicKeyPem,
    });

    const found = await store.getPeerByOwnerId("envoy:owner:alice");
    expect(found?.devicePublicKeyPem).toBe(device.publicKeyPem);
    expect(found?.deviceId).toBe(device.deviceId);
  });

  it("repairs corrupted record when upsertPeerFromSignal receives proper ownerId", async () => {
    // This tests the bug fix: corrupted records from mDNS peer.discovered
    // had ownerId = peerId instead of the actual owner identity
    const store = createLocalPeerDirectoryStore(profileDir);

    // Simulate a corrupted record: created via peer.discovered with ownerId = peerId
    await store.ensurePeerFromInboundChat({
      ownerId: "12D3KooWCorrupted", // wrong! This is a peerId, not an ownerId
      peerId: "12D3KooWCorrupted",
      listenAddrs: ["/ip4/192.168.1.100/tcp/4001"],
    });

    // Verify the corrupted record exists
    const corrupted = await store.getPeerByOwnerId("12D3KooWCorrupted");
    expect(corrupted).toBeDefined();
    expect(corrupted?.ownerId).toBe("12D3KooWCorrupted");

    // Now upsertPeerFromSignal with the CORRECT ownerId
    await store.upsertPeerFromSignal({
      peerId: "12D3KooWCorrupted",
      seenAt: "2026-05-05T12:00:00.000Z",
      payload: {
        ownerId: "envoy:owner:correct-owner",
        ownerPublicKeyPem: "correct-owner-key",
        deviceId: "envoy:device:correct-device",
        deviceCertificate: {
          version: "0.1",
          certificateId: "cert-correct",
          ownerId: "envoy:owner:correct-owner",
          deviceId: "envoy:device:correct-device",
          devicePublicKeyPem: "correct-device-key",
          deviceProfile: "primary",
          capabilities: ["mesh.listen"],
          issuedAt: "2026-05-05T12:00:00.000Z",
          expiresAt: null,
          signature: "correct-sig",
        },
        deviceProfile: "primary",
        capabilities: ["mesh.listen"],
        supportedProtocolVersions: ["emp/0.1"],
        listenAddrs: ["/ip4/192.168.1.100/tcp/4001"],
        publicTopics: [],
        status: "online",
      },
    });

    // The corrupted record should be repaired
    const repaired = await store.getPeerByOwnerId("envoy:owner:correct-owner");
    expect(repaired).toBeDefined();
    expect(repaired?.peerId).toBe("12D3KooWCorrupted");
    expect(repaired?.ownerId).toBe("envoy:owner:correct-owner");
    expect(repaired?.deviceId).toBe("envoy:device:correct-device");

    // The corrupted lookup should now return undefined
    const stillCorrupted = await store.getPeerByOwnerId("12D3KooWCorrupted");
    expect(stillCorrupted).toBeUndefined();
  });

  it("getPeerByOwnerId returns most recent record when multiple exist for same owner", async () => {
    const store = createLocalPeerDirectoryStore(profileDir);

    // Create first record
    await store.upsertPeerFromSignal({
      peerId: "12D3KooWFirst",
      seenAt: "2026-05-05T10:00:00.000Z",
      payload: {
        ownerId: "envoy:owner:same-owner",
        ownerPublicKeyPem: "owner-key",
        deviceId: "envoy:device:first",
        deviceCertificate: {
          version: "0.1",
          certificateId: "cert-first",
          ownerId: "envoy:owner:same-owner",
          deviceId: "envoy:device:first",
          devicePublicKeyPem: "first-key",
          deviceProfile: "primary",
          capabilities: [],
          issuedAt: "2026-05-05T10:00:00.000Z",
          expiresAt: null,
          signature: "sig-first",
        },
        deviceProfile: "primary",
        capabilities: [],
        supportedProtocolVersions: ["emp/0.1"],
        listenAddrs: ["/ip4/127.0.0.1/tcp/4001"],
        publicTopics: [],
        status: "online",
      },
    });

    // Create second record for same owner (different device)
    await store.upsertPeerFromSignal({
      peerId: "12D3KooWSecond",
      seenAt: "2026-05-05T11:00:00.000Z", // more recent
      payload: {
        ownerId: "envoy:owner:same-owner",
        ownerPublicKeyPem: "owner-key",
        deviceId: "envoy:device:second",
        deviceCertificate: {
          version: "0.1",
          certificateId: "cert-second",
          ownerId: "envoy:owner:same-owner",
          deviceId: "envoy:device:second",
          devicePublicKeyPem: "second-key",
          deviceProfile: "satellite",
          capabilities: [],
          issuedAt: "2026-05-05T11:00:00.000Z",
          expiresAt: null,
          signature: "sig-second",
        },
        deviceProfile: "satellite",
        capabilities: [],
        supportedProtocolVersions: ["emp/0.1"],
        listenAddrs: ["/ip4/127.0.0.1/tcp/4002"],
        publicTopics: [],
        status: "online",
      },
    });

    // getPeerByOwnerId should return the most recent
    const latest = await store.getPeerByOwnerId("envoy:owner:same-owner");
    expect(latest?.peerId).toBe("12D3KooWSecond");
    expect(latest?.deviceId).toBe("envoy:device:second");
  });

  it("getPeerByOwnerId prefers libp2p row over a newer envoy_* row", async () => {
    const store = createLocalPeerDirectoryStore(profileDir);
    const ownerId = "envoy:owner:same-owner";
    await writeFile(
      join(profileDir, "peer-directory.json"),
      JSON.stringify({
        version: "0.1",
        records: [
          {
            version: "0.1",
            ownerId,
            peerId: "12D3KooWLibp2p",
            deviceId: "chat-inbound",
            lastSeenAt: "2026-05-30T10:00:00.000Z",
            listenAddrs: [],
          },
          {
            version: "0.1",
            ownerId,
            peerId: "envoy_1KoMqLW3ZC7LAhZGVvWvu7vsSYe7wHnkiVQmby3v_Y0",
            deviceId: "pairDevice",
            lastSeenAt: "2026-05-30T12:00:00.000Z",
            listenAddrs: [],
          },
        ],
      }),
      { mode: 0o600 },
    );

    const found = await store.getPeerByOwnerId(ownerId);
    expect(found?.peerId).toBe("12D3KooWLibp2p");
  });

  it("ensurePeerFromInboundChat repairs corrupted record with same peerId", async () => {
    const store = createLocalPeerDirectoryStore(profileDir);

    // Create corrupted record via upsertPeerFromSignal (ownerId = peerId)
    await store.upsertPeerFromSignal({
      peerId: "12D3KooWBadRecord",
      seenAt: "2026-05-05T09:00:00.000Z",
      payload: {
        ownerId: "12D3KooWBadRecord", // wrong!
        ownerPublicKeyPem: "bad-key",
        deviceId: "envoy:device:bad",
        deviceCertificate: {
          version: "0.1",
          certificateId: "cert-bad",
          ownerId: "12D3KooWBadRecord",
          deviceId: "envoy:device:bad",
          devicePublicKeyPem: "bad-key",
          deviceProfile: "primary",
          capabilities: [],
          issuedAt: "2026-05-05T09:00:00.000Z",
          expiresAt: null,
          signature: "sig-bad",
        },
        deviceProfile: "primary",
        capabilities: [],
        supportedProtocolVersions: ["emp/0.1"],
        listenAddrs: ["/ip4/192.168.1.50/tcp/4001"],
        publicTopics: [],
        status: "online",
      },
    });

    // Now ensurePeerFromInboundChat with correct ownerId should repair it
    await store.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:good-owner",
      peerId: "12D3KooWBadRecord",
      listenAddrs: ["/ip4/192.168.1.50/tcp/4001"],
    });

    const repaired = await store.getPeerByOwnerId("envoy:owner:good-owner");
    expect(repaired).toBeDefined();
    expect(repaired?.peerId).toBe("12D3KooWBadRecord");
    expect(repaired?.ownerId).toBe("envoy:owner:good-owner");
    // deviceId is preserved from the existing record
    expect(repaired?.deviceId).toBe("envoy:device:bad");
  });

  it("mergeListenAddrsForPeerId strips legacy ephemeral TCP snapshots even with no new addrs", async () => {
    const store = createLocalPeerDirectoryStore(profileDir);
    const peerId = "12D3KooWEphemeralScrubPeer";
    await writeFile(
      join(profileDir, "peer-directory.json"),
      JSON.stringify({
        version: "0.1",
        records: [
          {
            version: "0.1",
            ownerId: "envoy:owner:scrub",
            peerId,
            deviceId: "legacy",
            lastSeenAt: new Date().toISOString(),
            listenAddrs: [
              `/ip4/192.168.3.78/tcp/64595/p2p/${peerId}`,
              `/ip4/192.168.3.78/tcp/4011/p2p/${peerId}`,
            ],
          },
        ],
      }),
      { mode: 0o600 },
    );
    await store.mergeListenAddrsForPeerId(peerId, []);
    const row = await store.getPeerByPeerId(peerId);
    expect(row?.listenAddrs.some((a) => a.includes("64595"))).toBe(false);
    expect(row?.listenAddrs.some((a) => a.includes("4011"))).toBe(true);
  });

  it("sanitizeListenAddrs strips ephemeral snapshots from all rows", async () => {
    const store = createLocalPeerDirectoryStore(profileDir);
    const peerId = "12D3KooWSanitizeListenAddrsPeer";
    await writeFile(
      join(profileDir, "peer-directory.json"),
      JSON.stringify({
        version: "0.1",
        records: [
          {
            version: "0.1",
            ownerId: "envoy:owner:sanitize",
            peerId,
            deviceId: "legacy",
            lastSeenAt: new Date().toISOString(),
            listenAddrs: [`/ip4/192.168.3.78/tcp/64595/p2p/${peerId}`],
          },
        ],
      }),
      { mode: 0o600 },
    );
    const result = await store.sanitizeListenAddrs();
    expect(result.recordsTouched).toBe(1);
    const row = await store.getPeerByPeerId(peerId);
    expect(row?.listenAddrs).toEqual([]);
  });
});
