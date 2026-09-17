import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'stun_client.dart';
import '../nat_type.dart';
import '../nat_behavior.dart';
import '../nat_behavior_discovery.dart';

/// A class that manages a pool of STUN clients for improved reliability and NAT detection
class StunClientPool {
  /// Default list of STUN servers to use
  static const List<({String host, int port})> defaultStunServers = [
    (host: 'stun.l.google.com', port: 19302),
    (host: 'stun1.l.google.com', port: 19302),
    (host: 'stun2.l.google.com', port: 19302),
    (host: 'stun3.l.google.com', port: 19302),
    (host: 'stun4.l.google.com', port: 19302)
  ];

  /// Default timeout for STUN requests
  static const Duration defaultTimeout = Duration(seconds: 5);

  /// Default health check interval
  static const Duration defaultHealthCheckInterval = Duration(minutes: 5);

  /// List of STUN clients in the pool
  final List<_StunServerInfo> _servers = [];

  /// Timeout for STUN requests
  final Duration timeout;

  /// Health check interval
  final Duration healthCheckInterval;

  /// Random number generator for server selection
  final Random _random = Random();

  /// Timer for periodic health checks
  Timer? _healthCheckTimer;

  /// Creates a new STUN client pool
  ///
  /// [stunServers] - List of STUN servers to use
  /// [timeout] - Timeout for STUN requests
  /// [healthCheckInterval] - Interval for health checks
  StunClientPool({
    List<({String host, int port})>? stunServers,
    this.timeout = defaultTimeout,
    this.healthCheckInterval = defaultHealthCheckInterval,
  }) {
    final servers = stunServers ?? defaultStunServers;

    // Initialize the server pool
    for (final server in servers) {
      _servers.add(
        _StunServerInfo(
          client: StunClient(
            serverHost: server.host,
            stunPort: server.port,
            timeout: timeout,
          ),
          host: server.host,
          port: server.port,
          healthScore: 100, // Start with perfect health
          lastResponseTime: null,
          lastSuccessTime: null,
          consecutiveFailures: 0,
        ),
      );
    }

    // Start periodic health checks
    _startHealthChecks();
  }

  /// Starts periodic health checks
  void _startHealthChecks() {
    _healthCheckTimer?.cancel();
    _healthCheckTimer = Timer.periodic(healthCheckInterval, (_) {
      _checkServerHealth();
    });
  }

  /// Checks the health of all servers in the pool
  Future<void> _checkServerHealth() async {
    for (final server in _servers) {
      try {
        final stopwatch = Stopwatch()..start();
        await server.client.discover();
        stopwatch.stop();

        // Update server health info
        server.lastResponseTime = stopwatch.elapsed;
        server.lastSuccessTime = DateTime.now();
        server.consecutiveFailures = 0;

        // Improve health score on success (max 100)
        server.healthScore = min(100, server.healthScore + 10);
      } catch (e) {
        // Decrease health score on failure (min 0)
        server.consecutiveFailures++;
        server.healthScore = max(0, server.healthScore - 20);
      }
    }

    // Sort servers by health score (highest first)
    _servers.sort((a, b) => b.healthScore.compareTo(a.healthScore));
  }

  /// Discovers external IP address and port using the pool of STUN servers
  ///
  /// This method tries multiple STUN servers in order of their health score
  /// until it gets a successful response or exhausts all servers.
  Future<StunResponse> discover() async {
    if (_servers.isEmpty) {
      throw Exception('No STUN servers available');
    }

    // Check server health if it hasn't been done yet
    if (_servers.every((s) => s.lastSuccessTime == null)) {
      await _checkServerHealth();
    }

    // Sort servers by health score (highest first)
    _servers.sort((a, b) => b.healthScore.compareTo(a.healthScore));

    // Try servers in order of health score
    Exception? lastException;
    for (final server in _servers) {
      try {
        final stopwatch = Stopwatch()..start();
        final response = await server.client.discover();
        stopwatch.stop();

        // Update server health info on success
        server.lastResponseTime = stopwatch.elapsed;
        server.lastSuccessTime = DateTime.now();
        server.consecutiveFailures = 0;
        server.healthScore = min(100, server.healthScore + 5);

        return response;
      } catch (e) {
        // Update server health info on failure
        server.consecutiveFailures++;
        server.healthScore = max(0, server.healthScore - 10);
        lastException = e is Exception ? e : Exception(e.toString());
      }
    }

    // If we get here, all servers failed
    throw lastException ?? Exception('All STUN servers failed');
  }

  /// Detects NAT type by comparing responses from multiple STUN servers
  ///
  /// This method provides more accurate NAT type detection by comparing
  /// the responses from multiple STUN servers.
  Future<NatType> detectNatType() async {
    // First, get a list of healthy servers
    final healthyServers = _servers.where((s) => s.healthScore > 50).toList();
    if (healthyServers.length < 2) {
      // Need at least 2 servers for accurate detection
      await _checkServerHealth();
      // Try again after health check
      final updatedHealthyServers = _servers.where((s) => s.healthScore > 30).toList();
      if (updatedHealthyServers.length < 2) {
        // Still not enough healthy servers, use whatever we have
        if (_servers.isEmpty) {
          throw Exception('No STUN servers available');
        }
        // Just use the first server and return its NAT type
        try {
          final response = await _servers.first.client.discover();
          return response.natType;
        } catch (e) {
          return NatType.blocked;
        }
      }
    }

    // Use at least 2 servers for detection
    final serversToUse = healthyServers.length >= 2 
        ? healthyServers.sublist(0, min(3, healthyServers.length)) 
        : _servers.sublist(0, min(3, _servers.length));

    // Get responses from multiple servers
    final responses = <StunResponse>[];
    for (final server in serversToUse) {
      try {
        final response = await server.client.discover();
        responses.add(response);
      } catch (e) {
        // Ignore failures, we'll work with what we have
      }
    }

    if (responses.isEmpty) {
      return NatType.blocked;
    }

    if (responses.length == 1) {
      // Only one response, return its NAT type
      return responses.first.natType;
    }

    // Compare external ports from different servers
    final ports = responses.map((r) => r.externalPort).toSet();

    if (ports.length > 1) {
      // Different ports for different servers indicates symmetric NAT
      return NatType.symmetric;
    }

    // If we got here, it's likely a cone NAT
    // We'd need more tests to distinguish between different types of cone NATs
    return NatType.fullCone;
  }

