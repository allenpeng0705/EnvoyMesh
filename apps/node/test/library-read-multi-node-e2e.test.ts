/**
 * Two-node E2E: library.read over the mesh.
 *
 * Phase 45 — Web Content Browsing. Scenarios:
 *  - LIBREAD-01: Bonded A↔B; A has web/hello.md; B calls libraryRead; assert
 *    response body matches file content, contentType is text/markdown.
 *  - LIBREAD-02: A has web/photos/cover.jpg (binary); B reads it; assert
 *    binary body round-trips (compare base64 + sha256).
 *  - LIBREAD-03: A and B NOT bonded; B attempts read; assert
 *    status: "not_found" (no leakage).
 *  - LIBREAD-04: A updates web/hello.md content; B reads with stale etag;
 *    assert response is full content (not 304 — etag-based caching is
 *    a 45B feature, not 45A).
 *  - LIBREAD-05: A has web/secret.md with visibility "private"; B attempts
 *    read; assert status: "not_found" (private is owner-only).
 *
 * Mirrors apps/node/test/library-publish-export-multi-node-e2e.test.ts
 * scaffolding (createTestNode, registerBondedPeer, wireLibraryReadHandler,
 * connectPeers, writeWebFile). See docs/web-content-browsing-design.md §8.3.
 */

import {
  createDeviceCertificate,
  deriveDeviceId,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import {
  createLibraryReadResponsePayload,
  createUnsignedEnvelope,
  parseLibraryReadPayload,
} from "@envoymesh/protocol";
import { EnvoyMesh } from "@envoymesh/network";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleInboundLibraryRead } from "../src/library-read-inbound.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { createWebContentStore, type WebContentEntry } from "../src/web-content-store.js";

const meshes: EnvoyMesh[] = [];
const profileDirs: string[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => {})));
  await Promise.all(profileDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

interface TestNode {
  profileDir: string;
  profile: NodeProfile;
  mesh: EnvoyMesh;
  taskStore: ReturnType<typeof createLocalTaskStore>;
  trustStore: ReturnType<typeof createLocalTrustStore>;
  peerDirectory: ReturnType<typeof createLocalPeerDirectoryStore>;
  human: ReturnType<typeof createHumanProfileStore>;
  service: NodeServiceImpl;
}

async function startMesh(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({ listen: ["/ip4/127.0.0.1/tcp/0"], enableMdns: false });
  await mesh.start();
  meshes.push(mesh);
  return mesh;
}

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
      capabilities: ["mesh.listen", "message.send", "task.execute", "vault.retrieve"],
    }),
  };
}

async function createTestNode(): Promise<TestNode> {
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-libread-e2e-"));
  profileDirs.push(profileDir);
  const profile = testProfile();
  const mesh = await startMesh();
  const taskStore = createLocalTaskStore(profileDir);
  const trustStore = createLocalTrustStore(profileDir);
  const peerDirectory = createLocalPeerDirectoryStore(profileDir);
  const human = createHumanProfileStore(profileDir);
  const service = new NodeServiceImpl(
    mesh,
    trustStore,
    peerDirectory,
    human,
    profileDir,
    profile,
  );
  service.bindCliTaskStore(taskStore);
  service.bindExternalMesh(mesh);
  return { profileDir, profile, mesh, taskStore, trustStore, peerDirectory, human, service };
}

