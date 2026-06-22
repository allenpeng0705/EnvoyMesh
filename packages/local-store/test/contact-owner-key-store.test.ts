import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createContactOwnerKeyStore } from "../src/contact-owner-key-store.js";

describe("contact-owner-key-store", () => {
  let profileDir: string;

  afterEach(async () => {
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("upserts and reads owner public keys by peer owner id", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-contact-keys-"));
    const store = createContactOwnerKeyStore(profileDir);
    const pem = "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----";

    await store.upsert("envoy:owner:abc", pem);
    const row = await store.get("envoy:owner:abc");

    expect(row?.ownerPublicKeyPem).toBe(pem);
  });

  it("recovers from empty or corrupted JSON without throwing", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-contact-keys-"));
    const path = join(profileDir, "contact-owner-keys.json");
    await writeFile(path, "", "utf8");

    const store = createContactOwnerKeyStore(profileDir);
    await expect(store.list()).resolves.toEqual([]);

    await writeFile(path, "{ not valid json", "utf8");
    await expect(store.get("envoy:owner:abc")).resolves.toBeUndefined();

    const pem = "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----";
    await store.upsert("envoy:owner:abc", pem);
    await expect(store.get("envoy:owner:abc")).resolves.toMatchObject({
      ownerId: "envoy:owner:abc",
      ownerPublicKeyPem: pem,
    });
  });
});
