import { createLocalTaskStore, createLocalTrustStore, createLocalPeerDirectoryStore } from "@envoymesh/local-store";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundLibraryRead } from "../src/library-read-inbound.js";
import { createWebContentStore, type WebContentEntry } from "../src/web-content-store.js";
import { deriveDeviceId } from "@envoymesh/identity";

let profileDir: string;
let taskStore: ReturnType<typeof createLocalTaskStore>;
let trustStore: ReturnType<typeof createLocalTrustStore>;
let peerDirectoryStore: ReturnType<typeof createLocalPeerDirectoryStore>;

const OWNER_SELF = "envoy:owner:self0001";
const OWNER_CONTACT = "envoy:owner:contact01";

function makeTestProfile() {
  return {
    owner: {
      ownerId: OWNER_SELF,
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
    },
    device: {
      deviceId: "envoy:device:self0001",
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    },
    deviceCertificate: {
      version: "0.1",
      deviceId: "envoy:device:self0001",
      ownerPublicKey: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      capabilities: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      signature: "sig",
    },
  };
}

function libraryReadEnvelope(senderPeerId: string, payload: unknown): EnvoyEnvelope {
  return {
    ...createUnsignedEnvelope({
      senderPeerId,
      senderPublicKey: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      intent: "library.read",
      payload,
      createdAt: "2026-07-20T10:00:00.000Z",
      messageId: "message-lr-1",
    }),
    signature: "signature",
  };
}

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-library-read-"));
  taskStore = createLocalTaskStore(profileDir);
  trustStore = createLocalTrustStore(profileDir);
  peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

async function writeWebFile(relPath: string, content: string): Promise<void> {
  const fullPath = join(profileDir, "web", relPath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, content, { mode: 0o600 });
}

/** Write a manifest entry that reflects the actual file size. */
async function writePublishedFile(
  relPath: string,
  content: string,
  opts: { visibility?: "public" | "bonded" | "contacts" | "private"; contactIds?: string[] } = {},
): Promise<void> {
  await writeWebFile(relPath, content);
  const visibility = opts.visibility ?? "public";
  await writeManifestEntry({
    path: relPath,
    contentHash: "any",
    byteLength: Buffer.byteLength(content, "utf8"),
    title: relPath,
    kind: "article",
    mimeType: "text/markdown",
    visibility,
    contactIds: opts.contactIds,
    updatedAt: "2026-07-20T00:00:00Z",
  });
}