  /// Discovers detailed NAT behavior according to RFC 5780
  ///
  /// This method uses the NatBehaviorDiscovery class to perform
  /// comprehensive NAT behavior discovery tests. It requires a STUN
  /// server that supports RFC 5780.
  ///
  /// Returns a NatBehavior object containing mapping and filtering behaviors.
  Future<NatBehavior> discoverNatBehavior() async {
    // First, find a healthy server
    await _checkServerHealth();
    final healthyServers = _servers.where((s) => s.healthScore > 50).toList();

    if (healthyServers.isEmpty) {
      if (_servers.isEmpty) {
        throw Exception('No STUN servers available');
      }
      // Use the first server even if it's not healthy
      final server = _servers.first;
      final discovery = NatBehaviorDiscovery(stunClient: server.client);
      return discovery.discoverBehavior();
    }

    // Try each healthy server until we find one that supports RFC 5780
    for (final server in healthyServers) {
      try {
        final discovery = NatBehaviorDiscovery(stunClient: server.client);
        final behavior = await discovery.discoverBehavior();

        // If we got a valid result (not unknown for both behaviors), return it
        if (behavior.mappingBehavior != NatMappingBehavior.unknown || 
            behavior.filteringBehavior != NatFilteringBehavior.unknown) {
          return behavior;
        }
      } catch (e) {
        // Continue to the next server
      }
    }

    // If we get here, none of the servers supported RFC 5780
    // Return unknown behaviors
    return NatBehavior();
  }

  /// Maps NatBehavior to traditional NatType
  ///
  /// This method converts the detailed RFC 5780 NAT behavior classification
  /// to the traditional NAT type classification.
  NatType behaviorToNatType(NatBehavior behavior) {
    if (behavior.mappingBehavior == NatMappingBehavior.unknown &&
        behavior.filteringBehavior == NatFilteringBehavior.unknown) {
      return NatType.unknown;
    }

    // Symmetric NAT has address-dependent or address-and-port-dependent mapping
    if (behavior.mappingBehavior == NatMappingBehavior.addressDependent ||
        behavior.mappingBehavior == NatMappingBehavior.addressAndPortDependent) {
      return NatType.symmetric;
    }

    // Full cone NAT has endpoint-independent mapping and filtering
    if (behavior.mappingBehavior == NatMappingBehavior.endpointIndependent &&
        behavior.filteringBehavior == NatFilteringBehavior.endpointIndependent) {
      return NatType.fullCone;
    }

    // Restricted cone NAT has endpoint-independent mapping and address-dependent filtering
    if (behavior.mappingBehavior == NatMappingBehavior.endpointIndependent &&
        behavior.filteringBehavior == NatFilteringBehavior.addressDependent) {
      return NatType.restrictedCone;
    }

    // Port restricted cone NAT has endpoint-independent mapping and address-and-port-dependent filtering
    if (behavior.mappingBehavior == NatMappingBehavior.endpointIndependent &&
        behavior.filteringBehavior == NatFilteringBehavior.addressAndPortDependent) {
      return NatType.portRestricted;
    }

    // Default to full cone if we can't determine the exact type
    return NatType.fullCone;
  }

  /// Gets the current health status of all servers in the pool
  List<({String host, int port, int healthScore, Duration? lastResponseTime, DateTime? lastSuccessTime, int consecutiveFailures})> 
      getServerHealthStatus() {
    return _servers.map((s) => (
      host: s.host,
      port: s.port,
      healthScore: s.healthScore,
      lastResponseTime: s.lastResponseTime,
      lastSuccessTime: s.lastSuccessTime,
      consecutiveFailures: s.consecutiveFailures,
    )).toList();
  }

  /// Adds a new STUN server to the pool
  void addServer(String host, int port) {
    // Check if server already exists
    if (_servers.any((s) => s.host == host && s.port == port)) {
      return;
    }

    _servers.add(
      _StunServerInfo(
        client: StunClient(
          serverHost: host,
          stunPort: port,
          timeout: timeout,
        ),
        host: host,
        port: port,
        healthScore: 50, // Start with neutral health
        lastResponseTime: null,
        lastSuccessTime: null,
        consecutiveFailures: 0,
      ),
    );
  }

  /// Removes a STUN server from the pool
  void removeServer(String host, int port) {
    _servers.removeWhere((s) => s.host == host && s.port == port);
  }

  /// Disposes the STUN client pool
  void dispose() {
    _healthCheckTimer?.cancel();
    _healthCheckTimer = null;
  }
}

/// Internal class to track STUN server information
class _StunServerInfo {
  final StunClient client;
  final String host;
  final int port;
  int healthScore;
  Duration? lastResponseTime;
  DateTime? lastSuccessTime;
  int consecutiveFailures;

  _StunServerInfo({
    required this.client,
    required this.host,
    required this.port,
    required this.healthScore,
    required this.lastResponseTime,
    required this.lastSuccessTime,
    required this.consecutiveFailures,
  });
}
