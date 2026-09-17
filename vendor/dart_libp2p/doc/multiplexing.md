# Stream Multiplexing

A single connection between two peers can handle multiple independent, concurrent streams of communication. This is achieved through a stream multiplexer, which takes a single connection (like a TCP socket) and splits it into many virtual streams.

This is a crucial feature of libp2p, as it allows different protocols and services to run concurrently between two peers without the overhead of opening a new connection for each one.

## The `Multiplexer` Interface

All stream multiplexers implement the `Multiplexer` interface. After a connection has been secured, the `Upgrader` negotiates a multiplexer and uses it to wrap the secure connection. The result is a `MuxedConn`, which is a `Conn` that can also create and accept new streams.

## Yamux

-   **Protocol ID**: `/yamux/1.0.0`
-   **Implementation**: `YamuxSession`

Yamux is the default stream multiplexer in this libp2p implementation. It is a reliable and efficient multiplexer that provides several key features:

-   **Stream Management**: Create, accept, and close thousands of streams over a single connection.
-   **Flow Control**: Each stream has its own receive window, which prevents a single fast-reading stream from overwhelming a slow-reading one. Peers send `WindowUpdate` frames to let the sender know they are ready for more data.
-   **Keepalives**: Yamux sends periodic ping messages to ensure the connection is still alive, allowing for the detection of dead connections.

### How it Works

Yamux works by breaking all data into frames. Each frame has a header that includes:
-   **Stream ID**: Identifies which stream the frame belongs to.
-   **Type**: The type of frame (e.g., Data, Window Update, New Stream, Ping).
-   **Flags**: Control flags (e.g., `SYN` to start a new stream, `ACK` to acknowledge it, `FIN` to close the write side, `RST` to reset a stream).
-   **Length**: The length of the data payload.

When you write data to a `YamuxStream`, the `YamuxSession` packages it into `Data` frames and sends it over the underlying connection. The receiving `YamuxSession` reads these frames, reassembles the data, and makes it available on the corresponding `YamuxStream`.

### Usage

Yamux is enabled by default when you use the `Libp2p.new_` constructor. You can also configure it manually.

```dart
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';

// Add Yamux to your configuration
final config = [
  Libp2p.muxer(
    '/yamux/1.0.0',
    (conn, isClient) => YamuxSession(conn, MultiplexerConfig(), isClient)
  ),
  // ... other options
];
```

Because it's the default, you often don't need to specify it at all. The library will create and configure it for you. Once a connection is established and upgraded, all `newStream` calls on the `Host` will transparently use the underlying Yamux session to create new streams.
