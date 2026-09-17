# Configuration

The configuration system for dart-libp2p provides a flexible and extensible way to configure your libp2p node. It is modeled after the Go implementation's configuration system but uses Dart's extension methods for a more idiomatic API.

## Overview

The system uses a functional options pattern. You start with a `Config` object and apply various `Option` functions to it. An `Option` is simply a function that modifies the `Config` object.

## Key Components

### The `Config` Class

The `Config` class is the central component that holds all configuration options for a libp2p node.

```dart
class Config {
  String? userAgent;
  String? protocolVersion;
  KeyPair? peerKey;
  List<Transport> transports = [];
  List<SecurityProtocol> securityProtocols = [];
  bool insecure = false;
  List<Multiaddr> listenAddrs = [];
  List<StreamMuxer> muxers = [];

  // ... and many other options
}
```

### The `Option` Type

An `Option` is a function that takes a `Config` object and applies a setting to it.

```dart
typedef Option = FutureOr<void> Function(Config config);
```

### The `Libp2p` Factory Class

The `Libp2p` class provides a set of static factory methods for creating `Option` functions. This is the primary way you will specify your configuration.

```dart
class Libp2p {
  static Option listenAddrs(List<Multiaddr> addrs) { ... }
  static Option security(SecurityProtocol securityProtocol) { ... }
  static Option transport(Transport transport) { ... }
  static Option identity(KeyPair keyPair) { ... }
  // ... and so on
}
```

## Usage

There are two primary ways to configure and create a libp2p host.

### Method 1: Using the `Libp2p.new_` convenience method

This is the simplest way to get a host running. It creates a `Config` object, applies your options, adds sensible defaults for any unspecified options, and returns a new `Host`.

```dart
import 'package:dart_libp2p/dart_libp2p.dart';

final host = await Libp2p.new_([
  // Set the identity (private key)
  Libp2p.identity(await generateKeyPair()),

  // Set the listen addresses
  Libp2p.listenAddrs([
    await Multiaddr.fromString('/ip4/127.0.0.1/tcp/9000'),
  ]),

  // Set the transport
  Libp2p.transport(TcpTransport()),

  // Set the security protocol
  Libp2p.security(NoiseSecurityProtocol()),

  // Set the stream multiplexer
  Libp2p.muxer('/yamux/1.0.0', () => YamuxMultiplexer()),

  // Set the user agent
  Libp2p.userAgent('my-libp2p-node/1.0.0'),
]);

// Start the host to begin listening for connections
await host.start();
```

### Method 2: Manually creating and applying a `Config`

This method gives you more control over the configuration process and follows the pattern used in go-libp2p.

```dart
import 'package:dart_libp2p/dart_libp2p.dart';
import 'package:dart_libp2p/config/defaults.dart';

// Step 1: Create a new Config
final config = Libp2p.newConfig();

// Step 2: Apply configuration options to the Config
await config.apply([
  Libp2p.identity(await generateKeyPair()),
  Libp2p.listenAddrs([
    await Multiaddr.fromString('/ip4/127.0.0.1/tcp/9000'),
  ]),
  Libp2p.transport(TcpTransport()),
  Libp2p.security(NoiseSecurityProtocol()),
  Libp2p.muxer('/yamux/1.0.0', () => YamuxMultiplexer()),
]);

// Step 3: Apply defaults for any options that weren't specified
await applyDefaults(config);

// Step 4: Create a new Host from the Config
final host = await config.newNode();

// Start the host
await host.start();
```

## Default Options

If you don't specify certain options, the library will apply sensible defaults. These are defined in the `lib/config/defaults.dart` file and include:

- **Identity**: An Ed25519 key pair is generated if not provided.
- **Security**: The Noise protocol is used by default.
- **Multiplexer**: Yamux (`/yamux/1.0.0`) is used by default.
- **Services**: Core services like `Identify` and `Ping` are enabled by default.

You must, however, specify at least one **Transport** and one **Listen Address** to create a functional node.

## Extending the Configuration

You can add your own custom options by following the established pattern:
1.  Add a new field to the `Config` class.
2.  Add a new extension method to the `ConfigOptions` extension.
3.  Add a new factory function to the `Libp2p` class.
