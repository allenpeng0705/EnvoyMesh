# CLAUDE.md - Dart LibP2P Project Guide
## Project Overview
**dart-libp2p** is a comprehensive Dart implementation of the libp2p networking stack for building peer-to-peer applications. Dart SDK 3.5.0+, version 0.5.4, MIT licensed.
## Key Commands

```bash
# Install dependencies
dart pub get

# Run tests
dart test                              # All tests
dart test test/crypto/                 # Specific directory
dart test test/crypto/ed25519_test.dart # Specific file

# Format and analyze
dart format lib/ test/ example/
dart analyze

# Generate protobuf code
dart run build_runner build

# Run examples
dart run example/echo_basic/main.dart
dart run example/chat_mdns/main.dart
dart run bin/ping_app.dart
```

## Directory Structure
```
lib/
├── config/          # Configuration system (Config, defaults)
├── core/            # Core interfaces and abstractions
│   ├── connmgr/     # Connection manager interface
│   ├── crypto/      # Cryptography (Ed25519, RSA, ECDSA)
│   ├── event/       # Event bus system
│   ├── host/        # Host interface
│   ├── network/     # Network interfaces (Conn, Stream, Mux)
│   ├── peer/        # Peer ID and peer records
│   ├── protocol/    # Protocol handling
│   └── routing/     # Routing interfaces
├── p2p/             # P2P implementations
│   ├── crypto/      # Key generation, protobuf
│   ├── discovery/   # mDNS, routing-based discovery
│   ├── host/        # BasicHost, AutoNAT, AutoRelay, peerstore
│   ├── nat/         # NAT detection and STUN
│   ├── network/     # Swarm implementation
│   ├── protocol/    # Identify, Ping, CircuitV2, HolePunch
│   ├── security/    # Noise protocol
│   └── transport/   # TCP, UDX transports, Yamux multiplexer
├── pb/              # Protobuf definitions
├── utils/           # Utility functions
└── dart_libp2p.dart # Main entry point

test/                # Test suite (mirrors lib/ structure)
example/             # Working examples (echo_basic, chat_mdns)
doc/                 # Comprehensive documentation

```

## Architecture
```
┌─────────────────────────────────┐
│    Your Application             │
├─────────────────────────────────┤
│    Host Interface               │
├─────────────────────────────────┤
│    Network / Swarm              │
├─────────────────────────────────┤
│    Upgrader                     │
├─────────────────────────────────┤
│ Multiplexer (Yamux) | Security  │
│                     | (Noise)   │
├─────────────────────────────────┤
│    Transport (TCP, UDX)         │
└─────────────────────────────────┘

```
### Key Components
- **Host** (`lib/core/host/host.dart`) - Central entry point, manages connections and protocols
- **Network/Swarm** (`lib/p2p/network/swarm/`) - Manages peer connections and lifecycle
- **Upgrader** (`lib/p2p/transport/basic_upgrader.dart`) - Upgrades raw connections to secure, multiplexed
- **Transports** - TCP (`tcp_transport.dart`), UDX (`udx_transport.dart`)
- **Security** - Noise protocol (`lib/p2p/security/noise/`)
- **Multiplexing** - Yamux (`lib/p2p/transport/multiplexing/yamux/`)
- **Peerstore** (`lib/p2p/host/peerstore/`) - Stores peer addresses and protocol support
- **Event Bus** (`lib/p2p/host/eventbus/`) - System-wide event publishing

### Configuration Pattern
```dart
final host = await Libp2p.new_([
  Libp2p.identity(keyPair),
  Libp2p.listenAddrs([MultiAddr('/ip4/0.0.0.0/tcp/0')]),
  Libp2p.transport(TcpTransport()),
  Libp2p.security(await NoiseSecurity.create(keyPair)),
  Libp2p.muxer(YamuxMultiplexer()),
]);
```

### Protocol Handler Pattern
```dart
host.setStreamHandler('/myprotocol/1.0.0', (stream) async {
  final data = await stream.read(1024);
  await stream.write(processData(data));
  await stream.close();
});

```

## Code Style
### Naming
- **Classes**: PascalCase (`BasicHost`, `NoiseSecurity`)
- **Functions/Methods**: camelCase (`connect()`, `newStream()`)
- **Constants**: camelCase (`protocolString`, `maxFrameSize`)
- **Private**: underscore prefix (`_log`, `_createNetwork()`)

### Documentation
- Public API: `///` doc comments
- Implementation details: `//` regular comments
- Parameters referenced with `[paramName]`

### Logging

```dart
import 'package:logging/logging.dart';
final _log = Logger('ComponentName');
_log.fine('Debug');
_log.info('Info');
_log.warning('Warning');
_log.severe('Error: $error');
```

### Testing
```dart
import 'package:test/test.dart';
void main() {
  group('ComponentName', () {
    test('specific behavior', () async {
      // Arrange, Act, Assert

      expect(result, expected);

    });
  });
}

```
## Protocols
- **Identify** - Peer capability advertisement
- **Ping** - Connectivity testing
- **AutoNAT/AutoNATv2** - NAT detection
- **AutoRelay** - Automatic relay discovery
- **Circuit Relay v2** - NAT traversal via relay
- **Hole Punching** - Direct connection through NAT
- **mDNS** - Local network discovery

## Key Files

- `lib/dart_libp2p.dart` - Main exports
- `lib/config/config.dart` - Configuration system
- `lib/core/host/host.dart` - Host interface
- `lib/p2p/host/basic/basic_host.dart` - Main Host implementation
- `lib/p2p/network/swarm/swarm.dart` - Swarm/Network implementation
- `pubspec.yaml` - Package configuration
- `doc/` - Comprehensive documentation

# Issue Tracking

This project uses **bd (beads)** for issue tracking.
Run `bd prime` for workflow context, or install hooks (`bd hooks install`) for auto-injection.

**Quick reference:**
- `bd ready` - Find unblocked work
- `bd create "Title" --type task --priority 2` - Create issue
- `bd close <id>` - Complete work
- `bd sync` - Sync with git (run at session end)

For full workflow details: `bd prime`
