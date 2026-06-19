/**
 * Phase 42I — VoIP push dispatch + tokenType persistence.
 *
 * Verifies:
 *  - `registerPushToken({ tokenType: "voip" })` stores a separate row
 *    from the alert token, even for the same physical device.
 *  - `registerPushToken` without `tokenType` defaults to "alert"
 *    (back-compat for older EnvoyGo builds).
 *  - The on-disk format round-trips correctly, including migration
 *    of pre-42I records that lacked `tokenType`.
 *  - `dispatchCallPush` selects iOS + voip tokens for the VoIP path.
 *  - `dispatchCallPush` uses FCM for Android (no separate VoIP
 *    channel exists there).
 *  - `dispatchCallPush` skips iOS + alert tokens — a chat-style
 *    notification cannot wake a CallKit screen.
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PushNotificationService } from "../src/push-notification.js";

// The HTTP transports are not what we're testing here. Stub them so
// the dispatcher's selection logic runs in isolation. The actual
// functions are not exported, but `PushNotificationService` calls
// them indirectly — we observe side effects by spying on
// `process.env` and console warnings, and by asserting which
// records make it to `listForOwner`.
const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

describe("PushNotificationService — Phase 42I VoIP", () => {
  let profileDir: string;
  let service: PushNotificationService;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "push-voip-"));
    service = new PushNotificationService();
    await service.init(profileDir);
    consoleWarn.mockClear();
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  describe("registerPushToken — tokenType discriminator", () => {
    it("namespaces alert vs voip tokens separately for the same device", () => {
      const ownerId = "envoy:owner:alice";
      const deviceToken = "abcdef0123456789";

      service.registerPushToken({
        platform: "ios",
        token: deviceToken,
        ownerId,
        tokenType: "alert",
      });
      service.registerPushToken({
        platform: "ios",
        token: deviceToken,
        ownerId,
        tokenType: "voip",
      });

      const tokens = service.listForOwner(ownerId);
      // Two distinct rows: alert + voip. Without the namespacing fix
      // (pre-42I), the second register would have stomped the first.
      expect(tokens).toHaveLength(2);
      const types = tokens.map((t) => t.tokenType).sort();
      expect(types).toEqual(["alert", "voip"]);
      // The synthetic deviceIds must differ so the iOS app can unregister
      // one without affecting the other.
      const ids = new Set(tokens.map((t) => t.deviceId));
      expect(ids.size).toBe(2);
    });

    it("defaults tokenType to alert when omitted (back-compat)", () => {
      const ownerId = "envoy:owner:bob";
      service.registerPushToken({
        platform: "ios",
        token: "ios-alert-token-1234567890",
        ownerId,
      });
      const tokens = service.listForOwner(ownerId);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]?.tokenType).toBe("alert");
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
        tokenType: "voip",
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

    it("preserves voip tokenType through a round-trip", async () => {
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
      expect(tokens[0]?.tokenType).toBe("voip");
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

    it("stores a voip record for the target owner and emits no alert fallback", async () => {
      // Register an iOS VoIP token. The dispatcher should pick it
      // (we don't make a real HTTP call here — the network path is
      // stubbed via missing APNS_VOIP_TOPIC env var).
      const ownerId = "envoy:owner:frank";
      service.registerPushToken({
        platform: "ios",
        token: "ios-voip-frank-1234567890",
        ownerId,
        tokenType: "voip",
      });
      // Wipe the alert env vars so the dispatcher takes its "skip"
      // path; what we care about is that it gets to that decision.
      const prevTopic = process.env.APNS_TOPIC;
      const prevVoipTopic = process.env.APNS_VOIP_TOPIC;
      delete process.env.APNS_TOPIC;
      delete process.env.APNS_VOIP_TOPIC;
      try {
        await service.dispatchCallPush({
          callerName: "Frank",
          targetOwnerId: ownerId,
          callId: "call-1",
          callerOwnerId: ownerId,
        });
      } finally {
        if (prevTopic === undefined) delete process.env.APNS_TOPIC;
        else process.env.APNS_TOPIC = prevTopic;
        if (prevVoipTopic === undefined) delete process.env.APNS_VOIP_TOPIC;
        else process.env.APNS_VOIP_TOPIC = prevVoipTopic;
      }
      // The dispatcher must have observed the missing env var and
      // logged a "skipping iOS VoIP push" warning.
      const warnMessages = consoleWarn.mock.calls.map((c) => String(c[0]));
      expect(warnMessages.some((m) => m.includes("VoIP topic not configured"))).toBe(true);
    });

    it("skips iOS alert tokens for call pushes (no CallKit wake-up possible)", async () => {
      const ownerId = "envoy:owner:grace";
      // Only an alert token is registered — the dispatcher should
      // intentionally skip iOS alert tokens for call pushes.
      service.registerPushToken({
        platform: "ios",
        token: "ios-alert-grace-1234567890",
        ownerId,
        tokenType: "alert",
      });
      const prevTopic = process.env.APNS_TOPIC;
      const prevVoipTopic = process.env.APNS_VOIP_TOPIC;
      process.env.APNS_TOPIC = "com.example.app";
      delete process.env.APNS_VOIP_TOPIC;
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
        if (prevVoipTopic === undefined) delete process.env.APNS_VOIP_TOPIC;
        else process.env.APNS_VOIP_TOPIC = prevVoipTopic;
      }
      // No APNs warning should have been emitted — the iOS alert
      // token was intentionally skipped. We expect zero "APNs"
      // (non-VoIP) rejection messages from this call.
      const apnsMessages = consoleWarn.mock.calls
        .map((c) => String(c[0]))
        .filter((m) => m.includes("[push] APNs") && !m.includes("VoIP"));
      expect(apnsMessages).toHaveLength(0);
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
      const prevVoipTopic = process.env.APNS_VOIP_TOPIC;
      delete process.env.FCM_PROJECT_ID;
      delete process.env.FCM_SERVICE_ACCOUNT_JSON;
      delete process.env.APNS_TOPIC;
      delete process.env.APNS_VOIP_TOPIC;
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
        if (prevVoipTopic === undefined) delete process.env.APNS_VOIP_TOPIC;
        else process.env.APNS_VOIP_TOPIC = prevVoipTopic;
      }
      const warnMessages = consoleWarn.mock.calls.map((c) => String(c[0]));
      expect(warnMessages.some((m) => m.includes("FCM credentials not configured"))).toBe(true);
    });

    it("dispatches to all matching tokens for an owner with multiple devices", async () => {
      // Two devices for the same owner — both VoIP tokens should be
      // targeted. We observe this via the FCM-skip warnings (Android
      // sibling dispatch would also be a valid signal).
      const ownerId = "envoy:owner:iris";
      service.registerPushToken({
        platform: "ios",
        token: "ios-voip-iris-a-1234567890",
        ownerId,
        tokenType: "voip",
      });
      service.registerPushToken({
        platform: "ios",
        token: "ios-voip-iris-b-1234567890",
        ownerId,
        tokenType: "voip",
      });
      // Force the "VoIP topic not configured" path on every dispatch
      // by clearing both APNS_TOPIC and APNS_VOIP_TOPIC. With a topic
      // set, the dispatcher would attempt the HTTP/2 call (and may or
      // may not warn depending on async error timing), which would
      // make the test flaky.
      const prevTopic = process.env.APNS_TOPIC;
      const prevVoip = process.env.APNS_VOIP_TOPIC;
      delete process.env.APNS_TOPIC;
      delete process.env.APNS_VOIP_TOPIC;
      try {
        await service.dispatchCallPush({
          callerName: "Iris",
          targetOwnerId: ownerId,
          callId: "call-1",
          callerOwnerId: ownerId,
        });
      } finally {
        if (prevTopic !== undefined) process.env.APNS_TOPIC = prevTopic;
        if (prevVoip !== undefined) process.env.APNS_VOIP_TOPIC = prevVoip;
      }
      const skipCount = consoleWarn.mock.calls
        .map((c) => String(c[0]))
        .filter((m) => m.includes("VoIP topic not configured")).length;
      expect(skipCount).toBe(2);
    });
  });
});
