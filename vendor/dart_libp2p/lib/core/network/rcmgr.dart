import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart'; // Provides concrete PeerId
import 'package:dart_libp2p/core/network/common.dart';
// conn.dart is not directly used by interfaces here, but might be by implementations

// --- New/Explicit Definitions Start ---

/// ScopeStat is a struct containing resource accounting information.
class ScopeStat {
  final int numStreamsInbound;
  final int numStreamsOutbound;
  final int numConnsInbound;
  final int numConnsOutbound;
  final int numFD;
  final int memory; // Dart's int handles arbitrary precision, similar to Go's int64

  const ScopeStat({
    this.numStreamsInbound = 0,
    this.numStreamsOutbound = 0,
    this.numConnsInbound = 0,
    this.numConnsOutbound = 0,
    this.numFD = 0,
    this.memory = 0,
  });
}

/// ResourceScope is the interface for all scopes.
abstract class ResourceScope {
  /// ReserveMemory reserves memory/buffer space in the scope; the unit is bytes.
  Future<void> reserveMemory(int size, int priority);

  /// ReleaseMemory explicitly releases memory previously reserved with ReserveMemory.
  void releaseMemory(int size);

  /// Stat retrieves current resource usage for the scope.
  ScopeStat get stat;

  /// BeginSpan creates a new span scope rooted at this scope.
  Future<ResourceScopeSpan> beginSpan();
}

/// ResourceScopeSpan is a ResourceScope with a delimited span.
abstract class ResourceScopeSpan implements ResourceScope {
  /// Done ends the span and releases associated resources.
  void done();
}

// --- New/Explicit Definitions End ---

/// ResourceManager is the interface for managing resources in libp2p.
///
/// WARNING The ResourceManager interface is considered experimental and subject to change
/// in subsequent releases.
abstract class ResourceManager implements ResourceScopeViewer {
  /// OpenConnection creates a new connection scope not yet associated with any peer; the connection
  /// is scoped at the transient scope.
  /// The caller owns the returned scope and is responsible for calling Done in order to signify
  /// the end of the scope's span.
  Future<ConnManagementScope> openConnection(Direction dir, bool usefd, MultiAddr endpoint);

  /// OpenStream creates a new stream scope, initially unnegotiated.
  /// An unnegotiated stream will be initially unattached to any protocol scope
  /// and constrained by the transient scope.
  /// The caller owns the returned scope and is responsible for calling Done in order to signify
  /// the end of th scope's span.
  Future<StreamManagementScope> openStream(PeerId peerId, Direction dir);

  /// Close closes the resource manager
  Future<void> close();
}

/// ResourceScopeViewer is a mixin interface providing view methods for accessing top level
/// scopes.
abstract class ResourceScopeViewer {
  /// ViewSystem views the system-wide resource scope.
  Future<T> viewSystem<T>(Future<T> Function(ResourceScope scope) f);

  /// ViewTransient views the transient (DMZ) resource scope.
  Future<T> viewTransient<T>(Future<T> Function(ResourceScope scope) f);

  /// ViewService retrieves a service-specific scope.
  Future<T> viewService<T>(String service, Future<T> Function(ServiceScope scope) f);

  /// ViewProtocol views the resource management scope for a specific protocol.
  Future<T> viewProtocol<T>(ProtocolID protocol, Future<T> Function(ProtocolScope scope) f);

  /// ViewPeer views the resource management scope for a specific peer.
  Future<T> viewPeer<T>(PeerId peerId, Future<T> Function(PeerScope scope) f);
}

/// Reservation priorities
class ReservationPriority {
  static const int low = 101;
  static const int medium = 152;
  static const int high = 203;
  static const int always = 255;
}

/// ServiceScope is the interface for service resource scopes
abstract class ServiceScope implements ResourceScope {
  String get name;
}

/// ProtocolScope is the interface for protocol resource scopes.
abstract class ProtocolScope implements ResourceScope {
  ProtocolID get protocol;
}

/// PeerScope is the interface for peer resource scopes.
abstract class PeerScope implements ResourceScope {
  PeerId get peer;
}

/// ConnManagementScope is the low level interface for connection resource scopes.
abstract class ConnManagementScope implements ResourceScopeSpan {
  PeerScope? get peerScope;
  Future<void> setPeer(PeerId peerId);
}

/// ConnScope is the user view of a connection scope.
abstract class ConnScope implements ResourceScope {}

/// StreamManagementScope is the interface for stream resource scopes.
abstract class StreamManagementScope implements ResourceScopeSpan, StreamScope{
  ProtocolScope? get protocolScope;
  Future<void> setProtocol(ProtocolID protocol);
  ServiceScope? get serviceScope;
  PeerScope get peerScope; // In Go, this is derived from the connection. Here it's explicit.
}

/// StreamScope is the user view of a StreamScope.
abstract class StreamScope implements ResourceScope {
  Future<void> setService(String service);
}

/// NullResourceManager is a stub for tests and initialization of default values
class NullResourceManager implements ResourceManager {
  @override
  Future<T> viewSystem<T>(Future<T> Function(ResourceScope scope) f) async {
    return await f(NullScope());
  }

  @override
  Future<T> viewTransient<T>(Future<T> Function(ResourceScope scope) f) async {
    return await f(NullScope());
  }

  @override
  Future<T> viewService<T>(String service, Future<T> Function(ServiceScope scope) f) async {
    return await f(NullScope());
  }

  @override
  Future<T> viewProtocol<T>(ProtocolID protocol, Future<T> Function(ProtocolScope scope) f) async {
    return await f(NullScope());
  }

  @override
  Future<T> viewPeer<T>(PeerId peerId, Future<T> Function(PeerScope scope) f) async {
    return await f(NullScope());
  }

  @override
  Future<ConnManagementScope> openConnection(Direction dir, bool usefd, MultiAddr endpoint) async {
    return NullScope();
  }

  @override
  Future<StreamManagementScope> openStream(PeerId peerId, Direction dir) async {
    return NullScope();
  }

  @override
  Future<void> close() async {}
}

/// NullScope is a stub for tests and initialization of default values
class NullScope implements 
    ResourceScope, ResourceScopeSpan, 
    ServiceScope, ProtocolScope, PeerScope, 
    ConnManagementScope, ConnScope, 
    StreamManagementScope, StreamScope {
      
  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  void releaseMemory(int size) {}

  @override
  ScopeStat get stat => const ScopeStat(); // Changed from scopeStat

  @override
  Future<ResourceScopeSpan> beginSpan() async {
    return this;
  }

  @override
  void done() {}

  @override
  String get name => '';

  @override
  ProtocolID get protocol => '';

  @override
  PeerId get peer => PeerId.fromString(''); // Assuming PeerId has a fromString constructor or similar

  // ConnManagementScope
  @override
  PeerScope get peerScope => this; // NullScope acts as its own PeerScope for simplicity

  @override
  Future<void> setPeer(PeerId peerId) async {}

  // StreamManagementScope
  @override
  ProtocolScope? get protocolScope => this; // NullScope acts as its own ProtocolScope

  @override
  Future<void> setProtocol(ProtocolID protocol) async {}

  @override
  ServiceScope? get serviceScope => this; // NullScope acts as its own ServiceScope

  // StreamManagementScope & StreamScope
  @override
  Future<void> setService(String service) async {}
}
