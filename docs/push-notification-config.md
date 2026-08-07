# Push Notification Configuration — Phase 31I / 42I / 45E / 50

Complete operator and developer reference for EnvoyGo push notifications
(iOS + Android). All events — chat, bond, feed, approval, Pi, and
**incoming calls** — use the **alert** APNs / FCM path.

> **CallKit / PushKit removed (China App Store).** MIIT requires CallKit
> off for apps available in China. EnvoyGo ships one binary worldwide
> without CallKit or PushKit. Incoming calls use a standard alert push
> (`data.type = "incomingCall"`, iOS `aps.content-available: 1`) and the
> in-app call screen. Wake from a force-killed app is best-effort (not
> as reliable as the old VoIP path). Legacy `tokenType: "voip"` from
> older builds is accepted and stored as `"alert"`.

**Implementation:**
- Home: `apps/node/src/push-notification.ts` + unified listener in `apps/node/src/node-service-impl.ts` (constructor)
- EnvoyGo: `apps/envoygo/lib/services/push_notification_service.dart` + `ios/Runner/AppDelegate.swift` (`envoygo/alert_push`)
- EnvoyGo deep-link navigation: `apps/envoygo/lib/main.dart` (`_routeNotificationTap`)
- EnvoyGo push toggle: `apps/envoygo/lib/services/push_preferences.dart` + `apps/envoygo/lib/screens/me/me_screen.dart`

Both APNs and FCM backends are **env-var gated**. When credentials are
absent, the home node logs a warning and skips the push silently. No
extra npm packages are required on the home node (native `node:http2` /
`node:https` / `node:crypto`).

---

## Table of contents

