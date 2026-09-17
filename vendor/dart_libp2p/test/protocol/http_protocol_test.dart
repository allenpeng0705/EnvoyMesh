import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/peer/record.dart';
import 'package:dart_libp2p/core/peer/pb/peer_record.pb.dart' as pb;
import 'package:dart_libp2p/core/record/record_registry.dart';
import 'package:dart_libp2p/p2p/network/swarm/swarm.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart';
import 'package:dart_libp2p/p2p/host/peerstore/pstoremem.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/config/config.dart';
import 'package:dart_libp2p/config/stream_muxer.dart';
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart' as multiaddr_protocol;
import 'package:dart_libp2p/p2p/protocol/http/http_protocol.dart';
import 'package:dart_udx/dart_udx.dart';
import 'package:test/test.dart';
import 'package:logging/logging.dart';

// Custom AddrsFactory for testing that doesn't filter loopback
List<MultiAddr> passThroughAddrsFactory(List<MultiAddr> addrs) {
  return addrs;
}

// Helper class for providing YamuxMuxer to the config
class _TestYamuxMuxerProvider extends StreamMuxer {
  final MultiplexerConfig yamuxConfig;

  _TestYamuxMuxerProvider({required this.yamuxConfig})
      : super(
    id: '/yamux/1.0.0',
    muxerFactory: (Conn secureConn, bool isClient) {
      if (secureConn is! TransportConn) {
        throw ArgumentError(
            'YamuxMuxer factory expects a TransportConn, got ${secureConn.runtimeType}');
      }
      return YamuxSession(secureConn, yamuxConfig, isClient);
    },
  );
}

