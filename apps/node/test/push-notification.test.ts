/**
 * Phase 31I push dispatch tests, post-CallKit-removal.
 *
 * Verifies:
 *  - `registerPushToken` defaults `tokenType` to "alert" when omitted.
 *  - `registerPushToken({ tokenType: "voip" })` is accepted for back-compat
 *    with older EnvoyGo builds, but stored as `tokenType: "alert"`
 *    (post-CallKit-removal there is no separate VoIP channel).
 *  - The on-disk format round-trips correctly, including migration of
 *    pre-42I records that lacked `tokenType` and pre-Phase-31I records
 *    that had `tokenType: "voip"`.
 *  - `dispatchCallPush` targets iOS alert tokens (no separate voip
 *    tokens) and uses FCM for Android.
 *  - `dispatchCallPush` short-circuits cleanly when no token is
 *    registered for the target owner.
 *
 * The APNs / FCM HTTP transports are not exercised here — we focus
 * on the dispatcher's selection logic. The actual HTTP calls are
 * covered by integration smoke tests and are best left to the
 * sandbox-free CI environment.
 */

import { mkdtemp, rm } from "node:fs/promises";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PushNotificationService } from "../src/push-notification.js";

// The HTTP transports are not what we're testing here. Stub them so
// the dispatcher's selection logic runs in isolation. The actual
// functions are not exported, but `PushNotificationService` calls
// them indirectly — we observe side effects by spying on
// `process.env` and console warnings, and by asserting which
// records make it to `listForOwner`.
const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

