/**
 * Review / App Store demo pairing config.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OWNER_FAMILY_PROFILE_ID } from "@envoymesh/api";
import {
  createDeviceCertificate,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  isActiveReviewPairingToken,
  resetReviewPairingAnchorForTests,
  resolveReviewPairing,
  reviewFamilyInviteToken,
} from "../src/review-pairing.js";
import { generateFamilyInviteTokenViaRuntime } from "../src/node-service-family.js";
import { localOwnerCaller, runWithRpcCaller } from "../src/rpc-caller-context.js";
import { validatePairingTokenViaRuntime } from "../src/node-service-handlers-validate-pairing-token.js";
import {
  getPairingPayloadViaRuntime,
  type GetPairingPayloadContext,
} from "../src/node-service-handlers-pairing-payload.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { vi } from "vitest";

afterEach(() => {
  resetReviewPairingAnchorForTests();
});

describe("resolveReviewPairing", () => {
  it("is disabled by default", () => {
    expect(resolveReviewPairing(null, {})).toBeNull();
    expect(
      resolveReviewPairing({ reviewPairingEnabled: false }, {}),
    ).toBeNull();
  });

  it("enables from env with token + days", () => {
    const now = Date.parse("2026-07-30T00:00:00.000Z");
    const settings = resolveReviewPairing(
      null,
      {
        ENVOY_REVIEW_PAIRING: "1",
        ENVOY_REVIEW_PAIRING_TOKEN: "review-secret",
        ENVOY_REVIEW_PAIRING_DAYS: "10",
      },
      now,
    );
    expect(settings).toEqual({
      enabled: true,
      token: "review-secret",
      expiresAtMs: now + 10 * 24 * 60 * 60 * 1000,
      familyOnly: false,
    });
  });

  it("ENVOY_APPLE_REVIEW umbrella flag implies family-only + 30-day TTL", () => {
    const now = Date.parse("2026-07-30T00:00:00.000Z");
    const settings = resolveReviewPairing(
      null,
      {
        ENVOY_APPLE_REVIEW: "1",
        ENVOY_REVIEW_PAIRING_TOKEN: "apple-secret",
      },
      now,
    );
    expect(settings).toEqual({
      enabled: true,
      token: "apple-secret",
      expiresAtMs: now + 30 * 24 * 60 * 60 * 1000,
      familyOnly: true,
    });
  });

  it("reviewPairingFamilyOnly file flag forces family-only mode", () => {
    const now = Date.parse("2026-07-30T00:00:00.000Z");
    const settings = resolveReviewPairing(
      {
        reviewPairingEnabled: true,
        reviewPairingToken: "file-secret",
        reviewPairingFamilyOnly: true,
      },
      {},
      now,
    );
    expect(settings).toMatchObject({
      enabled: true,
      token: "file-secret",
      familyOnly: true,
    });
    expect(settings?.expiresAtMs).toBe(now + 30 * 24 * 60 * 60 * 1000);
  });

  it("family-only respects an explicit TTL override", () => {
    const now = Date.parse("2026-07-30T00:00:00.000Z");
    const settings = resolveReviewPairing(
      null,
      {
        ENVOY_APPLE_REVIEW: "1",
        ENVOY_REVIEW_PAIRING_TOKEN: "apple-secret",
        ENVOY_REVIEW_PAIRING_DAYS: "7",
      },
      now,
    );
    expect(settings?.expiresAtMs).toBe(now + 7 * 24 * 60 * 60 * 1000);
    expect(settings?.familyOnly).toBe(true);
  });

  it("env wins over file when both set", () => {
    const settings = resolveReviewPairing(
      {
        reviewPairingEnabled: true,
        reviewPairingToken: "file-token",
        reviewPairingTtlDays: 3,
      },
      {
        ENVOY_REVIEW_PAIRING: "true",
        ENVOY_REVIEW_PAIRING_TOKEN: "env-token",
        ENVOY_REVIEW_PAIRING_DAYS: "7",
      },
      Date.parse("2026-07-30T00:00:00.000Z"),
    );
    expect(settings?.token).toBe("env-token");
  });

  it("returns null when enabled but token missing", () => {
    expect(
      resolveReviewPairing(null, { ENVOY_REVIEW_PAIRING: "1" }),
    ).toBeNull();
  });
});

describe("isActiveReviewPairingToken", () => {
  it("matches owner and derived family review tokens before expiry", () => {
    const settings = {
      enabled: true,
      token: "review-secret",
      expiresAtMs: Date.now() + 60_000,
      familyOnly: false,
    };
    expect(isActiveReviewPairingToken(settings, "review-secret")).toBe(true);
    expect(
      isActiveReviewPairingToken(settings, reviewFamilyInviteToken("review-secret")),
    ).toBe(true);
    expect(isActiveReviewPairingToken(settings, "other")).toBe(false);
    expect(isActiveReviewPairingToken(null, "review-secret")).toBe(false);
  });
});

describe("generateFamilyInviteTokenViaRuntime + review pairing", () => {
  it("uses derived family token and remaining review TTL instead of 72h", async () => {
    const expiresAtMs = Date.now() + 10 * 24 * 60 * 60 * 1000;
    const expectedTok = reviewFamilyInviteToken("stable-review-tok");
    const created = await runWithRpcCaller(
      localOwnerCaller("envoy:owner:review"),
      () =>
        generateFamilyInviteTokenViaRuntime(
          {
            getReviewPairing: () => ({
              enabled: true,
              token: "stable-review-tok",
              expiresAtMs,
              familyOnly: false,
            }),
            createInvite: async (params) => {
              expect(params.fixedToken).toBe(expectedTok);
              expect(params.clearUsed).toBe(true);
              expect(params.expiresInHours).toBeGreaterThanOrEqual(10 * 24 - 1);
              expect(params.kind).toBe("family");
              return {
                invite: {
                  token: params.fixedToken!,
                  expiresAt: new Date(expiresAtMs).toISOString(),
                },
                uri: `envoy://invite?token=${params.fixedToken}`,
              };
            },
          },
          { expiresInHours: 72, note: "ignored when review on" },
        ),
    );
    expect(created.token).toBe(expectedTok);
    expect(created.uri).toContain(expectedTok);
  });
});

describe("validatePairingToken + getPairingPayload review mode", () => {
  it("accepts the stable review token within TTL", async () => {
    const review = {
      enabled: true,
      token: "stable-review-tok",
      expiresAtMs: Date.now() + 60_000,
      familyOnly: false,
    };
    const ok = await validatePairingTokenViaRuntime(
      {
        getReviewPairing: () => review,
        getInMemoryToken: () => undefined,
        getInMemoryTokenIssuedAt: () => undefined,
        getInMemoryTokenTtlMs: () => 30 * 60 * 1000,
        getSessionTokenStore: () => undefined,
        getTaskStore: () => undefined,
      },
      "stable-review-tok",
    );
    expect(ok).toBe(true);
  });

  it("rejects expired review token", async () => {
    const ok = await validatePairingTokenViaRuntime(
      {
        getReviewPairing: () => ({
          enabled: true,
          token: "stable-review-tok",
          expiresAtMs: Date.now() - 1,
          familyOnly: false,
        }),
        getInMemoryToken: () => undefined,
        getInMemoryTokenIssuedAt: () => undefined,
        getInMemoryTokenTtlMs: () => 30 * 60 * 1000,
        getSessionTokenStore: () => undefined,
        getTaskStore: () => undefined,
      },
      "stable-review-tok",
    );
    expect(ok).toBe(false);
  });

  it("accepts derived family.<tok> under the same review TTL", async () => {
    const review = {
      enabled: true,
      token: "stable-review-tok",
      expiresAtMs: Date.now() + 60_000,
      familyOnly: false,
    };
    const ok = await validatePairingTokenViaRuntime(
      {
        getReviewPairing: () => review,
        getInMemoryToken: () => undefined,
        getInMemoryTokenIssuedAt: () => undefined,
        getInMemoryTokenTtlMs: () => 30 * 60 * 1000,
        getSessionTokenStore: () => undefined,
        getTaskStore: () => undefined,
      },
      reviewFamilyInviteToken("stable-review-tok"),
    );
    expect(ok).toBe(true);
  });

  it("embeds the same review token across getPairingPayload calls", async () => {
    const setPairingToken = vi.fn();
    const ctx = {
      getBridgeStatus: async () => ({ enabled: false }),
      getReachableMesh: () => undefined,
      getWsPort: () => 3030,
      getWsPath: () => "/ws",
      getRelayPublicWsUrl: () => "",
      getRelayBootstrapPeers: () => [],
      getConfiguredRelays: async () => [],
      getReviewPairing: () => ({
        enabled: true,
        token: "stable-review-tok",
        expiresAtMs: Date.now() + 86400000,
        familyOnly: false,
      }),
      getProfile: () => ({
        owner: { ownerId: "envoy:owner:review", publicKeyPem: "PK" },
      }),
      deriveRelayWsUrl: () => undefined,
      autoDiscoverRelayWsUrl: async () => undefined,
      autoDiscoverRelayPeerId: async () => undefined,
      setPairingToken,
    } as unknown as GetPairingPayloadContext;

    const a = await getPairingPayloadViaRuntime(ctx);
    const b = await getPairingPayloadViaRuntime(ctx);
    expect(a.token).toBe("stable-review-tok");
    expect(b.token).toBe("stable-review-tok");
    expect(setPairingToken).toHaveBeenCalled();
  });

  it("family-only review mode embeds the derived family token (Apple review)", async () => {
    const setPairingToken = vi.fn();
    const ctx = {
      getBridgeStatus: async () => ({ enabled: false }),
      getReachableMesh: () => undefined,
      getWsPort: () => 3030,
      getWsPath: () => "/ws",
      getRelayPublicWsUrl: () => "",
      getRelayBootstrapPeers: () => [],
      getConfiguredRelays: async () => [],
      getReviewPairing: () => ({
        enabled: true,
        token: "apple-secret",
        expiresAtMs: Date.now() + 30 * 86400000,
        familyOnly: true,
      }),
      getProfile: () => ({
        owner: { ownerId: "envoy:owner:review", publicKeyPem: "PK" },
      }),
      deriveRelayWsUrl: () => undefined,
      autoDiscoverRelayWsUrl: async () => undefined,
      autoDiscoverRelayPeerId: async () => undefined,
      setPairingToken,
    } as unknown as GetPairingPayloadContext;

    const payload = await getPairingPayloadViaRuntime(ctx);
    // The "owner" QR is really a family-member QR in Apple review mode.
    expect(payload.token).toBe(reviewFamilyInviteToken("apple-secret"));
    expect(setPairingToken).toHaveBeenCalledWith(
      reviewFamilyInviteToken("apple-secret"),
      expect.any(Number),
    );
  });
});

// ---------------------------------------------------------------------------
// Family-only review node (Apple) — full pairThinClient integration.
// The core guarantee: a reviewer scanning ANY QR on a family-only review
// build lands as a family member, never the owner, and the legacy owner-key
// handover RPCs (pairSharedIdentity / pairDevice) refuse review tokens.
// ---------------------------------------------------------------------------

function reviewTestProfile(ownerIdHint = "reviewer"): NodeProfile {
  const owner = generateOwnerIdentity();
  void ownerIdHint;
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "message.send", "task.execute"],
    }),
  };
}

function reviewMockMesh(): EnvoyMesh {
  return {
    peerId: "12D3KooWReviewHome",
    multiaddrs: ["/ip4/127.0.0.1/tcp/4001"],
    getPeerConnectionInfo: () => ({ connected: false, direct: false }),
  } as unknown as EnvoyMesh;
}

const REVIEW_SECRET = "apple-review-secret";

async function writeFamilyOnlyReviewConfig(profileDir: string): Promise<void> {
  await writeFile(
    join(profileDir, "node-config.json"),
    JSON.stringify(
      {
        version: "0.1",
        profileDir: "./data/default",
        discoveryProfile: "wan-default",
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "mock" },
        chatAssistEnabled: false,
        reviewPairingEnabled: true,
        reviewPairingToken: REVIEW_SECRET,
        reviewPairingFamilyOnly: true,
        reviewPairingTtlDays: 30,
      },
      null,
      2,
    ),
  );
}

describe("family-only review node — pairThinClient integration", () => {
  let profileDir: string;
  let svc: NodeServiceImpl;
  let ownerProfile: NodeProfile;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-review-e2e-"));
    ownerProfile = reviewTestProfile();
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    svc = new NodeServiceImpl(
      reviewMockMesh(),
      trustStore,
      peerDirectory,
      human,
      profileDir,
      ownerProfile,
    );
    svc.bindCliTaskStore(createLocalTaskStore(profileDir));
    svc.setWsListenAddress(3030, "/ws");
    await writeFamilyOnlyReviewConfig(profileDir);
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("scanner of the owner-form review token binds a family member, never the owner", async () => {
    const result = await svc.pairThinClient({
      pairingToken: REVIEW_SECRET,
      deviceName: "Apple Reviewer iPhone",
      platform: "flutter",
    });
    expect(result.isOwnerProfile).toBe(false);
    expect(result.profileId).not.toBe(OWNER_FAMILY_PROFILE_ID);
    expect(result.ownerId).toBe(ownerProfile.owner.ownerId);

    const record = await svc.lookupSessionToken(result.sessionToken);
    expect(record?.boundFamilyProfileId).toBe(result.profileId);
  });

  it("the derived family token (family invite QR) also binds a family member", async () => {
    const familyTok = reviewFamilyInviteToken(REVIEW_SECRET);
    const result = await svc.pairThinClient({
      pairingToken: familyTok,
      deviceName: "Reviewer Android",
      platform: "flutter",
    });
    expect(result.isOwnerProfile).toBe(false);
    expect(result.profileId).not.toBe(OWNER_FAMILY_PROFILE_ID);
  });

  it("review token stays multi-device reusable (Apple + Google reviewers)", async () => {
    const a = await svc.pairThinClient({
      pairingToken: REVIEW_SECRET,
      deviceName: "Phone A",
    });
    const b = await svc.pairThinClient({
      pairingToken: REVIEW_SECRET,
      deviceName: "Phone B",
    });
    expect(a.isOwnerProfile).toBe(false);
    expect(b.isOwnerProfile).toBe(false);
    // Each reviewer lands as their own family profile.
    expect(a.profileId).not.toBe(b.profileId);
  });

  it("pairSharedIdentity refuses the review token (owner-key handover must be impossible)", async () => {
    await expect(
      svc.pairSharedIdentity({
        requesterOwnerId: ownerProfile.owner.ownerId,
        requesterDeviceId: "reviewer-device",
        requesterDevicePublicKeyPem: "PUBKEY",
        keyExchangePublicKey: "KEYEXCHANGE",
        pairingToken: REVIEW_SECRET,
      } as never),
    ).rejects.toThrow(/review pairing tokens|Store-review/i);
  });

  it("pairDevice refuses the review token (companion binding must be impossible)", async () => {
    await expect(
      svc.pairDevice({
        requesterOwnerId: "attacker-owner",
        requesterDeviceId: "attacker-device",
        requesterDevicePublicKeyPem: "PUBKEY",
        pairingToken: REVIEW_SECRET,
      } as never),
    ).rejects.toThrow(/review pairing tokens|Store-review/i);
  });

  it("a bogus token is still rejected by pairThinClient", async () => {
    await expect(
      svc.pairThinClient({ pairingToken: "not-a-review-token", deviceName: "x" }),
    ).rejects.toThrow(/Invalid or expired pairing token/);
  });
});

// Apple-review package regression: the bundled review config must override a
// STALE profile-dir config. Repro of the reported bug — machine had run a
// normal EnvoyMesh build before, so `<profileDir>/node-config.json` existed
// WITHOUT review fields; the bundled family-only config was only consulted on
// ENOENT, review mode never activated, and the EnvoyGo QR bound the scanner
// as OWNER. Fix: node-config-store overlays bundled review fields on load.
describe("family-only review node — stale profile config regression", () => {
  let profileDir: string;
  let bundleDir: string;
  let svc: NodeServiceImpl;
  let ownerProfile: NodeProfile;
  const originalBundleDir = process.env.ENVOYMESH_NODE_BUNDLE_DIR;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-review-stale-"));
    bundleDir = await mkdtemp(join(tmpdir(), "envoy-review-bundle-"));
    ownerProfile = reviewTestProfile();
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    svc = new NodeServiceImpl(
      reviewMockMesh(),
      trustStore,
      peerDirectory,
      human,
      profileDir,
      ownerProfile,
    );
    svc.bindCliTaskStore(createLocalTaskStore(profileDir));
    svc.setWsListenAddress(3030, "/ws");

    // Stale profile-dir config from an earlier normal build — no review fields.
    await writeFile(
      join(profileDir, "node-config.json"),
      JSON.stringify(
        {
          version: "0.1",
          profileDir: "./data/default",
          discoveryProfile: "wan-default",
          relayEnabled: true,
          relayServerEnabled: false,
          advertiseAddrs: [],
          bootstrapPeers: [],
          bootstrapPresets: [],
          configuredRelays: [],
          modelProviders: { mode: "mock" },
          chatAssistEnabled: false,
        },
        null,
        2,
      ),
      "utf8",
    );
    // Bundled family-only review config (APPLE_REVIEW=1 staging).
    await writeFile(
      join(bundleDir, "node-config.json"),
      JSON.stringify(
        {
          version: "0.1",
          profileDir: "./data/default",
          discoveryProfile: "wan-default",
          relayEnabled: true,
          relayServerEnabled: false,
          advertiseAddrs: [],
          bootstrapPeers: [],
          bootstrapPresets: [],
          configuredRelays: [],
          modelProviders: { mode: "mock" },
          chatAssistEnabled: false,
          reviewPairingEnabled: true,
          reviewPairingToken: REVIEW_SECRET,
          reviewPairingFamilyOnly: true,
          reviewPairingTtlDays: 30,
        },
        null,
        2,
      ),
      "utf8",
    );
    process.env.ENVOYMESH_NODE_BUNDLE_DIR = bundleDir;
  });

  afterEach(async () => {
    if (originalBundleDir === undefined) {
      delete process.env.ENVOYMESH_NODE_BUNDLE_DIR;
    } else {
      process.env.ENVOYMESH_NODE_BUNDLE_DIR = originalBundleDir;
    }
    await rm(profileDir, { recursive: true, force: true });
    await rm(bundleDir, { recursive: true, force: true });
  });

  it("QR embeds the family token despite a stale profile config, and scanning binds a family member", async () => {
    const payload = await svc.getPairingPayload();
    // Before the fix this was a fresh random UUID (owner pairing).
    expect(payload.token).toBe(reviewFamilyInviteToken(REVIEW_SECRET));

    const result = await svc.pairThinClient({
      pairingToken: payload.token,
      deviceName: "Apple Reviewer iPhone",
      platform: "flutter",
    });
    expect(result.isOwnerProfile).toBe(false);
    expect(result.profileId).not.toBe(OWNER_FAMILY_PROFILE_ID);

    const record = await svc.lookupSessionToken(result.sessionToken);
    expect(record?.boundFamilyProfileId).toBe(result.profileId);
  });

  it("owner-form review token also binds a family member under the stale-profile overlay", async () => {
    const result = await svc.pairThinClient({
      pairingToken: REVIEW_SECRET,
      deviceName: "Apple Reviewer iPhone",
      platform: "flutter",
    });
    expect(result.isOwnerProfile).toBe(false);
    expect(result.profileId).not.toBe(OWNER_FAMILY_PROFILE_ID);
  });
});
