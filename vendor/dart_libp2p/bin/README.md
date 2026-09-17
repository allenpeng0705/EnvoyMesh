# libp2p Dart Sample Applications

This directory contains sample applications that demonstrate how to use the libp2p Dart library for various peer-to-peer networking scenarios. These applications are designed to showcase the expected usage patterns of the library once it's fully implemented.

**Note:** These are pseudo-code examples that sketch out the future classes and interfaces we expect to use to set up libp2p connections using Dart. Many of the imported classes and methods are placeholders that need to be implemented.

## Sample Applications

### 1. Echo Application (`libp2p_echo.dart`)

A basic example demonstrating how to set up a libp2p node and establish an end-to-end connection between two peers. One peer acts as a listener that echoes back any messages it receives, while the other peer acts as a sender that connects to the listener and sends a message.

**Usage:**

Start a listener node:
```bash
dart bin/libp2p_echo.dart -l 8080
```

Start a sender node (in a different terminal):
```bash
dart bin/libp2p_echo.dart -l 8081 -d <listener_address>
```

### 2. Chat Application (`libp2p_chat.dart`)

A more complex example demonstrating how to use libp2p with pubsub for distributed chat. This application uses mDNS for peer discovery and pubsub for message distribution.

**Usage:**

Start a chat node:
```bash
dart bin/libp2p_chat.dart -l 8080 -n YourNickname -r RoomName
```

Start another chat node (in a different terminal):
```bash
dart bin/libp2p_chat.dart -l 8081 -n AnotherNickname -r RoomName
```

### 3. DHT Application (`libp2p_dht.dart`)

An advanced example demonstrating how to use libp2p with a Distributed Hash Table (DHT) for content routing and peer discovery. This application allows storing and retrieving values from the DHT, announcing provider records, and finding peers.

**Usage:**

Start a DHT node:
```bash
dart bin/libp2p_dht.dart -l 8080
```

Connect to a bootstrap peer:
```bash
dart bin/libp2p_dht.dart -l 8081 -b <bootstrap_peer_address>
```

Store a value in the DHT:
```bash
dart bin/libp2p_dht.dart -l 8082 -b <bootstrap_peer_address> --put mykey=myvalue
```

Retrieve a value from the DHT:
```bash
dart bin/libp2p_dht.dart -l 8083 -b <bootstrap_peer_address> --get mykey
```

Announce that you can provide a value:
```bash
dart bin/libp2p_dht.dart -l 8084 -b <bootstrap_peer_address> --provide mykey
```

Find providers for a key:
```bash
dart bin/libp2p_dht.dart -l 8085 -b <bootstrap_peer_address> --find-providers mykey
```

Find a peer by its ID:
```bash
dart bin/libp2p_dht.dart -l 8086 -b <bootstrap_peer_address> --find-peer <peer_id>
```

## Components to be Implemented

These sample applications highlight several components that need to be implemented in the Dart libp2p library:

1. **Host Implementation**
   - `BasicHost` class that implements the `Host` interface

2. **Transport Protocols**
   - TCP transport
   - WebSocket transport
   - QUIC transport

3. **Security Protocols**
   - Noise protocol
   - TLS protocol

4. **Stream Multiplexers**
   - Yamux multiplexer
   - MPLEX multiplexer

5. **Peer Discovery**
   - mDNS discovery
   - Rendezvous discovery
   - Bootstrap list

6. **Pubsub**
   - Gossipsub implementation
   - Topic management
   - Message handling

7. **DHT and Content Routing**
   - Kademlia DHT implementation
   - Content routing
   - Peer routing
   - Provider records
   - CID (Content Identifier) handling

8. **Key Management**
   - Key pair generation
   - PeerId creation and handling
   - Multiaddress parsing and manipulation

9. **Peerstore**
   - Address book
   - Protocol negotiation
   - Connection management

These sample applications serve as a roadmap for the development of the Dart libp2p library, highlighting the key components that need to be implemented to achieve feature parity with the Go implementation.