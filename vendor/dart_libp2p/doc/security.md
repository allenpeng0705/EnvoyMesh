# Connection Security

In a peer-to-peer network, ensuring that communication is private and authentic is critical. Libp2p provides a modular security layer that allows peers to establish secure channels over raw network connections.

This library provides an implementation of the **Noise Protocol Framework**, which is the default security protocol for libp2p.

## The `SecurityProtocol` Interface

All security protocols implement the `SecurityProtocol` interface, which has two main responsibilities:

-   **`Future<SecuredConnection> secureOutbound(TransportConn connection)`**: Secures an outgoing connection.
-   **`Future<SecuredConnection> secureInbound(TransportConn connection)`**: Secures an incoming connection.

Both methods take a raw `TransportConn` and, after a successful handshake, return a `SecuredConnection`. This `SecuredConnection` wraps the raw connection, transparently encrypting all data written to it and decrypting all data read from it.

## The Noise Protocol

-   **Protocol ID**: `/noise`
-   **Implementation**: `NoiseSecurity`

Noise is a modern, lightweight, and formally verified cryptographic framework. Libp2p uses the `XX` handshake pattern from Noise, which provides mutual authentication.

### The `XX` Handshake

The `XX` handshake is a three-part process where both peers exchange ephemeral public keys and prove ownership of their long-term identity keys.

Here's a simplified overview of the process:

1.  **Handshake Messages**: The client and server exchange three handshake messages. During this exchange, they generate and trade ephemeral keys.
2.  **Session Keys**: After the three messages, both peers can derive two shared secret keys: one for sending data (client-to-server) and one for receiving data (server-to-client).
3.  **Identity Exchange**: After establishing the encrypted channel, the peers exchange their libp2p identity public keys and signatures over the encrypted channel. This proves to each peer that they are talking to the `PeerId` they expect.

The result of a successful Noise handshake is a `SecuredConnection` where:
-   All traffic is encrypted with strong symmetric ciphers (ChaChaPoly).
-   The identity of the remote peer has been cryptographically verified.

### Usage

The `NoiseSecurity` protocol is enabled by default when you use the `Libp2p.new_` constructor. You can also configure it manually.

```dart
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';

// You need an identity key pair for your host
KeyPair myKeyPair = await generateKeyPair();

// Add the Noise protocol to your configuration
final config = [
  Libp2p.identity(myKeyPair),
  Libp2p.security(await NoiseSecurity.create(myKeyPair)),
  // ... other options
];
```

Because it's the default, you often don't need to specify it at all. The library will create and configure it for you as long as an identity is provided.
