import 'package:dart_libp2p/core/multiaddr.dart';

/// Configuration for AmbientAutoNATv2 orchestrator
class AmbientAutoNATv2Config {
  /// Delay before starting initial probe after boot
  final Duration bootDelay;
  
  /// Interval for retry probes when status is uncertain
  final Duration retryInterval;
  
  /// Interval for refresh probes when status is confident
  final Duration refreshInterval;
  
  /// Optional function to provide addresses for probing
  /// If null, uses host.addrs
  final List<MultiAddr> Function()? addressFunc;
  
  /// If true, only probe IPv4 addresses for reachability detection.
  /// This ensures devices with public IPv6 but private IPv4 will still create
  /// relay reservations for compatibility with IPv4-only peers.
  /// The IPv6 addresses are still advertised and usable for direct connections -
  /// this only affects how AutoNAT determines if relay is needed.
  final bool ipv4Only;
  
  const AmbientAutoNATv2Config({
    this.bootDelay = const Duration(seconds: 15),
    this.retryInterval = const Duration(minutes: 1),
    this.refreshInterval = const Duration(minutes: 15),
    this.addressFunc,
    this.ipv4Only = false,
  });
}

