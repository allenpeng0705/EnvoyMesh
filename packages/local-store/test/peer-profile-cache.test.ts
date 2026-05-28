import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPeerProfileCacheStore } from "../src/peer-profile-cache.js";

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
});
