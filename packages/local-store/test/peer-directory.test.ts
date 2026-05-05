import { createLocalPeerDirectoryStore } from "../src/index.js";
import { mkdtemp, rm } from "node:fs/promises";
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
});
