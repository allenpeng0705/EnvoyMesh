# OverNode Binary Protocol (OBP)

## Overview

OBP is a custom application-layer protocol built on top of libp2p that provides reliable, framed messaging for peer-to-peer communication. It implements a binary framing protocol with structured message types, automatic retries, and flow control.

## Purpose

OBP serves as the **application protocol layer** between your application logic and libp2p's transport layer. It provides:

- **Structured Binary Framing**: Efficient binary message format with 16-byte headers
- **Protocol Handshaking**: Version negotiation and capability exchange
- **Reliable Messaging**: Request/response patterns with automatic retries and timeouts
- **Multiple Message Types**: Organized support for control, prekey, and CRDT operations
- **Flow Control**: Acknowledgment flags and stream ID correlation

## Architecture

```
┌─────────────────────────────────────────────┐
│        OverNode Application Logic           │
│    (Chat, Data Sync, User Features)        │
└─────────────────────────────────────────────┘
                     ↕
┌─────────────────────────────────────────────┐
│   OBP (OverNode Binary Protocol) ← HERE     │
│ - Frame encoding/decoding                   │
│ - Request/response handling                 │
│ - Protocol handshaking                      │
│ - Prekey & CRDT message types               │
└─────────────────────────────────────────────┘
                     ↕
┌─────────────────────────────────────────────┐
│         libp2p Protocol Layer               │
│ - P2PStream (multiplexed streams)           │
│ - Stream handlers & protocol IDs            │
└─────────────────────────────────────────────┘
                     ↕
┌─────────────────────────────────────────────┐
│         libp2p Transport Layer              │
│ - TCP, QUIC, WebTransport                   │
│ - Security (Noise, TLS)                     │
│ - Multiplexing (Yamux, MPLEX)               │
└─────────────────────────────────────────────┘
```

## Frame Structure

OBP uses a 16-byte header followed by a variable-length payload:

```
┌─────────────────────────────────────────────────────────────┐
│ Magic (4 bytes) │ Version (1) │ Type (1) │ Flags (1) │ Res(1)│
├─────────────────────────────────────────────────────────────┤
│                    Length (4 bytes, big-endian)            │
├─────────────────────────────────────────────────────────────┤
│                    Stream ID (4 bytes)                     │
├─────────────────────────────────────────────────────────────┤
│                    Payload (Length bytes)                  │
└─────────────────────────────────────────────────────────────┘
```

### Header Fields

- **Magic** (4 bytes): `0x4F564E44` ("OVND" in ASCII) - Protocol identifier
- **Version** (1 byte): Protocol version (currently `1`)
- **Type** (1 byte): Message type (see Message Types below)
- **Flags** (1 byte): Control flags (ackRequired, fin, err, compressed)
- **Reserved** (1 byte): Reserved for future use
- **Length** (4 bytes): Payload size in bytes (max 10MB)
- **Stream ID** (4 bytes): Unique identifier for request/response correlation

## Message Types

### Control Messages (0x01-0x05)
- `handshakeReq` (0x01): Initiate protocol handshake
- `handshakeAck` (0x02): Acknowledge handshake
- `ping` (0x03): Keep-alive ping
- `pong` (0x04): Ping response
- `error` (0x05): Error response

### Prekey Protocol (0x10-0x13)
- `prekeyBroadcastReq` (0x10): Broadcast cryptographic prekeys
- `prekeyBroadcastAck` (0x11): Acknowledge prekey broadcast
- `prekeyFetchReq` (0x12): Fetch prekeys from peer
- `prekeyFetchResp` (0x13): Prekey fetch response

### CRDT Protocol (0x20-0x23)
- `crdtSyncReq` (0x20): Request CRDT synchronization
- `crdtSyncResp` (0x21): CRDT sync response
- `crdtPinReq` (0x22): Request to pin CRDT data
- `crdtPinAck` (0x23): Acknowledge CRDT pin

## Usage

### Client-Side: Performing Handshake and Sending Requests

```dart
import 'package:dart_libp2p/p2p/protocol/obp/obp_protocol_handler.dart';
import 'package:dart_libp2p/p2p/protocol/obp/obp_frame.dart';

// Open a libp2p stream to the peer
final stream = await host.newStream(peerId, ['/overnode/obp/1.0.0']);

// Perform protocol handshake (client-side)
final handshakeSuccess = await OBPProtocolHandler.performHandshake(
  stream,
  isClient: true,
  context: 'my-app-client',
);

if (!handshakeSuccess) {
  await stream.close();
  return;
}

// Send a prekey fetch request
final request = OBPFrame(
  type: OBPMessageType.prekeyFetchReq,
  streamId: 123,
  payload: Uint8List.fromList(utf8.encode(jsonEncode({
    'user_id': 'user123',
    'timestamp': DateTime.now().toIso8601String(),
  }))),
);

final response = await OBPProtocolHandler.sendRequest(
  stream,
  request,
  context: 'prekey-fetch',
);

if (response != null && response.type == OBPMessageType.prekeyFetchResp) {
  final data = jsonDecode(utf8.decode(response.payload));
}

await OBPProtocolHandler.closeStream(stream, context: 'my-app-client');
```

