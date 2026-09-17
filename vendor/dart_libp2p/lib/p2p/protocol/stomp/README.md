# STOMP Protocol Implementation for dart-libp2p

This directory contains a complete implementation of the STOMP (Simple Text Oriented Messaging Protocol) version 1.2 for the dart-libp2p library. STOMP is a simple interoperable protocol designed for asynchronous message passing between clients via mediating servers.

## Overview

The STOMP implementation provides both client and server functionality, allowing libp2p peers to communicate using the STOMP messaging protocol over libp2p streams. This enables reliable message passing, publish-subscribe patterns, and transactional messaging between peers in a libp2p network.

## Features

- **Full STOMP 1.2 Compliance**: Implements the complete STOMP 1.2 specification
- **Client and Server Support**: Both client and server implementations
- **Message Acknowledgments**: Support for auto, client, and client-individual acknowledgment modes
- **Transactions**: Full transaction support with BEGIN, COMMIT, and ABORT
- **Subscriptions**: Subscribe to destinations and receive messages
- **Receipt Handling**: Optional receipt confirmation for reliable operations
- **Frame Validation**: Comprehensive frame validation and error handling
- **Escape Sequences**: Proper handling of STOMP escape sequences in headers
- **Size Limits**: Configurable limits for frame size, headers, and body
- **Timeout Support**: Configurable timeouts for all operations

## Architecture

The implementation follows the libp2p pattern of separating interfaces and implementations:

### Core Components

- **`stomp_frame.dart`**: Frame parsing, serialization, and validation
- **`stomp_constants.dart`**: Protocol constants and configuration
- **`stomp_exceptions.dart`**: Exception hierarchy for error handling
- **`stomp_subscription.dart`**: Subscription and acknowledgment management
- **`stomp_transaction.dart`**: Transaction management and coordination

### Client/Server Components

- **`stomp_client.dart`**: STOMP client implementation
- **`stomp_server.dart`**: STOMP server implementation
- **`stomp_service.dart`**: High-level service combining client and server

## Usage

### Basic Setup

```dart
import 'package:dart_libp2p/p2p/protocol/stomp.dart';

// Create a STOMP service with both client and server capabilities
final stompService = await host.addStompService(
  options: const StompServiceOptions.serverEnabled(
    serverName: 'my-stomp-server/1.0',
  ),
);
```

### Client Usage

```dart
// Connect to a STOMP server
final client = await host.connectStomp(
  peerId: serverPeerId,
  hostName: 'example.com',
  login: 'username',      // optional
  passcode: 'password',   // optional
);

// Send a message
await client.send(
  destination: '/queue/messages',
  body: 'Hello, STOMP!',
  contentType: 'text/plain',
  requestReceipt: true,
);

// Subscribe to a destination
final subscription = await client.subscribe(
  destination: '/topic/news',
  ackMode: StompAckMode.client,
);

// Listen for messages
subscription.messages.listen((message) async {
  
  // Acknowledge the message
  if (message.requiresAck) {
    await client.ack(messageId: message.ackId!);
  }
});
```

### Server Usage

```dart
// The server is automatically started with the service
final server = stompService.server!;

// Listen for new connections
server.onConnection.listen((connection) {
});

// Send a message to a destination
await server.sendToDestination(
  destination: '/topic/announcements',
  body: 'Server announcement',
  contentType: 'text/plain',
);

// Broadcast to all connected clients
await server.broadcast(
  body: 'System maintenance in 5 minutes',
  contentType: 'text/plain',
);
```

### Transactions

```dart
// Begin a transaction
final transaction = await client.beginTransaction();

try {
  // Send multiple messages in the transaction
  await client.send(
    destination: '/queue/orders',
    body: 'Order #1',
    transactionId: transaction.id,
  );
  
  await client.send(
    destination: '/queue/orders',
    body: 'Order #2',
    transactionId: transaction.id,
  );
  
  // Commit the transaction
  await client.commitTransaction(transactionId: transaction.id);
} catch (e) {
  // Abort on error
  await client.abortTransaction(transactionId: transaction.id);
}
```

## Protocol Details

### Frame Structure

STOMP frames follow this structure:
```
COMMAND
header1:value1
header2:value2

Body^@
```

- Command line terminated by LF (or CRLF)
- Headers in `key:value` format, one per line
- Empty line separates headers from body
- Body terminated by NULL byte (^@)

### Supported Commands

