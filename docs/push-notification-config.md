# Push Notification Configuration — Phase 31I / 42I / 45E

Complete operator and developer reference for EnvoyGo push notifications
(iOS + Android). Covers **alert** pushes (chat, bond, feed) and **VoIP**
pushes (backgrounded calls).

**Implementation:**
- Home: `apps/node/src/push-notification.ts`
- EnvoyGo alert: `apps/envoygo/lib/services/push_notification_service.dart` + `ios/Runner/AppDelegate.swift` (`envoygo/alert_push`)
- EnvoyGo VoIP: `apps/envoygo/lib/services/voip_push_service.dart` + `AppDelegate.swift` (`envoygo/voip_push`)

Both APNs and FCM backends are **env-var gated**. When credentials are
absent, the home node logs a warning and skips the push silently. No
extra npm packages are required on the home node (native `node:http2` /
`node:https` / `node:crypto`).

---

## Table of contents

1. [Architecture](#1-architecture)
2. [What triggers a push](#2-what-triggers-a-push)
3. [Environment variable reference](#3-environment-variable-reference)
4. [iOS — APNs (alert + VoIP)](#4-ios--apns-alert--voip)
5. [Android — FCM](#5-android--fcm)
6. [Token registration (RPC + storage)](#6-token-registration-rpc--storage)
7. [Payload shapes](#7-payload-shapes)
8. [Dispatch selection rules](#8-dispatch-selection-rules)
9. [EnvoyGo client behavior](#9-envoygo-client-behavior)
10. [Testing](#10-testing)
11. [Troubleshooting](#11-troubleshooting)
12. [Security notes](#12-security-notes)

---

## 1. Architecture

```
Publisher / peer ──mesh──► Home node (apps/node)
                              │
                              ├─ store / emit WS event (if EnvoyGo online)
                              │
                              └─ PushNotificationService
                                    ├─ alert tokens → APNs (iOS) / FCM (Android)
                                    │     chat · bond · feed.notify
                                    └─ voip tokens  → APNs VoIP topic (iOS)
                                          call invite (Android uses FCM alert token + type=call)

EnvoyGo (thin client)
  ├─ PushNotificationService  → registerPushToken(tokenType: "alert")
  └─ VoipPushService (iOS)    → registerPushToken(tokenType: "voip")
```

| Platform | Alert channel | Call channel |
|----------|---------------|--------------|
| **iOS** | APNs `apns-push-type: alert` → standard remote-notification token (hex) | APNs `apns-push-type: voip` → PushKit token (separate hex) |
| **Android** | FCM HTTP v1 → FCM registration token | Same FCM token with `data.type=call` (no separate VoIP channel) |

**Why two iOS tokens?** Regular alert pushes cannot reliably wake a
terminated app into a CallKit incoming-call UI. Apple reserves that for
PushKit VoIP. Chat / bond / feed stay on the alert path.

**China note:** iOS alert + VoIP use native APNs only (no Firebase on
iOS). Android still needs Firebase/FCM.

---

## 2. What triggers a push

| Event | Home API | Token type targeted | When |
|-------|----------|---------------------|------|
| Inbound `chat.message` | `dispatchChatPush` | `alert` | After chat is stored / `chat:message` WS emit (`apps/node/src/index.ts`) |
| Bond / contact request | `dispatchBondPush` | `alert` | When the bond-request path invokes it |
| Inbound `feed.notify` | `dispatchFeedPush` | `alert` | After feed inbox persist succeeds |
| Inbound call invite (callee offline) | `dispatchCallPush` | iOS `voip`; Android any platform token used as FCM | Call path when thin client has no live WS |

Pushes are best-effort. Missing credentials or tokens → log + skip.
A connected WebSocket does **not** currently suppress chat/feed pushes
(EnvoyGo may get both WS event and OS notification); call pushes check
online state via `hasClientForOwner` before dispatching.

---

## 3. Environment variable reference

Set these on the **home node** process (shell export, launchd/systemd
`Environment=`, Docker `-e`, etc.). Restart the node after changing them.

### 3.1 iOS — APNs (required for iOS alert + VoIP)

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `APNS_KEY_ID` | **Yes** (iOS) | `ABC1234567` | 10-char Key ID from Apple Developer → Keys |
| `APNS_TEAM_ID` | **Yes** (iOS) | `1A2B3C4D5E` | 10-char Team ID from Membership |
| `APNS_KEY_PATH` | **Yes** (iOS) | `/secure/AuthKey_ABC1234567.p8` | Absolute path to the `.p8` private key file |
| `APNS_TOPIC` | **Yes** (iOS alert) | `com.envoymesh.envoygo` | App **bundle ID** — must match the build that registered the device token |
| `APNS_VOIP_TOPIC` | Optional | `com.envoymesh.envoygo.voip` | VoIP APNs topic. If unset, home uses `${APNS_TOPIC}.voip` |
| `APNS_SANDBOX` | Optional | `1` | If set (any non-empty), use `api.sandbox.push.apple.com`. Unset → production `api.push.apple.com` |

JWT auth: ES256, claims `{ iss: TEAM_ID, iat: now }`, header `{ alg: ES256, kid: KEY_ID }`.

### 3.2 Android — FCM (required for Android)

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `FCM_PROJECT_ID` | **Yes** (Android) | `envoymesh-prod` | Firebase **Project ID** (not the Android package name) |
| `FCM_SERVICE_ACCOUNT_JSON` | **Yes** (Android) | `/secure/fcm-sa.json` | Absolute path to the Firebase Admin SDK service-account JSON |

The service account must be allowed to call
`https://www.googleapis.com/auth/firebase.messaging`. The home node
exchanges a short-lived RS256 JWT for an OAuth2 access token, then POSTs
to `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`.

### 3.3 Minimal examples

**iOS alert only (no calls):**

```bash
export APNS_KEY_ID="ABC1234567"
export APNS_TEAM_ID="1A2B3C4D5E"
export APNS_KEY_PATH="/secure/AuthKey_ABC1234567.p8"
export APNS_TOPIC="com.envoymesh.envoygo"
# Dev / TestFlight debug builds often need sandbox:
# export APNS_SANDBOX=1
```

**iOS alert + VoIP calls:**

```bash
export APNS_KEY_ID="ABC1234567"
export APNS_TEAM_ID="1A2B3C4D5E"
export APNS_KEY_PATH="/secure/AuthKey_ABC1234567.p8"
export APNS_TOPIC="com.envoymesh.envoygo"
export APNS_VOIP_TOPIC="com.envoymesh.envoygo.voip"   # or omit to use ${APNS_TOPIC}.voip
```

**Android:**

```bash
export FCM_PROJECT_ID="your-firebase-project-id"
export FCM_SERVICE_ACCOUNT_JSON="/secure/firebase-service-account.json"
```

**Both platforms on one home:**

```bash
# APNs block …
# FCM block …
npm run node:dev
```

---

## 4. iOS — APNs (alert + VoIP)

### 4.1 Prerequisites

- Apple Developer Program membership
- App ID / Bundle ID registered for EnvoyGo
- **Push Notifications** capability enabled on that App ID
- For VoIP: Push Notifications + Background Modes (VoIP) / PushKit usage as below

### 4.2 Bundle ID (`APNS_TOPIC`) — critical

`APNS_TOPIC` **must equal** the iOS app’s `PRODUCT_BUNDLE_IDENTIFIER` for
the build that obtained the device token.

In this repo the Runner target historically has used:

| Build config | Bundle ID seen in project |
|--------------|---------------------------|
| Debug | `com.envoymesh.envoygo` |
| Release | `envoymesh.envoygo` (may differ — **verify in Xcode**) |

**Always confirm in Xcode → Runner target → General → Bundle Identifier**,
then set:

```bash
export APNS_TOPIC="<exact Bundle Identifier>"
```

Mismatch → APNs `400` / `403` or silent drop.

### 4.3 Generate an APNs Auth Key (`.p8`)

1. Open [Apple Developer → Keys](https://developer.apple.com/account/resources/authkeys/list)
2. **+** → name e.g. `EnvoyMesh Push`
3. Enable **Apple Push Notifications service (APNs)**
4. Continue → Register
5. **Download the `.p8` immediately** (Apple shows it once)
6. Record:
   - **Key ID** (10 chars) → `APNS_KEY_ID`
   - File path → `APNS_KEY_PATH`
7. Team ID from [Membership](https://developer.apple.com/account/#/membership) → `APNS_TEAM_ID`

One `.p8` key can serve both alert and VoIP topics for the same team.

Store the file outside the git tree (e.g. `/secure/…`) with mode `0600`.
**Never commit `.p8` files.**

### 4.4 Enable Push on the App ID + Xcode

1. [Identifiers](https://developer.apple.com/account/resources/identifiers/list) → your App ID → enable **Push Notifications**
2. In Xcode: open `apps/envoygo/ios/Runner.xcworkspace`
3. Runner target → **Signing & Capabilities** → **+ Capability** → **Push Notifications**
4. Also add **Background Modes** if not already present, and check:
   - Audio, AirPlay, and Picture in Picture (for calls)
   - Voice over IP
   - Remote notifications

Repo `Info.plist` already declares:

```xml
<key>UIBackgroundModes</key>
<array>
  <string>voip</string>
  <string>audio</string>
  <string>remote-notification</string>
</array>
```

### 4.5 Sandbox vs production

| Build type | Typical APNs host | Env |
|------------|-------------------|-----|
| Debug / local device from Xcode | Sandbox | `APNS_SANDBOX=1` |
| TestFlight / App Store | Production | unset `APNS_SANDBOX` |

Device tokens are **environment-specific**. A sandbox token sent to
production (or the reverse) fails with status `400`.

### 4.6 VoIP topic (`APNS_VOIP_TOPIC`)

Apple delivers VoIP pushes to topic `<bundleId>.voip` (convention).

```bash
export APNS_VOIP_TOPIC="com.envoymesh.envoygo.voip"
# If omitted, home uses: "${APNS_TOPIC}.voip"
```

Ensure the App ID / entitlements allow PushKit VoIP for that bundle.
The same `.p8` JWT authenticates both alert and VoIP HTTP/2 calls; only
`apns-topic` and `apns-push-type` differ.

### 4.7 What EnvoyGo does on iOS (already implemented)

**Alert path (`envoygo/alert_push`):**

1. Dart `PushNotificationService.initialize()` → native
   `requestPermissionAndRegister`
2. `UNUserNotificationCenter.requestAuthorization([.alert, .badge, .sound])`
3. `UIApplication.registerForRemoteNotifications()`
4. `didRegisterForRemoteNotificationsWithDeviceToken` → hex string → Dart
   `onAlertToken`
5. After home connect → `registerPushToken` with `tokenType: "alert"`
6. Notification tap → `onNotificationTap` with the `data` dictionary

**VoIP path (`envoygo/voip_push`):**

1. `PKPushRegistry(desiredPushTypes: [.voIP])`
2. Token → Dart `onVoipToken` → `registerPushToken` with `tokenType: "voip"`
3. Incoming VoIP push → CallKit `reportNewIncomingCall` (sync, required by Apple)
   then Dart `onIncomingCall` → `CallProvider`

---

## 5. Android — FCM

### 5.1 Prerequisites

- Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
- Android app registered with package name matching EnvoyGo:
  - Application id in `apps/envoygo/android/app/build.gradle.kts`: **`envoymesh.envoygo`**
- Cloud Messaging API enabled for the project

### 5.2 Client: `google-services.json`

1. Firebase Console → Project settings → Your apps → Android app
2. Download **`google-services.json`**
3. Place it at:

```text
apps/envoygo/android/app/google-services.json
```

4. Wire the Google Services Gradle plugin (required for Firebase to
   initialize). If not already applied in your local tree:

**`apps/envoygo/android/settings.gradle.kts`** — add plugin (version
aligned with your Android Gradle Plugin):

```kotlin
plugins {
    // … existing …
    id("com.google.gms.google-services") version "4.4.2" apply false
}
```

**`apps/envoygo/android/app/build.gradle.kts`** — apply at the bottom:

```kotlin
plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}
```

Without `google-services.json` + plugin, `Firebase.initializeApp()` fails
and EnvoyGo **silently skips** FCM (push remains optional).

Do **not** commit production `google-services.json` if your org treats it
as sensitive; use CI secrets / local-only copy. (Firebase client configs
are often considered semi-public, but follow your security policy.)

### 5.3 Home: service account JSON

1. Firebase Console → Project settings → **Service accounts**
2. **Generate new private key** → download JSON
3. Store outside git, e.g. `/secure/firebase-service-account.json` (`0600`)
4. Set:

```bash
export FCM_PROJECT_ID="your-project-id"   # Project settings → General
export FCM_SERVICE_ACCOUNT_JSON="/secure/firebase-service-account.json"
```

The JSON must include at least `client_email` and `private_key`.

### 5.4 Android app permissions

`AndroidManifest.xml` includes:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

On Android 13+, the user must grant notification permission at runtime
(`FirebaseMessaging.requestPermission()` / system dialog).

### 5.5 What EnvoyGo does on Android (already implemented)

1. After home connect → `PushNotificationService.initialize()`
2. `Firebase.initializeApp()` + `getToken()`
3. `registerPushToken` with `platform: "android"`, `tokenType: "alert"`
4. `onTokenRefresh` re-registers
5. `onMessageOpenedApp` → `onNotificationTap`

There is **no** separate Android VoIP token; call invites reuse the alert
FCM token with `data.type=call`.

---

## 6. Token registration (RPC + storage)

### 6.1 RPC: `registerPushToken`

Invoked by EnvoyGo over the home WebSocket JSON-RPC after connect.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `platform` | `"ios"` \| `"android"` | yes | Anything other than `"ios"` is stored as `"android"` |
| `token` | string | yes | iOS: APNs hex; Android: FCM token. Empty → ignored |
| `ownerId` | string | optional | If omitted/empty, home fills from local profile `owner.ownerId` |
| `deviceId` | string | optional | Default: `{platform}-{tokenType}-{token}` |
| `tokenType` | `"alert"` \| `"voip"` | optional | Default `"alert"`. Unknown values → `"alert"` |

```dart
// Alert (chat / bond / feed) — both platforms
await PushNotificationService().registerWithHomeNode(
  (method, [params]) => client.call(method, params),
  ownerId: myOwnerId, // optional; home can fill
);

// VoIP — iOS only
await VoipPushService().registerWithHomeNode(
  (method, [params]) => client.call(method, params),
  ownerId: myOwnerId,
);
```

Unregister: `unregisterPushToken({ deviceId })`.

### 6.2 On-disk store

Path: **`<profileDir>/push-tokens.json`** (mode `0600` when written).

Created on first successful register; survives restarts.

```json
[
  {
    "deviceId": "ios-alert-<hex-or-token>",
    "platform": "ios",
    "token": "<device-token>",
    "ownerId": "envoy:owner:alice",
    "createdAt": "2026-07-21T00:00:00.000Z",
    "lastUsedAt": "2026-07-21T00:00:00.000Z",
    "tokenType": "alert"
  },
  {
    "deviceId": "ios-voip-<hex>",
    "platform": "ios",
    "token": "<voip-hex>",
    "ownerId": "envoy:owner:alice",
    "createdAt": "2026-07-21T00:00:00.000Z",
    "lastUsedAt": "2026-07-21T00:00:00.000Z",
    "tokenType": "voip"
  },
  {
    "deviceId": "android-alert-<fcm-token>",
    "platform": "android",
    "token": "<fcm-token>",
    "ownerId": "envoy:owner:alice",
    "createdAt": "2026-07-21T00:00:00.000Z",
    "lastUsedAt": "2026-07-21T00:00:00.000Z",
    "tokenType": "alert"
  }
]
```

- Pre-42I rows without `tokenType` migrate to `"alert"` on load.
- Same physical phone may have **both** alert and voip rows; keys are
  namespaced so one does not overwrite the other.

### 6.3 Owner ID matching

Dispatch looks up tokens with `listForOwner(targetOwnerId)`.

`targetOwnerId` is the **home owner’s** id (chat recipient / local
profile for feed). Thin-client tokens must be stored under that same
`ownerId`. Prefer passing `ownerId` from EnvoyGo; if omitted, home
`NodeServiceImpl.registerPushToken` fills from profile.

---

## 7. Payload shapes

All string values in `data` (APNs custom `data` object / FCM `data` map).

### 7.1 Chat — `dispatchChatPush`

| Field | Source |
|-------|--------|
| Notification title | Sender display name (fallback `"New message"`) |
| Notification body | Message preview (truncated ~120 chars) |
| `data.threadType` | `"direct"` (default) or `"room"` |
| `data.messageId` | Envelope message id |
| `data.senderOwnerId` | Optional |
| `data.roomId` | Optional |

### 7.2 Bond — `dispatchBondPush`

| Field | Value |
|-------|--------|
| Title | `"New contact request"` |
| Body | `"{senderName} wants to connect"` |
| `data.type` | `"bond_request"` |

### 7.3 Feed publish — `dispatchFeedPush` (`feed.notify`)

| Field | Value |
|-------|--------|
| Title | Published item title (fallback `"New published content"`) |
| Body | Summary, or URL if no summary (truncated ~120) |
| `data.type` | `"feed_notify"` |
| `data.url` | `envoy://…` content URL |
| `data.title` | Item title |
| `data.notificationId` | Inbox row id |
| `data.publisherOwnerId` | Optional |
| `data.kind` | Optional (`page`, `album`, …) |

EnvoyGo `handleNotificationTap` maps `feed_notify` → Browser URL (same
as Inbox **Open**). In-app Inbox still works via WS `feed:notify` /
`listFeedNotifications` when the app is foregrounded.

### 7.4 Call — `dispatchCallPush`

**iOS VoIP body:**

```json
{
  "aps": { "voip": 1 },
  "data": {
    "type": "call",
    "callId": "<uuid>",
    "callerOwnerId": "envoy:owner:…",
    "callerName": "…"
  }
}
```

Headers: `apns-push-type: voip`, topic = `APNS_VOIP_TOPIC` or `${APNS_TOPIC}.voip`.

**Android FCM:** normal notification + `data.type=call`, `callId`,
`callerOwnerId`, `priority=high`.

### 7.5 APNs alert envelope (chat / bond / feed)

```json
{
  "aps": {
    "alert": { "title": "…", "body": "…" },
    "sound": "default",
    "badge": 1
  },
  "data": { "…": "…" }
}
```

---

## 8. Dispatch selection rules

| Method | iOS alert token | iOS voip token | Android token |
|--------|-----------------|----------------|---------------|
| `dispatchChatPush` | ✅ APNs alert | ❌ skipped | ✅ FCM |
| `dispatchBondPush` | ✅ APNs alert | ❌ skipped | ✅ FCM |
| `dispatchFeedPush` | ✅ APNs alert | ❌ skipped | ✅ FCM |
| `dispatchCallPush` | ❌ skipped | ✅ APNs voip | ✅ FCM (`type=call`) |

If no matching tokens for `targetOwnerId` → no-op (no warning).
If credentials missing → warning per attempted platform send, then skip.

---

## 9. EnvoyGo client behavior

### 9.1 When tokens register

1. User pairs / connects to home (`NodeNotifier._connectToNodeImpl`)
2. On success → `_registerAlertPushToken()`:
   - `PushNotificationService.initialize()`
   - `registerWithHomeNode(..., ownerId: state.ownerId)`
3. `callProvider` initializes `VoipPushService` (iOS) and registers voip
   token with the same home client

If the OS returns the token **after** connect, alert service re-registers
when `onAlertToken` / FCM `onTokenRefresh` fires (home RPC handle kept).

### 9.2 Source files

| Piece | Path |
|-------|------|
| Alert Dart | `apps/envoygo/lib/services/push_notification_service.dart` |
| VoIP Dart | `apps/envoygo/lib/services/voip_push_service.dart` |
| Native iOS | `apps/envoygo/ios/Runner/AppDelegate.swift` |
| Connect hook | `apps/envoygo/lib/providers/node_provider.dart` |
| Home dispatch | `apps/node/src/push-notification.ts` |
| Feed hook | `apps/node/src/index.ts` (`feed.notify` → `dispatchFeedPush`) |
| Chat hook | `apps/node/src/index.ts` (`dispatchChatPush`) |
| RPC | `apps/node/src/json-rpc-router.ts` → `NodeServiceImpl.registerPushToken` |

### 9.3 Unit tests

```bash
# Home selection / persistence
npx vitest run apps/node/test/push-notification.test.ts

# EnvoyGo services
cd apps/envoygo && flutter test \
  test/services/push_notification_service_test.dart \
  test/services/voip_push_service_test.dart
```

---

## 10. Testing

### 10.1 Verify home credentials load

```bash
APNS_KEY_ID=ABC1234567 \
APNS_TEAM_ID=1A2B3C4D5E \
APNS_KEY_PATH=/secure/AuthKey.p8 \
APNS_TOPIC=com.envoymesh.envoygo \
APNS_SANDBOX=1 \
FCM_PROJECT_ID=my-project \
FCM_SERVICE_ACCOUNT_JSON=/secure/fcm-sa.json \
npm run node:dev
```

Then trigger a push (or temporarily call dispatch from a debug path).
Missing vars produce:

- `[push] APNs credentials not configured — skipping iOS push`
- `[push] APNs VoIP topic not configured — skipping iOS VoIP push`
- `[push] FCM credentials not configured — skipping Android push`

No such warning on send attempt ⇒ credentials resolved (HTTP may still fail).

### 10.2 Confirm token registration

1. Pair EnvoyGo → grant notification permission
2. On home, inspect:

```bash
cat "$PROFILE_DIR/push-tokens.json"
```

Expect an `alert` row for the device; on iOS also a `voip` row after the
call stack has initialized.

### 10.3 End-to-end — chat alert

1. Home running with APNs and/or FCM env set
2. EnvoyGo paired; token present in `push-tokens.json`
3. Background or kill EnvoyGo (optional but clearer)
4. Send a chat message to that owner from another peer
5. Expect OS notification within a few seconds

### 10.4 End-to-end — feed alert

1. Bonded peer publishes web content that fans out `feed.notify`
2. Home stores inbox item and calls `dispatchFeedPush`
3. EnvoyGo shows OS notification; tap data includes `type=feed_notify` + `url`
4. Foreground path: Inbox list / `feed:notify` WS still works without OS push

### 10.5 End-to-end — VoIP call (iOS)

1. `APNS_TOPIC` + VoIP topic configured; voip token registered
2. Place EnvoyGo in background / terminated
3. Peer starts a call to the home owner
4. Expect CallKit incoming UI; accept → WebRTC over WS

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `[push] APNs credentials not configured` | Missing `APNS_KEY_ID` / `TEAM_ID` / `KEY_PATH` / `TOPIC`, or unreadable `.p8` | Set all four; check file path and permissions |
| `[push] APNs VoIP topic not configured` | No `APNS_TOPIC` and no `APNS_VOIP_TOPIC` | Set `APNS_TOPIC` (fallback `.voip`) or explicit `APNS_VOIP_TOPIC` |
| `[push] APNs rejected: status=403` | Wrong Key/Team/Topic, or Push not enabled on App ID | Re-check Apple portal + `APNS_TOPIC` = bundle id |
| `[push] APNs rejected: status=400` | Bad/expired token, or sandbox↔prod mismatch | Toggle `APNS_SANDBOX`; re-install app; re-register token |
| `[push] FCM credentials not configured` | Missing `FCM_PROJECT_ID` or `FCM_SERVICE_ACCOUNT_JSON`, or bad JSON | Fix paths; ensure JSON has `client_email` + `private_key` |
| `[push] FCM rejected: status=403` | SA lacks Messaging permission / wrong project | IAM + matching `FCM_PROJECT_ID` |
| `[push] APNs error: …` / `FCM request error: …` | Network / DNS / TLS from home host | Can the node reach `api.push.apple.com` / `fcm.googleapis.com`? |
| No row in `push-tokens.json` | Permission denied on device; FCM init failed; not connected to home | Grant notifications; add `google-services.json`; reconnect EnvoyGo |
| Token present, no notification | Wrong `ownerId` on token vs dispatch target; only voip token for chat | Ensure `ownerId` matches home owner; need `tokenType: alert` for chat/feed |
| Chat works, calls don’t (iOS) | No voip token / wrong VoIP topic | Check voip row; set `APNS_VOIP_TOPIC`; PushKit + Background Modes |
| Android never gets token | Missing `google-services.json` or Gradle plugin | §5.2; watch logcat for Firebase init errors |
| iOS simulator | APNs device tokens often unavailable | Use a physical device |
| Duplicate notifications (WS + OS) | Expected today for chat/feed while connected | Background the app to validate OS path alone |

---

## 12. Security notes

- Treat `.p8` and FCM service-account JSON as **secrets**. Do not commit them.
- Prefer absolute paths under a restricted directory (`0600`, owner-only).
- `push-tokens.json` is written mode `0600`; it contains device tokens —
  back up / rotate with profile dir hygiene.
- Home accepts `registerPushToken` from authenticated thin clients (and
  legacy local WS without token). Empty `ownerId` is filled with the
  **local home owner** — devices cannot register tokens for arbitrary
  remote owners via omission.
- APNs/FCM payloads for feed carry **metadata only** (title, url, ids) —
  not page bodies. Content still loads via `library.read` / Browser.

---

## Related docs

- Design (feed inbox + OS push): [web-content-browsing-design.md](./web-content-browsing-design.md) §7.5
- Older short copy (superseded by this file for operators): [mobile_push_notification.md](./mobile_push_notification.md)
- Implementation checklist: [implementation-plan.md](./implementation-plan.md) (Phase 31I / 42I / 45E)
