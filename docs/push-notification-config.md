# Push Notification Configuration — Phase 31I

How to configure push notifications for EnvoyGo (iOS + Android).

---

## Overview

The home node dispatches push notifications when a chat message or bond
request arrives for an owner whose thin-client device is offline (not
connected via WebSocket).

| Platform | Service | Transport | Auth |
|----------|---------|-----------|------|
| iOS | Apple Push Notification service (APNs) | HTTP/2 to `api.push.apple.com` | ES256 JWT signed with `.p8` key |
| Android | Firebase Cloud Messaging (FCM) | HTTPS to `fcm.googleapis.com` | OAuth2 access token from service account JSON |

Both backends are **env-var gated** — when credentials are absent, the
node logs a warning and skips the push silently. No npm packages required.

---

## iOS — APNs

### 1. Prerequisites

- An Apple Developer account ($99/year)
- Your app's Bundle ID registered in the Apple Developer portal
- Push notifications capability enabled for the app

### 2. Generate an APNs Key (.p8)

1. Go to [Apple Developer → Certificates, Identifiers & Profiles → Keys](https://developer.apple.com/account/resources/authkeys/list)
2. Click **+** to create a new key
3. Name it (e.g. "EnvoyMesh Push")
4. Check **Apple Push Notifications service (APNs)**
5. Click **Continue** → **Register**
6. **Download the `.p8` file immediately** — Apple only lets you download it once
7. Note the **Key ID** (10-character string, e.g. `ABC1234567`)

### 3. Find your Team ID

1. Go to [Apple Developer → Membership](https://developer.apple.com/account/#/membership)
2. Copy your **Team ID** (10-character string)

### 4. Find your Bundle ID (Topic)

This is your app's bundle identifier from Xcode (e.g. `com.envoymesh.EnvoyGo`).

### 5. Set environment variables

```bash
export APNS_KEY_ID="ABC1234567"           # From step 2
export APNS_TEAM_ID="1A2B3C4D5E"          # From step 3
export APNS_KEY_PATH="/path/to/AuthKey_ABC1234567.p8"  # From step 2
export APNS_TOPIC="com.envoymesh.EnvoyGo"  # From step 4
```

**Optional:** set `APNS_SANDBOX=1` to use the APNs sandbox server
(`api.sandbox.push.apple.com`) for development builds. Production
builds use `api.push.apple.com` by default.

### 6. EnvoyGo client-side

The EnvoyGo app must:
1. Request push notification permission (`UNUserNotificationCenter`)
2. Register for remote notifications (`UIApplication.registerForRemoteNotifications`)
3. Obtain the device token from `didRegisterForRemoteNotificationsWithDeviceToken`
4. Send the token to the home node via the `registerPushToken` RPC:

```dart
await nodeService.registerPushToken({
  "platform": "ios",
  "token": deviceToken,  // hex string from APNs
  "ownerId": myOwnerId,
});
```

---

## Android — FCM

### 1. Prerequisites

- A Firebase project ([console.firebase.google.com](https://console.firebase.google.com))
- Your Android app registered in the Firebase project
- `google-services.json` downloaded and placed in the app's `android/app/` directory

### 2. Generate a Service Account Key

1. Go to [Firebase Console → Project Settings → Service accounts](https://console.firebase.google.com/project/_/settings/serviceaccounts/adminsdk)
2. Click **Generate new private key**
3. Download the JSON file

### 3. Find your Project ID

From the Firebase Console → Project Settings → General → **Project ID**.

### 4. Set environment variables

```bash
export FCM_PROJECT_ID="your-project-id"                          # From step 3
export FCM_SERVICE_ACCOUNT_JSON="/path/to/service-account.json"  # From step 2
```

### 5. EnvoyGo client-side

The EnvoyGo app must:
1. Initialize Firebase (`Firebase.initializeApp()`)
2. Obtain the FCM token (`FirebaseMessaging.instance.getToken()`)
3. Send the token to the home node via the `registerPushToken` RPC:

```dart
await nodeService.registerPushToken({
  "platform": "android",
  "token": fcmToken,
  "ownerId": myOwnerId,
});
```

---

## File layout on the home node

Push tokens are persisted to `<profileDir>/push-tokens.json`:

```json
[
  {
    "deviceId": "ios-abc123def456",
    "platform": "ios",
    "token": "abc123...full-token...",
    "ownerId": "envoy:owner:abc123",
    "createdAt": "2026-06-17T12:00:00.000Z",
    "lastUsedAt": "2026-06-17T12:00:00.000Z"
  }
]
```

This file is created automatically on the first `registerPushToken` call
and survives node restarts.

---

## Testing

### Verify APNs credentials

```bash
# Start the node with APNs env vars set
APNS_KEY_ID=ABC1234567 \
APNS_TEAM_ID=1A2B3C4D5E \
APNS_KEY_PATH=./AuthKey.p8 \
APNS_TOPIC=com.envoymesh.EnvoyGo \
npm run node:dev
```

The node logs `[push] APNs credentials not configured` if any variable is missing.
No log message = credentials loaded, push will be attempted.

### Verify FCM credentials

```bash
FCM_PROJECT_ID=my-project \
FCM_SERVICE_ACCOUNT_JSON=./service-account.json \
npm run node:dev
```

Same pattern — no "not configured" warning = credentials loaded.

### End-to-end test

1. Start the home node with credentials set
2. Pair EnvoyGo on a phone
3. Send a chat message to the paired owner from another device
4. Close/lock the phone (so the WebSocket disconnects)
5. The phone should receive a push notification within ~1-2 seconds

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `[push] APNs credentials not configured` | Missing env var(s) | Set all 4 `APNS_*` vars |
| `[push] APNs rejected: status=403` | Wrong Key ID / Team ID / Bundle ID, or APNs not enabled for app | Verify all values in Apple Developer portal |
| `[push] APNs rejected: status=400` | Invalid device token | Token may be from sandbox on prod (or vice versa). Set `APNS_SANDBOX=1` for dev builds |
| `[push] FCM credentials not configured` | Missing env var(s) | Set both `FCM_*` vars |
| `[push] FCM rejected: status=403` | Service account doesn't have Firebase Messaging permissions, or wrong project ID | Check IAM in Firebase Console |
| `[push] APNs error: ...` | Network / DNS issue | Can the node reach `api.push.apple.com`? |
| `[push] FCM request error: ...` | Network / DNS issue | Can the node reach `fcm.googleapis.com`? |
| No push received but no errors | Token not registered, or recipient online (WS connected) | Verify `push-tokens.json` has the token; verify WebSocket is disconnected |
