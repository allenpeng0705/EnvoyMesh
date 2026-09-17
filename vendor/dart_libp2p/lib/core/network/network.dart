import 'dart:async';

import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';

import 'notifiee.dart';

/// MessageSizeMax is a soft (recommended) maximum for network messages.
/// One can write more, as the interface is a stream. But it is useful
/// to bunch it up into multiple read/writes when the whole message is
/// a single, large serialized object.
const int messageSizeMax = 1 << 22; // 4 MB


/// Connectedness signals the capacity for a connection with a given node.
/// It is used to signal to services and other peers whether a node is reachable.
enum Connectedness {
  /// No connection to peer, and no extra information (default)
  notConnected,

  /// Has an open, live connection to peer
  connected,

  /// Recently connected to peer, terminated gracefully
  /// Deprecated: Will be removed in a future release
  canConnect,

  /// Recently attempted connecting but failed to connect
  /// Deprecated: Will be removed in a future release
  cannotConnect,

  /// Has a transient connection to the peer, but aren't fully connected
  limited,
}

/// Reachability indicates how reachable a node is.
enum Reachability {
  /// The reachability status of the node is unknown
  unknown,

  /// The node is reachable from the public internet
  public,

  /// The node is not reachable from the public internet.
  /// NOTE: This node may _still_ be reachable via relays.
  private,
}



/// StreamHandler is the type of function used to listen for
/// streams opened by the remote side.
// typedef StreamHandler = void Function(P2PStream stream);

typedef StreamHandler = Future<void> Function(P2PStream stream, PeerId remotePeer);

/// Network is the interface used to connect to the outside world.
/// It dials and listens for connections. it uses a Swarm to pool
/// connections. Connections are encrypted with a TLS-like protocol.
abstract class Network implements Dialer {
  /// Closes the network
  Future<void> close();

  /// Sets the handler for new streams opened by the remote side.
  /// This operation is thread-safe.
  /// 
  /// @param protocol The protocol ID for which to set the handler
  /// @param handler The handler function that will be called when a new stream is opened
  void setStreamHandler(String protocol, Future<void> Function(dynamic stream, PeerId remotePeer) handler);

  /// Returns a new stream to given peer p.
  /// If there is no connection to p, attempts to create one.
  Future<P2PStream> newStream(Context context, PeerId peerId);

  /// Tells the network to start listening on given multiaddrs.
  Future<void> listen(List<MultiAddr> addrs);

  /// Returns a list of addresses at which this network listens.
  List<MultiAddr> get listenAddresses;

  /// Returns a list of addresses at which this network listens.
  /// It expands "any interface" addresses (/ip4/0.0.0.0, /ip6/::) to
  /// use the known local interfaces.
  Future<List<MultiAddr>> get interfaceListenAddresses;

  /// Returns the ResourceManager associated with this network
  ResourceManager get resourceManager;
}

/// MultiaddrDNSResolver resolves DNS multiaddrs
abstract class MultiaddrDNSResolver {
  /// Resolves the first /dnsaddr component in a multiaddr.
  /// Recursively resolves DNSADDRs up to the recursion limit
  Future<List<MultiAddr>> resolveDNSAddr(
    Context context,
    PeerId expectedPeerId,
    MultiAddr maddr,
    int recursionLimit,
    int outputLimit,
  );

  /// Resolves the first /{dns,dns4,dns6} component in a multiaddr.
  Future<List<MultiAddr>> resolveDNSComponent(
    Context context,
    MultiAddr maddr,
    int outputLimit,
  );
}

/// Dialer represents a service that can dial out to peers
abstract class Dialer {
  /// Returns the internal peerstore
  /// This is useful to tell the dialer about a new address for a peer.
  /// Or use one of the public keys found out over the network.
  Peerstore get peerstore;

  /// Returns the local peer associated with this network
  PeerId get localPeer;

  /// Establishes a connection to a given peer
  Future<Conn> dialPeer(Context context, PeerId peerId);

  /// Closes the connection to a given peer
  Future<void> closePeer(PeerId peerId);

  /// Returns a state signaling connection capabilities
  Connectedness connectedness(PeerId peerId);

  /// Returns the peers connected
  List<PeerId> get peers;

  /// Returns the connections in this Network
  List<Conn> get conns;

  /// Returns the connections in this Network for given peer.
  List<Conn> connsToPeer(PeerId peerId);

  /// Register a notifiee for signals
  void notify(Notifiee notifiee);

  /// Unregister a notifiee for signals
  void stopNotify(Notifiee notifiee);

  /// Returns whether the dialer can dial peer p at addr
  bool canDial(PeerId peerId, MultiAddr addr);

  void removeListenAddress(MultiAddr addr);

}


class EvtPeerConnectednessChanged {
  /// Peer is the remote peer whose connectedness has changed.
  final PeerId peer;

  /// Connectedness is the new connectedness state.
  final Connectedness connectedness;

  /// Creates a new EvtPeerConnectednessChanged event.
  EvtPeerConnectednessChanged({
    required this.peer,
    required this.connectedness,
  });
}

/// AddrDelay provides an address along with the delay after which the address
/// should be dialed
class AddrDelay {
  /// The address to dial
  final MultiAddr addr;

  /// The delay after which to dial
  final Duration delay;

  const AddrDelay({
    required this.addr,
    required this.delay,
  });
}

/// DialRanker provides a schedule of dialing the provided addresses
typedef DialRanker = List<AddrDelay> Function(List<MultiAddr> addrs);
