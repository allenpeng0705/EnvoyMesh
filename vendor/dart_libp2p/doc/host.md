# The Host

The `Host` is the central component in a libp2p application. It represents a single node in the peer-to-peer network and serves as the main entry point for all libp2p interactions. It bundles together all the other major components, such as the `Network`, `Peerstore`, and `ProtocolSwitch` (Mux), providing a unified API.

A `Host` can be thought of as both a client and a server. It can initiate connections and protocols with other peers (acting as a client) and also listen for and respond to incoming connections and protocols (acting as a server).

## Key Responsibilities

- **Identity**: Every host has a unique `PeerId` that identifies it on the network.
- **Networking**: Manages underlying network connections through the `Network` interface.
- **Peer & Address Management**: Keeps track of other peers, their addresses, and public keys using the `Peerstore`.
- **Protocol Handling**: Dispatches incoming streams to the correct protocol handlers using the `ProtocolSwitch`.
- **Stream Creation**: Opens new communication streams to other peers for specific protocols.
- **Lifecycle Management**: Handles the startup and shutdown of the node and its services.

## The `Host` Interface

The core `Host` interface is defined in `lib/core/host/host.dart`. Here are its key methods and properties:

### Properties

- **`id`**: `PeerId`
  - The unique identifier for this host.

- **`peerStore`**: `Peerstore`
  - The host's repository for information about other peers, including their addresses and public keys.

- **`addrs`**: `List<MultiAddr>`
  - The list of multiaddresses that this host is currently listening on.

- **`network`**: `Network`
  - The underlying network interface that manages connections.

- **`mux`**: `ProtocolSwitch`
  - The protocol multiplexer that directs incoming streams to their registered handlers.

- **`connManager`**: `ConnManager`
  - The connection manager responsible for managing the lifecycle of connections.

- **`eventBus`**: `EventBus`
  - The event bus for emitting and listening to libp2p-related events.

### Methods

- **`Future<void> connect(AddrInfo pi)`**
  - Establishes a connection to the peer specified in the `AddrInfo` object. If a connection already exists, this method does nothing. Otherwise, it initiates a new connection.

- **`void setStreamHandler(ProtocolID pid, StreamHandler handler)`**
  - Registers a handler function for a specific protocol ID. When another peer opens a stream to this host with the given protocol ID, the `handler` function will be invoked to process the stream.

- **`void removeStreamHandler(ProtocolID pid)`**
  - Removes a previously registered protocol handler.

- **`Future<P2PStream> newStream(PeerId p, List<ProtocolID> pids)`**
  - Opens a new outgoing stream to a remote peer `p` for one of the specified protocol IDs `pids`. Libp2p will negotiate with the remote peer to select a mutually supported protocol from the list.

- **`Future<void> start()`**
  - Starts the host, which includes initiating listening on the configured addresses and starting any configured services (like Identify, Ping, etc.).

- **`Future<void> close()`**
  - Shuts down the host, gracefully closing all active connections, streams, and services.

## Example: Basic Host Usage

```dart
// Create a host (see Getting Started for full setup)
Host myHost = await createHost();

// Start the host to begin listening
await myHost.start();
print('Host started and listening on: ${myHost.addrs}');

// Set a handler for a custom protocol
myHost.setStreamHandler('/my-protocol/1.0.0', (stream, remotePeer) {
  print('Received a new stream from ${remotePeer}');
  // ... read from and write to the stream
  stream.close();
});

// Connect to another peer
AddrInfo otherPeerInfo = ...;
await myHost.connect(otherPeerInfo);

// Open a stream to the other peer for our custom protocol
P2PStream myStream = await myHost.newStream(
  otherPeerInfo.peerId,
  ['/my-protocol/1.0.0']
);

// ... send and receive data

// Shutdown the host
await myHost.close();
