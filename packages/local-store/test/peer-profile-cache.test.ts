import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPeerProfileCacheStore, MAX_PEER_PROFILE_CACHE_RECORDS } from "../src/peer-profile-cache.js";

describe("peer-profile-cache", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = "";
  });

  it("preserves cached thumbnail when metadata sync omits inline bytes but sha unchanged", async () => {
    dir = await mkdtemp(join(tmpdir(), "envoy-peer-profile-"));
    const store = createPeerProfileCacheStore(dir);
    const profileV1 = {
      version: "0.1" as const,
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice",
      updatedAt: "2026-05-28T12:00:00.000Z",
      signature: "sig1",
      publicThumbnail: {
        vaultRelativePath: "profile/thumbnail.jpg",
        mimeType: "image/jpeg" as const,
        contentSha256: "abc123",
        sizeBytes: 100,
      },
    };
    await store.upsert(profileV1, {
      contentBase64: "aGVsbG8=",
      mimeType: "image/jpeg",
    });
    const profileV2 = { ...profileV1, displayName: "Alice B", updatedAt: "2026-05-28T13:00:00.000Z" };
    const row = await store.upsert(profileV2);
    expect(row.thumbnail?.contentBase64).toBe("aGVsbG8=");
    expect(row.profile.displayName).toBe("Alice B");
  });

  it("replaces thumbnail when inline bytes are provided for a new sha", async () => {
    dir = await mkdtemp(join(tmpdir(), "envoy-peer-profile-"));
    const store = createPeerProfileCacheStore(dir);
    const profileV1 = {
      version: "0.1" as const,
      ownerId: "envoy:owner:bob",
      displayName: "Bob",
      username: "bob",
      updatedAt: "2026-05-28T12:00:00.000Z",
      signature: "sig1",
      publicThumbnail: {
        vaultRelativePath: "profile/thumbnail.jpg",
        mimeType: "image/jpeg" as const,
        contentSha256: "old",
        sizeBytes: 100,
      },
    };
    await store.upsert(profileV1, { contentBase64: "b2xk", mimeType: "image/jpeg" });
    const profileV2 = {
      ...profileV1,
      updatedAt: "2026-05-28T13:00:00.000Z",
      publicThumbnail: {
        ...profileV1.publicThumbnail!,
        contentSha256: "new",
        sizeBytes: 120,
      },
    };
    const row = await store.upsert(profileV2, { contentBase64: "bmV3", mimeType: "image/jpeg" });
    expect(row.thumbnail?.contentBase64).toBe("bmV3");
  });

  it("evicts oldest records when cache exceeds MAX_PEER_PROFILE_CACHE_RECORDS", async () => {
    dir = await mkdtemp(join(tmpdir(), "envoy-peer-profile-cap-"));
    const store = createPeerProfileCacheStore(dir);
    for (let i = 0; i < MAX_PEER_PROFILE_CACHE_RECORDS + 5; i++) {
      await store.upsert({
        version: "0.1" as const,
        ownerId: `envoy:owner:peer-${i}`,
        displayName: `Peer ${i}`,
        username: `peer${i}`,
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
        signature: `sig-${i}`,
      });
    }
    const all = await store.list();
    expect(all.length).toBe(MAX_PEER_PROFILE_CACHE_RECORDS);
    expect(all.some((r) => r.ownerId === "envoy:owner:peer-0")).toBe(false);
    expect(all.some((r) => r.ownerId === `envoy:owner:peer-${MAX_PEER_PROFILE_CACHE_RECORDS + 4}`)).toBe(
      true,
    );
  });
});
