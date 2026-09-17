# Getting Started with Dart Libp2p

This guide will walk you through the process of setting up two libp2p nodes, connecting them, and sending a message using the Ping protocol.

## 1. Project Setup

First, ensure you have a Dart project set up. Add `dart_libp2p` to your `pubspec.yaml`:

```yaml
dependencies:
  dart_libp2p: ^latest
```

## 2. Creating a Libp2p Host

A `Host` is the central object in libp2p, representing a single peer in the network. Here's how to create one. We'll use the `Libp2p.new_` convenience method, which simplifies the configuration process.

```dart
import 'package:dart_libp2p/dart_libp2p.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/tcp_transport.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';

Future<Host> createHost() async {
  // Generate a key pair for this node.
  final keyPair = await generateKeyPair();

  // Create a new libp2p host.
  final host = await Libp2p.new_([
    // Set the identity (private key)
    Libp2p.identity(keyPair),

    // Set the listen addresses
    Libp2p.listenAddrs([
      await Multiaddr.fromString('/ip4/127.0.0.1/tcp/0'),
    ]),

    // Set the transport
    Libp2p.transport(TcpTransport()),

    // Set the security protocol
    Libp2p.security(NoiseSecurityProtocol()),

    // Set the stream multiplexer
    Libp2p.muxer('/yamux/1.0.0', (conn, isClient) => YamuxSession(conn, MultiplexerConfig(), isClient)),
  ]);

  return host;
}
```

## 3. Connecting Two Nodes

Now, let's create two hosts and have one connect to the other.

```dart
import 'package:dart_libp2p/core/peer/addr_info.dart';

void main() async {
  // Create two hosts.
  final host1 = await createHost();
  final host2 = await createHost();

  print('Host 1 Peer ID: ${host1.peerId}');
  print('Host 1 Listen Addrs: ${host1.addrs}');
  print('Host 2 Peer ID: ${host2.peerId}');
  print('Host 2 Listen Addrs: ${host2.addrs}');

  // To connect, host1 needs to know host2's PeerId and listen address.
  final serverAddrInfo = AddrInfo(host2.peerId, host2.addrs);

  // Connect host1 to host2
  await host1.connect(serverAddrInfo);
  print('Host 1 connected to Host 2 successfully!');

  // ... now you can open streams and exchange data.

  // Clean up
  await host1.close();
  await host2.close();
}
```

## 4. Sending Data with the Ping Protocol

Libp2p uses protocols to define how peers communicate. The Ping protocol is a simple way to check connectivity and measure latency.

The `PingService` is automatically started by the `BasicHost` by default. You can use it to ping another peer.

```dart
import 'package:dart_libp2p/p2p/protocol/ping/ping.dart';

void main() async {
  final host1 = await createHost();
  final host2 = await createHost();

  final serverAddrInfo = AddrInfo(host2.peerId, host2.addrs);
  await host1.connect(serverAddrInfo);

  // Get the PingService from the host
  final pingService = host1.services[PingConstants.protocolId] as PingService;

  // Ping the other peer
  final result = await pingService.ping(host2.peerId);

  if (result.isSuccess) {
    print('Ping successful! RTT: ${result.rtt}');
  } else {
    print('Ping failed: ${result.error}');
  }

  await host1.close();
  await host2.close();
}
```

This example demonstrates the fundamental workflow of creating nodes, connecting them, and using a protocol to communicate. From here, you can explore more complex protocols and build sophisticated peer-to-peer applications.
