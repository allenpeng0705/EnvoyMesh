# Dart LibP2P Examples

This directory contains practical examples demonstrating different aspects of the `dart-libp2p` library. Each example is designed to be educational and showcase real-world usage patterns.

## 📁 Available Examples

### 🔊 [Basic Echo Server](./echo_basic/)
**Difficulty:** Beginner  
**Concepts:** Host creation, direct connections, custom protocols, one-way messaging

A simple echo example that demonstrates one-way messaging between a client and server. Perfect for understanding libp2p fundamentals without bidirectional complexity.

**Key Features:**
- Client-server echo pattern
- Custom echo protocol (`/echo/1.0.0`)
- One-way stream communication
- Clear separation of sender/receiver roles
- Clean host setup and teardown

**Best for:** Learning libp2p basics, understanding protocols and streams

### 🌐 [mDNS P2P Chat](./chat_mdns/)
**Difficulty:** Intermediate  
**Concepts:** mDNS discovery, multi-peer networking, interactive applications

An advanced chat application that uses mDNS (Multicast DNS) to automatically discover peers on the local network. Supports chatting with multiple discovered peers. Includes a localhost fallback for development/testing.

**Key Features:**
- Automatic peer discovery via mDNS
- **Localhost fallback discovery** (UDP broadcast when mDNS fails)
- Multi-peer support
- Interactive command-line interface  
- Real-world networking scenarios
- Robust connection management
- Extensive debugging output

**Best for:** Understanding peer discovery, building production-ready P2P apps

## 🚀 Quick Start

### Running the Basic Echo Example

```bash
# From project root
dart run example/echo_basic/main.dart
```

### Running the mDNS Chat Example

```bash
# Terminal 1
dart run example/chat_mdns/main.dart

# Terminal 2 (to see peer discovery in action)  
dart run example/chat_mdns/main.dart
```

## 🛠 Common Dependencies

All examples use the shared utilities in [`shared/host_utils.dart`](./shared/host_utils.dart), which provides:

- **`createHost()`**: Creates a libp2p host with UDX transport and Noise security
- **`createHostWithRandomPort()`**: Creates a host listening on a random port
- **`truncatePeerId()`**: Helper for displaying shortened peer IDs

## 📋 Prerequisites

### System Requirements

- **Dart SDK**: 3.0 or higher
- **Network**: For mDNS examples, all instances should be on the same local network

### Dependencies

The examples use these core `dart-libp2p` features:

- **UDX Transport**: UDP-based networking transport
- **Noise Security**: Encrypted and authenticated connections
- **Ed25519 Keys**: Cryptographic keys for peer identity
- **mDNS Discovery**: Local network peer discovery (mDNS example only)

## 🏗 Architecture Overview

Both examples follow similar patterns:

### Host Creation
```dart
final host = await createHostWithRandomPort();
```

All examples use the same host setup:
- Ed25519 cryptographic keys
- UDX transport for UDP networking
- Noise protocol for security
- Connection manager for peer management

### Protocol Handling
```dart
host.setStreamHandler('/chat/1.0.0', handleIncomingMessage);
```

Custom protocols are implemented using stream handlers that process incoming connections.

### Message Exchange
```dart
final stream = await host.newStream(targetPeer, ['/chat/1.0.0']);
await stream.write(utf8.encode(message));
```

Messages are sent by opening streams to target peers and writing data.

## 🎯 Learning Path

We recommend exploring the examples in this order:

1. **[Basic Echo](./echo_basic/)** - Learn libp2p fundamentals
   - Host creation and configuration
   - Direct peer connections
   - Custom protocol implementation
   - One-way stream communication
   - Client-server patterns

2. **[mDNS Chat](./chat_mdns/)** - Advanced networking concepts
   - Automatic peer discovery
   - Multi-peer applications
   - Bidirectional communication
   - Real-world networking scenarios
   - Interactive user interfaces

## 🔍 Key Concepts Demonstrated

| Concept | Basic Echo | mDNS Chat |
|---------|:----------:|:---------:|
| Host Creation | ✅ | ✅ |
| Direct Connections | ✅ | ✅ |
| Custom Protocols | ✅ | ✅ |
| Stream Communication | ✅ | ✅ |
| One-Way Messaging | ✅ | ❌ |
| Bidirectional Chat | ❌ | ✅ |
| Peer Discovery | ❌ | ✅ |
| Multi-Peer Support | ❌ | ✅ |
| mDNS Integration | ❌ | ✅ |
| Interactive UI | ❌ | ✅ |

## 🐛 Troubleshooting

### Common Issues

**"No route to host" errors:**
- Check firewall settings
- Ensure UDP traffic is allowed
- Try running on the same machine first

**mDNS discovery not working:**
- Verify all peers are on the same network
- Check that multicast is enabled
- Some corporate networks block mDNS

**Compilation errors:**
- Ensure you're running from the project root directory
- Check that all dependencies are properly installed
- Verify Dart SDK version compatibility

### Getting Help

- Check the individual README files in each example directory
- Review the [main documentation](../doc/)
- Look at the [test files](../test/) for additional usage patterns

## 🤝 Contributing

Found a bug or have an idea for a new example? Contributions are welcome!

- Examples should be educational and demonstrate real-world usage
- Include comprehensive README files with setup instructions
- Follow the existing code style and patterns
- Test thoroughly on different platforms

## 📚 Further Reading

- [LibP2P Documentation](../doc/)
- [Cookbook](../doc/cookbook.md) - Additional recipes and patterns
- [Getting Started Guide](../doc/getting-started.md)
- [Test Examples](../test/) - More advanced usage patterns
