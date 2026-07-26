import { createLocalTaskStore, createLocalTrustStore, createLocalPeerDirectoryStore } from "@envoymesh/local-store";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundLibraryRead } from "../src/library-read-inbound.js";
import { createWebContentStore, type WebContentEntry, type WebContentVisibility } from "../src/web-content-store.js";
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

async function writeManifestEntry(entry: WebContentEntry): Promise<void> {
  const store = createWebContentStore(join(profileDir, "web"));
  await store.upsert(entry);
}

async function writePublishedFile(
  relPath: string,
  content: string,
  visibility: WebContentVisibility = "public",
  contactIds?: string[],
): Promise<void> {
  await writeWebFile(relPath, content);
  await writeManifestEntry({
    path: relPath,
    contentHash: "any",
    byteLength: Buffer.byteLength(content, "utf8"),
    title: relPath,
    kind: "article",
    mimeType: "text/markdown",
    visibility,
    contactIds,
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
  peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
}

async function call(
  senderPeerId: string,
  payload: unknown,
  opts: { isLocalSelfRead?: boolean; remotePeerId?: string } = {},
) {
  return handleInboundLibraryRead({
    envelope: libraryReadEnvelope(senderPeerId, payload),
    remotePeerId: opts.remotePeerId ?? `remote-${senderPeerId}-${Math.random().toString(36).slice(2, 8)}`,
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

function req(path: string) {
  return {
    requesterOwnerId: OWNER_CONTACT,
    targetOwnerId: OWNER_SELF,
    path,
  };
}

describe("handleInboundLibraryRead", () => {
  it("returns not_found for empty path when index.html and index.md are missing", async () => {
    const result = await call("peer-stranger", req(""));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("not_found");
    }
  });

  it("serves public-visibility file to a stranger (public bond)", async () => {
    const content = "# Hello";
    await writePublishedFile("public.md", content, "public");
    const result = await call("peer-stranger", req("public.md"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("ok");
      expect(result.responsePayload.body).toBe(content);
      expect(result.responsePayload.contentType).toBe("text/markdown");
      expect(result.responsePayload.byteLength).toBe(Buffer.byteLength(content, "utf8"));
    }
  });

  it("denies bonded-visibility file to a stranger (returns not_found)", async () => {
    await writePublishedFile("private-bonded.md", "secret", "bonded");
    const result = await call("peer-stranger", req("private-bonded.md"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("not_found");
    }
  });

  it("serves bonded-visibility file to a direct bond", async () => {
    const content = "# Friends only";
    await writePublishedFile("for-friends.md", content, "bonded");
    await trustStore.setTrustRecord({ peerOwnerId: OWNER_CONTACT, level: "direct", displayName: "Contact" });
    await registerPeer("peer-contact", OWNER_CONTACT, "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----");
    const result = await call("peer-contact", req("for-friends.md"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("ok");
      expect(result.responsePayload.body).toBe(content);
    }
  });

  it("denies contacts-visibility file to a direct bond not in contactIds", async () => {
    await writePublishedFile("contacts.md", "# exclusive", "contacts", ["envoy:owner:someother"]);
    await trustStore.setTrustRecord({ peerOwnerId: OWNER_CONTACT, level: "direct", displayName: "Contact" });
    await registerPeer("peer-contact", OWNER_CONTACT, "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----");
    const result = await call("peer-contact", req("contacts.md"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("forbidden");
    }
  });

  it("denies contacts-visibility with missing contactIds (deny-by-default)", async () => {
    await writePublishedFile("contacts-open.md", "# exclusive", "contacts");
    await trustStore.setTrustRecord({ peerOwnerId: OWNER_CONTACT, level: "direct", displayName: "Contact" });
    await registerPeer("peer-contact", OWNER_CONTACT, "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----");
    const result = await call("peer-contact", req("contacts-open.md"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("forbidden");
    }
  });

  it("serves contacts-visibility file to a contact in contactIds", async () => {
    await writePublishedFile("contacts2.md", "# exclusive", "contacts", [OWNER_CONTACT]);
    await trustStore.setTrustRecord({ peerOwnerId: OWNER_CONTACT, level: "direct", displayName: "Contact" });
    await registerPeer("peer-contact", OWNER_CONTACT, "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----");
    const result = await call("peer-contact", req("contacts2.md"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("ok");
    }
  });

  it("returns not_found for missing file", async () => {
    const result = await call("peer-stranger", req("does-not-exist.md"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("not_found");
    }
  });

  it("returns not_found for path traversal attempt (no leakage)", async () => {
    await writeWebFile("hello.md", "# Hello");
    const result = await call("peer-stranger", req("../../../etc/passwd"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("not_found");
    }
  });

  it("serves file to owner via local self-read (private visibility ok)", async () => {
    await writePublishedFile("owner-private.md", "# my private notes", "private");
    const result = await call("peer-self", req("owner-private.md"), { isLocalSelfRead: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("ok");
    }
  });

  it("includes contentHash and etag on successful reads", async () => {
    const content = "# Hello";
    await writePublishedFile("etag.md", content, "public");
    const result = await call("peer-stranger", req("etag.md"));
    expect(result.ok).toBe(true);
    if (result.ok && result.responsePayload.status === "ok") {
      expect(result.responsePayload.contentHash).toBeTruthy();
      expect(result.responsePayload.contentHash).toHaveLength(64);
      expect(result.responsePayload.etag).toBeTruthy();
      expect(result.responsePayload.byteLength).toBe(Buffer.byteLength(content, "utf8"));
    }
  });

  it("returns too_large for files over the cap without a range", async () => {
    // Write a file larger than 48 KiB.
    const big = "x".repeat(50 * 1024);
    await writePublishedFile("big.txt", big, "public");
    const result = await call("peer-stranger", req("big.txt"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("too_large");
    }
  });

  it("honors range requests for large files", async () => {
    const big = "0123456789".repeat(10_000); // 100_000 bytes
    await writePublishedFile("ranged.txt", big, "public");
    const result = await call("peer-stranger", {
      ...req("ranged.txt"),
      range: { start: 10, end: 19 },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.responsePayload.status === "ok") {
      // Range slices are always base64 (avoids mid-UTF-8 splits).
      expect(result.responsePayload.body).toBe(Buffer.from("0123456789").toString("base64"));
      expect(result.responsePayload.range).toEqual({
        start: 10,
        end: 19,
        total: 100_000,
      });
    }
  });

  it("rejects oversized range requests (DoS guard)", async () => {
    const big = "x".repeat(100 * 1024);
    await writePublishedFile("huge.txt", big, "public");
    const result = await call("peer-stranger", {
      ...req("huge.txt"),
      range: { start: 0, end: 90 * 1024 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("too_large");
      expect(result.responsePayload.byteLength).toBe(big.length);
    }
  });

  it("returns empty body for past-EOF range (no phantom byte)", async () => {
    await writePublishedFile("small.txt", "hi", "public");
    const result = await call("peer-stranger", {
      ...req("small.txt"),
      range: { start: 10, end: 20 },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.responsePayload.status === "ok") {
      expect(result.responsePayload.body).toBe("");
      expect(result.responsePayload.byteLength).toBe(0);
    }
  });

  it("serves files with no manifest entry as private (default)", async () => {
    // No manifest entry — file defaults to private visibility.
    await writeWebFile("default-private.md", "# draft");
    // Stranger should NOT see it.
    const r1 = await call("peer-stranger", req("default-private.md"));
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.responsePayload.status).toBe("not_found");
    // Owner via self-read SHOULD see it.
    const r2 = await call("peer-self", req("default-private.md"), { isLocalSelfRead: true });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.responsePayload.status).toBe("ok");
  });

  it("emits audit events for served reads", async () => {
    await writePublishedFile("audit.md", "# Hello", "public");
    await call("peer-stranger", req("audit.md"));
    const events = await taskStore.readAuditEvents({ limit: 100 });
    const types = events.map((e) => e.type);
    expect(types).toContain("message.verified");
    expect(types).toContain("library.read.served");
  });

  it("serves bonded-visibility file to a referred bond", async () => {
    const content = "# Referred friends";
    await writePublishedFile("referred.md", content, "bonded");
    await trustStore.setTrustRecord({
      peerOwnerId: OWNER_CONTACT,
      level: "referred",
      displayName: "Referred Contact",
    });
    await registerPeer(
      "peer-referred",
      OWNER_CONTACT,
      "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
    );
    const result = await call("peer-referred", req("referred.md"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("ok");
      expect(result.responsePayload.body).toBe(content);
    }
  });

  it("denies blocked peer for any visibility (not_found, no leakage)", async () => {
    await writePublishedFile("public-blocked.md", "# Hello", "public");
    await trustStore.setTrustRecord({
      peerOwnerId: OWNER_CONTACT,
      level: "blocked",
      displayName: "Blocked",
    });
    await registerPeer(
      "peer-blocked",
      OWNER_CONTACT,
      "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
    );
    const result = await call("peer-blocked", req("public-blocked.md"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("not_found");
    }
  });

  it("denies blocked peer on contacts-visibility with not_found (no ACL leakage)", async () => {
    // Regression: policy deny must not return forbidden for contacts visibility —
    // that would leak that the path exists and is ACL-gated to a blocked peer.
    await writePublishedFile("contacts-blocked.md", "# exclusive", "contacts", [OWNER_CONTACT]);
    await trustStore.setTrustRecord({
      peerOwnerId: OWNER_CONTACT,
      level: "blocked",
      displayName: "Blocked",
    });
    await registerPeer(
      "peer-blocked-contacts",
      OWNER_CONTACT,
      "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
    );
    const result = await call("peer-blocked-contacts", req("contacts-blocked.md"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("not_found");
    }
  });

  it("rate-limits the 6th public-tier request in a minute", async () => {
    await writePublishedFile("rate.md", "# Hello", "public");
    const peer = "peer-rate-limit";
    for (let i = 0; i < 5; i++) {
      const r = await call(peer, req("rate.md"), { remotePeerId: peer });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.responsePayload.status).toBe("ok");
    }
    const limited = await call(peer, req("rate.md"), { remotePeerId: peer });
    expect(limited.ok).toBe(false);
    if (!limited.ok) {
      expect(limited.reason).toMatch(/rate limited/i);
    }
  });

  it("returns not_modified when ifNoneMatch matches current etag", async () => {
    const content = "# Cached page";
    await writePublishedFile("etag.md", content, "public");
    const first = await call("peer-stranger", req("etag.md"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.responsePayload.status).toBe("ok");
    const etag = first.responsePayload.etag;
    expect(etag).toBeTruthy();

    const second = await call("peer-stranger", {
      ...req("etag.md"),
      ifNoneMatch: etag,
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.responsePayload.status).toBe("not_modified");
      expect(second.responsePayload.body).toBeUndefined();
      expect(second.responsePayload.etag).toBe(etag);
    }
  });

  it("too_large includes byteLength so clients can range-fetch", async () => {
    const big = "x".repeat(60 * 1024);
    await writePublishedFile("big.md", big, "public");
    const result = await call("peer-stranger", req("big.md"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("too_large");
      expect(result.responsePayload.byteLength).toBe(big.length);
      expect(result.responsePayload.etag).toBeTruthy();
      expect(result.responsePayload.contentHash).toBeTruthy();
    }
  });

  it("resolves empty path to index.md when only markdown exists", async () => {
    const content = "# Site root";
    await writePublishedFile("index.md", content, "public");
    const result = await call("peer-stranger", req(""));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("ok");
      expect(result.responsePayload.body).toBe(content);
    }
  });

  it("prefers index.html over index.md for empty path", async () => {
    await writePublishedFile("index.md", "# Markdown root", "public");
    const html = "<!DOCTYPE html><html><body class=\"em-profile-portal\">HTML root</body></html>";
    await writePublishedFile("index.html", html, "public");
    const result = await call("peer-stranger", req(""));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.status).toBe("ok");
      expect(result.responsePayload.body).toBe(html);
      expect(result.responsePayload.contentType).toMatch(/html/);
    }
  });

  it("emits deny audit for stranger on bonded content", async () => {
    await writePublishedFile("deny-audit.md", "secret", "bonded");
    await call("peer-stranger", req("deny-audit.md"));
    const events = await taskStore.readAuditEvents({ limit: 100 });
    const deny = events.find(
      (e) => e.type === "policy.decided" && e.outcome === "deny" && e.intent === "library.read",
    );
    expect(deny).toBeTruthy();
  });
});