#### Client Commands
- `CONNECT` / `STOMP` - Connect to server
- `SEND` - Send a message
- `SUBSCRIBE` - Subscribe to destination
- `UNSUBSCRIBE` - Unsubscribe from destination
- `ACK` - Acknowledge message
- `NACK` - Negative acknowledge message
- `BEGIN` - Begin transaction
- `COMMIT` - Commit transaction
- `ABORT` - Abort transaction
- `DISCONNECT` - Disconnect from server

#### Server Commands
- `CONNECTED` - Connection acknowledgment
- `MESSAGE` - Message delivery
- `RECEIPT` - Receipt confirmation
- `ERROR` - Error notification

### Destinations

Destinations are opaque strings that identify message endpoints:

- `/queue/name` - Point-to-point queues
- `/topic/name` - Publish-subscribe topics
- `/temp/name` - Temporary destinations

Use `StompUtils` for destination management:

```dart
final queueDest = StompUtils.createQueueDestination('orders');
final topicDest = StompUtils.createTopicDestination('news');
final tempDest = StompUtils.createTempDestination('session123');
```

### Acknowledgment Modes

- **`auto`**: Automatic acknowledgment (default)
- **`client`**: Manual acknowledgment (cumulative)
- **`client-individual`**: Manual acknowledgment (per message)

### Error Handling

The implementation provides a comprehensive exception hierarchy:

- `StompException` - Base exception
- `StompFrameException` - Frame parsing/validation errors
- `StompConnectionException` - Connection errors
- `StompTimeoutException` - Timeout errors
- `StompServerErrorException` - Server-sent errors
- And more specific exceptions for different scenarios

## Configuration

### Service Options

```dart
const options = StompServiceOptions(
  enableServer: true,                    // Enable server functionality
  serverName: 'my-server/1.0',          // Server identification
  timeout: Duration(seconds: 30),       // Default operation timeout
  enableAutoReconnect: false,           // Auto-reconnect clients
  reconnectInterval: Duration(seconds: 5), // Reconnect interval
  maxReconnectAttempts: 3,              // Max reconnect attempts
);
```

### Protocol Constants

Key constants can be found in `StompConstants`:

- `maxFrameSize`: 64KB default frame size limit
- `maxHeaders`: 100 headers per frame limit
- `maxHeaderLength`: 1KB header length limit
- `maxBodySize`: 8MB body size limit
- `defaultTimeout`: 30 seconds default timeout

## P2P Integration

### Connection Management

The STOMP implementation leverages libp2p's connection infrastructure:

```dart
// STOMP uses libp2p streams for transport
final client = await host.connectStomp(
  peerId: targetPeer,
  hostName: 'peer-to-peer',
);

// Automatic reconnection on stream failures
client.onStateChange.listen((state) {
  if (state == StompClientState.error) {
    // Library handles automatic reconnection
  }
});
```

### Peer Discovery Integration

STOMP works with libp2p's peer discovery mechanisms:

```dart
// Example: Connect to discovered peers
host.network.onPeerConnect.listen((peerId) async {
  try {
    final client = await host.connectStomp(
      peerId: peerId,
      hostName: 'discovered-peer',
    );
    
    // Subscribe to peer's announcements
    await client.subscribe(
      destination: '/peer/${peerId}/announcements',
      ackMode: StompAckMode.auto,
    );
  } catch (e) {
  }
});
```

### Stream Lifecycle Management

- Automatic stream reconnection on failures
- Integration with libp2p's connection manager
- Proper resource cleanup on disconnection
- Support for libp2p context and scoping

## Destination Patterns

### Recommended Conventions

The library doesn't enforce destination patterns, but here are recommended conventions for P2P networks:

```dart
// Direct peer messaging
'/peer/{peerId}/inbox'           // Personal inbox
'/peer/{peerId}/queue/{name}'    // Peer-specific queues
'/peer/{peerId}/rpc/{service}'   // RPC endpoints

// Network-wide destinations
'/network/topic/{name}'          // Global topics
'/network/broadcast'             // Network broadcasts
'/network/events/{type}'         // Event streams

// Local destinations
'/local/queue/{name}'            // Local-only queues
'/local/temp/{session}'          // Temporary destinations

// Service-oriented destinations
'/service/{name}/requests'       // Service requests
'/service/{name}/responses'      // Service responses
'/service/{name}/events'         // Service events

// Group-based destinations
'/group/{groupId}/topic/{name}'  // Group topics
'/group/{groupId}/chat'          // Group chat
```

### Custom Destination Resolution

Applications can implement custom destination resolution:

```dart
class P2PDestinationResolver {
  final Host host;
  final Map<String, PeerId> serviceRegistry = {};
  
  P2PDestinationResolver(this.host);
  
  /// Resolve a destination to a target peer
  PeerId? resolvePeer(String destination) {
    // Direct peer destinations
    if (destination.startsWith('/peer/')) {
      final parts = destination.split('/');
      if (parts.length >= 3) {
        return PeerId.fromString(parts[2]);
      }
    }
    
    // Service destinations
    if (destination.startsWith('/service/')) {
      final parts = destination.split('/');
      if (parts.length >= 3) {
        return serviceRegistry[parts[2]];
      }
    }
    
    // Network destinations - could use DHT or broadcast
    if (destination.startsWith('/network/')) {
      return null; // Indicates broadcast needed
    }
    
    return null;
  }
  
  /// Register a service provider
  void registerService(String serviceName, PeerId provider) {
    serviceRegistry[serviceName] = provider;
  }
}
```

### Destination Utilities

Use the built-in utilities for common patterns:

```dart
// Create standardized destinations
final peerInbox = '/peer/${peerId}/inbox';
final networkTopic = StompUtils.createTopicDestination('global-events');
final serviceEndpoint = '/service/user-management/requests';

// Validate destination format
if (StompUtils.isValidDestination(destination)) {
  await client.send(destination: destination, body: message);
}

// Determine destination type
final type = StompUtils.getDestinationType(destination);
switch (type) {
  case StompDestinationType.topic:
    // Handle topic subscription
    break;
  case StompDestinationType.queue:
    // Handle queue messaging
    break;
}
```

## Multi-Peer Messaging Patterns

### Direct Peer Communication

```dart
// Connect to specific peer and send direct message
final targetPeer = PeerId.fromString('12D3KooW...');
final client = await host.connectStomp(
  peerId: targetPeer,
  hostName: 'direct-messaging',
);

await client.send(
  destination: '/peer/${targetPeer}/inbox',
  body: 'Direct message to peer',
  contentType: 'text/plain',
);
```

### Network Broadcasting

Application-level broadcast implementation:

```dart
class NetworkBroadcaster {
  final StompService stompService;
  final Set<PeerId> connectedPeers = {};
  
  NetworkBroadcaster(this.stompService) {
    // Track connected peers
    stompService.server?.onConnection.listen((connection) {
      connectedPeers.add(connection.peerId);
    });
    
    stompService.server?.onDisconnection.listen((connection) {
      connectedPeers.remove(connection.peerId);
    });
  }
  
  /// Broadcast message to all connected peers
  Future<void> broadcast(String message, {String? contentType}) async {
    final futures = <Future<void>>[];
    
    for (final peerId in connectedPeers) {
      futures.add(_sendToPeer(peerId, message, contentType));
    }
    
    // Wait for all sends to complete
    final results = await Future.wait(
      futures,
      eagerError: false, // Don't fail on individual peer errors
    );
    
  }
  
  Future<void> _sendToPeer(PeerId peerId, String message, String? contentType) async {
    try {
      final client = stompService.getClient(peerId);
      if (client?.isConnected == true) {
        await client!.send(
          destination: '/network/broadcast',
          body: message,
          contentType: contentType,
        );
      }
    } catch (e) {
    }
  }
}
```

### Message Routing

Example of application-level message routing:

```dart
class MessageRouter {
  final StompService stompService;
  final P2PDestinationResolver resolver;
  
  MessageRouter(this.stompService, this.resolver) {
    // Listen for messages that need routing
    stompService.server?.onMessage.listen(_routeMessage);
  }
  
  Future<void> _routeMessage(StompMessage message) async {
    final targetPeer = resolver.resolvePeer(message.destination);
    
    if (targetPeer == null) {
      // Network-wide destination - broadcast
      await _broadcastMessage(message);
    } else if (targetPeer != stompService._host.id) {
      // Forward to specific peer
      await _forwardMessage(message, targetPeer);
    }
    // If targetPeer is us, message is already delivered locally
  }
  
  Future<void> _forwardMessage(StompMessage message, PeerId targetPeer) async {
    try {
      final client = await stompService.connect(
        peerId: targetPeer,
        hostName: 'message-router',
      );
      
      await client.send(
        destination: message.destination,
        body: message.body,
        contentType: message.contentType,
        headers: message.headers,
      );
    } catch (e) {
    }
  }
  
  Future<void> _broadcastMessage(StompMessage message) async {
    // Implementation depends on network topology
    // Could use DHT, gossip protocol, or known peer list
  }
}
```

