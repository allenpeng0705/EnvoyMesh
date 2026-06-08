# EnvoyGo

Flutter thin client for remote access to an EnvoyMesh home node. Supports iOS, Android, and web.

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

EnvoyGo is a **thin client** — it does not run a libp2p node, generate identity keys, or participate in the mesh. It connects to one home node at a time via secure WebSocket, calls JSON-RPC methods, and renders a minimal, chat-focused UI.

See [docs/flutter-thin-client-design.md](../../docs/flutter-thin-client-design.md) for the full architecture.

## Related

- [EnvoyMesh](../../README.md) — the main project
- [Phase 31 implementation plan](../../docs/implementation-plan.md#phase-31--flutter-thin-client-envoygo-design)
- [Satellite app ADR](../../docs/satellite-app-adr.md)
