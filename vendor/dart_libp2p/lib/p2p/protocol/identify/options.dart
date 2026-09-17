/// Options for the identify service.
///
/// This file contains the options for configuring the identify service.
///
/// This is a port of the Go implementation from go-libp2p/p2p/protocol/identify/opts.go
/// to Dart, using native Dart idioms.

import 'metrics.dart';

/// Options for configuring the identify service.
class IdentifyOptions {
  /// The protocol version string that will be used to identify the family of protocols used by the peer.
  final String? protocolVersion;
  
  /// The user agent this node will identify itself with to peers.
  final String? userAgent;
  
  /// Whether to disable populating signed peer records on the outgoing Identify response.
  /// If true, ONLY sends the unsigned addresses.
  final bool disableSignedPeerRecord;
  
  /// The metrics tracer to use for collecting metrics.
  final MetricsTracer? metricsTracer;
  
  /// Whether to disable the observed address manager.
  /// This also effectively disables the NAT emitter and EvtNATDeviceTypeChanged.
  final bool disableObservedAddrManager;
  
  /// Creates a new set of identify options.
  const IdentifyOptions({
    this.protocolVersion,
    this.userAgent,
    this.disableSignedPeerRecord = false,
    this.metricsTracer,
    this.disableObservedAddrManager = false,
  });
  
  /// Creates a copy of these options with the given changes.
  IdentifyOptions copyWith({
    String? protocolVersion,
    String? userAgent,
    bool? disableSignedPeerRecord,
    MetricsTracer? metricsTracer,
    bool? disableObservedAddrManager,
  }) {
    return IdentifyOptions(
      protocolVersion: protocolVersion ?? this.protocolVersion,
      userAgent: userAgent ?? this.userAgent,
      disableSignedPeerRecord: disableSignedPeerRecord ?? this.disableSignedPeerRecord,
      metricsTracer: metricsTracer ?? this.metricsTracer,
      disableObservedAddrManager: disableObservedAddrManager ?? this.disableObservedAddrManager,
    );
  }
}