### Service Discovery Pattern

```dart
class StompServiceRegistry {
  final StompService stompService;
  final Map<String, Set<PeerId>> services = {};
  
  StompServiceRegistry(this.stompService) {
    _setupServiceDiscovery();
  }
  
  void _setupServiceDiscovery() {
    // Listen for service announcements
    stompService.server?.onMessage.listen((message) {
      if (message.destination.startsWith('/network/services/announce')) {
        _handleServiceAnnouncement(message);
      }
    });
  }
  
  /// Register a service
  Future<void> registerService(String serviceName) async {
    await stompService.server?.sendToDestination(
      destination: '/network/services/announce',
      body: serviceName,
      headers: {'peer-id': stompService._host.id.toString()},
    );
  }
  
  /// Find providers for a service
  Set<PeerId> findServiceProviders(String serviceName) {
    return services[serviceName] ?? {};
  }
  
  void _handleServiceAnnouncement(StompMessage message) {
    final serviceName = message.body;
    final peerIdStr = message.getHeader('peer-id');
    
    if (serviceName != null && peerIdStr != null) {
      final peerId = PeerId.fromString(peerIdStr);
      services.putIfAbsent(serviceName, () => {}).add(peerId);
    }
  }
}
```

## Network Resilience

### Library-Provided Features

The STOMP library provides several resilience features:

- **Automatic Stream Reconnection**: Handles libp2p stream failures
- **Connection State Monitoring**: Track connection health
- **Timeout Handling**: Configurable timeouts for all operations
- **Resource Cleanup**: Proper cleanup on failures
- **Transaction Rollback**: Automatic rollback on connection loss

```dart
// Monitor connection health
client.onStateChange.listen((state) {
  switch (state) {
    case StompClientState.connected:
      break;
    case StompClientState.disconnected:
      break;
    case StompClientState.error:
      break;
  }
});
```

### Application-Level Resilience

Applications should implement additional resilience patterns:

```dart
class ResilientMessaging {
  final StompClient client;
  final int maxRetries;
  final Duration baseDelay;
  
  ResilientMessaging(this.client, {
    this.maxRetries = 3,
    this.baseDelay = const Duration(seconds: 1),
  });
  
  /// Send message with exponential backoff retry
  Future<void> sendWithRetry(String destination, String message) async {
    var attempts = 0;
    
    while (attempts < maxRetries) {
      try {
        await client.send(
          destination: destination,
          body: message,
          requestReceipt: true, // Ensure delivery confirmation
        );
        return; // Success
      } catch (e) {
        attempts++;
        if (attempts >= maxRetries) {
          throw StompException('Failed after $maxRetries attempts: $e');
        }
        
        // Exponential backoff
        final delay = baseDelay * pow(2, attempts - 1);
        await Future.delayed(delay);
      }
    }
  }
  
  /// Subscribe with automatic resubscription
  Future<StompSubscription> subscribeWithReconnect(
    String destination, {
    StompAckMode ackMode = StompAckMode.auto,
  }) async {
    late StompSubscription subscription;
    
    Future<void> subscribe() async {
      subscription = await client.subscribe(
        destination: destination,
        ackMode: ackMode,
      );
    }
    
    // Initial subscription
    await subscribe();
    
    // Resubscribe on reconnection
    client.onStateChange.listen((state) async {
      if (state == StompClientState.connected) {
        try {
          await subscribe();
        } catch (e) {
        }
      }
    });
    
    return subscription;
  }
}
```

### Network Partition Handling

```dart
class PartitionAwareMessaging {
  final StompService stompService;
  final List<StompMessage> pendingMessages = [];
  
  PartitionAwareMessaging(this.stompService) {
    _setupPartitionDetection();
  }
  
  void _setupPartitionDetection() {
    // Monitor peer connections
    stompService.server?.onDisconnection.listen((connection) {
      _handlePeerDisconnection(connection.peerId);
    });
  }
  
  /// Send message with partition awareness
  Future<void> sendMessage(PeerId targetPeer, String destination, String message) async {
    try {
      final client = stompService.getClient(targetPeer);
      if (client?.isConnected == true) {
        await client!.send(destination: destination, body: message);
      } else {
        // Queue for later delivery
        pendingMessages.add(StompMessage(
          messageId: _generateId(),
          destination: destination,
          subscriptionId: '',
          headers: {'target-peer': targetPeer.toString()},
          body: message,
        ));
      }
    } catch (e) {
      // Could implement dead letter queue here
    }
  }
  
  void _handlePeerDisconnection(PeerId peerId) {
    // Could implement message persistence here
  }
  
  String _generateId() => DateTime.now().millisecondsSinceEpoch.toString();
}
```