1. [Architecture](#1-architecture)
2. [What triggers a push](#2-what-triggers-a-push)
3. [Environment variable reference](#3-environment-variable-reference)
4. [iOS — APNs (alert + incoming-call)](#4-ios--apns-alert--incoming-call)
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
                              ├─ store / emit WS event
                              │
                              └─ Phase 50 unified push listener (NodeServiceImpl constructor)
                                    │  one this.on("chat:message") subscriber catches ALL chat sources:
                                    │    direct chat · group chat · EnvoyAI reply · Ext Agent reply · Pi response
                                    │
                                    ├─ this.on("pi:proposal") → Pi tool-action request
                                    │
                                    └─ PushNotificationService
                                          └─ alert tokens → APNs (iOS) / FCM (Android)
                                                chat · bond · feed.notify · approval · Pi · incomingCall

EnvoyGo (thin client)
  ├─ PushNotificationService  → registerPushToken(tokenType: "alert")
  │     ├─ initialize() in main() before runApp (cold-start safe)
  │     ├─ getInitialMessage() for Android cold-start tap
  │     ├─ onNotificationTap → _routeNotificationTap (deep-link nav)
  │     └─ onIncomingCall → CallProvider (in-app call screen)
  └─ PushPreferences          → in-app toggle (Me → Preferences)
```

| Platform | Alert / call channel |
|----------|----------------------|
| **iOS** | APNs `apns-push-type: alert` → one remote-notification token (hex). Calls add `aps.content-available: 1` + `data.type=incomingCall`. |
| **Android** | FCM HTTP v1 → one FCM token. Calls use the same token with `data.type=incomingCall` and `priority=high`. |

**China note:** iOS uses native APNs only (no Firebase on iOS). Android
still needs Firebase/FCM.

**Phase 50 — Skip-if-online gate.** All chat/bond/feed push paths check
whether **EnvoyGo recently sent an RPC** over an authenticated WebSocket
(`WsServer.hasRecentlyActiveClientForOwner`, ~20s idle window). A
backgrounded phone with a lingering TCP socket does **not** suppress
pushes. Call pushes use `hasClientForOwner` (any connected thin-client
session) to avoid a double in-app ring when the phone is already online.
**Desktop Social does not count** as online for this gate (it connects
without a thin-client session token); otherwise chatting in Social would
suppress pushes to a killed phone.

This gate covers chat, bond, feed, approval, and Pi proposal pushes. Call
pushes use `hasClientForOwner`. Owner presence (`isOwnerOnline` / AI
status activity) is separate and only used for auto-reply / assist policy.

---

## 2. What triggers a push

Phase 50 replaced per-source hooks with a **unified `chat:message` listener**
on `NodeServiceImpl` that catches ALL chat sources in one place. Bond,
feed, call, approval, and Pi-proposal pushes use separate listeners but
the same skip-if-online gate.

| Event | Dispatch method | Listener / hook | Token type | Skip-if-online? |
|-------|-----------------|-----------------|------------|-----------------|
| Direct chat (inbound) | `dispatchChatPush` | Unified `chat:message` listener (NodeServiceImpl constructor) | `alert` | ✅ Yes |
| Group chat (`chat.room.message`) | `dispatchChatPush` | Unified `chat:message` listener | `alert` | ✅ Yes |
| EnvoyAI / OpenClaw reply | `dispatchChatPush` | Unified `chat:message` listener | `alert` | ✅ Yes |
| Ext Agent reply (HomeClaw/Hermes/OpenHuman/Pi) | `dispatchChatPush` | Unified `chat:message` listener | `alert` | ✅ Yes |
| Pi `sendToPi` response | `dispatchChatPush` | `sendToPi` emits `chat:message` → unified listener | `alert` | ✅ Yes |
| Pi tool-action request | `dispatchChatPush` | `pi:proposal` listener (NodeServiceImpl constructor) | `alert` | ✅ Yes |
| Bond / contact request | `dispatchBondPush` | `hello:request` callback (`index.ts`) | `alert` | ✅ Yes |
| Inbound `feed.notify` | `dispatchFeedPush` | `index.ts:1339` (skip-if-online gated) | `alert` | ✅ Yes |
| Approval-queue item (new pending) | `dispatchApprovalPush` | `approvalQueue.onChange` diff (`bindApprovalQueue`) | `alert` | ✅ Yes |
| Inbound call invite | `dispatchCallPush` | `call.invite` → `call-inbound.ts` | `alert` (iOS APNs + Android FCM) | ✅ Yes (`hasClientForOwner`) |

Pushes are best-effort. Missing credentials or tokens → log + skip.
**Phase 50:** chat/bond/feed paths apply the skip-if-online gate via
`isThinClientOnline()` → `hasRecentlyActiveClientForOwner` (authenticated
EnvoyGo WS **and** an RPC within ~20s). Idle/background sockets do not
suppress pushes. Call pushes use `hasClientForOwner`.

**Token cleanup (Phase 50B):** `sendAndCleanup()` wraps every
`sendApns`/`sendFcm` call. If APNs returns 410 (Unregistered), 400
(BadDeviceToken), or 403 (BadCertificate), or FCM returns 404/400
(UNREGISTERED), the token is automatically unregistered from
`push-tokens.json`. Stale tokens no longer accumulate.

---

## 3. Environment variable reference

Set these on the **home node** process (shell export, launchd/systemd
`Environment=`, Docker `-e`, etc.). Restart the node after changing them.

### 3.1 iOS — APNs (required for iOS alert + incoming-call)

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `APNS_KEY_ID` | **Yes** (iOS) | `ABC1234567` | 10-char Key ID from Apple Developer → Keys |
| `APNS_TEAM_ID` | **Yes** (iOS) | `1A2B3C4D5E` | 10-char Team ID from Membership |
| `APNS_KEY_PATH` | **Yes** (iOS) | `/secure/AuthKey_ABC1234567.p8` | Absolute path to the `.p8` private key file |
| `APNS_TOPIC` | **Yes** (iOS) | `com.envoymesh.envoygo` | App **bundle ID** — must match the build that registered the device token |
| `APNS_SANDBOX` | Optional | `1` | If set (any non-empty), use `api.sandbox.push.apple.com`. Unset → production `api.push.apple.com` |

`APNS_VOIP_TOPIC` is **obsolete** (CallKit/PushKit removed). Ignore it if
present in an old `push-config.json`.

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

**iOS (chat + incoming-call share the same APNs topic):**

```bash
export APNS_KEY_ID="ABC1234567"
export APNS_TEAM_ID="1A2B3C4D5E"
export APNS_KEY_PATH="/secure/AuthKey_ABC1234567.p8"
export APNS_TOPIC="com.envoymesh.envoygo"
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

### 3.4 Config file — for packaged builds (DMG / exe / AppImage)

In a packaged Tauri app, the Node process is spawned by the Rust shell and
inherits its environment — which doesn't include custom env vars. For DMG
users, use a **`push-config.json`** file in the profile directory instead.

The home node checks env vars first; if a credential is absent from env,
it falls back to the config file. This means you can mix (e.g. APNS via
config file, FCM via env var) without conflict.

**Profile directory location:**

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/EnvoyMesh/` |
| Linux | `~/.local/share/EnvoyMesh/` (or `$XDG_DATA_HOME/EnvoyMesh/`) |
| Windows | `%APPDATA%/EnvoyMesh/` |

**Setup:**

1. Copy the template:
```bash
cp push-config.example.json ~/Library/Application\ Support/EnvoyMesh/push-config.json
```

2. Edit with your credentials:
```json
{
  "apns": {
    "keyId": "ABC1234567",
    "teamId": "1A2B3C4D5E",
    "keyPath": "/secure/AuthKey_ABC1234567.p8",
    "topic": "com.envoymesh.envoygo",
    "sandbox": false
  },
  "fcm": {
    "projectId": "your-firebase-project-id",
    "serviceAccountJsonPath": "/secure/firebase-service-account.json"
  }
}
```

3. Restart the EnvoyMesh app. The node log should show:
```
[push] Loaded credentials from push-config.json
```

**Important:** The `.p8` key and service account JSON are secrets — never
bundle them in the DMG. Drop them **next to `push-config.json`** in the
profile dir and reference them by filename (relative path). Absolute paths
also work if you prefer a secure location outside the profile dir.

**File path resolution (keyPath, serviceAccountJsonPath):**

| Path style | Example | Resolves to |
|---|---|---|
| Relative | `AuthKey_ABC1234567.p8` | `<profileDir>/AuthKey_ABC1234567.p8` |
| Absolute | `/secure/AuthKey.p8` | `/secure/AuthKey.p8` |

Relative paths are resolved against the profile dir, so the same
`push-config.json` works in all modes:

| Run mode | Profile dir | `AuthKey.p8` resolves to |
|---|---|---|
| Dev (`npm run node:dev`) | `./data/default/` | `./data/default/AuthKey.p8` |
| Tauri macOS (DMG) | `~/Library/Application Support/EnvoyMesh/profile/` | `~/Library/Application Support/EnvoyMesh/profile/AuthKey.p8` |
| Tauri Linux (AppImage) | `~/.local/share/EnvoyMesh/profile/` | `~/.local/share/EnvoyMesh/profile/AuthKey.p8` |
| Tauri Windows (exe) | `%APPDATA%/EnvoyMesh/profile/` | `%APPDATA%/EnvoyMesh/profile/AuthKey.p8` |

**Setup (macOS DMG):**

```bash
# 1. Navigate to the profile dir
cd ~/Library/Application\ Support/EnvoyMesh/profile/

# 2. Copy the template
cp /path/to/repo/push-config.example.json push-config.json

# 3. Drop your .p8 key here (from Apple Developer → Keys)
cp ~/Downloads/AuthKey_ABC1234567.p8 .

# 4. For Android: drop the FCM service account JSON here
cp ~/Downloads/firebase-service-account.json .

# 5. Edit push-config.json with your keyId, teamId, topic, projectId
nano push-config.json
```

After editing, restart the EnvoyMesh app. The log should show:
```
[push] Loaded credentials from push-config.json
```

**Precedence:** env vars > config file. If both are set, env vars win.

---

## 4. iOS — APNs (alert + incoming-call)

### 4.1 Prerequisites

- Apple Developer Program membership
- App ID / Bundle ID registered for EnvoyGo
- **Push Notifications** capability enabled on that App ID
- Background Modes: **Audio** (in-call) and **Remote notifications**
  (do **not** enable Voice over IP / PushKit — CallKit removed for China)

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

Store the file outside the git tree (e.g. `/secure/…`) with mode `0600`.
**Never commit `.p8` files.**

### 4.4 Enable Push on the App ID + Xcode

1. [Identifiers](https://developer.apple.com/account/resources/identifiers/list) → your App ID → enable **Push Notifications**
2. In Xcode: open `apps/envoygo/ios/Runner.xcworkspace`
3. Runner target → **Signing & Capabilities** → **+ Capability** → **Push Notifications**
4. Also add **Background Modes** if not already present, and check:
   - Audio, AirPlay, and Picture in Picture (for calls)
   - Remote notifications
   - **Do not** check Voice over IP

Repo `Info.plist` declares:

```xml
<key>UIBackgroundModes</key>
<array>
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

### 4.6 What EnvoyGo does on iOS (already implemented)

Single channel `envoygo/alert_push`:

1. Dart `PushNotificationService.initialize()` → native
   `requestPermissionAndRegister`
2. `UNUserNotificationCenter.requestAuthorization([.alert, .badge, .sound])`
3. `UIApplication.registerForRemoteNotifications()`
4. `didRegisterForRemoteNotificationsWithDeviceToken` → hex string → Dart
   `onAlertToken`
5. After home connect → `registerPushToken` with `tokenType: "alert"`
6. Non-call notification tap → `onNotificationTap` → deep-link router
7. `data.type == "incomingCall"` (tap, `content-available` wake, or
   cold-start `launchOptions`) → `onIncomingCall` → `CallProvider`
   in-app call screen (no CallKit)

---

## 5. Android — FCM

### 5.1 Prerequisites

- Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
- Android app registered with package name matching EnvoyGo:
  - Application id in `apps/envoygo/android/app/build.gradle.kts`: **`com.envoymesh.envoygo`**
- Cloud Messaging API enabled for the project

### 5.2 Client: `google-services.json`

1. Firebase Console → Project settings → Your apps → Android app
   (package name **`com.envoymesh.envoygo`**)
2. Download **`google-services.json`**
3. Place it at:

```text
apps/envoygo/android/app/google-services.json
```

4. Google Services Gradle plugin is already wired:
   - `apps/envoygo/android/settings.gradle.kts` declares
     `com.google.gms.google-services` `4.4.2` (`apply false`)
   - `apps/envoygo/android/app/build.gradle.kts` applies it **only when**
     `google-services.json` exists (so builds still work before Firebase
     is configured)

Without `google-services.json`, `Firebase.initializeApp()` fails and
EnvoyGo **silently skips** FCM (push remains optional).

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
5. `onMessage` / `onMessageOpenedApp` / cold-start → `_routePushData`
   (`incomingCall` → `onIncomingCall`; else → `onNotificationTap`)

Call invites reuse the same FCM alert token with
`data.type=incomingCall` and `priority=high`.

---

## 6. Token registration (RPC + storage)

### 6.1 RPC: `registerPushToken`

Invoked by EnvoyGo over the home WebSocket JSON-RPC after connect.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `platform` | `"ios"` \| `"android"` | yes | Anything other than `"ios"` is stored as `"android"` |
| `token` | string | yes | iOS: APNs hex; Android: FCM token. Empty → ignored |
| `ownerId` | string | optional | If omitted/empty, home fills from local profile `owner.ownerId` |
| `deviceId` | string | optional | Default: `{platform}-alert-{profileId}-{token}` |
| `tokenType` | `"alert"` \| `"voip"` | optional | Always stored as `"alert"`. Legacy `"voip"` from older EnvoyGo builds is accepted and downgraded. |

```dart
// Chat / bond / feed / incoming-call — both platforms (one token)
await PushNotificationService().registerWithHomeNode(
  (method, [params]) => client.call(method, params),
  ownerId: myOwnerId, // optional; home can fill
);
```

Unregister: `unregisterPushToken({ deviceId })`.

### 6.2 On-disk store

Path: **`<profileDir>/push-tokens.json`** (mode `0600` when written).

Created on first successful register; survives restarts.

```json
[
  {
    "deviceId": "ios-alert-owner-<hex-or-token>",
    "platform": "ios",
    "token": "<device-token>",
    "ownerId": "envoy:owner:alice",
    "profileId": "owner",
    "createdAt": "2026-07-21T00:00:00.000Z",
    "lastUsedAt": "2026-07-21T00:00:00.000Z",
    "tokenType": "alert"
  },
  {
    "deviceId": "android-alert-owner-<fcm-token>",
    "platform": "android",
    "token": "<fcm-token>",
    "ownerId": "envoy:owner:alice",
    "profileId": "owner",
    "createdAt": "2026-07-21T00:00:00.000Z",
    "lastUsedAt": "2026-07-21T00:00:00.000Z",
    "tokenType": "alert"
  }
]
```

- Pre-42I rows without `tokenType` migrate to `"alert"` on load.
- Legacy `tokenType: "voip"` rows also migrate to `"alert"` on load
  (CallKit/PushKit removed).

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
| `data.senderOwnerId` | Optional (Phase 50 — for deep-link routing to the contact) |

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

### 7.4 Approval — `dispatchApprovalPush` (Phase 50)

| Field | Value |
|-------|--------|
| Title | `"Approval needed"` |
| Body | `"{contactDisplayName}: {itemTitle}"` (truncated ~120) |
| `data.type` | `"approval"` |
| `data.itemId` | Approval-queue item id (for deep-link routing) |

EnvoyGo `handleNotificationTap` maps `approval` → Inbox tab (index 1).

### 7.5 Pi tool-action request (Phase 50)

Uses `dispatchChatPush` with special sender values:

| Field | Value |
|-------|--------|
| Title | `"Pi"` |
| Body | `"{title}: {message}"` (truncated ~120) |
| `data.messageId` | `"pi-proposal-{uiRequestId}"` |
| `data.senderOwnerId` | `"envoy:pi"` |

EnvoyGo `handleNotificationTap` maps `senderOwnerId == "envoy:pi"` →
Chats tab (index 0) where the Pi thread lives.

### 7.6 Call — `dispatchCallPush`

**iOS APNs alert body** (`apns-push-type: alert`, topic = `APNS_TOPIC`):

```json
{
  "aps": {
    "alert": { "title": "Incoming call", "body": "<callerName>" },
    "sound": "default",
    "badge": 1,
    "content-available": 1
  },
  "data": {
    "type": "incomingCall",
    "callId": "<uuid>",
    "callerOwnerId": "envoy:owner:…"
  }
}
```

**Android FCM:** same `data.type=incomingCall`, `callId`,
`callerOwnerId`, plus `priority=high`.

### 7.7 APNs alert envelope (chat / bond / feed / approval / Pi)

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

| Method | iOS alert token | Android token |
|--------|-----------------|---------------|
| `dispatchChatPush` | ✅ APNs alert (via `sendAndCleanup`) | ✅ FCM (via `sendAndCleanup`) |
| `dispatchBondPush` | ✅ APNs alert (via `sendAndCleanup`) | ✅ FCM (via `sendAndCleanup`) |
| `dispatchFeedPush` | ✅ APNs alert (via `sendAndCleanup`) | ✅ FCM (via `sendAndCleanup`) |
| `dispatchApprovalPush` | ✅ APNs alert (via `sendAndCleanup`) | ✅ FCM (via `sendAndCleanup`) |
| `dispatchCallPush` | ✅ APNs alert + `content-available` | ✅ FCM (`priority=high`) |

All dispatch methods go through `sendAndCleanup()` which automatically
unregisters tokens that return 410/400/403/404 from APNs/FCM.

If no matching tokens for `targetOwnerId` → no-op (no warning).
If credentials missing → warning per attempted platform send, then skip.

---

## 9. EnvoyGo client behavior

### 9.1 When tokens register

1. **Phase 50:** `PushNotificationService().initialize()` runs in `main()`
   BEFORE `runApp()` — this ensures `getInitialMessage()` (Android cold-start)
   resolves before `_EnvoyGoRootState.initState()` drains the buffer.
   `initialize()` is idempotent + error-swallowing (safe for missing
   `google-services.json`).
2. User pairs / connects to home (`NodeNotifier._connectToNodeImpl`)
3. On success → `registerPushToken()`:
   - Checks `PushPreferences.isEnabled()` first — if the user turned push
     off in Me → Preferences, skips registration entirely.
   - If enabled: `PushNotificationService.registerWithHomeNode(...)`
4. `callProvider` subscribes to `PushNotificationService.onIncomingCall`
   (and drains `consumePendingIncomingCall` for cold start).

If the OS returns the token **after** connect, the alert service re-registers
when `onAlertToken` / FCM `onTokenRefresh` fires (home RPC handle kept).

### 9.2 Phase 50 — In-app push toggle

Users can turn push notifications on/off in **Me → Preferences** (not the
OS system settings). Implemented via `PushPreferences` (SharedPreferences):

- **Toggle ON:** saves `push_notifications_enabled = true`, calls
  `registerPushToken()` to re-register with the home node.
- **Toggle OFF:** saves `push_notifications_enabled = false`. On the next
  reconnect, `registerPushToken()` checks the preference and skips
  registration. The home node's existing token naturally expires via
  APNs/FCM 410 token cleanup.

The home node needs no awareness of this toggle — it simply has no token
to push to when push is disabled.

### 9.3 Phase 50 — Deep-link navigation

When the user taps a notification, `_routeNotificationTap` in `main.dart`
maps the payload to a target screen via `EnvoyGoApp.navigatorKey`:

| Payload type | Tap opens |
|---|---|
| Chat (direct) | ChatDetailScreen with threadId = `nodeId:senderOwnerId` |
| Chat (room) | ChatDetailScreen with threadId = `nodeId:roomId` |
| `feed_notify` | BrowserScreen at the published URL |
| `bond_request` | Inbox tab (index 1) |
| `approval` | Inbox tab (index 1) |
| `pi_proposal` | Chats tab (index 0) |
| `incomingCall` | In-app call screen via `onIncomingCall` (not deep-link router) |

**Cold-start handling:**
- `initialize()` runs in `main()` before `runApp()` so `getInitialMessage()`
  (Android) resolves early. Chat taps drain via
  `consumePendingInitialTap()` in `initState()`; calls drain via
  `consumePendingIncomingCall()` when `CallProvider` attaches.
- If `activeNode` is null on cold-start (nodes load async), the tap is
  buffered in `_pendingColdStartTap` and replayed after `loadPairedNodes()`
  completes.
- The `onNotificationTap` subscription is stored and cancelled in
  `dispose()` (no listener leak).

### 9.4 Source files

| Piece | Path |
|-------|------|
| Push Dart | `apps/envoygo/lib/services/push_notification_service.dart` |
| Push toggle | `apps/envoygo/lib/services/push_preferences.dart` |
| Deep-link router | `apps/envoygo/lib/main.dart` (`_routeNotificationTap`) |
| Native iOS | `apps/envoygo/ios/Runner/AppDelegate.swift` |
| Connect / call hook | `apps/envoygo/lib/providers/node_provider.dart` |
| Toggle UI | `apps/envoygo/lib/screens/me/me_screen.dart` |
| Home dispatch | `apps/node/src/push-notification.ts` |
| Unified chat listener | `apps/node/src/node-service-impl.ts` (constructor) |
| Bond hook | `apps/node/src/index.ts` (`hello:request` → `dispatchBondPush`) |
| Feed hook | `apps/node/src/index.ts` (`feed.notify` → `dispatchFeedPush`) |
| Approval hook | `apps/node/src/node-service-impl.ts` (`bindApprovalQueue`) |
| RPC | `apps/node/src/json-rpc-router.ts` → `NodeServiceImpl.registerPushToken` |

### 9.5 Unit tests

```bash
# Home selection / persistence
npx vitest run apps/node/test/push-notification.test.ts

# EnvoyGo services
cd apps/envoygo && flutter test \
  test/services/push_notification_service_test.dart
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
- `[push] FCM credentials not configured — skipping Android push`

No such warning on send attempt ⇒ credentials resolved (HTTP may still fail).

### 10.2 Confirm token registration

1. Pair EnvoyGo → grant notification permission
2. On home, inspect:

```bash
cat "$PROFILE_DIR/push-tokens.json"
```

Expect a single `alert` row per device/profile (no separate voip row).

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

### 10.5 End-to-end — incoming call

1. `APNS_TOPIC` (and/or FCM) configured; alert token registered
2. Place EnvoyGo in background / terminated
3. Peer starts a call to the home owner
4. Expect OS banner; tap or background wake → in-app call screen
   (not CallKit); accept → WebRTC over WS. Force-killed wake is
   best-effort with alert + `content-available`.

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `[push] dispatchChatPush skipped — push service not initialized` | Home node never called `pushNotificationService.init(profileDir)` | Restart home node on a build that inits push at startup (`index.ts` + `NodeServiceImpl`) |
| `[push] dispatchChatPush: no alert tokens for owner=…` | EnvoyGo never registered, or `ownerId` mismatch | Open EnvoyGo → Me → enable push; reconnect; check `push-tokens.json` |
| `[push] APNs credentials not configured` | Missing `APNS_KEY_ID` / `TEAM_ID` / `KEY_PATH` / `TOPIC`, or unreadable `.p8` | Set all four; check file path and permissions; ensure `push-config.json` is next to the profile or repo root |
| `[push] APNs rejected: status=403` | Wrong Key/Team/Topic, or Push not enabled on App ID | Re-check Apple portal + `APNS_TOPIC` = bundle id |
| `[push] APNs rejected: status=400` | Bad/expired token, or sandbox↔prod mismatch | Toggle `APNS_SANDBOX` / `apns.sandbox` in `push-config.json`; debug builds need `sandbox: true`; re-install app; re-register token |
| `[push] FCM credentials not configured` | Missing `FCM_PROJECT_ID` or `FCM_SERVICE_ACCOUNT_JSON`, or bad JSON | Fix paths; ensure JSON has `client_email` + `private_key` |
| `[push] FCM rejected: status=403` | SA lacks Messaging permission / wrong project | IAM + matching `FCM_PROJECT_ID` |
| `[push] APNs error: …` / `FCM request error: …` | Network / DNS / TLS from home host | Can the node reach `api.push.apple.com` / `fcm.googleapis.com`? |
| No row in `push-tokens.json` | Push never initialized (tokens not persisted); permission denied; not connected | Restart home; grant notifications; reconnect EnvoyGo |
| Token present, no notification | Wrong `ownerId` / `profileId` on token vs dispatch target; app actively using WS (<20s) | Ensure `ownerId` matches home owner and `profileId` matches family member (mom/dad/owner); background app (EnvoyGo disconnects WS on pause) |
| `[push] skip-if-online profile=…` | Thin client still considered recently active | Background/force-quit EnvoyGo; after pause the WS should drop so FCM/APNs can fire |
| Chat works, calls don’t | No alert token / offline gate / OS throttled `content-available` | Check `alert` row; confirm phone offline for `hasClientForOwner`; tap the banner if wake failed |
| Android never gets token | Missing `google-services.json` or Gradle plugin | §5.2; watch logcat for Firebase init errors |
| iOS push OK, Android never | FCM credentials missing on home, or no Android row in `push-tokens.json` | Set `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT_JSON` (or `push-config.json` + `serviceAccountKey.json`); open Android EnvoyGo once with push enabled |
| iOS simulator | APNs device tokens often unavailable | Use a physical device |
| Duplicate notifications (WS + OS) | Rare: active EnvoyGo + push after idle window | Expected when backgrounded >20s then message arrives |

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
