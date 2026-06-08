# EnvoyGo — Integration Smoke Test

## Prerequisites

1. Home EnvoyMesh node running on macOS/Linux with a profile directory
2. Flutter SDK installed
3. iOS Simulator or Android Emulator (or physical device)

## Quick Start

```bash
# 1. Start the home node
cd apps/node
npm run node:dev

# 2. In the Social UI (http://localhost:3030), go to Settings → Devices
#    and generate a pairing QR code. Copy the `envoy://pair?...` URI.

# 3. Run the Flutter app
cd apps/envoygo
flutter run

# 4. In the app, tap "Pair with Node" on the Me tab
#    and paste the pairing URI into the text field.
#    (On mobile, scan the QR code.)

# 5. After pairing, contacts should sync and chat should work.
```

## Manual E2E Checklist

| Step | Action | Expected |
|------|--------|----------|
| 1 | Start home node | `[ws-server] listening on :3030` |
| 2 | Open Social UI | Shows contacts, settings |
| 3 | Copy pairing URI | `envoy://pair?token=...&peerId=...` |
| 4 | Launch EnvoyGo | Shows 3-tab UI (Chats, Contacts, Me) |
| 5 | Tap "Pair" on Me tab | Opens pairing screen |
| 6 | Paste pairing URI | Shows confirmation with node name |
| 7 | Tap "Pair" | Shows "Connected" on Me tab |
| 8 | Switch to Contacts tab | Shows bonded contacts from home node |
| 9 | Tap contact → "Chat" | Opens chat detail |
| 10 | Send a message | Message appears, delivered via mesh |
| 11 | Switch to Chats tab | Shows thread with last message |
| 12 | Receive message from contact | Thread updates with unread badge |
| 13 | Create group chat | FAB → name → thread appears |
| 14 | Invite contact to group | AppBar person_add → pick contact |
| 15 | Unpair | Me tab → Unpair → confirm → cleared |

## Token Auth Verification

```bash
# Test that unauthenticated clients are gated:
# Connect to ws://localhost:3030/ws without a token and send any RPC
# Expect: { "error": "Authentication required" }

# Test that authenticated clients work:
# Connect to ws://localhost:3030/ws?token=<sessionToken>
# Send getBonds — should succeed
```

## Push Notification Verification

```bash
# Push tokens are logged to console:
# [push] Would send APNs to <token>: New message
# [push] Would send FCM to <token>: New message

# Production setup requires:
# iOS: APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC env vars
# Android: FCM_SERVICE_ACCOUNT_JSON env var
```
