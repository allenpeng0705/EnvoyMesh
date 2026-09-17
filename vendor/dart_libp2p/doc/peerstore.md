# The Peerstore

The `Peerstore` is a critical component in libp2p that acts as a database or address book for all known peers. It stores essential information about other nodes in the network, allowing the `Host` to connect to them and make informed decisions about which protocols to use.

Every `Host` has its own `Peerstore`, which can be accessed via the `host.peerStore` property.

## Key Functions

The `Peerstore` is responsible for storing and managing:

-   **Addresses**: The `MultiAddr`s that a peer is listening on.
-   **Public Keys**: The cryptographic public keys of peers, which are essential for verifying their identity.
-   **Protocols**: The list of protocols that a peer is known to support.
-   **Latency**: Latency metrics (round-trip times) from previous `Ping` interactions.
-   **Metadata**: Arbitrary key-value data that can be associated with a peer.

## The `Peerstore` Interface

The `Peerstore` is composed of several specialized "books," each responsible for a specific type of data.

### `AddrBook`

The `AddrBook` manages peer addresses.

-   **`addAddrs(PeerId p, List<MultiAddr> addrs, Duration ttl)`**: Adds a list of addresses for a peer with a specific Time-To-Live (TTL). The TTL determines how long the address is considered valid.
-   **`addrs(PeerId p)`**: Returns all known, valid addresses for a given peer.
-   **`clearAddrs(PeerId p)`**: Removes all stored addresses for a peer.

### `KeyBook`

The `KeyBook` manages cryptographic keys.

-   **`addPubKey(PeerId id, PublicKey pk)`**: Stores the public key for a peer. This is crucial for authentication.
-   **`pubKey(PeerId id)`**: Retrieves the public key for a peer.
-   **`addPrivKey(PeerId id, PrivateKey sk)`**: Stores a private key. In practice, a host will only ever store its own private key.

### `ProtoBook`

The `ProtoBook` tracks the protocols supported by peers. This information is typically gathered from the `Identify` protocol.

-   **`addProtocols(PeerId id, List<ProtocolID> protocols)`**: Adds a list of supported protocols for a peer.
-   **`getProtocols(PeerId id)`**: Returns all known protocols for a peer.
-   **`supportsProtocols(PeerId id, List<ProtocolID> protocols)`**: Checks which of the given protocols are supported by the peer.

### `Metrics`

The `Metrics` book stores performance-related data.

-   **`recordLatency(PeerId id, Duration latency)`**: Records a new latency measurement for a peer, usually from a `Ping` result.
-   **`latencyEWMA(PeerId id)`**: Returns an exponentially-weighted moving average of a peer's latency.

## How Information is Populated

The `Peerstore` is populated both manually and automatically:

-   **Automatically**: When you connect to a peer, the `Identify` protocol runs automatically. It exchanges information like listen addresses and supported protocols, which are then automatically added to the `Peerstore`.
-   **Manually**: You can manually add information to the `Peerstore`. This is essential for bootstrapping, where you need to tell your node about the addresses of initial "bootstrap" peers to connect to.

### Example: Manual Population for Bootstrapping

```dart
// Assume 'myHost' is your local host and you know the AddrInfo of a bootstrap peer.
AddrInfo bootstrapPeerInfo = ...;

// Add the bootstrap peer's addresses and public key to your peerstore
await myHost.peerStore.addrBook.addAddrs(
  bootstrapPeerInfo.peerId,
  bootstrapPeerInfo.addrs,
  AddressTTL.permanentAddrTTL // Give bootstrap addresses a long TTL
);
myHost.peerStore.keyBook.addPubKey(
  bootstrapPeerInfo.peerId,
  bootstrapPeerInfo.peerId.publicKey // Extract public key from PeerId
);

// Now you can connect to the bootstrap peer
await myHost.connect(bootstrapPeerInfo);
