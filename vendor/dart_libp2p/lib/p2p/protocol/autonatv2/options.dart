import 'dart:async';

import 'package:dart_libp2p/p2p/protocol/autonatv2/server.dart';
import 'package:dart_libp2p/core/protocol/autonatv2/autonatv2.dart';

import '../../../core/multiaddr.dart';
import '../../../core/network/stream.dart';

/// Function type for determining whether to request dial data
typedef DataRequestPolicyFunc = bool Function(P2PStream stream, MultiAddr dialAddr);

/// Settings for AutoNAT v2
class AutoNATv2Settings {
  /// Whether to allow private addresses
  final bool allowPrivateAddrs;
  
  /// Global rate limit (requests per minute)
  final int serverRPM;
  
  /// Per-peer rate limit (requests per minute)
  final int serverPerPeerRPM;
  
  /// Rate limit for dial data requests (requests per minute)
  final int serverDialDataRPM;
  
  /// Policy for determining when to request dial data
  final DataRequestPolicyFunc dataRequestPolicy;
  
  /// Function for getting the current time (for testing)
  final DateTime Function() now;
  
  /// Wait time for dial-back to prevent amplification attacks
  final Duration amplificationAttackPreventionDialWait;
  
  /// Metrics tracer
  final MetricsTracer? metricsTracer;

  AutoNATv2Settings({
    this.allowPrivateAddrs = false,
    this.serverRPM = 60, // 1 every second
    this.serverPerPeerRPM = 12, // 1 every 5 seconds
    this.serverDialDataRPM = 12, // 1 every 5 seconds
    required this.dataRequestPolicy,
    DateTime Function()? now,
    this.amplificationAttackPreventionDialWait = const Duration(seconds: 3),
    this.metricsTracer,
  }) : now = now ?? (() => DateTime.now());

  /// Create a copy of this settings object with the given changes
  AutoNATv2Settings copyWith({
    bool? allowPrivateAddrs,
    int? serverRPM,
    int? serverPerPeerRPM,
    int? serverDialDataRPM,
    DataRequestPolicyFunc? dataRequestPolicy,
    DateTime Function()? now,
    Duration? amplificationAttackPreventionDialWait,
    MetricsTracer? metricsTracer,
  }) {
    return AutoNATv2Settings(
      allowPrivateAddrs: allowPrivateAddrs ?? this.allowPrivateAddrs,
      serverRPM: serverRPM ?? this.serverRPM,
      serverPerPeerRPM: serverPerPeerRPM ?? this.serverPerPeerRPM,
      serverDialDataRPM: serverDialDataRPM ?? this.serverDialDataRPM,
      dataRequestPolicy: dataRequestPolicy ?? this.dataRequestPolicy,
      now: now ?? this.now,
      amplificationAttackPreventionDialWait: amplificationAttackPreventionDialWait ?? this.amplificationAttackPreventionDialWait,
      metricsTracer: metricsTracer ?? this.metricsTracer,
    );
  }
}

/// Option for configuring AutoNAT v2
typedef AutoNATv2Option = AutoNATv2Settings Function(AutoNATv2Settings settings);

/// Create an option for setting the server rate limits
AutoNATv2Option withServerRateLimit(int rpm, int perPeerRPM, int dialDataRPM) {
  return (settings) => settings.copyWith(
        serverRPM: rpm,
        serverPerPeerRPM: perPeerRPM,
        serverDialDataRPM: dialDataRPM,
      );
}

/// Create an option for setting the metrics tracer
AutoNATv2Option withMetricsTracer(MetricsTracer metricsTracer) {
  return (settings) => settings.copyWith(metricsTracer: metricsTracer);
}

/// Create an option for setting the data request policy
AutoNATv2Option withDataRequestPolicy(DataRequestPolicyFunc policy) {
  return (settings) => settings.copyWith(dataRequestPolicy: policy);
}

/// Create an option for allowing private addresses (for testing)
AutoNATv2Option allowPrivateAddrs() {
  return (settings) => settings.copyWith(allowPrivateAddrs: true);
}

/// Create an option for setting the amplification attack prevention dial wait time
AutoNATv2Option withAmplificationAttackPreventionDialWait(Duration duration) {
  return (settings) => settings.copyWith(amplificationAttackPreventionDialWait: duration);
}

/// Default settings for AutoNAT v2
AutoNATv2Settings defaultSettings() {
  return AutoNATv2Settings(
    dataRequestPolicy: amplificationAttackPrevention,
  );
}