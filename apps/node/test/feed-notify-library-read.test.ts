/**
 * Phase 45E — notify → library.read vertical slice (handler-level, no live mesh).
 * Alice publishes web content; Bob receives feed.notify; Bob library.read succeeds.
 */
import { createLocalPeerDirectoryStore, createLocalTaskStore, createLocalTrustStore } from "@envoymesh/local-store";
import { deriveDeviceId } from "@envoymesh/identity";
import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundFeedNotify } from "../src/feed-notify-inbound.js";
import { handleInboundLibraryRead } from "../src/library-read-inbound.js";
import { publishWebContentEntry } from "../src/web-content-author.js";
import { createWebContentStore } from "../src/web-content-store.js";

const ALICE = "envoy:owner:alice0001";
const BOB = "envoy:owner:bob000001";
const ALICE_PEER = "envoy_alicepeer";
const BOB_PEER = "envoy_bobpeer";
const PEM = "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----";

let aliceDir: string;
let bobDir: string;

beforeEach(async () => {
  aliceDir = await mkdtemp(join(tmpdir(), "feed-alice-"));
  bobDir = await mkdtemp(join(tmpdir(), "feed-bob-"));
});

afterEach(async () => {
  await rm(aliceDir, { recursive: true, force: true });
  await rm(bobDir, { recursive: true, force: true });
});

describe("feed.notify → library.read", () => {
  it("Bob stores notify and reads Alice's published post", async () => {
    const published = await publishWebContentEntry(aliceDir, {
      ownerId: ALICE,
      template: "note",
      title: "Bonded note",
      body: "Hello from Alice",
      visibility: "bonded",
      tags: ["music"],
    });

    const bobTrust = createLocalTrustStore(bobDir);
    const bobPeers = createLocalPeerDirectoryStore(bobDir);
    const bobTasks = createLocalTaskStore(bobDir);
    await bobTrust.setTrustRecord({ peerOwnerId: ALICE, level: "direct", displayName: "Alice" });
    await writeFile(
      join(bobDir, "peer-directory.json"),
      JSON.stringify({
        version: "0.1",
        records: [
          {
            version: "0.1",
            ownerId: ALICE,
            peerId: ALICE_PEER,
            deviceId: deriveDeviceId(PEM),
            devicePublicKeyPem: PEM,
            lastSeenAt: new Date().toISOString(),
            listenAddrs: [],
          },
        ],
      }),
      { mode: 0o600 },
    );

    const notifyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: ALICE_PEER,
        senderPublicKey: PEM,
        senderRole: "human",
        recipientRole: "human",
        intent: "feed.notify",
        payload: {
          publisherOwnerId: ALICE,
          publishedAt: published.publishedAt,
          title: published.title,
          url: published.url,
          kind: "note",
          visibility: "bonded",
          tags: ["music"],
          contentHash: published.contentHash,
        },
      }),
      signature: "sig",
    };

    const notify = await handleInboundFeedNotify({
      envelope: notifyEnvelope,
      profileDir: bobDir,
      remotePeerId: "12D3KooWalice",
      trustStore: bobTrust,
      peerDirectoryStore: bobPeers,
      taskStore: bobTasks,
      localInterests: ["music"],
    });
    expect(notify.ok).toBe(true);
    if (!notify.ok) return;
    expect(notify.item.url).toBe(published.url);

    // Alice serves library.read for Bob
    const aliceTrust = createLocalTrustStore(aliceDir);
    const alicePeers = createLocalPeerDirectoryStore(aliceDir);
    const aliceTasks = createLocalTaskStore(aliceDir);
    await aliceTrust.setTrustRecord({ peerOwnerId: BOB, level: "direct", displayName: "Bob" });
    await mkdir(join(aliceDir, "web"), { recursive: true });
    // ensure manifest still present
    const store = createWebContentStore(join(aliceDir, "web"));
    expect(await store.findByPath(published.path)).toBeTruthy();

    const readEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: BOB_PEER,
        senderPublicKey: PEM,
        senderRole: "human",
        recipientRole: "human",
        intent: "library.read",
        payload: {
          requesterOwnerId: BOB,
          targetOwnerId: ALICE,
          path: published.path,
        },
      }),
      signature: "sig",
    };

    await writeFile(
      join(aliceDir, "peer-directory.json"),
      JSON.stringify({
        version: "0.1",
        records: [
          {
            version: "0.1",
            ownerId: BOB,
            peerId: BOB_PEER,
            deviceId: deriveDeviceId(PEM),
            devicePublicKeyPem: PEM,
            lastSeenAt: new Date().toISOString(),
            listenAddrs: [],
          },
        ],
      }),
      { mode: 0o600 },
    );

    const read = await handleInboundLibraryRead({
      envelope: readEnvelope,
      profile: {
        owner: { ownerId: ALICE, publicKeyPem: PEM },
        device: { deviceId: "envoy:device:alice", publicKeyPem: PEM, privateKeyPem: "x" },
        deviceCertificate: {
          deviceId: "envoy:device:alice",
          ownerId: ALICE,
          deviceProfile: "primary",
          capabilities: ["vault.retrieve"],
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          signature: "sig",
        },
      } as never,
      remotePeerId: "12D3KooWbob",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore: aliceTasks,
      trustStore: aliceTrust,
      peerDirectoryStore: alicePeers,
      profileDir: aliceDir,
    });

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.responsePayload.status).toBe("ok");
    expect(read.responsePayload.body).toContain("Hello from Alice");
  });
});
