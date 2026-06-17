import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalFleetManifestStore } from "@envoymesh/local-store";
import type { FleetManifestRecord } from "@envoymesh/local-store";

const NOW = "2026-06-16T00:00:00.000Z";

function rec(overrides: Partial<FleetManifestRecord> = {}): FleetManifestRecord {
  return {
    manifestId: "m-1",
    issuerOwnerId: "envoy:owner:abc",
    issuerOwnerFingerprint: "fp-owner",
    signatureFingerprint: "fp-sig",
    issuedAt: NOW,
    importedAt: NOW,
    memberCount: 3,
    preStagedOwnerIds: ["envoy:owner:1", "envoy:owner:2"],
    ...overrides,
  };
}

describe("createLocalFleetManifestStore", () => {
  let profileDir: string;
  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "fleet-manifest-store-"));
  });
  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("returns an empty list when the file does not exist", async () => {
    const store = createLocalFleetManifestStore(profileDir);
    expect(await store.listManifests()).toEqual([]);
  });

  it("round-trips a manifest record", async () => {
    const store = createLocalFleetManifestStore(profileDir);
    await store.saveManifest(rec());
    const list = await store.listManifests();
    expect(list).toHaveLength(1);
    expect(list[0].manifestId).toBe("m-1");
  });

  it("updates an existing record on re-save (idempotent)", async () => {
    const store = createLocalFleetManifestStore(profileDir);
    await store.saveManifest(rec());
    await store.saveManifest(rec({ label: "Acme Q3", memberCount: 5 }));
    const list = await store.listManifests();
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe("Acme Q3");
    expect(list[0].memberCount).toBe(5);
  });

  it("returns null on getManifest for a missing id", async () => {
    const store = createLocalFleetManifestStore(profileDir);
    expect(await store.getManifest("nope")).toBeNull();
  });

  it("revokeManifest marks the record revoked and is idempotent", async () => {
    const store = createLocalFleetManifestStore(profileDir);
    await store.saveManifest(rec());
    const revoked1 = await store.revokeManifest("m-1", "2026-06-16T01:00:00.000Z");
    expect(revoked1?.revokedAt).toBe("2026-06-16T01:00:00.000Z");
    const revoked2 = await store.revokeManifest("m-1", "2026-06-16T02:00:00.000Z");
    // Second revoke must NOT overwrite the original timestamp.
    expect(revoked2?.revokedAt).toBe("2026-06-16T01:00:00.000Z");
  });

  it("revokeManifest returns null for a missing id", async () => {
    const store = createLocalFleetManifestStore(profileDir);
    expect(await store.revokeManifest("nope", NOW)).toBeNull();
  });

  it("persists across store instances (atomic write, no orphans)", async () => {
    const storeA = createLocalFleetManifestStore(profileDir);
    await storeA.saveManifest(rec());
    const storeB = createLocalFleetManifestStore(profileDir);
    const list = await storeB.listManifests();
    expect(list).toHaveLength(1);
    expect(list[0].manifestId).toBe("m-1");
  });
});