/** Write a peer-directory entry for a known contact (used for direct-bond tests). */
async function registerPeer(peerId: string, ownerId: string, publicKeyPem: string): Promise<void> {
  const deviceId = deriveDeviceId(publicKeyPem);
  await writeFile(
    join(profileDir, "peer-directory.json"),
    JSON.stringify(
      {
        version: "0.1",
        records: [
          {
            version: "0.1",
            ownerId,
            peerId,
            deviceId,
            devicePublicKeyPem: publicKeyPem,
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
  // Re-create the store so it picks up the file we just wrote.
  peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
}

async function writeManifestEntry(entry: WebContentEntry): Promise<void> {
  const store = createWebContentStore(join(profileDir, "web"));
  await store.upsert(entry);
}

async function call(
  senderPeerId: string,
  payload: unknown,
  opts: { isLocalSelfRead?: boolean } = {},
) {
  return handleInboundLibraryRead({
    envelope: libraryReadEnvelope(senderPeerId, payload),
    remotePeerId: "remote-libp2p",
    receivedAt: Date.now(),
    correlationId: "corr-lr-1",
    taskStore,
    trustStore,
    peerDirectoryStore,
    profile: makeTestProfile(),
    profileDir,
    isLocalSelfRead: opts.isLocalSelfRead,
  });
}

const VALID_PAYLOAD = {
  requesterOwnerId: OWNER_CONTACT,
  targetOwnerId: OWNER_SELF,
  path: "hello.md",
};

describe("handleInboundLibraryRead", () => {
  it("returns error for invalid payload (missing path)", async () => {
    const result = await call("peer-a", {
      requesterOwnerId: OWNER_CONTACT,
      targetOwnerId: OWNER_SELF,
      path: "",
    });
    expect(result.ok).toBe(false);
  });

  it("serves public-visibility file to a stranger (public bond)", async () => {
    await writeWebFile("hello.md", "# Hello");
    await writeManifestEntry({
      path: "hello.md",
      contentHash: "any",
      byteLength: 7,
      title: "Hello",
      kind: "article",
      mimeType: "text/markdown",
      visibility: "public",
      updatedAt: "2026-07-20T00:00:00Z",
    });
    // No trust record → bond defaults to "public" (stranger).
    const result = await call("peer-stranger", VALID_PAYLOAD);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("ok");
      expect(result.responsePayload.body).toBe("# Hello");
      expect(result.responsePayload.contentType).toBe("text/markdown");
    }
  });

  it("denies bonded-visibility file to a stranger (returns not_found)", async () => {
    await writeWebFile("secret.md", "secret");
    await writeManifestEntry({
      path: "secret.md",
      contentHash: "any",
      byteLength: 6,
      title: "Secret",
      kind: "note",
      mimeType: "text/markdown",
      visibility: "bonded",
      updatedAt: "2026-07-20T00:00:00Z",
    });
    const result = await call("peer-stranger", {
      ...VALID_PAYLOAD,
      path: "secret.md",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // not_found rather than forbidden to avoid leaking existence.
      expect(result.responsePayload.status).toBe("not_found");
    }
  });

  it("serves bonded-visibility file to a direct bond", async () => {
    await writeWebFile("friends.md", "# Friends only");
    await writeManifestEntry({
      path: "friends.md",
      contentHash: "any",
      byteLength: 14,
      title: "Friends",
      kind: "article",
      mimeType: "text/markdown",
      visibility: "bonded",
      updatedAt: "2026-07-20T00:00:00Z",
    });
    await trustStore.setTrustRecord({ peerOwnerId: OWNER_CONTACT, level: "direct", displayName: "Contact" });
    await registerPeer("peer-contact", OWNER_CONTACT, "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----");
    const result = await call("peer-contact", {
      ...VALID_PAYLOAD,
      path: "friends.md",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("ok");
      expect(result.responsePayload.body).toBe("# Friends only");
    }
  });

  it("denies contacts-visibility file to a direct bond not in contactIds", async () => {
    await writeWebFile("exclusive.md", "# exclusive");
    await writeManifestEntry({
      path: "exclusive.md",
      contentHash: "any",
      byteLength: 11,
      title: "Exclusive",
      kind: "note",
      mimeType: "text/markdown",
      visibility: "contacts",
      contactIds: ["envoy:owner:someother"],
      updatedAt: "2026-07-20T00:00:00Z",
    });
    await trustStore.setTrustRecord({ peerOwnerId: OWNER_CONTACT, level: "direct", displayName: "Contact" });
    await registerPeer("peer-contact", OWNER_CONTACT, "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----");
    const result = await call("peer-contact", {
      ...VALID_PAYLOAD,
      path: "exclusive.md",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("forbidden");
    }
  });

  it("serves contacts-visibility file to a contact in contactIds", async () => {
    await writeWebFile("exclusive.md", "# exclusive");
    await writeManifestEntry({
      path: "exclusive.md",
      contentHash: "any",
      byteLength: 11,
      title: "Exclusive",
      kind: "note",
      mimeType: "text/markdown",
      visibility: "contacts",
      contactIds: [OWNER_CONTACT],
      updatedAt: "2026-07-20T00:00:00Z",
    });
    await trustStore.setTrustRecord({ peerOwnerId: OWNER_CONTACT, level: "direct", displayName: "Contact" });
    await registerPeer("peer-contact", OWNER_CONTACT, "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----");
    const result = await call("peer-contact", {
      ...VALID_PAYLOAD,
      path: "exclusive.md",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("ok");
    }
  });

  it("returns not_found for missing file", async () => {
    const result = await call("peer-stranger", {
      ...VALID_PAYLOAD,
      path: "nonexistent.md",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("not_found");
    }
  });

  it("returns not_found for path traversal attempt (no leakage)", async () => {
    await writeWebFile("hello.md", "# Hello");
    const result = await call("peer-stranger", {
      ...VALID_PAYLOAD,
      path: "../../../etc/passwd",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("not_found");
    }
  });

  it("serves file to owner via local self-read (private visibility ok)", async () => {
    await writeWebFile("private-notes.md", "# my private notes");
    await writeManifestEntry({
      path: "private-notes.md",
      contentHash: "any",
      byteLength: 19,
      title: "Private",
      kind: "note",
      mimeType: "text/markdown",
      visibility: "private",
      updatedAt: "2026-07-20T00:00:00Z",
    });
    const result = await call("peer-self", { ...VALID_PAYLOAD, path: "private-notes.md" }, { isLocalSelfRead: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("ok");
    }
  });

  it("includes contentHash and etag on successful reads", async () => {
    await writeWebFile("hello.md", "# Hello");
    await writeManifestEntry({
      path: "hello.md",
      contentHash: "any",
      byteLength: 8,
      title: "Hello",
      kind: "article",
      mimeType: "text/markdown",
      visibility: "public",
      updatedAt: "2026-07-20T00:00:00Z",
    });
    const result = await call("peer-stranger", VALID_PAYLOAD);
    expect(result.ok).toBe(true);
    if (result.ok && result.responsePayload.status === "ok") {
      expect(result.responsePayload.contentHash).toBeTruthy();
      expect(result.responsePayload.contentHash).toHaveLength(64); // sha256 hex
      expect(result.responsePayload.etag).toBeTruthy();
      expect(result.responsePayload.byteLength).toBe(7); // "# Hello" is 7 bytes
    }
  });

  it("returns too_large for files over the cap without a range", async () => {
    // Write a file larger than 48 KiB.
    const big = "x".repeat(50 * 1024);
    await writeWebFile("big.txt", big);
    await writeManifestEntry({
      path: "big.txt",
      contentHash: "any",
      byteLength: big.length,
      title: "Big",
      kind: "file",
      mimeType: "text/plain",
      visibility: "public",
      updatedAt: "2026-07-20T00:00:00Z",
    });
    const result = await call("peer-stranger", {
      ...VALID_PAYLOAD,
      path: "big.txt",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("too_large");
    }
  });

  it("honors range requests for large files", async () => {
    const big = "0123456789".repeat(10_000); // 100_000 bytes
    await writeWebFile("ranged.txt", big);
    await writeManifestEntry({
      path: "ranged.txt",
      contentHash: "any",
      byteLength: big.length,
      title: "Ranged",
      kind: "file",
      mimeType: "text/plain",
      visibility: "public",
      updatedAt: "2026-07-20T00:00:00Z",
    });
    const result = await call("peer-stranger", {
      ...VALID_PAYLOAD,
      path: "ranged.txt",
      range: { start: 10, end: 19 },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.responsePayload.status === "ok") {
      expect(result.responsePayload.body).toBe("0123456789");
      expect(result.responsePayload.range).toEqual({
        start: 10,
        end: 19,
        total: 100_000,
      });
    }
  });

  it("serves files with no manifest entry as private (default)", async () => {
    // No manifest entry — file defaults to private visibility.
    // Use a unique path so this test's filesystem state doesn't collide
    // with prior tests that wrote `hello.md` with a manifest entry.
    await writeWebFile("default-private.md", "# draft");
    // Stranger should NOT see it.
    const r1 = await call("peer-stranger", { ...VALID_PAYLOAD, path: "default-private.md" });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.responsePayload.status).toBe("not_found");
    // Owner via self-read SHOULD see it.
    const r2 = await call("peer-self", { ...VALID_PAYLOAD, path: "default-private.md" }, { isLocalSelfRead: true });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.responsePayload.status).toBe("ok");
  });

  it("emits audit events for served reads", async () => {
    await writeWebFile("hello.md", "# Hello");
    await writeManifestEntry({
      path: "hello.md",
      contentHash: "any",
      byteLength: 8,
      title: "Hello",
      kind: "article",
      mimeType: "text/markdown",
      visibility: "public",
      updatedAt: "2026-07-20T00:00:00Z",
    });
    await call("peer-stranger", VALID_PAYLOAD);
    const events = await taskStore.readAuditEvents({ limit: 100 });
    const types = events.map((e) => e.type);
    expect(types).toContain("message.verified");
    expect(types).toContain("library.read.served");
  });
});
