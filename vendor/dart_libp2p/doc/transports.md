# Transports

Transports are the foundation of the libp2p network stack, providing the mechanism for sending and receiving data over the actual network. They are responsible for establishing connections between peers. Libp2p is transport-agnostic, meaning it can run over any number of underlying transport protocols.

## The `Transport` Interface

All transport implementations in dart-libp2p adhere to the `Transport` interface defined in `lib/p2p/transport/transport.dart`. This ensures that the host can interact with any transport in a consistent way.

### Key Methods

- **`Future<Conn> dial(MultiAddr addr, {Duration? timeout})`**
  - Attempts to establish an outgoing connection to a peer at the given `MultiAddr`. If successful, it returns a `Conn` object representing the raw, un-upgraded connection.

- **`Future<Listener> listen(MultiAddr addr)`**
  - Binds to the given `MultiAddr` and starts listening for incoming connections. It returns a `Listener` object that can be used to accept these connections.

- **`bool canDial(MultiAddr addr)`**
  - Returns `true` if the transport can handle the protocol specified in the given `MultiAddr` for dialing.

- **`List<String> get protocols`**
  - Returns a list of protocol strings that this transport supports (e.g., `/ip4/tcp`).

## Connection Upgrading

When a transport establishes a connection (either through `dial` or `listen`), it returns a raw `TransportConn`. This connection is not yet secure or capable of handling multiple streams. The libp2p `Swarm` then uses an `Upgrader` to layer on security and stream multiplexing.

The upgrade process is as follows:
1.  A raw connection is established by the transport.
2.  A security protocol (like Noise) is negotiated to create a secure channel.
3.  A stream multiplexer (like Yamux) is negotiated over the secure channel.

The final result is a fully upgraded, secure, and multiplexed `Conn` that the `Host` can use to open streams.

## Available Transports

This library currently provides two main transport implementations:

### TCP Transport

-   **Class**: `TcpTransport`
-   **Protocols**: `/ip4/tcp`, `/ip6/tcp`
-   **Description**: The standard TCP transport. It's reliable, widely available, and a good default choice for most applications, especially in data centers or between servers with public IP addresses.

**Usage:**

```dart
import 'package:dart_libp2p/p2p/transport/tcp_transport.dart';

// Add TCP transport to your configuration
final config = [
  Libp2p.transport(TcpTransport()),
  // ... other options
];
```

### UDX Transport

-   **Class**: `UdxTransport`
-   **Protocols**: `/ip4/udp/udx`, `/ip6/udp/udx`
-   **Description**: A custom transport protocol built on top of UDP. UDX provides reliability and multiplexing out-of-the-box and is particularly effective for hole punching, making it excellent for peer-to-peer connections where nodes are behind NATs or firewalls.

**Usage:**

```dart
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';

// Add UDX transport to your configuration
final config = [
  Libp2p.transport(UdxTransport()),
  // ... other options
];
```

You can configure your host to use multiple transports simultaneously. Libp2p will automatically choose the best available transport when connecting to a peer based on the addresses stored in the `Peerstore`.
