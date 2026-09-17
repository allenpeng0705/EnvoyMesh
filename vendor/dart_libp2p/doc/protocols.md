# Core Protocols

Libp2p is a modular system built from a collection of protocols. Each protocol defines a set of rules for exchanging information to accomplish a specific task. This page documents some of the core protocols included in dart-libp2p.

## Ping

-   **Protocol ID**: `/ipfs/ping/1.0.0`
-   **Service**: `PingService`

The Ping protocol is one of the simplest and most fundamental protocols. It is used to check the connectivity between two peers and measure the round-trip time (RTT) or latency of the connection.

### How it Works

1.  **Initiator**: The initiating peer (the "pinger") opens a new stream to the target peer with the protocol ID `/ipfs/ping/1.0.0`.
2.  **Pinger**: The pinger generates 32 bytes of random data and sends it over the stream.
3.  **Receiver**: The receiving peer reads the 32 bytes of data.
4.  **Receiver**: The receiver immediately writes the exact same 32 bytes back to the stream (this is the "pong").
5.  **Pinger**: The pinger reads the 32-byte response and verifies that it matches the data originally sent. The time elapsed between sending the ping and receiving the pong is the RTT.

This process can be repeated over the same stream to get multiple latency measurements.

### Usage

The `PingService` is enabled by default on the `BasicHost`. You can access it to ping other peers.

```dart
import 'package:dart_libp2p/p2p/protocol/ping/ping.dart';

// Assuming 'host' is your initialized Host and you are connected to 'remotePeerId'
final pingService = host.services[PingConstants.protocolId] as PingService;

// The ping method returns a stream of results
final pingStream = pingService.ping(remotePeerId);

await for (final result in pingStream) {
  if (result.hasError) {
    print('Ping failed: ${result.error}');
    break;
  } else {
    print('Pong received! RTT: ${result.rtt}');
  }
}
```

The `PingService` also automatically handles incoming ping requests by setting a stream handler on the host.

## Identify

-   **Protocol ID**: `/ipfs/id/1.0.0`
-   **Service**: `IdentifyService`

The Identify protocol is crucial for the discovery and compatibility-checking of peers. When two peers connect, they automatically use the Identify protocol to exchange information about themselves.

### How it Works

1.  When a new connection is established, the initiator opens a stream to the other peer with the protocol ID `/ipfs/id/1.0.0`.
2.  The peers exchange `Identify` protobuf messages containing:
    -   **`publicKey`**: The peer's public key.
    -   **`listenAddrs`**: The addresses the peer is listening on.
    -   **`observedAddr`**: The address of the connecting peer as seen by the listening peer. This is very useful for NAT traversal.
    -   **`protocols`**: A list of protocol IDs that the peer supports.
    -   **`protocolVersion`** and **`agentVersion`**: Version strings for the libp2p implementation and the client application.

### Usage

The `IdentifyService` is enabled by default on the `BasicHost` and runs automatically. You do not need to interact with it directly. When you connect to a peer, the Identify protocol will run in the background. The information gathered is automatically added to the `Peerstore`.

You can inspect the `Peerstore` to see the results:

```dart
// After connecting to a peer...
final supportedProtocols = await host.peerStore.getProtocols(remotePeerId);
print('Remote peer supports: $supportedProtocols');

final listenAddrs = await host.peerStore.getAddrs(remotePeerId);
print('Remote peer is listening on: $listenAddrs');

## HTTP

-   **Protocol ID**: `/p2p/http/1.0.0`
-   **Service**: `HttpProtocolService`

This library includes a protocol that emulates HTTP/1.1, allowing you to build familiar client-server style APIs over libp2p streams. This is extremely useful for creating request/response interactions between peers.

### How it Works

The HTTP protocol service works by mapping traditional HTTP concepts to the libp2p stack:

-   **Server**: You create an `HttpProtocolService` instance and attach it to your `Host`. You can then define routes (e.g., `GET /users/:id`) and provide handlers for them.
-   **Client**: You use the same `HttpProtocolService` instance to make requests to other peers.
-   **Transport**: Instead of sending requests over a standard TCP socket, the service serializes the HTTP request (request line, headers, and body) and sends it over a libp2p `P2PStream` to the target peer using the `/p2p/http/1.0.0` protocol ID.
-   **Response**: The receiving peer's `HttpProtocolService` parses the incoming request, routes it to the correct handler, and sends the serialized HTTP response back over the same stream.

### Usage

This protocol provides a powerful way to build complex APIs between your peers.

#### Creating an HTTP Server

```dart
import 'package:dart_libp2p/p2p/protocol/http/http_protocol.dart';

// Assuming 'myHost' is your initialized Host
final httpServer = HttpProtocolService(myHost);

// Define a GET route
httpServer.get('/hello', (request) async {
  return HttpResponse.text('Hello, ${request.remotePeer.toBase58()}!');
});

// Define a POST route that accepts JSON
httpServer.post('/api/data', (request) async {
  final jsonData = request.bodyAsJson;
  if (jsonData == null) {
    return HttpResponse.error(HttpStatus.badRequest, 'Invalid JSON');
  }
  print('Received data: $jsonData');
  return HttpResponse.json({'status': 'ok', 'received': jsonData});
});
```

#### Making HTTP Requests (Client)

```dart
// Assuming 'httpClient' is the HttpProtocolService instance on the client host
// and you are connected to 'serverPeerId'

// Make a GET request
final response = await httpClient.getRequest(serverPeerId, '/hello');
print('Server responded: ${response.bodyAsString}');

// Make a POST request with a JSON payload
final postResponse = await httpClient.postJson(
  serverPeerId,
  '/api/data',
  {'message': 'This is a test'}
);
print('Server JSON response: ${postResponse.bodyAsJson}');
```
