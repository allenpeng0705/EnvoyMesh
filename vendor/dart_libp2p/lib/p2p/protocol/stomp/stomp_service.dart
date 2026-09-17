import 'dart:async';

import 'package:dart_libp2p/p2p/protocol/stomp/stomp_subscription.dart';
import 'package:logging/logging.dart';

import '../../../core/interfaces.dart';
import '../../../core/peer/peer_id.dart';
import 'stomp_client.dart';
import 'stomp_constants.dart';
import 'stomp_exceptions.dart';
import 'stomp_server.dart';

final _logger = Logger('stomp.service');

/// STOMP service that provides both client and server functionality for libp2p
class StompService {
  final Host _host;
  final StompServiceOptions _options;
  
  StompServer? _server;
  final Map<PeerId, StompClient> _clients = {};
  
  bool _isStarted = false;

  StompService(this._host, {StompServiceOptions? options})
      : _options = options ?? StompServiceOptions();

  /// Whether the service is started
  bool get isStarted => _isStarted;

  /// The STOMP server (if enabled)
  StompServer? get server => _server;

  /// Active STOMP clients
  Map<PeerId, StompClient> get clients => Map.unmodifiable(_clients);

  /// Starts the STOMP service
  Future<void> start() async {
    if (_isStarted) {
      throw const StompStateException('Service already started', 'started', 'stopped');
    }

    _logger.info('Starting STOMP service on ${_host.id}');

    // Start server if enabled
    if (_options.enableServer) {
      _server = StompServer(
        host: _host,
        serverName: _options.serverName,
        timeout: _options.timeout,
      );
      await _server!.start();
      _logger.info('STOMP server started');
    }

    _isStarted = true;
    _logger.info('STOMP service started');
  }

  /// Stops the STOMP service
  Future<void> stop() async {
    if (!_isStarted) return;

    _logger.info('Stopping STOMP service');

    // Close all clients
    final clientList = List<StompClient>.from(_clients.values);
    for (final client in clientList) {
      await client.close();
    }
    _clients.clear();

    // Stop server
    if (_server != null) {
      await _server!.stop();
      _server = null;
      _logger.info('STOMP server stopped');
    }

    _isStarted = false;
    _logger.info('STOMP service stopped');
  }

  /// Creates a new STOMP client connection to a peer
  Future<StompClient> connect({
    required PeerId peerId,
    required String hostName,
    String? login,
    String? passcode,
    Duration? timeout,
  }) async {
    if (!_isStarted) {
      throw const StompStateException('Service not started', 'stopped', 'started');
    }

    // Check if we already have a client for this peer
    final existingClient = _clients[peerId];
    if (existingClient != null) {
      if (existingClient.isConnected) {
        return existingClient;
      } else {
        // Remove disconnected client
        _clients.remove(peerId);
      }
    }

    // Create new client
    final client = StompClient(
      host: _host,
      serverPeerId: peerId,
      hostName: hostName,
      login: login,
      passcode: passcode,
      timeout: timeout ?? _options.timeout,
    );

    // Listen for state changes to clean up disconnected clients
    client.onStateChange.listen((state) {
      if (state == StompClientState.disconnected || state == StompClientState.error) {
        _clients.remove(peerId);
      }
    });

    // Connect
    await client.connect();
    _clients[peerId] = client;

    _logger.info('Connected to STOMP server at $peerId');
    return client;
  }

  /// Disconnects from a peer
  Future<void> disconnect(PeerId peerId) async {
    final client = _clients.remove(peerId);
    if (client != null) {
      await client.disconnect();
      _logger.info('Disconnected from STOMP server at $peerId');
    }
  }

  /// Disconnects from all peers
  Future<void> disconnectAll() async {
    final clientList = List<StompClient>.from(_clients.values);
    _clients.clear();
    
    for (final client in clientList) {
      await client.disconnect();
    }
    
    _logger.info('Disconnected from all STOMP servers');
  }

  /// Gets a client for a specific peer
  StompClient? getClient(PeerId peerId) {
    return _clients[peerId];
  }