### Server-Side: Handling Incoming Requests

```dart
import 'package:dart_libp2p/p2p/protocol/obp/obp_protocol_handler.dart';
import 'package:dart_libp2p/p2p/protocol/obp/obp_frame.dart';

// Register OBP protocol handler
host.setStreamHandler('/overnode/obp/1.0.0', (stream) async {
  try {
    // Perform handshake (server-side)
    final handshakeSuccess = await OBPProtocolHandler.performHandshake(
      stream,
      isClient: false,
      context: 'my-app-server',
    );
    
    if (!handshakeSuccess) {
      await OBPProtocolHandler.closeStream(stream, context: 'my-app-server');
      return;
    }
    
    // Handle incoming requests
    while (!stream.isClosed) {
      final request = await OBPProtocolHandler.readFrame(
        stream,
        context: 'my-app-server',
      );
      
      if (request == null) break; // EOF
      
      // Handle different message types
      switch (request.type) {
        case OBPMessageType.prekeyFetchReq:
          await _handlePrekeyFetch(stream, request);
          break;
          
        case OBPMessageType.crdtSyncReq:
          await _handleCrdtSync(stream, request);
          break;
          
        default:
          await OBPProtocolHandler.sendError(
            stream,
            'Unsupported message type: ${request.type}',
            OBPErrorCodes.invalidMessage,
            context: 'my-app-server',
          );
      }
    }
  } catch (e) {
  } finally {
    await OBPProtocolHandler.closeStream(stream, context: 'my-app-server');
  }
});

Future<void> _handlePrekeyFetch(P2PStream stream, OBPFrame request) async {
  // Parse request
  final reqData = jsonDecode(utf8.decode(request.payload));
  
  // Fetch prekeys (your business logic here)
  final prekeys = await fetchPrekeysForUser(reqData['user_id']);
  
  // Send response
  final response = OBPFrame(
    type: OBPMessageType.prekeyFetchResp,
    streamId: request.streamId,
    payload: Uint8List.fromList(utf8.encode(jsonEncode(prekeys))),
  );
  
  await OBPProtocolHandler.sendResponse(stream, response, context: 'prekey-handler');
}
```

## Key Features

### 1. Automatic Retries
Failed requests are automatically retried up to 3 times with exponential backoff.

### 2. Timeout Protection
All operations have configurable timeouts (default 30 seconds) to prevent hanging connections.

### 3. Buffered Reading
Per-stream buffers handle frame boundaries correctly when reading partial data from network streams.

### 4. Error Handling
Standardized error responses with error codes and JSON payloads for debugging.

### 5. Stream Lifecycle Management
Safe stream closing and resetting with proper cleanup.

### 6. Extensive Logging
Detailed logging at various levels (INFO, FINE, WARNING, SEVERE) for production debugging.

## Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| 1000 | `protocolError` | General protocol error |
| 1001 | `invalidMessage` | Invalid or malformed message |
| 1002 | `unsupportedVersion` | Protocol version not supported |
| 1003 | `handshakeFailed` | Handshake negotiation failed |
| 1004 | `timeout` | Operation timed out |
| 1005 | `internalError` | Internal server error |
| 1006 | `invalidPayload` | Payload validation failed |
| 1007 | `resourceNotFound` | Requested resource not found |
| 1008 | `accessDenied` | Permission denied |
| 1009 | `rateLimited` | Rate limit exceeded |

## Configuration

### Timeouts
```dart
// Custom timeout
await OBPProtocolHandler.sendRequest(
  stream,
  request,
  timeout: Duration(seconds: 60),
  context: 'long-operation',
);
```

### Retry Behavior
```dart
// Custom retry count
await OBPProtocolHandler.sendRequest(
  stream,
  request,
  maxRetries: 5,
  context: 'critical-operation',
);
```

## Performance Considerations

- **Maximum Payload Size**: 10MB per frame
- **Header Overhead**: 16 bytes per message
- **Buffering**: Per-stream buffers for handling partial reads
- **Binary Format**: Efficient big-endian encoding for compact wire format

## When to Use OBP

Use OBP when you need:

✅ **Structured messaging** over raw byte streams  
✅ **Multiple message types** in a single protocol  
✅ **Request/response semantics** with acknowledgments  
✅ **Application-level handshaking** beyond libp2p's connection security  
✅ **Built-in retry/timeout logic** at the application layer  

Don't use OBP if:

❌ You need a simple unidirectional stream  
❌ You're building a protocol that fits existing libp2p protocols (ping, identify, etc.)  
❌ Your messages are simple enough to handle without framing  

## Components

- **`obp_frame.dart`**: Frame structure, encoding/decoding, message types, and flags
- **`obp_protocol_handler.dart`**: Protocol handler with handshake, request/response, and stream management

## License

See the main project LICENSE file.

