import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalTrustStore, parseTrustLevel } from "@envoymesh/local-store";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-trust-store-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("trust store", () => {
  it("returns an empty trust list when no file exists", async () => {
    await expect(createLocalTrustStore(profileDir).listTrustRecords()).resolves.toEqual([]);
  });

  it("sets, updates, reads, and removes trust records", async () => {
    const store = createLocalTrustStore(profileDir);
    const direct = await store.setTrustRecord({
      peerOwnerId: "envoy:owner:alice",
      level: "direct",
      displayName: "Alice",
      note: "Met through local test.",
      now: "2026-04-27T10:00:00.000Z",
    });
    const blocked = await store.setTrustRecord({
      peerOwnerId: "envoy:owner:bob",
      level: "blocked",
      now: "2026-04-27T10:01:00.000Z",
    });

    expect(await store.listTrustRecords()).toEqual([direct, blocked]);

    const updated = await store.setTrustRecord({
      peerOwnerId: "envoy:owner:alice",
      level: "referred",
      now: "2026-04-27T10:02:00.000Z",
    });

    expect(updated).toMatchObject({
      peerOwnerId: "envoy:owner:alice",
      level: "referred",
      displayName: "Alice",
      updatedAt: "2026-04-27T10:02:00.000Z",
    });

    await expect(store.getTrustRecord("envoy:owner:alice")).resolves.toMatchObject({
      level: "referred",
    });
    await expect(store.removeTrustRecord("envoy:owner:bob")).resolves.toEqual(blocked);
    await expect(store.listTrustRecords()).resolves.toHaveLength(1);
  });

  it("rejects invalid trust levels", () => {
    expect(() => parseTrustLevel("self")).toThrow("Invalid trust level");
  });
});