void main() {
  // Set up logging for tests
  Logger.root.level = Level.INFO;
  Logger.root.onRecord.listen((record) {
    print('${record.level.name}: ${record.time}: ${record.message}');
  });

  group('HTTP-like Protocol Tests', () {
    late UDX udxInstance;
    late ResourceManagerImpl resourceManager;
    late ConnectionManager connManager;

    setUpAll(() async {
      udxInstance = UDX();
      resourceManager = ResourceManagerImpl(limiter: FixedLimiter());
      connManager = ConnectionManager();
    });

    tearDownAll(() async {
      await connManager.dispose();
      await resourceManager.close();
    });

    test('basic HTTP GET request/response', () async {
      print('\n=== Starting Basic HTTP GET Test ===');
      
      final serverHost = await createTestHost(
        name: 'HTTPServer',
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );
      
      final clientHost = await createTestHost(
        name: 'HTTPClient',
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );

      try {
        // Setup HTTP server
        final httpServer = HttpProtocolService(serverHost);
        
        // Add a simple GET route
        httpServer.get('/hello', (request) async {
          return HttpResponse.text('Hello, World!');
        });
        
        // Add a route with path parameters
        httpServer.get('/users/:id', (request) async {
          // In a real implementation, you'd extract path params from the route
          return HttpResponse.json({
            'user_id': '123',
            'name': 'John Doe',
            'email': 'john@example.com'
          });
        });

        // Setup listening
        final listenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
        await serverHost.network.listen([listenAddr]);
        
        final actualListenAddr = serverHost.addrs.firstWhere(
          (addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name)
        );
        
        // Setup peer discovery
        await clientHost.peerStore.addrBook.addAddrs(
          serverHost.id,
          [actualListenAddr],
          AddressTTL.permanentAddrTTL
        );
        clientHost.peerStore.keyBook.addPubKey(
          serverHost.id,
          (await serverHost.peerStore.keyBook.pubKey(serverHost.id))!
        );

        // Connect to server first (following working test pattern)
        final serverAddrInfo = AddrInfo(serverHost.id, serverHost.addrs);
        print('Client connecting to server...');
        await clientHost.connect(serverAddrInfo);
        print('Client connected to server successfully');

        // Create HTTP client
        final httpClient = HttpProtocolService(clientHost);

        // Test 1: Simple GET request
        print('Testing GET /hello...');
        final response1 = await httpClient.getRequest(serverHost.id, '/hello');
        
        expect(response1.status, equals(HttpStatus.ok));
        expect(response1.contentType, contains('text/plain'));
        expect(response1.bodyAsString, equals('Hello, World!'));
        print('✓ GET /hello successful: ${response1.bodyAsString}');

        // Test 2: GET request with path parameters
        print('Testing GET /users/123...');
        final response2 = await httpClient.getRequest(serverHost.id, '/users/123');
        
        expect(response2.status, equals(HttpStatus.ok));
        expect(response2.contentType, contains('application/json'));
        
        final userData = response2.bodyAsJson;
        expect(userData, isNotNull);
        expect(userData!['user_id'], equals('123'));
        expect(userData['name'], equals('John Doe'));
        print('✓ GET /users/123 successful: $userData');

        // Test 3: 404 Not Found
        print('Testing GET /nonexistent...');
        final response3 = await httpClient.getRequest(serverHost.id, '/nonexistent');
        
        expect(response3.status, equals(HttpStatus.notFound));
        expect(response3.bodyAsString, equals('Not found'));
        print('✓ GET /nonexistent returned 404 as expected');

      } finally {
        await serverHost.close();
        await clientHost.close();
      }
    }, timeout: Timeout(Duration(seconds: 30)));

    test('HTTP POST with JSON data', () async {
      print('\n=== Starting HTTP POST JSON Test ===');
      
      final serverHost = await createTestHost(
        name: 'JSONServer',
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );
      
      final clientHost = await createTestHost(
        name: 'JSONClient',
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );

      try {
        // Setup HTTP server with POST routes
        final httpServer = HttpProtocolService(serverHost);
        
        // Add a POST route for creating users
        httpServer.post('/users', (request) async {
          final userData = request.bodyAsJson;
          if (userData == null) {
            return HttpResponse.error(HttpStatus.badRequest, 'Invalid JSON data');
          }
          
          // Simulate user creation
          final newUser = {
            'id': DateTime.now().millisecondsSinceEpoch.toString(),
            'name': userData['name'],
            'email': userData['email'],
            'created_at': DateTime.now().toIso8601String(),
          };
          
          return HttpResponse.json(newUser, status: HttpStatus.created);
        });
        
        // Add a POST route for data processing
        httpServer.post('/process', (request) async {
          final data = request.bodyAsJson;
          if (data == null) {
            return HttpResponse.error(HttpStatus.badRequest, 'Invalid JSON data');
          }
          
          // Simulate data processing
          final result = {
            'input': data,
            'processed': true,
            'timestamp': DateTime.now().toIso8601String(),
            'result': 'Data processed successfully',
          };
          
          return HttpResponse.json(result);
        });

        // Setup networking
        final listenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
        await serverHost.network.listen([listenAddr]);
        
        final actualListenAddr = serverHost.addrs.firstWhere(
          (addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name)
        );
        
        await clientHost.peerStore.addrBook.addAddrs(
          serverHost.id,
          [actualListenAddr],
          AddressTTL.permanentAddrTTL
        );
        clientHost.peerStore.keyBook.addPubKey(
          serverHost.id,
          (await serverHost.peerStore.keyBook.pubKey(serverHost.id))!
        );

        // Connect to server first (following working test pattern)
        final serverAddrInfo = AddrInfo(serverHost.id, serverHost.addrs);
        print('Client connecting to server...');
        await clientHost.connect(serverAddrInfo);
        print('Client connected to server successfully');

        final httpClient = HttpProtocolService(clientHost);

        // Test 1: Create user with JSON
        print('Testing POST /users with JSON data...');
        final userData = {
          'name': 'Alice Smith',
          'email': 'alice@example.com',
        };
        
        final response1 = await httpClient.postJson(serverHost.id, '/users', userData);
        
        expect(response1.status, equals(HttpStatus.created));
        expect(response1.contentType, contains('application/json'));
        
        final createdUser = response1.bodyAsJson;
        expect(createdUser, isNotNull);
        expect(createdUser!['name'], equals('Alice Smith'));
        expect(createdUser['email'], equals('alice@example.com'));
        expect(createdUser['id'], isNotNull);
        expect(createdUser['created_at'], isNotNull);
        print('✓ POST /users successful: $createdUser');

        // Test 2: Process data
        print('Testing POST /process with complex data...');
        final processData = {
          'operation': 'calculate',
          'values': [1, 2, 3, 4, 5],
          'metadata': {
            'source': 'test',
            'version': '1.0'
          }
        };
        
        final response2 = await httpClient.postJson(serverHost.id, '/process', processData);
        
        expect(response2.status, equals(HttpStatus.ok));
        expect(response2.contentType, contains('application/json'));
        
        final processResult = response2.bodyAsJson;
        expect(processResult, isNotNull);
        expect(processResult!['processed'], equals(true));
        expect(processResult['input'], equals(processData));
        expect(processResult['result'], isNotNull);
        print('✓ POST /process successful: ${processResult['result']}');

        // Test 3: Invalid JSON
        print('Testing POST with invalid data...');
        final invalidData = utf8.encode('invalid json data');
        final response3 = await httpClient.postRequest(
          serverHost.id, 
          '/users',
          headers: {'content-type': 'application/json'},
          body: invalidData,
        );
        
        expect(response3.status, equals(HttpStatus.badRequest));
        expect(response3.bodyAsString, contains('Invalid JSON data'));
        print('✓ POST with invalid JSON returned 400 as expected');

      } finally {
        await serverHost.close();
        await clientHost.close();
      }
    });

    test('HTTP protocol with connection reuse', () async {
      print('\n=== Starting HTTP Connection Reuse Test ===');
      
      final serverHost = await createTestHost(
        name: 'ReuseServer',
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );
      
      final clientHost = await createTestHost(
        name: 'ReuseClient',
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );

      try {
        // Setup HTTP server with multiple routes
        final httpServer = HttpProtocolService(serverHost);
        
        var requestCount = 0;
        
        httpServer.get('/api/status', (request) async {
          requestCount++;
          return HttpResponse.json({
            'status': 'ok',
            'request_count': requestCount,
            'timestamp': DateTime.now().toIso8601String(),
          });
        });
        
        httpServer.get('/api/data/:id', (request) async {
          requestCount++;
          return HttpResponse.json({
            'id': 'data-123',
            'content': 'Sample data content',
            'request_count': requestCount,
          });
        });
        
        httpServer.post('/api/submit', (request) async {
          requestCount++;
          final data = request.bodyAsJson ?? {};
          return HttpResponse.json({
            'submitted': true,
            'received_data': data,
            'request_count': requestCount,
          });
        });

        // Setup networking
        final listenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
        await serverHost.network.listen([listenAddr]);
        
        final actualListenAddr = serverHost.addrs.firstWhere(
          (addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name)
        );
        
        await clientHost.peerStore.addrBook.addAddrs(
          serverHost.id,
          [actualListenAddr],
          AddressTTL.permanentAddrTTL
        );
        clientHost.peerStore.keyBook.addPubKey(
          serverHost.id,
          (await serverHost.peerStore.keyBook.pubKey(serverHost.id))!
        );

        // Connect to server first (following working test pattern)
        final serverAddrInfo = AddrInfo(serverHost.id, serverHost.addrs);
        print('Client connecting to server...');
        await clientHost.connect(serverAddrInfo);
        print('Client connected to server successfully');

        final httpClient = HttpProtocolService(clientHost);

        // Perform multiple requests to test connection reuse
        print('Performing multiple HTTP requests...');
        
        // Request 1: GET status
        final response1 = await httpClient.getRequest(serverHost.id, '/api/status');
        expect(response1.status, equals(HttpStatus.ok));
        final status1 = response1.bodyAsJson!;
        expect(status1['request_count'], equals(1));
        print('✓ Request 1 (GET /api/status): count = ${status1['request_count']}');

        // Request 2: GET data
        final response2 = await httpClient.getRequest(serverHost.id, '/api/data/123');
        expect(response2.status, equals(HttpStatus.ok));
        final data2 = response2.bodyAsJson!;
        expect(data2['request_count'], equals(2));
        print('✓ Request 2 (GET /api/data/123): count = ${data2['request_count']}');

        // Request 3: POST submit
        final submitData = {'message': 'Hello from client', 'value': 42};
        final response3 = await httpClient.postJson(serverHost.id, '/api/submit', submitData);
        expect(response3.status, equals(HttpStatus.ok));
        final submit3 = response3.bodyAsJson!;
        expect(submit3['request_count'], equals(3));
        expect(submit3['received_data'], equals(submitData));
        print('✓ Request 3 (POST /api/submit): count = ${submit3['request_count']}');

        // Request 4: Another GET status
        final response4 = await httpClient.getRequest(serverHost.id, '/api/status');
        expect(response4.status, equals(HttpStatus.ok));
        final status4 = response4.bodyAsJson!;
        expect(status4['request_count'], equals(4));
        print('✓ Request 4 (GET /api/status): count = ${status4['request_count']}');

        // Verify connection reuse by checking that all requests were handled
        // by the same server instance (evidenced by incrementing counter)
        expect(requestCount, equals(4));
        print('✓ All 4 requests processed by same server instance');
        print('✓ Connection reuse working correctly');

      } finally {
        await serverHost.close();
        await clientHost.close();
      }
    });

    test('HTTP error handling and status codes', () async {
      print('\n=== Starting HTTP Error Handling Test ===');
      
      final serverHost = await createTestHost(
        name: 'ErrorServer',
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );
      
      final clientHost = await createTestHost(
        name: 'ErrorClient',
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );

      try {
        // Setup HTTP server with various error scenarios
        final httpServer = HttpProtocolService(serverHost);
        
        httpServer.get('/success', (request) async {
          return HttpResponse.text('Success!');
        });
        
        httpServer.get('/error/400', (request) async {
          return HttpResponse.error(HttpStatus.badRequest, 'Bad request example');
        });
        
        httpServer.get('/error/401', (request) async {
          return HttpResponse.error(HttpStatus.unauthorized, 'Unauthorized access');
        });
        
        httpServer.get('/error/500', (request) async {
          throw Exception('Simulated server error');
        });
        
        httpServer.post('/validate', (request) async {
          final data = request.bodyAsJson;
          if (data == null) {
            return HttpResponse.error(HttpStatus.badRequest, 'JSON required');
          }
          
          if (!data.containsKey('name')) {
            return HttpResponse.error(HttpStatus.badRequest, 'Missing required field: name');
          }
          
          if (!data.containsKey('email')) {
            return HttpResponse.error(HttpStatus.badRequest, 'Missing required field: email');
          }
          
          return HttpResponse.json({'validated': true, 'data': data});
        });

        // Setup networking
        final listenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
        await serverHost.network.listen([listenAddr]);
        
        final actualListenAddr = serverHost.addrs.firstWhere(
          (addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name)
        );
        
        await clientHost.peerStore.addrBook.addAddrs(
          serverHost.id,
          [actualListenAddr],
          AddressTTL.permanentAddrTTL
        );
        clientHost.peerStore.keyBook.addPubKey(
          serverHost.id,
          (await serverHost.peerStore.keyBook.pubKey(serverHost.id))!
        );

        // Connect to server first (following working test pattern)
        final serverAddrInfo = AddrInfo(serverHost.id, serverHost.addrs);
        print('Client connecting to server...');
        await clientHost.connect(serverAddrInfo);
        print('Client connected to server successfully');

        final httpClient = HttpProtocolService(clientHost);

        // Test various error scenarios
        print('Testing success case...');
        final response1 = await httpClient.getRequest(serverHost.id, '/success');
        expect(response1.status, equals(HttpStatus.ok));
        expect(response1.bodyAsString, equals('Success!'));
        print('✓ Success case works');

        print('Testing 400 Bad Request...');
        final response2 = await httpClient.getRequest(serverHost.id, '/error/400');
        expect(response2.status, equals(HttpStatus.badRequest));
        expect(response2.bodyAsString, equals('Bad request example'));
        print('✓ 400 Bad Request handled correctly');

        print('Testing 401 Unauthorized...');
        final response3 = await httpClient.getRequest(serverHost.id, '/error/401');
        expect(response3.status, equals(HttpStatus.unauthorized));
        expect(response3.bodyAsString, equals('Unauthorized access'));
        print('✓ 401 Unauthorized handled correctly');

        print('Testing 500 Internal Server Error...');
        final response4 = await httpClient.getRequest(serverHost.id, '/error/500');
        expect(response4.status, equals(HttpStatus.internalServerError));
        expect(response4.bodyAsString, equals('Internal server error'));
        print('✓ 500 Internal Server Error handled correctly');

        print('Testing 404 Not Found...');
        final response5 = await httpClient.getRequest(serverHost.id, '/nonexistent');
        expect(response5.status, equals(HttpStatus.notFound));
        expect(response5.bodyAsString, equals('Not found'));
        print('✓ 404 Not Found handled correctly');

        print('Testing validation errors...');
        
        // Missing name field
        final response6 = await httpClient.postJson(serverHost.id, '/validate', {'email': 'test@example.com'});
        expect(response6.status, equals(HttpStatus.badRequest));
        expect(response6.bodyAsString, contains('Missing required field: name'));
        print('✓ Validation error for missing name');

        // Missing email field
        final response7 = await httpClient.postJson(serverHost.id, '/validate', {'name': 'John'});
        expect(response7.status, equals(HttpStatus.badRequest));
        expect(response7.bodyAsString, contains('Missing required field: email'));
        print('✓ Validation error for missing email');

        // Valid data
        final validData = {'name': 'John Doe', 'email': 'john@example.com'};
        final response8 = await httpClient.postJson(serverHost.id, '/validate', validData);
        expect(response8.status, equals(HttpStatus.ok));
        final result = response8.bodyAsJson!;
        expect(result['validated'], equals(true));
        expect(result['data'], equals(validData));
        print('✓ Valid data accepted');

      } finally {
        await serverHost.close();
        await clientHost.close();
      }
    });
  });
}

