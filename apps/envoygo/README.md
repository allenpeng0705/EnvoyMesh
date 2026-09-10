# EnvoyGo

Flutter thin client for remote access to an EnvoyMesh home node. Supports iOS, Android, and web.

## Pairing is required

EnvoyGo is the phone companion for a computer running EnvoyMesh: chat, content,
files, terminal, knowledge and coding all execute on that home node. So with the
mobile node off (the default) the app is **pair-gated**:

- the welcome slides end on a "Pairing is required" slide
- the setup guide is the app entry on first launch, with **Pair now** as the
  primary action and **Pair later** as the escape hatch
- "Pair later" opens the app shell exactly as before — every feature then shows
  its own pairing CTA — and is remembered, so the gate does not reappear
- the gate is driven by node state (paired ⇒ straight to the shell), so it
  disappears the moment pairing succeeds

`lib/services/onboarding_gate.dart` holds the rule; flip the mobile node flag on
to allow unpaired use again.

## Feature flags

### Mobile node (off by default)

The **mobile node** is the on-device phone persona: its own mesh identity, LAN/WAN
discovery, and phone-plane direct chat with other phones. It is **disabled by
default** while it is still being evaluated — in practice it currently only buys
unpaired chatting, and everything else in the app runs against the home node.

While it is off, the phone:

- does **not** load or mint a phone identity, and does not open the phone store/DB
- does **not** start the libp2p host (unless a home node is paired, which needs it)
- shows no phone-plane UI: no cell-tower indicator, no "On this phone" contact or
  chat sections, no cross-persona "say hello on your phone" suggestions, and
  Discover shows the pairing CTA instead of mesh search
- skips the onboarding profile step (that step configures the phone persona)

Nothing is deleted. Identity, contacts and DM history stay on disk and reappear
when the flag is turned back on.

```bash
# Default-on build (e.g. for investigation)
flutter run --dart-define=ENVOYGO_MOBILE_NODE=1

# Same, plus the in-app switch (Me → Settings → "Mobile node on this phone")
flutter run --dart-define=ENVOYGO_MOBILE_NODE=1 \
            --dart-define=ENVOYGO_MOBILE_NODE_TOGGLE=1
```

The in-app switch is hidden unless `ENVOYGO_MOBILE_NODE_TOGGLE=1` is set, so a
release build has no user-visible entry for an unfinished plane. See
`lib/services/feature_flags.dart`.

## Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| iOS | ✅ | QR scanning, push (APNs), secure storage (Keychain) |
| Android | ✅ | QR scanning, push (FCM), secure storage (EncryptedSharedPreferences) |
| Web | ✅ | Chat, contacts, and terminal viewing. QR scanning and push notifications are mobile-only. |

## Quick Start

```bash
# Install dependencies
cd apps/envoygo
flutter pub get

# Run on a connected device or emulator
flutter run

# Run on web
flutter run -d chrome
```

## Build

```bash
# Android APK (debug)
flutter build apk --debug

# iOS (debug, no code signing)
flutter build ios --debug --no-codesign

# Web
flutter build web
```

## Android FCM (optional)

Dart push code is already wired. To enable Android alert push:

1. In Firebase Console, add an Android app with package
   **`com.envoymesh.envoygo`**
2. Download `google-services.json` →
   `apps/envoygo/android/app/google-services.json`
3. Rebuild — the Google Services Gradle plugin applies automatically
   when that file is present
4. On the home node, set `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT_JSON`
   (see `docs/push-notification-config.md`)

Without the JSON file, Android builds still succeed and FCM init is a
silent no-op.

## Project Structure

```
lib/
├── main.dart                    # App entry, Riverpod ProviderScope
├── app.dart                     # MaterialApp, Material 3 theme
├── models/                      # Data classes
│   ├── json_rpc.dart            # JsonRpcRequest, JsonRpcResponse, JsonRpcEvent
│   ├── stored_node.dart         # Paired home node
│   ├── contact.dart             # Bonded contact
│   ├── chat_thread.dart         # Chat thread (any type)
│   ├── chat_message.dart        # Chat message
│   ├── chat_room.dart           # Group chat room
│   └── terminal_session.dart    # Terminal session
├── services/                    # Business logic
│   ├── home_remote_client.dart  # Transport-agnostic WS client
│   ├── candidate_resolver.dart  # Transport URL builder
│   ├── node_service_client.dart # Typed RPC wrappers
│   ├── pairing_service.dart     # QR scan → pairing
│   └── terminal_service.dart    # PTY tunnel
├── storage/                     # Persistence
│   ├── secure_storage.dart      # Session tokens
│   └── local_database.dart      # SQLite cache
├── providers/                   # Riverpod state
│   ├── node_provider.dart       # Active node, connection state
│   ├── chat_provider.dart       # Threads, messages
│   ├── contact_provider.dart    # Bonds, profiles
│   └── terminal_provider.dart   # Terminal sessions
├── screens/                     # Full-screen views
│   ├── home_screen.dart         # 3-tab scaffold
│   ├── pairing/                 # QR scan + confirm
│   ├── chat/                    # Thread list + detail
│   ├── contacts/                # Contact list
│   ├── terminals/               # Terminal list + detail
│   └── me/                      # Profile + node management
└── widgets/                     # Reusable components
    ├── chat_bubble.dart
    ├── contact_tile.dart
    ├── thread_tile.dart
    ├── terminal_widget.dart
    ├── connection_indicator.dart
    └── node_status_badge.dart
```

## Architecture

EnvoyGo is a **Level-2** mobile app ([SDK tiers](../../packages/README-mobile-sdk.md)):

1. **Home** — thin client (`envoy_thin_client`): pair to a home node, JSON-RPC for Social / terminals / vault / …
2. **On this phone** — separate social-lite persona (`envoy_mesh` + `envoy_mesh_libp2p`): own Envoy keys, shared libp2p host, foreground WAN/LAN discovery

The two personas never auto-merge bonds or chats. See [ADR-0002](../../docs/adr/0002-envoygo-social-lite-dual-persona.md).

## Related

- [Mobile SDK (L1 / L2)](../../packages/README-mobile-sdk.md)
- [EnvoyMesh](../../README.md) — the main project
- [Satellite app ADR](../../docs/satellite-app-adr.md)
- [Wire compat](../../docs/envoygo-social-lite-wire-compat.md)
