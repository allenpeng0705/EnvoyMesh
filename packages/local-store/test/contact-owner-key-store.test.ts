import { mkdtemp, rm } from "node:fs/promises";
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
});