  /// Sends a message to a destination on a specific peer
  Future<String?> sendMessage({
    required PeerId peerId,
    required String destination,
    String? body,
    String? contentType,
    bool requestReceipt = false,
    Map<String, String>? headers,
  }) async {
    final client = _clients[peerId];
    if (client == null || !client.isConnected) {
      throw StompConnectionException('No active connection to peer $peerId');
    }

    return await client.send(
      destination: destination,
      body: body,
      contentType: contentType,
      requestReceipt: requestReceipt,
      headers: headers,
    );
  }

  /// Subscribes to a destination on a specific peer
  Future<StompSubscription> subscribe({
    required PeerId peerId,
    required String destination,
    String? subscriptionId,
    StompAckMode ackMode = StompAckMode.auto,
    bool requestReceipt = false,
    Map<String, String>? headers,
  }) async {
    final client = _clients[peerId];
    if (client == null || !client.isConnected) {
      throw StompConnectionException('No active connection to peer $peerId');
    }

    return await client.subscribe(
      destination: destination,
      id: subscriptionId,
      ackMode: ackMode,
      requestReceipt: requestReceipt,
      headers: headers,
    );
  }

  /// Broadcasts a message to all connected peers
  Future<void> broadcast({
    required String destination,
    required String body,
    String? contentType,
    Map<String, String>? headers,
  }) async {
    final futures = <Future<String?>>[];
    
    for (final client in _clients.values) {
      if (client.isConnected) {
        futures.add(client.send(
          destination: destination,
          body: body,
          contentType: contentType,
          headers: headers,
        ));
      }
    }
    
    await Future.wait(futures);
    _logger.info('Broadcasted message to ${futures.length} peers');
  }

  /// Gets statistics about the STOMP service
  StompServiceStats getStats() {
    final connectedClients = _clients.values.where((c) => c.isConnected).length;
    final serverConnections = _server?.connections.length ?? 0;
    
    return StompServiceStats(
      isStarted: _isStarted,
      serverEnabled: _options.enableServer,
      serverRunning: _server?.isRunning ?? false,
      connectedClients: connectedClients,
      totalClients: _clients.length,
      serverConnections: serverConnections,
    );
  }
}

/// Configuration options for the STOMP service
class StompServiceOptions {
  /// Whether to enable the STOMP server
  final bool enableServer;

  /// Server name to advertise
  final String? serverName;

  /// Default timeout for operations
  final Duration timeout;

  /// Whether to enable automatic reconnection for clients
  final bool enableAutoReconnect;

  /// Interval for automatic reconnection attempts
  final Duration reconnectInterval;

  /// Maximum number of reconnection attempts
  final int maxReconnectAttempts;

  const StompServiceOptions({
    this.enableServer = true,
    this.serverName,
    this.timeout = StompConstants.defaultTimeout,
    this.enableAutoReconnect = false,
    this.reconnectInterval = const Duration(seconds: 5),
    this.maxReconnectAttempts = 3,
  });

  /// Creates options with server disabled
  const StompServiceOptions.clientOnly({
    this.timeout = StompConstants.defaultTimeout,
    this.enableAutoReconnect = false,
    this.reconnectInterval = const Duration(seconds: 5),
    this.maxReconnectAttempts = 3,
  }) : enableServer = false,
       serverName = null;

  /// Creates options with server enabled
  const StompServiceOptions.serverEnabled({
    this.serverName,
    this.timeout = StompConstants.defaultTimeout,
    this.enableAutoReconnect = false,
    this.reconnectInterval = const Duration(seconds: 5),
    this.maxReconnectAttempts = 3,
  }) : enableServer = true;
}

/// Statistics about the STOMP service
class StompServiceStats {
  /// Whether the service is started
  final bool isStarted;

  /// Whether the server is enabled
  final bool serverEnabled;

  /// Whether the server is running
  final bool serverRunning;

  /// Number of connected clients
  final int connectedClients;

  /// Total number of clients (including disconnected)
  final int totalClients;

  /// Number of connections to the server
  final int serverConnections;

