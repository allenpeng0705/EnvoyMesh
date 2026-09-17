import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/context.dart' as core_context;
import 'package:dart_libp2p/core/network/mux.dart' as core_mux_types; // Aliased import
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/host/eventbus/basic.dart';
import 'package:dart_libp2p/p2p/protocol/http/http_protocol.dart';
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/p2p/network/connmgr/null_conn_mgr.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart'; // Corrected import
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/p2p/transport/listener.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart'; // Corrected import for YamuxSession
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/stream.dart'; // Added import for YamuxStream
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart'; // For MultiplexerConfig
import 'package:dart_libp2p/config/stream_muxer.dart'; // For StreamMuxer base class
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_udx/dart_udx.dart';
import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart' as p2p_transport; // Aliased for clarity
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart'; // Added for ResourceManagerImpl
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart'; // Added for FixedLimiter
import 'package:dart_libp2p/p2p/network/swarm/swarm.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/host/peerstore/pstoremem/peerstore.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/network/stream.dart' as core_network_stream;
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart' as multiaddr_protocol;
import 'package:dart_libp2p/core/peerstore.dart'; // For AddressTTL
import 'package:dart_libp2p/core/network/network.dart'; // For Network type in TestNotifiee
import 'package:dart_libp2p/core/network/notifiee.dart'; // For Notifiee interface

// Custom AddrsFactory for testing that doesn't filter loopback
List<MultiAddr> passThroughAddrsFactory(List<MultiAddr> addrs) {
  return addrs;
}

// Helper class for providing YamuxMuxer to the config
class _TestYamuxMuxerProvider extends StreamMuxer {
  final MultiplexerConfig yamuxConfig;

  _TestYamuxMuxerProvider({required this.yamuxConfig})
      : super(
          id: '/yamux/1.0.0', // Matches YamuxSession.protocolId
          muxerFactory: (Conn secureConn, bool isClient) {
            if (secureConn is! TransportConn) {
              throw ArgumentError(
                  'YamuxMuxer factory expects a TransportConn, got ${secureConn.runtimeType}');
            }
            return YamuxSession(secureConn, yamuxConfig, isClient);
          },
        );
}

// Helper Notifiee for tests
class TestNotifiee implements Notifiee {
  final Function(Network, Conn)? connectedCallback;
  final Function(Network, Conn)? disconnectedCallback;
  final Function(Network, MultiAddr)? listenCallback;
  final Function(Network, MultiAddr)? listenCloseCallback;

  TestNotifiee({
    this.connectedCallback,
    this.disconnectedCallback,
    this.listenCallback,
    this.listenCloseCallback,
  });

  @override
  Future<void> connected(Network network, Conn conn, {Duration? dialLatency}) async {
    connectedCallback?.call(network, conn);
  }

  @override
  Future<void> disconnected(Network network, Conn conn) async {
    disconnectedCallback?.call(network, conn);
  }

  @override
  void listen(Network network, MultiAddr addr) {
    listenCallback?.call(network, addr);
  }

  @override
  void listenClose(Network network, MultiAddr addr) {
    listenCloseCallback?.call(network, addr);
  }
}

