/**
 * @vitest-environment jsdom
 * E2E: mobile profile.sync inbound → peer cache (Say Hello / bond photo request path).
 */
import { describe, expect, it } from "vitest";
import { createProfileSyncPayload } from "@envoymesh/protocol";
import { generateOwnerIdentity, signHumanProfile } from "@envoymesh/mobile-identity";
import type { MobileContactOwnerKeyStore } from "../src/mobile-contact-owner-keys.js";
import { createMobilePeerProfileCache } from "../src/mobile-peer-profile-cache.js";
import { handleMobileInboundProfileSync } from "../src/mobile-profile-sync.js";

const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function sha256HexFromBase64(b64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("E2E mobile profile.sync inbound", () => {
  it("caches signed peer profile and inline thumbnail when owner key is known", async () => {
    const localOwner = generateOwnerIdentity();
    const peerOwner = generateOwnerIdentity();

    const cache = createMobilePeerProfileCache(localOwner.ownerId);
    const ownerKeys: MobileContactOwnerKeyStore = {
      get: async (ownerId) =>
        ownerId === peerOwner.ownerId ? { ownerPublicKeyPem: peerOwner.publicKeyPem } : undefined,
      set: async () => {},
    };

    const contentSha256 = await sha256HexFromBase64(MINIMAL_PNG_BASE64);

    const profile = signHumanProfile(
      {
        version: "0.1",
        ownerId: peerOwner.ownerId,
        displayName: "Peer",
        username: "peer01",
        profileVisibility: "private",
        updatedAt: "2026-05-28T12:00:00.000Z",
        publicThumbnail: {
          vaultRelativePath: "profile/thumbnail.png",
          mimeType: "image/png",
          contentSha256,
        },
      },
      peerOwner.privateKeyPem,
    );

    const payload = createProfileSyncPayload(profile, {
      contentBase64: MINIMAL_PNG_BASE64,
      mimeType: "image/png",
      contentSha256,
    });

    const result = await handleMobileInboundProfileSync({
      payload,
      ownerKeys,
      cache,
    });

    expect(result.ok, !result.ok ? result.reason : "").toBe(true);
    if (!result.ok) throw new Error(`expected ok: ${result.reason}`);
    expect(result.ownerId).toBe(peerOwner.ownerId);

    const row = await cache.get(peerOwner.ownerId);
    expect(row?.profile.displayName).toBe("Peer");
    expect(row?.thumbnail?.contentBase64).toBe(MINIMAL_PNG_BASE64);
  });

  it("rejects sync when owner public key is unknown", async () => {
    const localOwner = generateOwnerIdentity();
    const peerOwner = generateOwnerIdentity();
    const cache = createMobilePeerProfileCache(localOwner.ownerId);
    const ownerKeys: MobileContactOwnerKeyStore = {
      get: async () => undefined,
      set: async () => {},
    };

    const profile = signHumanProfile(
      {
        version: "0.1",
        ownerId: peerOwner.ownerId,
        displayName: "Stranger",
        username: "str01",
        profileVisibility: "private",
        updatedAt: "2026-05-28T12:00:00.000Z",
      },
      peerOwner.privateKeyPem,
    );

    const result = await handleMobileInboundProfileSync({
      payload: createProfileSyncPayload(profile),
      ownerKeys,
      cache,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toMatch(/unknown owner/i);
  });
});
