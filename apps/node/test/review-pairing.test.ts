/**
 * Review / App Store demo pairing config.
 */
import { afterEach, describe, expect, it } from "vitest";
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
    });
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
});