## Integration with libp2p

The STOMP implementation integrates seamlessly with libp2p:

- Uses libp2p streams for transport
- Follows libp2p protocol negotiation
- Integrates with libp2p peer discovery
- Uses libp2p security and multiplexing
- Supports libp2p context and scoping

## Thread Safety

The implementation is designed to be thread-safe:

- All managers use proper synchronization
- Stream operations are properly coordinated
- State changes are atomic where required
- Concurrent operations are supported

## Performance Considerations

- Frame parsing is optimized for common cases
- Memory usage is bounded by configurable limits
- Connection pooling reduces overhead
- Efficient subscription routing

## Production Deployment

### Peer Discovery Strategy

Choose appropriate peer discovery mechanisms for your network:

```dart
// Local network discovery
final mdnsService = MdnsDiscovery();
await host.discovery.addService(mdnsService);

// Bootstrap peers for wide area networks
final bootstrapPeers = [
  PeerId.fromString('12D3KooW...'),
  PeerId.fromString('12D3KooW...'),
];

// DHT for peer discovery
final dhtService = KademliaDHT();
await host.discovery.addService(dhtService);
```

### Message Persistence

The library provides in-memory messaging only. For production, consider:

```dart
class PersistentStompService {
  final StompService stompService;
  final MessageStore messageStore;
  
  PersistentStompService(this.stompService, this.messageStore) {
    _setupPersistence();
  }
  
  void _setupPersistence() {
    // Persist outgoing messages
    stompService.server?.onMessage.listen((message) async {
      await messageStore.store(message);
    });
    
    // Handle offline peer messages
    stompService.server?.onDisconnection.listen((connection) async {
      final queuedMessages = await messageStore.getQueuedMessages(connection.peerId);
      // Store for later delivery
    });
  }
}

abstract class MessageStore {
  Future<void> store(StompMessage message);
  Future<List<StompMessage>> getQueuedMessages(PeerId peerId);
  Future<void> markDelivered(String messageId);
}
```

### Monitoring and Metrics

Implement comprehensive monitoring:

```dart
class StompMetrics {
  final StompService stompService;
  int messagesRouted = 0;
  int connectionsActive = 0;
  final Map<String, int> destinationCounts = {};
  
  StompMetrics(this.stompService) {
    _setupMetrics();
  }
  
  void _setupMetrics() {
    stompService.server?.onMessage.listen((message) {
      messagesRouted++;
      destinationCounts[message.destination] = 
          (destinationCounts[message.destination] ?? 0) + 1;
    });
    
    stompService.server?.onConnection.listen((_) {
      connectionsActive++;
    });
    
    stompService.server?.onDisconnection.listen((_) {
      connectionsActive--;
    });
  }
  
  Map<String, dynamic> getMetrics() {
    return {
      'messages_routed': messagesRouted,
      'connections_active': connectionsActive,
      'destination_counts': destinationCounts,
      'service_stats': stompService.getStats(),
    };
  }
}
```

### Security Considerations

Implement appropriate security measures:

```dart
class SecureStompService {
  final StompService stompService;
  final Set<PeerId> allowedPeers;
  
  SecureStompService(this.stompService, this.allowedPeers) {
    _setupSecurity();
  }
  
  void _setupSecurity() {
    // Connection filtering
    stompService.server?.onConnection.listen((connection) {
      if (!allowedPeers.contains(connection.peerId)) {
        connection.close();
      }
    });
    
    // Message filtering
    stompService.server?.onMessage.listen((message) {
      if (!_isAuthorizedDestination(message.destination)) {
        return;
      }
    });
  }
  
  bool _isAuthorizedDestination(String destination) {
    // Implement your authorization logic
    return !destination.startsWith('/admin/');
  }
}
```

### Load Balancing

For high-throughput scenarios:

```dart
class LoadBalancedStompService {
  final List<StompService> services;
  int _currentIndex = 0;
  
  LoadBalancedStompService(this.services);
  
  StompService getNextService() {
    final service = services[_currentIndex];
    _currentIndex = (_currentIndex + 1) % services.length;
    return service;
  }
  
  Future<void> sendMessage(String destination, String message) async {
    final service = getNextService();
    await service.server?.sendToDestination(
      destination: destination,
      body: message,
    );
  }
}
```

### Configuration Management

Use environment-based configuration:

```dart
class StompConfig {
  final String serverName;
  final Duration timeout;
  final int maxConnections;
  final bool enableMetrics;
  final List<String> allowedDestinations;
  
  StompConfig({
    required this.serverName,
    this.timeout = const Duration(seconds: 30),
    this.maxConnections = 1000,
    this.enableMetrics = true,
    this.allowedDestinations = const [],
  });
  
  factory StompConfig.fromEnvironment() {
    return StompConfig(
      serverName: Platform.environment['STOMP_SERVER_NAME'] ?? 'dart-libp2p-stomp',
      timeout: Duration(
        seconds: int.parse(Platform.environment['STOMP_TIMEOUT'] ?? '30'),
      ),
      maxConnections: int.parse(Platform.environment['STOMP_MAX_CONNECTIONS'] ?? '1000'),
      enableMetrics: Platform.environment['STOMP_ENABLE_METRICS'] == 'true',
    );
  }
}
```

## Common Usage Patterns

### Chat Application

```dart
class P2PChatService {
  final StompService stompService;
  final String userId;
  
  P2PChatService(this.stompService, this.userId);
  
  Future<void> sendMessage(String recipientId, String message) async {
    await stompService.sendMessage(
      peerId: PeerId.fromString(recipientId),
      destination: '/peer/$recipientId/chat',
      body: jsonEncode({
        'from': userId,
        'message': message,
        'timestamp': DateTime.now().toIso8601String(),
      }),
      contentType: 'application/json',
    );
  }
  
  Future<void> joinChatRoom(String roomId) async {
    // Subscribe to room messages
    await stompService.subscribe(
      peerId: PeerId.fromString(roomId), // Room server peer
      destination: '/room/$roomId/messages',
      ackMode: StompAckMode.auto,
    );
  }
}
```

### Event Distribution

```dart
class EventDistributor {
  final StompService stompService;
  final Set<PeerId> subscribers = {};
  
  EventDistributor(this.stompService);
  
  Future<void> publishEvent(String eventType, Map<String, dynamic> data) async {
    final eventData = jsonEncode({
      'type': eventType,
      'data': data,
      'timestamp': DateTime.now().toIso8601String(),
    });
    
    for (final subscriber in subscribers) {
      try {
        await stompService.sendMessage(
          peerId: subscriber,
          destination: '/events/$eventType',
          body: eventData,
          contentType: 'application/json',
        );
      } catch (e) {
      }
    }
  }
  
  void addSubscriber(PeerId peerId) {
    subscribers.add(peerId);
  }
}
```

### RPC over STOMP

```dart
class StompRpcService {
  final StompService stompService;
  final Map<String, Completer<String>> pendingRequests = {};
  
  StompRpcService(this.stompService) {
    _setupResponseHandler();
  }
  
  void _setupResponseHandler() {
    // Listen for RPC responses
    stompService.server?.onMessage.listen((message) {
      if (message.destination.startsWith('/rpc/response/')) {
        final requestId = message.destination.split('/').last;
        final completer = pendingRequests.remove(requestId);
        completer?.complete(message.body ?? '');
      }
    });
  }
  
  Future<String> callRemoteMethod(
    PeerId targetPeer,
    String method,
    Map<String, dynamic> params,
  ) async {
    final requestId = _generateRequestId();
    final completer = Completer<String>();
    pendingRequests[requestId] = completer;
    
    await stompService.sendMessage(
      peerId: targetPeer,
      destination: '/rpc/request/$method',
      body: jsonEncode({
        'id': requestId,
        'method': method,
        'params': params,
        'responseDestination': '/rpc/response/$requestId',
      }),
      contentType: 'application/json',
    );
    
    return completer.future.timeout(const Duration(seconds: 30));
  }
  
  String _generateRequestId() => 
      'req_${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(1000)}';
}
```

## Testing

See the `example/stomp_example.dart` file for a comprehensive example demonstrating all features of the STOMP implementation.

## Compliance

This implementation follows the STOMP 1.2 specification:
- Full frame format compliance
- Proper escape sequence handling
- Complete command set support
- Correct error handling
- Specification-compliant timeouts

## Future Enhancements

Potential future improvements:

- Heart-beat implementation
- Message persistence
- Advanced routing patterns
- Metrics and monitoring
- Performance optimizations
- Additional destination types

## Contributing

When contributing to the STOMP implementation:

1. Follow the existing code patterns
2. Add comprehensive tests
3. Update documentation
4. Ensure STOMP 1.2 compliance
5. Consider backward compatibility
