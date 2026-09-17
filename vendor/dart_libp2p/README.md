# Dart Libp2p

[![Dart](https://img.shields.io/badge/Dart-3.5+-blue.svg)](https://dart.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A comprehensive Dart implementation of the [libp2p](https://libp2p.io/) networking stack, providing a modular and extensible foundation for building peer-to-peer applications.

## 🚀 Features

- **Modular Architecture**: Pluggable transports, security protocols, and stream multiplexers
- **Multiple Transports**: TCP and custom UDX (UDP-based) transport support
- **Security**: Noise protocol for encrypted and authenticated connections
- **Stream Multiplexing**: Yamux for efficient multi-stream communication
- **Peer Discovery**: mDNS and routing-based peer discovery mechanisms
- **Protocol Support**: Built-in support for Ping, Identify, and other core libp2p protocols
- **Resource Management**: Built-in protection against resource exhaustion
- **Event System**: Comprehensive event bus for monitoring network activity
- **NAT Traversal**: Hole punching and relay support for NAT traversal

## 📦 Installation

Add `dart_libp2p` to your `pubspec.yaml`:

```yaml
dependencies:
  dart_libp2p: ^0.5.2
```

Then run:

```bash
dart pub get
```

## 🏃‍♂️ Quick Start

Here's a simple example of creating two libp2p nodes and connecting them:

```dart
import 'package:dart_libp2p/dart_libp2p.dart';
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart' as p2p_conn_manager;
import 'package:dart_udx/dart_udx.dart';

Future<Host> createHost({String? listen}) async {
  final keyPair = await crypto_ed25519.generateEd25519KeyPair();
  final udx = UDX();
  final connMgr = p2p_conn_manager.ConnectionManager();

  final options = <p2p_config.Option>[
    p2p_config.Libp2p.identity(keyPair),
    p2p_config.Libp2p.connManager(connMgr),
    p2p_config.Libp2p.transport(UDXTransport(connManager: connMgr, udxInstance: udx)),
    p2p_config.Libp2p.security(await NoiseSecurity.create(keyPair)),
    if (listen != null) p2p_config.Libp2p.listenAddrs([MultiAddr(listen)]),
  ];

  final host = await p2p_config.Libp2p.new_(options);
  await host.start();
  return host;
}

void main() async {
  final host1 = await createHost(listen: '/ip4/0.0.0.0/udp/0/udx');
  final host2 = await createHost(listen: '/ip4/0.0.0.0/udp/0/udx');

  print('Host 1: ${host1.id}');
  print('Host 2: ${host2.id}');

  await host1.connect(AddrInfo(host2.id, host2.addrs));
  print('Connected successfully!');

  await host1.close();
  await host2.close();
}
```

## 🏗️ Architecture

Dart Libp2p follows a layered architecture where each component provides services to the layer above it:

```
┌─────────────────────────────────────┐
│           Application               │
│        (Your Custom Protocols)      │
├─────────────────────────────────────┤
│              Host                   │
├─────────────────────────────────────┤
│           Network/Swarm             │
├─────────────────────────────────────┤
│            Upgrader                 │
├─────────────────────────────────────┤
│  Multiplexer (Yamux) │ Security     │
│                      │ (Noise)      │
├─────────────────────────────────────┤
│           Transport                 │
│        (TCP, UDX)                   │
└─────────────────────────────────────┘
```

### Core Components

- **Host**: Central entry point that ties all components together
- **Network/Swarm**: Manages connections, peers, and upgrade lifecycle
- **Upgrader**: Handles security and multiplexing negotiation
- **Transport**: Establishes raw connections (TCP, UDX)
- **Security**: Encrypts and authenticates connections (Noise)
- **Multiplexer**: Enables multiple streams over single connections (Yamux)

## 🚛 Transports

### TCP Transport
- **Protocols**: `/ip4/tcp`, `/ip6/tcp`
- **Use Case**: Reliable, widely available transport for most applications
- **Best For**: Data centers, servers with public IPs

### UDX Transport
- **Protocols**: `/ip4/udp/udx`, `/ip6/udp/udx`
- **Use Case**: Custom UDP-based transport with built-in reliability
- **Best For**: NAT traversal, hole punching, peer-to-peer connections

> **Note**: This implementation does not support QUIC. Instead, we've opted for a custom `dart-udx` implementation that provides similar benefits for peer-to-peer networking.

## 🔐 Security

Dart Libp2p uses the Noise protocol for securing connections:

- **Encryption**: All communication is encrypted
- **Authentication**: Remote peer identity is verified
- **Perfect Forward Secrecy**: Session keys are ephemeral
- **Handshake**: Efficient key exchange and authentication

## 📚 Documentation

For detailed documentation, visit the [docs](./doc/) directory:

- **[Getting Started](./doc/getting-started.md)**: Step-by-step setup guide
- **[Architecture](./doc/architecture.md)**: Detailed architecture overview
- **[Configuration](./doc/configuration.md)**: Configuration options
- **[Host](./doc/host.md)**: Host component documentation
- **[Transports](./doc/transports.md)**: Transport layer details
- **[Security](./doc/security.md)**: Security protocol information
- **[Multiplexing](./doc/multiplexing.md)**: Stream multiplexing
- **[Protocols](./doc/protocols.md)**: Built-in protocol documentation
- **[Peerstore](./doc/peerstore.md)**: Peer information management
- **[Event Bus](./doc/event-bus.md)**: Event system documentation
- **[Resource Manager](./doc/resource-manager.md)**: Resource protection
- **[Cookbook](./doc/cookbook.md)**: Practical examples and recipes

## 🧪 Examples

Check out the [examples](./example/) directory for working examples:

| Example | Type | Description | Key Features |
|---------|------|-------------|--------------|
| **[echo_basic](./example/echo_basic/)** | Basic | Simple echo server/client | One-way messaging, connection basics |
| **[chat_mdns](./example/chat_mdns/)** | Advanced | mDNS-enabled P2P chat | **mDNS discovery**, multi-peer chat, zero-config networking |

### Featured Example: mDNS Chat

The `chat_mdns` example demonstrates **mDNS service discovery** using the `mdns_dart` package:
- ✅ **Real mDNS service advertisement** (not fake lookup calls)  
- ✅ **Actual network-level discovery** (broadcasts to 224.0.0.251:5353)  
- ✅ **Zero-configuration networking** (no fallback mechanisms needed)  
- ✅ **Cross-subnet support** (works beyond localhost)  

Run multiple instances to see real peer discovery in action:
```bash
# Terminal 1
dart run example/chat_mdns/main.dart

# Terminal 2  
dart run example/chat_mdns/main.dart
```

## 🧪 Testing

Run the test suite:

```bash
dart test
```

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines and code of conduct.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [libp2p](https://libp2p.io/) - The original protocol specification
- [dart-udx](https://pub.dev/packages/dart_udx) - Custom UDP transport implementation  
- [mdns_dart](https://pub.dev/packages/mdns_dart) - mDNS service advertisement and discovery
- The libp2p community for inspiration and guidance

## 🔗 Links

- [libp2p.io](https://libp2p.io/) - Official libp2p documentation
- [Dart](https://dart.dev/) - Dart programming language
- [pub.dev](https://pub.dev/packages/dart_libp2p) - Package on pub.dev 
