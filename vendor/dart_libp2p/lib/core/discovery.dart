import 'dart:async';
import 'peer/addr_info.dart';

/// Options for discovery operations
class DiscoveryOptions {
  /// Time-to-live for advertisements
  final Duration? ttl;
  
  /// Maximum number of peers to discover
  final int? limit;
  
  /// Other implementation-specific options
  final Map<dynamic, dynamic> other;
  
  /// Creates a new DiscoveryOptions
  DiscoveryOptions({this.ttl, this.limit, Map<dynamic, dynamic>? other})
      : other = other ?? {};
  
  /// Applies the given options to this DiscoveryOptions
  DiscoveryOptions apply(List<DiscoveryOption> options) {
    var result = this;
    for (final option in options) {
      result = option(result);
    }
    return result;
  }
}

/// A function that modifies DiscoveryOptions
typedef DiscoveryOption = DiscoveryOptions Function(DiscoveryOptions options);

/// Creates an option that sets the TTL
DiscoveryOption ttl(Duration duration) {
  return (options) => DiscoveryOptions(
        ttl: duration,
        limit: options.limit,
        other: Map.from(options.other),
      );
}

/// Creates an option that sets the limit
DiscoveryOption limit(int limit) {
  return (options) => DiscoveryOptions(
        ttl: options.ttl,
        limit: limit,
        other: Map.from(options.other),
      );
}

/// Interface for advertising services
abstract class Advertiser {
  /// Advertises a service
  Future<Duration> advertise(String ns, [List<DiscoveryOption> options = const []]);
}

/// Interface for peer discovery
abstract class Discoverer {
  /// Discovers peers providing a service
  Future<Stream<AddrInfo>> findPeers(String ns, [List<DiscoveryOption> options = const []]);
}

/// Interface that combines service advertisement and peer discovery
abstract class Discovery implements Advertiser, Discoverer {}