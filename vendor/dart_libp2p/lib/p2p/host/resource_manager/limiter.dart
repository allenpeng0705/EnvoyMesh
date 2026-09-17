import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limit.dart';

/// Limiter is the interface for providing limits to the resource manager.
abstract class Limiter {
  Limit getSystemLimits();
  Limit getTransientLimits();
  Limit getAllowlistedSystemLimits();
  Limit getAllowlistedTransientLimits();
  Limit getServiceLimits(String service);
  Limit getServicePeerLimits(String service, PeerId peer); // Added PeerId
  Limit getProtocolLimits(ProtocolID protocol);
  Limit getProtocolPeerLimits(ProtocolID protocol, PeerId peer); // Added PeerId
  Limit getPeerLimits(PeerId peer);
  Limit getStreamLimits(PeerId peer); // Corresponds to GetStreamLimits(p peer.ID) in Go, used for individual streams
  Limit getConnLimits(); // Corresponds to GetConnLimits() in Go, used for individual connections
}

/// FixedLimiter is a limiter with fixed limits.
/// Initially, it will return generous default limits.
/// Configuration will be added later.
class FixedLimiter implements Limiter {
  // Placeholder for actual configuration. For now, we use simple defaults.
  final BaseLimit _defaultSystemLimit;
  final BaseLimit _defaultTransientLimit;
  final BaseLimit _defaultAllowlistedSystemLimit;
  final BaseLimit _defaultAllowlistedTransientLimit;
  final BaseLimit _defaultServiceLimit;
  final BaseLimit _defaultServicePeerLimit;
  final BaseLimit _defaultProtocolLimit;
  final BaseLimit _defaultProtocolPeerLimit;
  final BaseLimit _defaultPeerLimit;
  final BaseLimit _defaultStreamLimit;
  final BaseLimit _defaultConnLimit;

  // TODO: Add proper configuration loading (e.g. from a ConcreteLimitConfig class)
  FixedLimiter()
      : _defaultSystemLimit = BaseLimit.unlimited(),
        _defaultTransientLimit = BaseLimit.unlimited(),
        _defaultAllowlistedSystemLimit = BaseLimit.unlimited(),
        _defaultAllowlistedTransientLimit = BaseLimit.unlimited(),
        _defaultServiceLimit = BaseLimit.unlimited(),
        _defaultServicePeerLimit = BaseLimit.unlimited(),
        _defaultProtocolLimit = BaseLimit.unlimited(),
        _defaultProtocolPeerLimit = BaseLimit.unlimited(),
        _defaultPeerLimit = BaseLimit.unlimited(),
        _defaultStreamLimit = BaseLimit( // Streams usually have more constrained default limits
            streams: 1024, streamsInbound: 512, streamsOutbound: 512, memory: 1024 * 1024 * 8 /* 8 MiB */),
        _defaultConnLimit = BaseLimit( // Conns also have more constrained default limits
            conns: 256, connsInbound: 128, connsOutbound: 128, fd: 128, memory: 1024 * 1024 * 4 /* 4 MiB */);

  @override
  Limit getSystemLimits() => _defaultSystemLimit;

  @override
  Limit getTransientLimits() => _defaultTransientLimit;

  @override
  Limit getAllowlistedSystemLimits() => _defaultAllowlistedSystemLimit;
  
  @override
  Limit getAllowlistedTransientLimits() => _defaultAllowlistedTransientLimit;

  @override
  Limit getServiceLimits(String service) {
    // TODO: Implement specific service limits based on configuration
    return _defaultServiceLimit;
  }

  @override
  Limit getServicePeerLimits(String service, PeerId peer) {
    // TODO: Implement specific service peer limits based on configuration and peer
    return _defaultServicePeerLimit;
  }

  @override
  Limit getProtocolLimits(ProtocolID protocol) {
    // TODO: Implement specific protocol limits
    return _defaultProtocolLimit;
  }

  @override
  Limit getProtocolPeerLimits(ProtocolID protocol, PeerId peer) {
    // TODO: Implement specific protocol peer limits based on configuration and peer
    return _defaultProtocolPeerLimit;
  }

  @override
  Limit getPeerLimits(PeerId peer) {
    // TODO: Implement specific peer limits
    return _defaultPeerLimit;
  }

  @override
  Limit getStreamLimits(PeerId peer) {
    // This limit is typically for a single stream being opened to/from a peer.
    return _defaultStreamLimit;
  }

  @override
  Limit getConnLimits() {
    // This limit is typically for a single connection being opened.
    return _defaultConnLimit;
  }
}