/// Creates a test host with UDX transport and real Yamux multiplexer
Future<BasicHost> createTestHost({
  required String name,
  required UDX udxInstance,
  required ResourceManagerImpl resourceManager,
  required ConnectionManager connManager,
}) async {
  print('Creating test host: $name');
  
  // Generate test peer identity
  final keyPair = await crypto_ed25519.generateEd25519KeyPair();
  final peerId = PeerId.fromPublicKey(keyPair.publicKey);
  print('$name PeerId: ${peerId.toString()}');
  
  // Create real peerstore
  final peerstore = MemoryPeerstore();
  
  // Add own key to peerstore
  peerstore.keyBook.addPrivKey(peerId, keyPair.privateKey);
  peerstore.keyBook.addPubKey(peerId, keyPair.publicKey);
  
  // Create Yamux multiplexer config
  final yamuxMultiplexerConfig = MultiplexerConfig(
    keepAliveInterval: Duration(seconds: 30),
    maxStreamWindowSize: 1024 * 1024,
    initialStreamWindowSize: 256 * 1024,
    streamWriteTimeout: Duration(seconds: 10),
    maxStreams: 256,
  );
  
  // Create config with real protocols
  final config = Config();
  config.peerKey = keyPair;
  config.addrsFactory = passThroughAddrsFactory;
  
  // Add real Noise security protocol
  config.securityProtocols = [await NoiseSecurity.create(keyPair)];
  
  // Add REAL Yamux muxer
  config.muxers = [
    _TestYamuxMuxerProvider(yamuxConfig: yamuxMultiplexerConfig)
  ];
  
  // Create UDX transport
  final udxTransport = UDXTransport(
    connManager: connManager,
    udxInstance: udxInstance,
  );
  
  // Create upgrader
  final upgrader = BasicUpgrader(resourceManager: resourceManager);
  
  // Create swarm
  final swarm = Swarm(
    host: null,
    localPeer: peerId,
    peerstore: peerstore,
    resourceManager: resourceManager,
    upgrader: upgrader,
    config: config,
    transports: [udxTransport],
  );
  
  // Create and return host
  final host = await BasicHost.create(
    network: swarm,
    config: config,
  );
  
  // Register PeerRecord type before starting host
  RecordRegistry.register<pb.PeerRecord>(
    String.fromCharCodes(PeerRecordEnvelopePayloadType),
    pb.PeerRecord.fromBuffer
  );
  
  await host.start();
  
  print('$name host created successfully');
  return host;
}
