import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionTokenStore,
  type SessionTokenRecord,
} from "../src/session-token-store.js";

describe("session token store", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "envoymesh-session-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const record = (overrides: Partial<SessionTokenRecord> = {}): SessionTokenRecord => ({
    token: overrides.token ?? "tok-001",
    ownerId: overrides.ownerId ?? "envoy:owner:alice",
    deviceId: overrides.deviceId ?? "envoy:device:alice-phone",
    displayName: overrides.displayName ?? "Companion",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    lastUsedAt: overrides.lastUsedAt ?? new Date().toISOString(),
    ...overrides,
  });

  it("returns empty list when no tokens saved", async () => {
    const store = createSessionTokenStore(dir);
    expect(await store.listTokens()).toEqual([]);
  });

  it("persists and retrieves a token by value", async () => {
    const store = createSessionTokenStore(dir);
    const rec = record();
    await store.setToken(rec);

    const found = await store.getTokenByValue("tok-001");
    expect(found).toBeDefined();
    expect(found!.token).toBe("tok-001");
    expect(found!.ownerId).toBe("envoy:owner:alice");
    expect(found!.deviceId).toBe("envoy:device:alice-phone");
  });

  it("persists boundFamilyProfileId for family invite pairs", async () => {
    const store = createSessionTokenStore(dir);
    await store.setToken(record({
      profileId: "mom",
      boundFamilyProfileId: "mom",
    }));
    const found = await store.getTokenByValue("tok-001");
    expect(found!.profileId).toBe("mom");
    expect(found!.boundFamilyProfileId).toBe("mom");
  });

  it("returns undefined for unknown token", async () => {
    const store = createSessionTokenStore(dir);
    await store.setToken(record());
    expect(await store.getTokenByValue("unknown")).toBeUndefined();
  });

  it("returns undefined for empty token", async () => {
    const store = createSessionTokenStore(dir);
    await store.setToken(record());
    expect(await store.getTokenByValue("")).toBeUndefined();
  });

  it("setToken can update lastUsedAt (touch)", async () => {
    const store = createSessionTokenStore(dir);
    const old = new Date("2024-01-01").toISOString();
    await store.setToken(record({ lastUsedAt: old }));

    // Simulate a touch: read the record and write it back with updated lastUsedAt
    const found = await store.getTokenByValue("tok-001");
    expect(found).toBeDefined();
    found!.lastUsedAt = new Date().toISOString();
    await store.setToken(found!);

    // Verify the update persisted
    const reloaded = await store.getTokenByValue("tok-001");
    expect(reloaded!.lastUsedAt! > old).toBe(true);
  });

  it("upserts by deviceId — replaces existing record for same device", async () => {
    const store = createSessionTokenStore(dir);
    await store.setToken(record());

    const updated = record({ token: "tok-002", displayName: "Tablet" });
    await store.setToken(updated);

    const tokens = await store.listTokens();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token).toBe("tok-002");
    expect(tokens[0].displayName).toBe("Tablet");
    // Old token should no longer be valid
    expect(await store.getTokenByValue("tok-001")).toBeUndefined();
    expect(await store.getTokenByValue("tok-002")).toBeDefined();
  });

  it("stores multiple tokens for different devices", async () => {
    const store = createSessionTokenStore(dir);
    await store.setToken(record({ ownerId: "envoy:owner:alice", deviceId: "envoy:device:alice-phone", token: "tok-a" }));
    await store.setToken(record({ ownerId: "envoy:owner:bob", deviceId: "envoy:device:bob-phone", token: "tok-b" }));

    const tokens = await store.listTokens();
    expect(tokens).toHaveLength(2);
    expect(await store.getTokenByValue("tok-a")).toBeDefined();
    expect(await store.getTokenByValue("tok-b")).toBeDefined();
  });

  it("removes all tokens for an owner", async () => {
    const store = createSessionTokenStore(dir);
    await store.setToken(record({ ownerId: "envoy:owner:alice", deviceId: "envoy:device:alice-phone", token: "tok-a" }));
    await store.setToken(record({ ownerId: "envoy:owner:bob", deviceId: "envoy:device:bob-phone", token: "tok-b" }));

    await store.removeTokensForOwner("envoy:owner:alice");

    const tokens = await store.listTokens();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].ownerId).toBe("envoy:owner:bob");
    expect(await store.getTokenByValue("tok-a")).toBeUndefined();
    expect(await store.getTokenByValue("tok-b")).toBeDefined();
  });

  it("removeTokenByDeviceId removes only the matching device session", async () => {
    const store = createSessionTokenStore(dir);
    await store.setToken(record({
      ownerId: "envoy:owner:alice",
      deviceId: "envoy:device:phone",
      token: "tok-phone",
    }));
    await store.setToken(record({
      ownerId: "envoy:owner:alice",
      deviceId: "envoy:device:tablet",
      token: "tok-tablet",
    }));

    await store.removeTokenByDeviceId("envoy:device:phone");

    expect(await store.getTokenByValue("tok-phone")).toBeUndefined();
    expect(await store.getTokenByValue("tok-tablet")).toBeDefined();
  });

  it("removeTokensForOwner is a no-op when owner has no tokens", async () => {
    const store = createSessionTokenStore(dir);
    await store.setToken(record());

    // Should not throw
    await store.removeTokensForOwner("envoy:owner:unknown");

    expect(await store.listTokens()).toHaveLength(1);
  });

  it("writes atomically (tmp file then rename)", async () => {
    const store = createSessionTokenStore(dir);
    await store.setToken(record());

    // Verify file at expected path is readable
    const filePath = join(dir, "session-tokens.json");
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe("0.1");
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].token).toBe("tok-001");

    // Verify no stale .tmp files left around
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(dir);
    const tmpFiles = files.filter((f) => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);
  });

  it("survives write-read round-trip (multiple stores)", async () => {
    const store1 = createSessionTokenStore(dir);
    await store1.setToken(record({ token: "survive-me" }));

    // A new store reading the same directory must find the token
    const store2 = createSessionTokenStore(dir);
    const found = await store2.getTokenByValue("survive-me");
    expect(found).toBeDefined();
    expect(found!.ownerId).toBe("envoy:owner:alice");
  });

  it("survives corrupted JSON file (recovers with empty state)", async () => {
    const filePath = join(dir, "session-tokens.json");

    // Write garbage JSON
    await writeFile(filePath, "this is not valid {{{ json", { mode: 0o600 });

    // A store that encounters corrupted JSON should start fresh
    const store = createSessionTokenStore(dir);
    const tokens = await store.listTokens();
    expect(tokens).toEqual([]);

    // Writing a new token should succeed (overwrites corrupted file)
    await store.setToken(record({ token: "recovery-test" }));
    const found = await store.getTokenByValue("recovery-test");
    expect(found).toBeDefined();
    expect(found!.token).toBe("recovery-test");
  });

  it("survives empty JSON file", async () => {
    const filePath = join(dir, "session-tokens.json");
    await writeFile(filePath, "", { mode: 0o600 });

    const store = createSessionTokenStore(dir);
    const tokens = await store.listTokens();
    expect(tokens).toEqual([]);

    // Write should still work
    await store.setToken(record({ token: "after-empty" }));
    expect(await store.getTokenByValue("after-empty")).toBeDefined();
  });

  it("serialises concurrent writes so no records are lost", async () => {
    const store = createSessionTokenStore(dir);

    // Fire many concurrent setToken calls
    const owners = Array.from({ length: 20 }, (_, i) => `envoy:owner:peer-${i}`);
    await Promise.all(
      owners.map((ownerId, i) =>
        store.setToken(record({ ownerId, deviceId: `envoy:device:peer-${i}`, token: `tok-${i}` })),
      ),
    );

    const tokens = await store.listTokens();
    expect(tokens).toHaveLength(20);

    // Every token should be findable
    for (let i = 0; i < 20; i++) {
      const found = await store.getTokenByValue(`tok-${i}`);
      expect(found).toBeDefined();
      expect(found!.ownerId).toBe(`envoy:owner:peer-${i}`);
    }
  });

  it("serialises concurrent setToken and removeTokensForOwner", async () => {
    const store = createSessionTokenStore(dir);

    // Seed some tokens
    await store.setToken(record({ ownerId: "envoy:owner:keep", deviceId: "envoy:device:keep", token: "keep-me" }));
    await store.setToken(record({ ownerId: "envoy:owner:remove", deviceId: "envoy:device:remove", token: "remove-me" }));

    // Concurrently: set a new token while removing another owner
    await Promise.all([
      store.setToken(record({ ownerId: "envoy:owner:new", deviceId: "envoy:device:new", token: "new-tok" })),
      store.removeTokensForOwner("envoy:owner:remove"),
    ]);

    const tokens = await store.listTokens();
    const ownerIds = tokens.map((t) => t.ownerId);
    expect(ownerIds).toContain("envoy:owner:keep");
    expect(ownerIds).toContain("envoy:owner:new");
    expect(ownerIds).not.toContain("envoy:owner:remove");
    expect(tokens).toHaveLength(2);
  });

  it("handles setToken with the same deviceId concurrently (last write wins)", async () => {
    const store = createSessionTokenStore(dir);

    await Promise.all([
      store.setToken(record({ ownerId: "envoy:owner:alice", deviceId: "envoy:device:alice-phone", token: "tok-a" })),
      store.setToken(record({ ownerId: "envoy:owner:alice", deviceId: "envoy:device:alice-phone", token: "tok-b" })),
      store.setToken(record({ ownerId: "envoy:owner:alice", deviceId: "envoy:device:alice-phone", token: "tok-c" })),
    ]);

    const tokens = await store.listTokens();
    // Only one record for alice — last writer wins
    expect(tokens).toHaveLength(1);
    expect(tokens[0].ownerId).toBe("envoy:owner:alice");
    // The token that survived should be one of a/b/c
    expect(["tok-a", "tok-b", "tok-c"]).toContain(tokens[0].token);
  });
});