  const StompServiceStats({
    required this.isStarted,
    required this.serverEnabled,
    required this.serverRunning,
    required this.connectedClients,
    required this.totalClients,
    required this.serverConnections,
  });

  @override
  String toString() {
    return 'StompServiceStats('
        'started: $isStarted, '
        'serverEnabled: $serverEnabled, '
        'serverRunning: $serverRunning, '
        'connectedClients: $connectedClients, '
        'totalClients: $totalClients, '
        'serverConnections: $serverConnections'
        ')';
  }
}

/// Helper class for creating STOMP services with common configurations
class StompServiceFactory {
  /// Creates a STOMP service with both client and server capabilities
  static StompService createFullService(Host host, {
    String? serverName,
    Duration? timeout,
  }) {
    return StompService(
      host,
      options: StompServiceOptions.serverEnabled(
        serverName: serverName,
        timeout: timeout ?? StompConstants.defaultTimeout,
      ),
    );
  }

  /// Creates a STOMP service with only client capabilities
  static StompService createClientOnlyService(Host host, {
    Duration? timeout,
    bool enableAutoReconnect = false,
  }) {
    return StompService(
      host,
      options: StompServiceOptions.clientOnly(
        timeout: timeout ?? StompConstants.defaultTimeout,
        enableAutoReconnect: enableAutoReconnect,
      ),
    );
  }

  /// Creates a STOMP service with custom options
  static StompService createCustomService(Host host, StompServiceOptions options) {
    return StompService(host, options: options);
  }
}

/// Extension methods for Host to easily add STOMP functionality
extension StompHostExtension on Host {
  /// Adds STOMP service to the host
  Future<StompService> addStompService({StompServiceOptions? options}) async {
    final service = StompService(this, options: options);
    await service.start();
    return service;
  }

  /// Creates a STOMP client connection to a peer
  Future<StompClient> connectStomp({
    required PeerId peerId,
    required String hostName,
    String? login,
    String? passcode,
    Duration? timeout,
  }) async {
    final client = StompClient(
      host: this,
      serverPeerId: peerId,
      hostName: hostName,
      login: login,
      passcode: passcode,
      timeout: timeout ?? StompConstants.defaultTimeout,
    );
    
    await client.connect();
    return client;
  }
}

/// Utility functions for STOMP
class StompUtils {
  /// Validates a destination name
  static bool isValidDestination(String destination) {
    if (destination.isEmpty) return false;
    
    // Basic validation - destinations should start with /
    if (!destination.startsWith('/')) return false;
    
    // Check for invalid characters
    const invalidChars = ['\n', '\r', '\0'];
    for (final char in invalidChars) {
      if (destination.contains(char)) return false;
    }
    
    return true;
  }

  /// Creates a topic destination
  static String createTopicDestination(String topic) {
    if (!topic.startsWith('/')) {
      return '/topic/$topic';
    }
    return topic;
  }

  /// Creates a queue destination
  static String createQueueDestination(String queue) {
    if (!queue.startsWith('/')) {
      return '/queue/$queue';
    }
    return queue;
  }

  /// Creates a temporary destination
  static String createTempDestination(String suffix) {
    return '/temp/${DateTime.now().millisecondsSinceEpoch}-$suffix';
  }

  /// Parses a destination to determine its type
  static StompDestinationType getDestinationType(String destination) {
    if (destination.startsWith('/topic/')) {
      return StompDestinationType.topic;
    } else if (destination.startsWith('/queue/')) {
      return StompDestinationType.queue;
    } else if (destination.startsWith('/temp/')) {
      return StompDestinationType.temporary;
    } else {
      return StompDestinationType.unknown;
    }
  }
}

/// Types of STOMP destinations
enum StompDestinationType {
  topic,
  queue,
  temporary,
  unknown;

  @override
  String toString() {
    switch (this) {
      case StompDestinationType.topic:
        return 'topic';
      case StompDestinationType.queue:
        return 'queue';
      case StompDestinationType.temporary:
        return 'temporary';
      case StompDestinationType.unknown:
        return 'unknown';
    }
  }
}
