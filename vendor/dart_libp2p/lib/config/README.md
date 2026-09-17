# Dart-libp2p Configuration System

This directory contains the configuration system for the Dart implementation of libp2p. It is modeled after the Go implementation's configuration system, but uses Dart's extension functions for a more idiomatic Dart API.

## Overview

The configuration system provides a flexible and extensible way to configure libp2p nodes. It uses a functional options pattern, which allows for flexible and readable configuration.

## Key Components

### Config Class

The `Config` class is the central component that holds all configuration options:

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

  // ...
}
```

### Option Type

An `Option` is defined as a function that takes a Config and returns a FutureOr<void>:

```dart
typedef Option = FutureOr<void> Function(Config config);
```

### Extension Methods

The `ConfigOptions` extension provides methods for applying different options to a Config:

```dart
extension ConfigOptions on Config {
  Future<void> withListenAddrs(List<Multiaddr> addrs) async {
    listenAddrs.addAll(addrs);
  }

  Future<void> withSecurity(SecurityProtocol securityProtocol) async {
    if (insecure) {
      throw Exception('Cannot use security protocols with an insecure configuration');
    }
    securityProtocols.add(securityProtocol);
  }

  // ...
}
```

### Factory Functions

The `Libp2p` class provides factory functions for creating options:

```dart
class Libp2p {
  static Option listenAddrs(List<Multiaddr> addrs) {
    return (config) => config.withListenAddrs(addrs);
  }

  static Option security(SecurityProtocol securityProtocol) {
    return (config) => config.withSecurity(securityProtocol);
  }

  // ...
}
```

## Usage

There are two ways to use the configuration system:

### Method 1: Using the convenience method

```dart
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

// Start the host
await host.start();
```

### Method 2: Creating a Config and applying options (recommended)

This method follows the pattern used in the Go implementation:

```dart
// Step 1: Create a new Config
final config = Libp2p.newConfig();

// Step 2: Apply configuration options to the Config
await config.apply([
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

// Apply defaults for any options that weren't specified
await applyDefaults(config);

// Step 3: Create a new Host from the Config
final host = await config.newNode();

// Start the host
await host.start();
```

## Default Options

The configuration system includes default options that are applied if the user doesn't specify certain options. These defaults are defined in the `defaults.dart` file.

## Extending the Configuration System

To add new configuration options:

1. Add a new field to the `Config` class
2. Add a new extension method to the `ConfigOptions` extension
3. Add a new factory function to the `Libp2p` class
4. Update the `_validate` method in the `Config` class if necessary
5. Update the `applyDefaults` function in the `defaults.dart` file if necessary