describe("PushNotificationService — Phase 31I (post-CallKit-removal)", () => {
  let profileDir: string;
  let service: PushNotificationService;
  // Tests run from the repo root where a real push-config.json may
  // exist. Disable the repo-root fallback in `loadPushConfig` so the
  // dispatcher reliably hits the "no credentials configured" path —
  // otherwise it would attempt real APNs/FCM HTTP/2 calls and time
  // out, or emit a different warning string.
  const prevSkip = process.env.ENVOYMESH_PUSH_CONFIG_SKIP_REPO_FALLBACK;
  process.env.ENVOYMESH_PUSH_CONFIG_SKIP_REPO_FALLBACK = "1";

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "push-voip-"));
    service = new PushNotificationService();
    await service.init(profileDir);
    consoleWarn.mockClear();
  });

  afterAll(() => {
    if (prevSkip === undefined) {
      delete process.env.ENVOYMESH_PUSH_CONFIG_SKIP_REPO_FALLBACK;
    } else {
      process.env.ENVOYMESH_PUSH_CONFIG_SKIP_REPO_FALLBACK = prevSkip;
    }
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  describe("registerPushToken — tokenType normalization (post-CallKit)", () => {
    it("defaults tokenType to alert when omitted", () => {
      const ownerId = "envoy:owner:bob";
      service.registerPushToken({
        platform: "ios",
        token: "ios-alert-token-1234567890",
        ownerId,
      });
      const tokens = service.listForOwner(ownerId);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]?.tokenType).toBe("alert");
      expect(tokens[0]?.profileId).toBe("owner");
    });

    it("downgrades legacy tokenType=voip to alert (CallKit path is gone)", () => {
      // Older EnvoyGo builds still send `tokenType: "voip"`. We accept
      // the call for back-compat but store the record as `alert` so
      // dispatch logic only has to look at one type.
      const ownerId = "envoy:owner:legacy-voip";
      service.registerPushToken({
        platform: "ios",
        token: "ios-legacy-voip-token-1234567890",
        ownerId,
        tokenType: "voip",
      });
      const tokens = service.listForOwner(ownerId);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]?.tokenType).toBe("alert");
    });

    it("tags tokens with profileId and filters dispatch by profile", async () => {
      const ownerId = "envoy:owner:family";
      service.registerPushToken({
        platform: "android",
        token: "fcm-mom-token-aaaaaaaaaaaa",
        ownerId,
        profileId: "mom",
        tokenType: "alert",
      });
      service.registerPushToken({
        platform: "android",
        token: "fcm-dad-token-bbbbbbbbbbbb",
        ownerId,
        profileId: "owner",
        tokenType: "alert",
      });
      expect(service.listForOwner(ownerId)).toHaveLength(2);
      expect(service.listForOwnerProfile(ownerId, "mom")).toHaveLength(1);
      expect(service.listForOwnerProfile(ownerId, "mom")[0]?.token).toBe(
        "fcm-mom-token-aaaaaaaaaaaa",
      );

      // Soft-check: dispatchChatPush with targetProfileId=mom only sees mom's token
      // (HTTP transport is mocked / absent — we assert selection via list helper).
      await service.dispatchChatPush({
        senderName: "EnvoyAI",
        messagePreview: "hi mom",
        targetOwnerId: ownerId,
        targetProfileId: "mom",
        messageId: "m1",
        threadType: "envoyai",
      });
    });

    it("treats unknown tokenType values as alert (defensive default)", () => {
      // The JSON-RPC router casts unknown strings to "alert" — assert
      // the storage side matches.
      const ownerId = "envoy:owner:carol";
      service.registerPushToken({
        platform: "ios",
        token: "ios-bogus-token-1234567890",
        ownerId,
        // The TS type prevents this at compile time, but at runtime
        // (e.g. older APK calling the RPC) we should not crash.
        tokenType: "garbage" as unknown as "voip",
      });
      const tokens = service.listForOwner(ownerId);
      expect(tokens[0]?.tokenType).toBe("alert");
    });

    it("uses an explicit deviceId when provided", () => {
      const ownerId = "envoy:owner:dave";
      service.registerPushToken({
        platform: "ios",
        token: "ios-custom-token-1234567890",
        ownerId,
        deviceId: "my-custom-device",
        tokenType: "alert",
      });
      const tokens = service.listForOwner(ownerId);
      expect(tokens[0]?.deviceId).toBe("my-custom-device");
    });
  });

  describe("disk persistence — tokenType migration", () => {
    it("migrates pre-42I records (no tokenType field) to alert", async () => {
      // Write a pre-42I record manually.
      const fs = await import("node:fs/promises");
      const filePath = join(profileDir, "push-tokens.json");
      await fs.writeFile(
        filePath,
        JSON.stringify([
          {
            deviceId: "ios-abcdef012345",
            platform: "ios",
            token: "abcdef012345",
            ownerId: "envoy:owner:legacy",
            createdAt: "2024-01-01T00:00:00Z",
            lastUsedAt: "2024-01-01T00:00:00Z",
            // tokenType deliberately missing
          },
        ]),
      );

      const fresh = new PushNotificationService();
      await fresh.init(profileDir);

      const tokens = fresh.listForOwner("envoy:owner:legacy");
      expect(tokens).toHaveLength(1);
      expect(tokens[0]?.tokenType).toBe("alert");
    });

    it("downgrades voip tokenType to alert on a round-trip (CallKit path is gone)", async () => {
      // Post-CallKit-removal: a voip record is stored as "alert" on
      // load — there is no separate voip channel anymore, so the
      // dispatcher must see "alert" to target it.
      service.registerPushToken({
        platform: "ios",
        token: "ios-voip-roundtrip-1234567890",
        ownerId: "envoy:owner:eve",
        tokenType: "voip",
      });
      // The internal register() is fire-and-forget on _persist, so
      // wait for the file to settle before re-initializing. A short
      // poll on fs.statSync is the simplest reliable approach for
      // a single-record write.
      const filePath = join(profileDir, "push-tokens.json");
      for (let i = 0; i < 20; i += 1) {
        try {
          const stat = await fs.promises.stat(filePath);
          if (stat.size > 0) break;
        } catch {
          // File not yet created.
        }
        await new Promise((r) => setTimeout(r, 25));
      }
      // Re-init from disk to force a load.
      const fresh = new PushNotificationService();
      await fresh.init(profileDir);

      const tokens = fresh.listForOwner("envoy:owner:eve");
      expect(tokens).toHaveLength(1);
      expect(tokens[0]?.tokenType).toBe("alert");
    });
  });

  describe("dispatchCallPush — selection logic", () => {
    it("returns silently when no token is registered for the target owner", async () => {
      // No assertions on console output here — we just need to verify
      // the dispatcher does not throw and does not hit the network.
      await expect(
        service.dispatchCallPush({
          callerName: "Alice",
          targetOwnerId: "envoy:owner:unknown",
          callId: "call-1",
          callerOwnerId: "envoy:owner:alice",
        }),
      ).resolves.toBeUndefined();
    });

    it("returns silently when the service has not been initialized", async () => {
      const uninitialized = new PushNotificationService();
      await expect(
        uninitialized.dispatchCallPush({
          callerName: "Alice",
          targetOwnerId: "envoy:owner:alice",
          callId: "call-1",
          callerOwnerId: "envoy:owner:alice",
        }),
      ).resolves.toBeUndefined();
    });

    it("targets iOS alert tokens (post-CallKit) for call pushes", async () => {
      // After the CallKit removal, an iOS alert token IS the call-push
      // path — the alert payload carries content-available: 1 so iOS
      // wakes the app and the AppDelegate forwards the incoming-call
      // payload to the in-app call screen. We verify selection by
      // wiping APNS_TOPIC to force the skip path and watching for the
      // iOS APNs warning.
      const ownerId = "envoy:owner:grace";
      service.registerPushToken({
        platform: "ios",
        token: "ios-alert-grace-1234567890",
        ownerId,
        tokenType: "alert",
      });
      const prevTopic = process.env.APNS_TOPIC;
      delete process.env.APNS_TOPIC;
      try {
        await service.dispatchCallPush({
          callerName: "Grace",
          targetOwnerId: ownerId,
          callId: "call-1",
          callerOwnerId: ownerId,
        });
      } finally {
        if (prevTopic === undefined) delete process.env.APNS_TOPIC;
        else process.env.APNS_TOPIC = prevTopic;
      }
      // Dispatcher must have reached the iOS code path and observed
      // the missing APNS_TOPIC env var.
      const apnsMessages = consoleWarn.mock.calls
        .map((c) => String(c[0]))
        .filter((m) => m.includes("APNs credentials not configured"));
      expect(apnsMessages.length).toBeGreaterThan(0);
    });

    it("falls back to FCM for Android tokens", async () => {
      const ownerId = "envoy:owner:henry";
      service.registerPushToken({
        platform: "android",
        token: "android-fcm-token-henry-1234567890",
        ownerId,
      });
      // Wipe FCM env vars so the dispatcher's "skip" path runs and
      // emits a recognizable warning. We're verifying selection, not
      // the HTTP call.
      const prevProject = process.env.FCM_PROJECT_ID;
      const prevKey = process.env.FCM_SERVICE_ACCOUNT_JSON;
      const prevTopic = process.env.APNS_TOPIC;
      delete process.env.FCM_PROJECT_ID;
      delete process.env.FCM_SERVICE_ACCOUNT_JSON;
      delete process.env.APNS_TOPIC;
      try {
        await service.dispatchCallPush({
          callerName: "Henry",
          targetOwnerId: ownerId,
          callId: "call-1",
          callerOwnerId: ownerId,
        });
      } finally {
        if (prevProject === undefined) delete process.env.FCM_PROJECT_ID;
        else process.env.FCM_PROJECT_ID = prevProject;
        if (prevKey === undefined) delete process.env.FCM_SERVICE_ACCOUNT_JSON;
        else process.env.FCM_SERVICE_ACCOUNT_JSON = prevKey;
        if (prevTopic === undefined) delete process.env.APNS_TOPIC;
        else process.env.APNS_TOPIC = prevTopic;
      }
      const warnMessages = consoleWarn.mock.calls.map((c) => String(c[0]));
      expect(warnMessages.some((m) => m.includes("FCM credentials not configured"))).toBe(true);
    });

    it("dispatches to all matching tokens for an owner with multiple iOS devices", async () => {
      // Two iOS devices for the same owner — both alert tokens should
      // be targeted. We observe this via the APNs-skip warnings.
      const ownerId = "envoy:owner:iris";
      service.registerPushToken({
        platform: "ios",
        token: "ios-alert-iris-a-1234567890",
        ownerId,
        tokenType: "alert",
      });
      service.registerPushToken({
        platform: "ios",
        token: "ios-alert-iris-b-1234567890",
        ownerId,
        tokenType: "alert",
      });
      // Force the "no APNs credentials" path on every dispatch by
      // clearing APNS_TOPIC. With a topic set, the dispatcher would
      // attempt the HTTP/2 call (and may or may not warn depending on
      // async error timing), which would make the test flaky.
      const prevTopic = process.env.APNS_TOPIC;
      delete process.env.APNS_TOPIC;
      try {
        await service.dispatchCallPush({
          callerName: "Iris",
          targetOwnerId: ownerId,
          callId: "call-1",
          callerOwnerId: ownerId,
        });
      } finally {
        if (prevTopic !== undefined) process.env.APNS_TOPIC = prevTopic;
      }
      const skipCount = consoleWarn.mock.calls
        .map((c) => String(c[0]))
        .filter((m) => m.includes("APNs credentials not configured")).length;
      expect(skipCount).toBe(2);
    });
  });

  describe("dispatchChatPush / dispatchFeedPush — alert-only selection", () => {
    it("dispatches chat pushes to iOS alert tokens (incl. legacy voip records)", async () => {
      // Post-CallKit-removal, a legacy `tokenType: "voip"` record is
      // stored as `tokenType: "alert"` and dispatched to like any
      // other iOS token — there's no separate voip channel anymore.
      const ownerId = "envoy:owner:jade";
      service.registerPushToken({
        platform: "ios",
        token: "ios-voip-jade-1234567890",
        ownerId,
        tokenType: "voip",
      });
      const prevTopic = process.env.APNS_TOPIC;
      delete process.env.APNS_TOPIC;
      try {
        await service.dispatchChatPush({
          senderName: "Bob",
          messagePreview: "hello",
          targetOwnerId: ownerId,
          messageId: "msg-1",
        });
      } finally {
        if (prevTopic === undefined) delete process.env.APNS_TOPIC;
        else process.env.APNS_TOPIC = prevTopic;
      }
      // The voip-tagged record is stored as alert → it gets dispatched
      // to like any other iOS alert token. The skip path runs because
      // we wiped APNS_TOPIC.
      const apnsSkips = consoleWarn.mock.calls
        .map((c) => String(c[0]))
        .filter((m) => m.includes("APNs credentials not configured"));
      expect(apnsSkips).toHaveLength(1);
    });

    it("dispatches feed pushes to all iOS alert tokens (incl. legacy voip records)", async () => {
      // Post-CallKit-removal, a legacy `tokenType: "voip"` record is
      // stored as `tokenType: "alert"` and dispatched to like any
      // other iOS token — there's no separate voip channel anymore.
      const ownerId = "envoy:owner:kai";
      service.registerPushToken({
        platform: "ios",
        token: "ios-alert-kai-1234567890",
        ownerId,
        tokenType: "alert",
      });
      service.registerPushToken({
        platform: "ios",
        token: "ios-voip-kai-1234567890",
        ownerId,
        tokenType: "voip",
      });
      const prevTopic = process.env.APNS_TOPIC;
      delete process.env.APNS_TOPIC;
      try {
        await service.dispatchFeedPush({
          targetOwnerId: ownerId,
          title: "Family album",
          summary: "New photos",
          url: "envoy://envoy_owner_kai/photos/",
          notificationId: "notif-1",
          publisherOwnerId: "envoy:owner:alice",
          kind: "album",
        });
      } finally {
        if (prevTopic === undefined) delete process.env.APNS_TOPIC;
        else process.env.APNS_TOPIC = prevTopic;
      }
      // Both records are alert-type now → both produce an APNs skip
      // (no credentials configured).
      const apnsSkips = consoleWarn.mock.calls
        .map((c) => String(c[0]))
        .filter((m) => m.includes("APNs credentials not configured"));
      expect(apnsSkips).toHaveLength(2);
    });

    it("short-circuits feed push when no alert token is registered", async () => {
      await service.dispatchFeedPush({
        targetOwnerId: "envoy:owner:nobody",
        title: "x",
        url: "envoy://x/",
        notificationId: "n1",
      });
      expect(consoleWarn).not.toHaveBeenCalled();
    });
  });
});