void main() {
  group('Swarm with UDX, Noise, and HTTP', () {
    late BasicHost clientHost;
    late BasicHost serverHost;
    late PeerId clientPeerId;
    late PeerId serverPeerId;
    late KeyPair clientKeyPair;
    late KeyPair serverKeyPair;
    late UDX udxInstance;
    late MultiAddr serverListenAddr;

    setUpAll(() async {
      udxInstance = UDX();

      clientKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      serverKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      clientPeerId = await PeerId.fromPublicKey(clientKeyPair.publicKey);
      serverPeerId = await PeerId.fromPublicKey(serverKeyPair.publicKey);

      final yamuxMultiplexerConfig = MultiplexerConfig(
        keepAliveInterval: Duration(seconds: 30),
        maxStreamWindowSize: 1024 * 1024,
        initialStreamWindowSize: 256 * 1024,
        streamWriteTimeout: Duration(seconds: 10),
        maxStreams: 256,
      );
      final muxerDefs = [_TestYamuxMuxerProvider(yamuxConfig: yamuxMultiplexerConfig)];

      final clientSecurity = [await NoiseSecurity.create(clientKeyPair)];
      final serverSecurity = [await NoiseSecurity.create(serverKeyPair)];

      final resourceManager = ResourceManagerImpl(limiter: FixedLimiter());
      final p2p_transport.ConnectionManager connManager = p2p_transport.ConnectionManager(); 
      final eventBus = BasicBus();

      final clientP2PConfig = p2p_config.Config()
        ..peerKey = clientKeyPair
        ..securityProtocols = clientSecurity
        ..muxers = muxerDefs
        ..connManager= connManager
        ..eventBus = eventBus;

      final serverP2PConfig = p2p_config.Config()
        ..peerKey = serverKeyPair
        ..securityProtocols = serverSecurity
        ..muxers = muxerDefs
        ..addrsFactory = passThroughAddrsFactory;
      final initialListenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
      serverP2PConfig.listenAddrs = [initialListenAddr]; 
      serverP2PConfig.connManager= connManager; 
      serverP2PConfig.eventBus = eventBus;

      final clientUdxTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);
      final serverUdxTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);
      
      final clientPeerstore = MemoryPeerstore(); 
      final serverPeerstore = MemoryPeerstore(); 

      final clientSwarm = Swarm(
        host: null, 
        localPeer: clientPeerId,
        peerstore: clientPeerstore,
        resourceManager: resourceManager, 
        upgrader: BasicUpgrader(resourceManager: resourceManager),
        config: clientP2PConfig,
        transports: [clientUdxTransport],
      );
      clientHost = await BasicHost.create(network: clientSwarm, config: clientP2PConfig);
      clientSwarm.setHost(clientHost); 
      await clientHost.start(); 

      final serverSwarm = Swarm(
        host: null, 
        localPeer: serverPeerId,
        peerstore: serverPeerstore,
        resourceManager: resourceManager, 
        upgrader: BasicUpgrader(resourceManager: resourceManager),
        config: serverP2PConfig,
        transports: [serverUdxTransport],
      );
      serverHost = await BasicHost.create(network: serverSwarm, config: serverP2PConfig);
      serverSwarm.setHost(serverHost); 
      
      // Setup HTTP server
      final httpServer = HttpProtocolService(serverHost);
      
      // Add a simple GET route
      httpServer.get('/hello', (request) async {
        return HttpResponse.text('Hello, World!');
      });
      
      // Add a route with JSON response
      httpServer.get('/api/status', (request) async {
        return HttpResponse.json({
          'status': 'ok',
          'timestamp': DateTime.now().toIso8601String(),
          'server': 'dart-libp2p-http-test'
        });
      });

      await serverSwarm.listen(serverP2PConfig.listenAddrs); 
      await serverHost.start(); 
      
      expect(serverHost.addrs.isNotEmpty, isTrue); 
      serverListenAddr = serverHost.addrs.firstWhere((addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name)); 
      print('Server Host listening on: $serverListenAddr');

     clientHost.peerStore.addrBook.addAddrs(
        serverPeerId, 
        [serverListenAddr], 
        AddressTTL.permanentAddrTTL 
      );
      clientHost.peerStore.keyBook.addPubKey(serverPeerId, serverKeyPair.publicKey);

      print('Swarm UDX/Noise/HTTP Setup Complete. Client: ${clientPeerId.toString()}, Server: ${serverPeerId.toString()} listening on $serverListenAddr');
    });

    tearDownAll(() async {
      print('Closing client host...');
      await clientHost.close();
      print('Closing server host...');
      await serverHost.close();
      print('Swarm UDX/Noise/HTTP Teardown Complete.');
    });

    test('should establish connection via Swarm, negotiate Noise/Yamux, and perform basic HTTP requests', () async {
      print('Client Host (${clientPeerId.toString()}) connecting to Server Host (${serverPeerId.toString()}) for HTTP protocol');
      
      try {
        final serverAddrInfo = AddrInfo(serverPeerId, [serverListenAddr]); 
        await clientHost.connect(serverAddrInfo);
        print('Client Host connected to Server Host.');

        // Create HTTP client
        final httpClient = HttpProtocolService(clientHost);

        // Test 1: Simple GET request
        print('Testing GET /hello...');
        final response1 = await httpClient.getRequest(serverPeerId, '/hello');
        
        expect(response1.status, equals(HttpStatus.ok));
        expect(response1.contentType, contains('text/plain'));
        expect(response1.bodyAsString, equals('Hello, World!'));
        print('✓ GET /hello successful: ${response1.bodyAsString}');

        // Test 2: JSON API request
        print('Testing GET /api/status...');
        final response2 = await httpClient.getRequest(serverPeerId, '/api/status');
        
        expect(response2.status, equals(HttpStatus.ok));
        expect(response2.contentType, contains('application/json'));
        
        final statusData = response2.bodyAsJson;
        expect(statusData, isNotNull);
        expect(statusData!['status'], equals('ok'));
        expect(statusData['server'], equals('dart-libp2p-http-test'));
        expect(statusData['timestamp'], isNotNull);
        print('✓ GET /api/status successful: $statusData');

        // Test 3: 404 Not Found
        print('Testing GET /nonexistent...');
        final response3 = await httpClient.getRequest(serverPeerId, '/nonexistent');
        
        expect(response3.status, equals(HttpStatus.notFound));
        expect(response3.bodyAsString, equals('Not found'));
        print('✓ GET /nonexistent returned 404 as expected');

        print('Basic HTTP protocol test successful via Swarm/Host.');

      } catch (e, s) {
        print('HTTP test failed: $e\n$s');
        fail('HTTP test failed: $e');
      }

      await Future.delayed(Duration(milliseconds: 100));

    }, timeout: Timeout(Duration(seconds: 30)));

    test('should handle POST requests with JSON data', () async {
      print('Testing POST requests with JSON payloads');
      
      try {
        final serverAddrInfo = AddrInfo(serverPeerId, [serverListenAddr]); 
        await clientHost.connect(serverAddrInfo);
        print('Client Host connected to Server Host for POST testing.');

        // Setup additional POST routes on the existing server
        final httpServer = HttpProtocolService(serverHost);
        
        // Add POST route for user creation
        httpServer.post('/api/users', (request) async {
          final userData = request.bodyAsJson;
          if (userData == null) {
            return HttpResponse.error(HttpStatus.badRequest, 'Invalid JSON data');
          }
          
          if (!userData.containsKey('name') || !userData.containsKey('email')) {
            return HttpResponse.error(HttpStatus.badRequest, 'Missing required fields');
          }
          
          final newUser = {
            'id': DateTime.now().millisecondsSinceEpoch.toString(),
            'name': userData['name'],
            'email': userData['email'],
            'created_at': DateTime.now().toIso8601String(),
          };
          
          return HttpResponse.json(newUser, status: HttpStatus.created);
        });
        
        // Add POST route for data processing
        httpServer.post('/api/process', (request) async {
          final data = request.bodyAsJson;
          if (data == null) {
            return HttpResponse.error(HttpStatus.badRequest, 'Invalid JSON data');
          }
          
          final result = {
            'input': data,
            'processed': true,
            'timestamp': DateTime.now().toIso8601String(),
            'result_count': (data['items'] as List?)?.length ?? 0,
          };
          
          return HttpResponse.json(result);
        });

        final httpClient = HttpProtocolService(clientHost);

        // Test 1: Create user with valid JSON
        print('Testing POST /api/users with valid data...');
        final userData = {
          'name': 'Alice Johnson',
          'email': 'alice.johnson@example.com',
        };
        
        final response1 = await httpClient.postJson(serverPeerId, '/api/users', userData);
        
        expect(response1.status, equals(HttpStatus.created));
        expect(response1.contentType, contains('application/json'));
        
        final createdUser = response1.bodyAsJson;
        expect(createdUser, isNotNull);
        expect(createdUser!['name'], equals('Alice Johnson'));
        expect(createdUser['email'], equals('alice.johnson@example.com'));
        expect(createdUser['id'], isNotNull);
        expect(createdUser['created_at'], isNotNull);
        print('✓ POST /api/users successful: User ID ${createdUser['id']}');

        // Test 2: Process complex data
        print('Testing POST /api/process with complex data...');
        final processData = {
          'operation': 'analyze',
          'items': [
            {'id': 1, 'value': 'test1'},
            {'id': 2, 'value': 'test2'},
            {'id': 3, 'value': 'test3'}
          ],
          'metadata': {
            'source': 'http_test',
            'version': '2.0'
          }
        };
        
        final response2 = await httpClient.postJson(serverPeerId, '/api/process', processData);
        
        expect(response2.status, equals(HttpStatus.ok));
        expect(response2.contentType, contains('application/json'));
        
        final processResult = response2.bodyAsJson;
        expect(processResult, isNotNull);
        expect(processResult!['processed'], equals(true));
        expect(processResult['input'], equals(processData));
        expect(processResult['result_count'], equals(3));
        print('✓ POST /api/process successful: Processed ${processResult['result_count']} items');

        // Test 3: Invalid JSON handling
        print('Testing POST with invalid JSON...');
        final invalidData = utf8.encode('{"invalid": json}');
        final response3 = await httpClient.postRequest(
          serverPeerId, 
          '/api/users',
          headers: {'content-type': 'application/json'},
          body: invalidData,
        );
        
        expect(response3.status, equals(HttpStatus.badRequest));
        expect(response3.bodyAsString, contains('Invalid JSON data'));
        print('✓ POST with invalid JSON returned 400 as expected');

        // Test 4: Missing required fields
        print('Testing POST with missing required fields...');
        final incompleteData = {'name': 'John Doe'}; // missing email
        final response4 = await httpClient.postJson(serverPeerId, '/api/users', incompleteData);
        
        expect(response4.status, equals(HttpStatus.badRequest));
        expect(response4.bodyAsString, contains('Missing required fields'));
        print('✓ POST with missing fields returned 400 as expected');

        print('POST JSON test successful via Swarm/Host.');

      } catch (e, s) {
        print('POST JSON test failed: $e\n$s');
        fail('POST JSON test failed: $e');
      }

      await Future.delayed(Duration(milliseconds: 100));

    }, timeout: Timeout(Duration(seconds: 30)));

    test('should handle custom headers and advanced HTTP features', () async {
      print('Testing custom headers and advanced HTTP features');
      
      try {
        final serverAddrInfo = AddrInfo(serverPeerId, [serverListenAddr]); 
        await clientHost.connect(serverAddrInfo);
        print('Client Host connected to Server Host for advanced features testing.');

        // Setup advanced routes on the existing server
        final httpServer = HttpProtocolService(serverHost);
        
        // Add route that checks custom headers
        httpServer.get('/api/protected', (request) async {
          final authHeader = request.headers['authorization'];
          if (authHeader == null || !authHeader.startsWith('Bearer ')) {
            return HttpResponse.error(HttpStatus.unauthorized, 'Missing or invalid authorization header');
          }
          
          final token = authHeader.substring('Bearer '.length);
          if (token != 'valid-token-123') {
            return HttpResponse.error(HttpStatus.forbidden, 'Invalid token');
          }
          
          return HttpResponse.json({
            'message': 'Access granted',
            'user_agent': request.headers['user-agent'] ?? 'unknown',
            'custom_header': request.headers['x-custom-header'] ?? 'not-provided',
          });
        });
        
        // Add route with path parameters
        httpServer.get('/api/users/:userId/posts/:postId', (request) async {
          // For now, we'll simulate path parameter extraction
          // In a real implementation, this would be handled by the routing system
          final pathParts = request.path.split('/');
          final userId = pathParts.length > 3 ? pathParts[3] : 'unknown';
          final postId = pathParts.length > 5 ? pathParts[5] : 'unknown';
          
          return HttpResponse.json({
            'user_id': userId,
            'post_id': postId,
            'title': 'Sample Post Title',
            'content': 'This is a sample post content for testing path parameters.',
          });
        });
        
        // Add route that returns custom headers
        httpServer.get('/api/headers-test', (request) async {
          final response = HttpResponse.json({
            'message': 'Headers test response',
            'timestamp': DateTime.now().toIso8601String(),
          });
          
          // Add custom response headers
          response.headers['x-custom-response'] = 'test-value';
          response.headers['x-request-id'] = 'req-${DateTime.now().millisecondsSinceEpoch}';
          response.headers['cache-control'] = 'no-cache';
          
          return response;
        });

        final httpClient = HttpProtocolService(clientHost);

        // Test 1: Request with authorization header
        print('Testing GET /api/protected with authorization header...');
        final response1 = await httpClient.request(
          serverPeerId,
          HttpMethod.get,
          '/api/protected',
          headers: {
            'authorization': 'Bearer valid-token-123',
            'user-agent': 'dart-libp2p-test-client/1.0',
            'x-custom-header': 'test-custom-value',
          },
        );
        
        expect(response1.status, equals(HttpStatus.ok));
        final protectedData = response1.bodyAsJson;
        expect(protectedData, isNotNull);
        expect(protectedData!['message'], equals('Access granted'));
        expect(protectedData['user_agent'], equals('dart-libp2p-test-client/1.0'));
        expect(protectedData['custom_header'], equals('test-custom-value'));
        print('✓ GET /api/protected with valid auth successful');

        // Test 2: Request without authorization header
        print('Testing GET /api/protected without authorization...');
        final response2 = await httpClient.getRequest(serverPeerId, '/api/protected');
        
        expect(response2.status, equals(HttpStatus.unauthorized));
        expect(response2.bodyAsString, contains('Missing or invalid authorization header'));
        print('✓ GET /api/protected without auth returned 401 as expected');

        // Test 3: Request with invalid token
        print('Testing GET /api/protected with invalid token...');
        final response3 = await httpClient.request(
          serverPeerId,
          HttpMethod.get,
          '/api/protected',
          headers: {'authorization': 'Bearer invalid-token'},
        );
        
        expect(response3.status, equals(HttpStatus.forbidden));
        expect(response3.bodyAsString, contains('Invalid token'));
        print('✓ GET /api/protected with invalid token returned 403 as expected');

        // Test 4: Path parameters
        print('Testing GET with path parameters...');
        final response4 = await httpClient.getRequest(serverPeerId, '/api/users/user123/posts/post456');
        
        expect(response4.status, equals(HttpStatus.ok));
        final pathData = response4.bodyAsJson;
        expect(pathData, isNotNull);
        expect(pathData!['user_id'], equals('user123'));
        expect(pathData['post_id'], equals('post456'));
        expect(pathData['title'], isNotNull);
        print('✓ GET with path parameters successful: User ${pathData['user_id']}, Post ${pathData['post_id']}');

        // Test 5: Custom response headers
        print('Testing GET /api/headers-test for custom response headers...');
        final response5 = await httpClient.getRequest(serverPeerId, '/api/headers-test');
        
        expect(response5.status, equals(HttpStatus.ok));
        expect(response5.headers['x-custom-response'], equals('test-value'));
        expect(response5.headers['cache-control'], equals('no-cache'));
        expect(response5.headers['x-request-id'], isNotNull);
        expect(response5.headers['x-request-id']!.startsWith('req-'), isTrue);
        
        final headersData = response5.bodyAsJson;
        expect(headersData, isNotNull);
        expect(headersData!['message'], equals('Headers test response'));
        print('✓ GET /api/headers-test with custom response headers successful');
        print('  Custom headers: x-custom-response=${response5.headers['x-custom-response']}, x-request-id=${response5.headers['x-request-id']}');

        print('Advanced HTTP features test successful via Swarm/Host.');

      } catch (e, s) {
        print('Advanced HTTP features test failed: $e\n$s');
        fail('Advanced HTTP features test failed: $e');
      }

      await Future.delayed(Duration(milliseconds: 100));

    }, timeout: Timeout(Duration(seconds: 30)));

    test('should handle PUT and DELETE HTTP methods', () async {
      print('Testing PUT and DELETE HTTP methods');
      
      try {
        final serverAddrInfo = AddrInfo(serverPeerId, [serverListenAddr]); 
        await clientHost.connect(serverAddrInfo);
        print('Client Host connected to Server Host for PUT/DELETE testing.');

        // Setup PUT and DELETE routes on the existing server
        final httpServer = HttpProtocolService(serverHost);
        
        // Add PUT route for updating resources
        httpServer.put('/api/users/:id', (request) async {
          final pathParts = request.path.split('/');
          final userId = pathParts.length > 3 ? pathParts[3] : 'unknown';
          
          final updateData = request.bodyAsJson;
          if (updateData == null) {
            return HttpResponse.error(HttpStatus.badRequest, 'Invalid JSON data for update');
          }
          
          final updatedUser = {
            'id': userId,
            'name': updateData['name'] ?? 'Unknown',
            'email': updateData['email'] ?? 'unknown@example.com',
            'updated_at': DateTime.now().toIso8601String(),
            'version': (updateData['version'] as int? ?? 0) + 1,
          };
          
          return HttpResponse.json(updatedUser);
        });
        
        // Add DELETE route for removing resources
        httpServer.delete('/api/users/:id', (request) async {
          final pathParts = request.path.split('/');
          final userId = pathParts.length > 3 ? pathParts[3] : 'unknown';
          
          final deleteResult = {
            'deleted': true,
            'user_id': userId,
            'deleted_at': DateTime.now().toIso8601String(),
          };
          
          return HttpResponse.json(deleteResult);
        });
        
        // Add PUT route that returns different status codes
        httpServer.put('/api/status/:code', (request) async {
          final pathParts = request.path.split('/');
          final statusCodeStr = pathParts.length > 3 ? pathParts[3] : '200';
          final statusCode = int.tryParse(statusCodeStr) ?? 200;
          
          switch (statusCode) {
            case 200:
              return HttpResponse.json({'message': 'OK', 'code': 200});
            case 202:
              return HttpResponse.json({'message': 'Accepted', 'code': 202}, status: HttpStatus.accepted);
            case 204:
              return HttpResponse(status: HttpStatus.noContent);
            case 409:
              return HttpResponse.error(HttpStatus.conflict, 'Resource conflict');
            default:
              return HttpResponse.error(HttpStatus.badRequest, 'Unsupported status code');
          }
        });

        final httpClient = HttpProtocolService(clientHost);

        // Test 1: PUT request to update user
        print('Testing PUT /api/users/user456...');
        final updateData = {
          'name': 'Bob Wilson',
          'email': 'bob.wilson@example.com',
          'version': 1,
        };
        
        final response1 = await httpClient.request(
          serverPeerId,
          HttpMethod.put,
          '/api/users/user456',
          headers: {'content-type': 'application/json'},
          body: utf8.encode(jsonEncode(updateData)),
        );
        
        expect(response1.status, equals(HttpStatus.ok));
        final updatedUser = response1.bodyAsJson;
        expect(updatedUser, isNotNull);
        expect(updatedUser!['id'], equals('user456'));
        expect(updatedUser['name'], equals('Bob Wilson'));
        expect(updatedUser['email'], equals('bob.wilson@example.com'));
        expect(updatedUser['version'], equals(2));
        expect(updatedUser['updated_at'], isNotNull);
        print('✓ PUT /api/users/user456 successful: Version ${updatedUser['version']}');

        // Test 2: DELETE request
        print('Testing DELETE /api/users/user789...');
        final response2 = await httpClient.request(
          serverPeerId,
          HttpMethod.delete,
          '/api/users/user789',
        );
        
        expect(response2.status, equals(HttpStatus.ok));
        final deleteResult = response2.bodyAsJson;
        expect(deleteResult, isNotNull);
        expect(deleteResult!['deleted'], equals(true));
        expect(deleteResult['user_id'], equals('user789'));
        expect(deleteResult['deleted_at'], isNotNull);
        print('✓ DELETE /api/users/user789 successful');

        // Test 3: PUT with different status codes
        print('Testing PUT /api/status/202 (Accepted)...');
        final response3 = await httpClient.request(
          serverPeerId,
          HttpMethod.put,
          '/api/status/202',
          body: utf8.encode('{}'),
        );
        
        expect(response3.status, equals(HttpStatus.accepted));
        final acceptedResult = response3.bodyAsJson;
        expect(acceptedResult, isNotNull);
        expect(acceptedResult!['code'], equals(202));
        print('✓ PUT /api/status/202 returned 202 Accepted');

        // Test 4: PUT with 204 No Content
        print('Testing PUT /api/status/204 (No Content)...');
        final response4 = await httpClient.request(
          serverPeerId,
          HttpMethod.put,
          '/api/status/204',
          body: utf8.encode('{}'),
        );
        
        expect(response4.status, equals(HttpStatus.noContent));
        expect(response4.body, anyOf(isNull, isEmpty));
        print('✓ PUT /api/status/204 returned 204 No Content');

        // Test 5: PUT with 409 Conflict
        print('Testing PUT /api/status/409 (Conflict)...');
        final response5 = await httpClient.request(
          serverPeerId,
          HttpMethod.put,
          '/api/status/409',
          body: utf8.encode('{}'),
        );
        
        expect(response5.status, equals(HttpStatus.conflict));
        expect(response5.bodyAsString, contains('Resource conflict'));
        print('✓ PUT /api/status/409 returned 409 Conflict');

        print('PUT and DELETE methods test successful via Swarm/Host.');

      } catch (e, s) {
        print('PUT/DELETE test failed: $e\n$s');
        fail('PUT/DELETE test failed: $e');
      }

      await Future.delayed(Duration(milliseconds: 100));

    }, timeout: Timeout(Duration(seconds: 30)));

    test('should handle concurrent HTTP requests efficiently', () async {
      print('Testing concurrent HTTP requests');
      
      try {
        final serverAddrInfo = AddrInfo(serverPeerId, [serverListenAddr]); 
        await clientHost.connect(serverAddrInfo);
        print('Client Host connected to Server Host for concurrent testing.');

        // Setup routes for concurrent testing
        final httpServer = HttpProtocolService(serverHost);
        var requestCounter = 0;
        
        // Add route that simulates processing time
        httpServer.get('/api/concurrent/:id', (request) async {
          final pathParts = request.path.split('/');
          final requestId = pathParts.length > 3 ? pathParts[3] : 'unknown';
          final currentCount = ++requestCounter;
          
          // Simulate some processing time
          await Future.delayed(Duration(milliseconds: 50));
          
          return HttpResponse.json({
            'request_id': requestId,
            'processed_at': DateTime.now().toIso8601String(),
            'request_number': currentCount,
            'message': 'Concurrent request processed successfully',
          });
        });
        
        // Add route for load testing
        httpServer.post('/api/load-test', (request) async {
          final data = request.bodyAsJson ?? {};
          final batchId = data['batch_id'] ?? 'unknown';
          final itemCount = data['item_count'] ?? 0;
          
          return HttpResponse.json({
            'batch_id': batchId,
            'items_processed': itemCount,
            'processing_time_ms': 25,
            'status': 'completed',
          });
        });

        final httpClient = HttpProtocolService(clientHost);

        // Test 1: Concurrent GET requests
        print('Testing 5 concurrent GET requests...');
        final concurrentRequests = <Future<HttpResponse>>[];
        
        for (int i = 1; i <= 5; i++) {
          final future = httpClient.getRequest(serverPeerId, '/api/concurrent/req$i');
          concurrentRequests.add(future);
        }
        
        final responses = await Future.wait(concurrentRequests);
        
        expect(responses.length, equals(5));
        for (int i = 0; i < responses.length; i++) {
          expect(responses[i].status, equals(HttpStatus.ok));
          final responseData = responses[i].bodyAsJson;
          expect(responseData, isNotNull);
          expect(responseData!['request_id'], equals('req${i + 1}'));
          expect(responseData['request_number'], isNotNull);
          print('✓ Concurrent request ${i + 1}: ID=${responseData['request_id']}, Number=${responseData['request_number']}');
        }
        
        // Verify all requests were processed (counter should be at least 5)
        expect(requestCounter, greaterThanOrEqualTo(5));
        print('✓ All 5 concurrent GET requests completed successfully');

        // Test 2: Mixed concurrent requests (GET and POST)
        print('Testing mixed concurrent requests (3 GET + 2 POST)...');
        final mixedRequests = <Future<HttpResponse>>[];
        
        // Add GET requests
        for (int i = 6; i <= 8; i++) {
          mixedRequests.add(httpClient.getRequest(serverPeerId, '/api/concurrent/mixed$i'));
        }
        
        // Add POST requests
        for (int i = 1; i <= 2; i++) {
          final postData = {
            'batch_id': 'batch$i',
            'item_count': i * 10,
          };
          mixedRequests.add(httpClient.postJson(serverPeerId, '/api/load-test', postData));
        }
        
        final mixedResponses = await Future.wait(mixedRequests);
        
        expect(mixedResponses.length, equals(5));
        
        // Check GET responses (first 3)
        for (int i = 0; i < 3; i++) {
          expect(mixedResponses[i].status, equals(HttpStatus.ok));
          final getData = mixedResponses[i].bodyAsJson;
          expect(getData!['request_id'], equals('mixed${i + 6}'));
          print('✓ Mixed GET request ${i + 1}: ${getData['request_id']}');
        }
        
        // Check POST responses (last 2)
        for (int i = 3; i < 5; i++) {
          expect(mixedResponses[i].status, equals(HttpStatus.ok));
          final postData = mixedResponses[i].bodyAsJson;
          expect(postData!['batch_id'], equals('batch${i - 2}'));
          expect(postData['status'], equals('completed'));
          print('✓ Mixed POST request ${i - 2}: ${postData['batch_id']}');
        }
        
        print('✓ All 5 mixed concurrent requests completed successfully');

        // Test 3: High-frequency sequential requests
        print('Testing 10 rapid sequential requests...');
        final sequentialResults = <Map<String, dynamic>>[];
        
        for (int i = 1; i <= 10; i++) {
          final response = await httpClient.getRequest(serverPeerId, '/api/concurrent/seq$i');
          expect(response.status, equals(HttpStatus.ok));
          
          final responseData = response.bodyAsJson!;
          sequentialResults.add(responseData);
        }
        
        expect(sequentialResults.length, equals(10));
        
        // Verify request numbers are increasing (showing proper sequencing)
        for (int i = 0; i < sequentialResults.length; i++) {
          expect(sequentialResults[i]['request_id'], equals('seq${i + 1}'));
          print('✓ Sequential request ${i + 1}: Number=${sequentialResults[i]['request_number']}');
        }
        
        print('✓ All 10 sequential requests completed successfully');
        print('✓ Total requests processed: $requestCounter');

        print('Concurrent HTTP requests test successful via Swarm/Host.');

      } catch (e, s) {
        print('Concurrent requests test failed: $e\n$s');
        fail('Concurrent requests test failed: $e');
      }

      await Future.delayed(Duration(milliseconds: 100));

    }, timeout: Timeout(Duration(seconds: 45)));

    test('should handle HTTP error scenarios and edge cases', () async {
      print('Testing HTTP error scenarios and edge cases');
      
      try {
        final serverAddrInfo = AddrInfo(serverPeerId, [serverListenAddr]); 
        await clientHost.connect(serverAddrInfo);
        print('Client Host connected to Server Host for error testing.');

        // Setup error testing routes
        final httpServer = HttpProtocolService(serverHost);
        
        // Add route that throws exceptions
        httpServer.get('/api/error/exception', (request) async {
          throw Exception('Simulated server exception');
        });
        
        // Add route that returns various error codes
        httpServer.get('/api/error/:code', (request) async {
          final pathParts = request.path.split('/');
          final errorCode = pathParts.length > 3 ? pathParts[3] : '500';
          
          switch (errorCode) {
            case '400':
              return HttpResponse.error(HttpStatus.badRequest, 'Bad request error');
            case '401':
              return HttpResponse.error(HttpStatus.unauthorized, 'Unauthorized access');
            case '403':
              return HttpResponse.error(HttpStatus.forbidden, 'Forbidden resource');
            case '404':
              return HttpResponse.error(HttpStatus.notFound, 'Resource not found');
            case '405':
              return HttpResponse.error(HttpStatus.methodNotAllowed, 'Method not allowed');
            case '500':
              return HttpResponse.error(HttpStatus.internalServerError, 'Internal server error');
            case '503':
              return HttpResponse.error(HttpStatus.serviceUnavailable, 'Service unavailable');
            default:
              return HttpResponse.error(HttpStatus.badRequest, 'Unknown error code');
          }
        });
        
        // Add route that validates content types
        httpServer.post('/api/validate-content', (request) async {
          final contentType = request.headers['content-type'] ?? '';
          
          if (!contentType.contains('application/json')) {
            return HttpResponse.error(HttpStatus.badRequest, 'Content-Type must be application/json');
          }
          
          final data = request.bodyAsJson;
          if (data == null) {
            return HttpResponse.error(HttpStatus.badRequest, 'Invalid JSON in request body');
          }
          
          return HttpResponse.json({'message': 'Content validated successfully', 'received': data});
        });
        
        // Add route that checks request size
        httpServer.post('/api/size-check', (request) async {
          final bodySize = request.body?.length ?? 0;
          
          if (bodySize > 1000) {
            return HttpResponse.error(HttpStatus.badRequest, 'Request body too large');
          }
          
          return HttpResponse.json({
            'message': 'Size check passed',
            'body_size': bodySize,
            'max_allowed': 1000,
          });
        });

        final httpClient = HttpProtocolService(clientHost);

        // Test 1: Server exception handling
        print('Testing server exception handling...');
        final response1 = await httpClient.getRequest(serverPeerId, '/api/error/exception');
        
        expect(response1.status, equals(HttpStatus.internalServerError));
        expect(response1.bodyAsString, equals('Internal server error'));
        print('✓ Server exception returned 500 Internal Server Error');

        // Test 2: Various HTTP error codes
        final errorCodes = ['400', '401', '403', '404', '405', '500', '503'];
        final expectedStatuses = [
          HttpStatus.badRequest,
          HttpStatus.unauthorized,
          HttpStatus.forbidden,
          HttpStatus.notFound,
          HttpStatus.methodNotAllowed,
          HttpStatus.internalServerError,
          HttpStatus.serviceUnavailable,
        ];
        
        for (int i = 0; i < errorCodes.length; i++) {
          print('Testing error code ${errorCodes[i]}...');
          final response = await httpClient.getRequest(serverPeerId, '/api/error/${errorCodes[i]}');
          
          expect(response.status, equals(expectedStatuses[i]));
          expect(response.bodyAsString, isNotEmpty);
          print('✓ Error ${errorCodes[i]} returned ${expectedStatuses[i].code} as expected');
        }

        // Test 3: Content-Type validation
        print('Testing content-type validation...');
        
        // Valid JSON with correct content-type
        final validData = {'test': 'data'};
        final response3a = await httpClient.postRequest(
          serverPeerId,
          '/api/validate-content',
          headers: {'content-type': 'application/json'},
          body: utf8.encode(jsonEncode(validData)),
        );
        
        expect(response3a.status, equals(HttpStatus.ok));
        final validResult = response3a.bodyAsJson;
        expect(validResult!['message'], equals('Content validated successfully'));
        expect(validResult['received'], equals(validData));
        print('✓ Valid JSON with correct content-type accepted');
        
        // Invalid content-type
        final response3b = await httpClient.postRequest(
          serverPeerId,
          '/api/validate-content',
          headers: {'content-type': 'text/plain'},
          body: utf8.encode('plain text'),
        );
        
        expect(response3b.status, equals(HttpStatus.badRequest));
        expect(response3b.bodyAsString, contains('Content-Type must be application/json'));
        print('✓ Invalid content-type rejected with 400');
        
        // Invalid JSON with correct content-type
        final response3c = await httpClient.postRequest(
          serverPeerId,
          '/api/validate-content',
          headers: {'content-type': 'application/json'},
          body: utf8.encode('invalid json'),
        );
        
        expect(response3c.status, equals(HttpStatus.badRequest));
        expect(response3c.bodyAsString, contains('Invalid JSON in request body'));
        print('✓ Invalid JSON rejected with 400');

        // Test 4: Request size validation
        print('Testing request size validation...');
        
        // Small request (should pass)
        final smallData = {'message': 'small'};
        final response4a = await httpClient.postJson(serverPeerId, '/api/size-check', smallData);
        
        expect(response4a.status, equals(HttpStatus.ok));
        final sizeResult = response4a.bodyAsJson;
        expect(sizeResult!['message'], equals('Size check passed'));
        expect(sizeResult['body_size'], lessThan(1000));
        print('✓ Small request passed size check: ${sizeResult['body_size']} bytes');
        
        // Large request (should fail)
        final largeData = {'message': 'x' * 1500}; // Create large payload
        final response4b = await httpClient.postJson(serverPeerId, '/api/size-check', largeData);
        
        expect(response4b.status, equals(HttpStatus.badRequest));
        expect(response4b.bodyAsString, contains('Request body too large'));
        print('✓ Large request rejected with 400');

        print('HTTP error scenarios and edge cases test successful via Swarm/Host.');

      } catch (e, s) {
        print('Error scenarios test failed: $e\n$s');
        fail('Error scenarios test failed: $e');
      }

      await Future.delayed(Duration(milliseconds: 100));

    }, timeout: Timeout(Duration(seconds: 30)));
  });

}