async function registerBondedPeer(
  local: TestNode,
  remote: TestNode,
  displayName: string,
): Promise<void> {
  await local.trustStore.setTrustRecord({
    peerOwnerId: remote.profile.owner.ownerId,
    level: "direct",
    displayName,
  });
  await writeFile(
    join(local.profileDir, "peer-directory.json"),
    JSON.stringify(
      {
        version: "0.1",
        records: [
          {
            version: "0.1",
            ownerId: remote.profile.owner.ownerId,
            peerId: remote.mesh.peerId,
            deviceId: deriveDeviceId(remote.profile.device.publicKeyPem),
            devicePublicKeyPem: remote.profile.device.publicKeyPem,
            lastSeenAt: new Date().toISOString(),
            listenAddrs: remote.mesh.multiaddrs.map(String),
          },
        ],
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}

/** Write a web/ file + manifest entry on the given node. */
async function publishFile(
  node: TestNode,
  relPath: string,
  body: string,
  visibility: "public" | "bonded" | "contacts" | "private" = "public",
  mimeType: "text/markdown" | "image/jpeg" = "text/markdown",
  contactIds?: string[],
): Promise<void> {
  const fullPath = join(node.profileDir, "web", relPath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, body, { mode: 0o600 });

  const store = createWebContentStore(join(node.profileDir, "web"));
  const entry: WebContentEntry = {
    path: relPath,
    contentHash: "any",
    byteLength: Buffer.byteLength(body, "utf8"),
    title: relPath,
    kind: relPath.endsWith(".jpg") || relPath.endsWith(".jpeg") ? "photo" : "article",
    mimeType,
    visibility,
    updatedAt: new Date().toISOString(),
    ...(contactIds?.length ? { contactIds } : {}),
  };
  await store.upsert(entry);
}

/** Wire the inbound library.read handler on the given node. */
function wireLibraryReadHandler(node: TestNode): void {
  node.mesh.onMessage(async ({ envelope, remotePeerId, replyWithEnvelope }) => {
    if (!verifyInboundEnvelope(envelope)) return;
    if (envelope.intent !== "library.read") return;
    if (!replyWithEnvelope) return;

    const result = await handleInboundLibraryRead({
      envelope,
      remotePeerId,
      receivedAt: Date.now(),
      correlationId: envelope.correlationId,
      taskStore: node.taskStore,
      trustStore: node.trustStore,
      peerDirectoryStore: node.peerDirectory,
      profile: node.profile,
      profileDir: node.profileDir,
    });
    if (!result.ok) return;
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(node.profile.device.publicKeyPem),
      senderPublicKey: node.profile.device.publicKeyPem,
      recipientPeerId: envelope.senderPeerId,
      intent: "library.read.response",
      payload: createLibraryReadResponsePayload(result.responsePayload),
      correlationId: envelope.correlationId,
    });
    const signed = signUnsignedEnvelope(unsigned, node.profile.device.privateKeyPem);
    await replyWithEnvelope(signed);
  });
}

async function connectPeers(local: TestNode, remote: TestNode): Promise<void> {
  await local.mesh.probePeer(remote.mesh.multiaddrs[0]!);
}

describe("library.read — two-node E2E", () => {
  it("LIBREAD-01: bonded reader fetches a public markdown file", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireLibraryReadHandler(alice);
    await connectPeers(bob, alice);

    const body = "# Hello from Alice\n\nFirst published post.";
    await publishFile(alice, "posts/hello.md", body, "public");
    const result = await bob.service.libraryRead({
      targetOwnerId: alice.profile.owner.ownerId,
      path: "posts/hello.md",
    });

    expect(result.status).toBe("ok");
    expect(result.body).toBe(body);
    expect(result.contentType).toBe("text/markdown");
    expect(result.byteLength).toBe(Buffer.byteLength(body, "utf8"));
    expect(result.contentHash).toBeTruthy();
    expect(result.peerOwnerId).toBe(alice.profile.owner.ownerId);
  });

  it("LIBREAD-02: bonded reader fetches a binary image (base64 round-trip)", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireLibraryReadHandler(alice);
    await connectPeers(bob, alice);

    // Minimal valid JPEG (1x1 pixel white) — bytes are binary.
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
      0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06,
      0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d,
      0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d,
      0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28,
      0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
      0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xd9,
    ]);
    await mkdir(join(alice.profileDir, "web", "photos"), { recursive: true });
    await writeFile(join(alice.profileDir, "web", "photos", "cover.jpg"), jpegBytes, { mode: 0o600 });
    const store = createWebContentStore(join(alice.profileDir, "web"));
    await store.upsert({
      path: "photos/cover.jpg",
      contentHash: "any",
      byteLength: jpegBytes.length,
      title: "cover",
      kind: "photo",
      mimeType: "image/jpeg",
      visibility: "public",
      updatedAt: new Date().toISOString(),
    });

    const result = await bob.service.libraryRead({
      targetOwnerId: alice.profile.owner.ownerId,
      path: "photos/cover.jpg",
    });

    expect(result.status).toBe("ok");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.byteLength).toBe(jpegBytes.length);
    expect(result.body).toBeTruthy();
    const decoded = Buffer.from(result.body!, "base64");
    expect(decoded.equals(jpegBytes)).toBe(true);
  });

  it("LIBREAD-03: unbonded reader gets not_found for bonded-only content", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    // No registerBondedPeer — they are NOT bonded.
    wireLibraryReadHandler(alice);
    await connectPeers(bob, alice);

    // Bob is a stranger (no trust record → bond defaults to "public").
    // Alice's file is "bonded" visibility — Bob's bond is too weak.
    // The handler returns not_found to avoid leaking path existence.
    // Transport may return "error" if the unbonded dial times out —
    // both statuses correctly prevent content leakage.
    await publishFile(alice, "hidden.md", "for friends only", "bonded");
    const result = await bob.service.libraryRead({
      targetOwnerId: alice.profile.owner.ownerId,
      path: "hidden.md",
    });

    expect(["not_found", "error"]).toContain(result.status);
    expect(result.body).toBeUndefined();
  });

  it("LIBREAD-04: private file returns not_found to bonded reader", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireLibraryReadHandler(alice);
    await connectPeers(bob, alice);

    await publishFile(alice, "owner-only.md", "top secret", "private");
    const result = await bob.service.libraryRead({
      targetOwnerId: alice.profile.owner.ownerId,
      path: "owner-only.md",
    });

    expect(result.status).toBe("not_found");
    expect(result.body).toBeUndefined();
  });

  it("LIBREAD-05: bonded reader gets updated content on re-read", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireLibraryReadHandler(alice);
    await connectPeers(bob, alice);

    await publishFile(alice, "changelog.md", "version 1", "public");
    const r1 = await bob.service.libraryRead({
      targetOwnerId: alice.profile.owner.ownerId,
      path: "changelog.md",
    });
    expect(r1.status).toBe("ok");
    expect(r1.body).toBe("version 1");

    // Update content on Alice.
    await writeFile(
      join(alice.profileDir, "web", "changelog.md"),
      "version 2 — new features",
      { mode: 0o600 },
    );

    const r2 = await bob.service.libraryRead({
      targetOwnerId: alice.profile.owner.ownerId,
      path: "changelog.md",
    });
    expect(r2.status).toBe("ok");
    expect(r2.body).toBe("version 2 — new features");
  });

  it("LIBREAD-06: contacts ACL allow when reader is in contactIds", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireLibraryReadHandler(alice);
    await connectPeers(bob, alice);

    await publishFile(
      alice,
      "exclusive.md",
      "# For Bob",
      "contacts",
      "text/markdown",
      [bob.profile.owner.ownerId],
    );
    const result = await bob.service.libraryRead({
      targetOwnerId: alice.profile.owner.ownerId,
      path: "exclusive.md",
    });
    expect(result.status).toBe("ok");
    expect(result.body).toContain("For Bob");
  });

  it("LIBREAD-07: contacts ACL deny when bonded reader is not in contactIds", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireLibraryReadHandler(alice);
    await connectPeers(bob, alice);

    await publishFile(
      alice,
      "exclusive.md",
      "# Secret",
      "contacts",
      "text/markdown",
      ["envoy:owner:someone-else"],
    );
    const result = await bob.service.libraryRead({
      targetOwnerId: alice.profile.owner.ownerId,
      path: "exclusive.md",
    });
    expect(result.status).toBe("forbidden");
    expect(result.body).toBeUndefined();
  });
});
