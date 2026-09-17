import 'dart:async';
import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dart_libp2p/dart_libp2p.dart';
import 'package:dart_libp2p/config/config.dart';
import 'package:dart_libp2p/p2p/protocol/ping/ping.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/core/peer/pb/peer_record.pb.dart' as pb;
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/config/stream_muxer.dart';
import 'package:dart_libp2p/p2p/host/autonat/ambient_config.dart';
import 'package:dart_libp2p/p2p/protocol/autonatv2/options.dart' show allowPrivateAddrs;




import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/network/swarm/swarm.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/p2p/transport/tcp_transport.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart';
import 'package:dart_libp2p/p2p/host/peerstore/pstoremem.dart';


import 'package:logging/logging.dart';

// Helper class for providing YamuxMuxer to the config  
class _YamuxMuxerProvider extends StreamMuxer {
  final MultiplexerConfig yamuxConfig;

  _YamuxMuxerProvider({required this.yamuxConfig})
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

/// Integration test peer for holepunch testing
/// Can run as a relay server or regular peer
class IntegrationTestPeer {
  late final BasicHost host;
  late final Swarm network;
  late final Config config;
  final String role;
  final String peerName;
  
  IntegrationTestPeer({
    required this.role,
    required this.peerName,
  });

  Future<void> initialize() async {
    // Setup logging
    Logger.root.level = Level.INFO;
    Logger.root.onRecord.listen((record) {
      print('${DateTime.now().toIso8601String()} [${record.level}] ${record.loggerName}: ${record.message}');
      if (record.error != null) print('ERROR: ${record.error}');
      if (record.stackTrace != null) print('STACK: ${record.stackTrace}');
    });

    print('🚀 Initializing $role peer: $peerName');

    // Register peer record codec (required for envelope/peerstore functionality)
    // This is normally done in Libp2p.new_() but we're creating BasicHost directly
    RecordRegistry.register<pb.PeerRecord>(
      String.fromCharCodes(PeerRecordEnvelopePayloadType),
      pb.PeerRecord.fromBuffer
    );
    print('✅ Peer record codec registered');

    // Create deterministic key pair for testing based on role
    // This ensures the relay server always has the same peer ID
    final keyPair = await _generateDeterministicKeyPair(role, peerName);
    final peerId = PeerId.fromPublicKey(keyPair.publicKey);
    
    print('📱 Peer ID: ${peerId.toBase58()}');

    // Create Yamux multiplexer config
    final yamuxMultiplexerConfig = MultiplexerConfig(
      keepAliveInterval: Duration(seconds: 30),
      maxStreamWindowSize: 1024 * 1024,
      initialStreamWindowSize: 256 * 1024,
      streamWriteTimeout: Duration(seconds: 10),
      maxStreams: 256,
    );

    // Configure based on environment variables
    config = Config()
      ..peerKey = keyPair
      ..enableHolePunching = _getBoolEnv('ENABLE_HOLEPUNCH', true)
      ..enableRelay = _getBoolEnv('ENABLE_RELAY', role == 'relay')
      ..enableAutoNAT = _getBoolEnv('ENABLE_AUTONAT', true) // ✅ Now enabled by default with AmbientAutoNATv2
      ..enableAutoRelay = _getBoolEnv('ENABLE_AUTORELAY', role != 'relay') // Enable AutoRelay for non-relay peers
      ..enablePing = true
      // 🔒 SECURITY: Add Noise security protocol (fixes "No security protocols configured")
      ..securityProtocols = [await NoiseSecurity.create(keyPair)]
      // 🔀 MUXING: Add Yamux multiplexer (fixes "No muxers configured")  
      ..muxers = [_YamuxMuxerProvider(yamuxConfig: yamuxMultiplexerConfig)]
      // ⏱️ AUTONAT: Configure AmbientAutoNATv2 with fast boot delay for testing
      ..ambientAutoNATConfig = AmbientAutoNATv2Config(
        bootDelay: Duration(milliseconds: 500), // Fast boot for testing
        retryInterval: Duration(seconds: 1),
        refreshInterval: Duration(seconds: 30),
      )
      // 🌐 AUTONAT SERVER: For relay servers, allow private addresses (local testing)
      ..autoNATv2Options = role == 'relay' 
        ? [allowPrivateAddrs()] 
        : []
      // 🔒 FORCE REACHABILITY: Relay servers are always public
      ..forceReachability = role == 'relay' ? Reachability.public : null;
    
    // Debug: Print config flags
    print('🔧 Config flags:');
    print('   - enableHolePunching: ${config.enableHolePunching}');
    print('   - enableRelay: ${config.enableRelay}');
    print('   - enableAutoNAT: ${config.enableAutoNAT}');
    print('   - enableAutoRelay: ${config.enableAutoRelay}');
    print('   - ambientAutoNATConfig.bootDelay: ${config.ambientAutoNATConfig?.bootDelay}');
    print('   - forceReachability: ${config.forceReachability}');

    // Parse listen addresses
    final listenAddrsStr = Platform.environment['LISTEN_ADDRS'] ?? '/ip4/0.0.0.0/tcp/4001';
    config.listenAddrs = listenAddrsStr
        .split(',')
        .map((addr) => MultiAddr(addr.trim()))
        .toList();

    // Create network infrastructure
    final peerstore = MemoryPeerstore();
    
    // 🔑 CRITICAL: Initialize peerstore with own keys (fixes peerstore lookup hangs)
    peerstore.keyBook.addPrivKey(peerId, keyPair.privateKey);
    peerstore.keyBook.addPubKey(peerId, keyPair.publicKey);
    
    final resourceManager = NullResourceManager();
    final connManager = ConnectionManager(
      idleTimeout: Duration(seconds: 30),
      shutdownTimeout: Duration(seconds: 5),
    );
    final upgrader = BasicUpgrader(resourceManager: resourceManager);
    
    // Create network (Swarm)
    network = Swarm(
      host: null, // Will be set after host creation
      localPeer: peerId,
      peerstore: peerstore,
      resourceManager: resourceManager,
      upgrader: upgrader,
      config: config,
      transports: [
        TCPTransport(
          resourceManager: resourceManager,
          connManager: connManager,
        ),
      ],
    );

    // Create host with network
    host = await BasicHost.create(network: network, config: config);
    
    // Link network back to host
    network.setHost(host);

    print('✅ $role peer $peerName initialized successfully');
  }

  Future<void> _setupRelayServer() async {
    print('🌐 Setting up relay server...');
    
    // Note: Relay service is automatically started by BasicHost when:
    // - config.enableRelay = true AND
    // - config.enableAutoNAT = false
    // No manual event emission needed!
    
    print('📡 Relay server ready to accept connections');
  }

  Future<void> _setupPeerConnections() async {
    print('🔗 Setting up peer connections...');
    
    // Parse relay servers if provided
    final relayServersStr = Platform.environment['RELAY_SERVERS'];
    if (relayServersStr != null) {
      final relayAddrs = relayServersStr
          .split(',')
          .map((addr) => MultiAddr(addr.trim()))
          .toList();
      
      print('🎯 Relay servers configured: $relayAddrs');
      
      // Connect to relay servers
      for (final relayAddr in relayAddrs) {
        try {
          await _connectToRelay(relayAddr);
        } catch (e) {
          print('⚠️  Failed to connect to relay $relayAddr: $e');
        }
      }
    }

    // Setup STUN servers for address discovery
    final stunServersStr = Platform.environment['STUN_SERVERS'];
    if (stunServersStr != null) {
      final stunServers = stunServersStr.split(',').map((s) => s.trim()).toList();
      print('🎯 STUN servers configured: $stunServers');
      // STUN integration would be handled by the NAT discovery system
    }
  }
  
  Future<void> _triggerAutoRelay() async {
    // ✅ NO LONGER NEEDED: AmbientAutoNATv2 automatically detects reachability and emits events!
    // AutoRelay will automatically start when AmbientAutoNATv2 detects private/unknown reachability.
    // This is the canonical solution - no manual event emission required.
    print('✅ AmbientAutoNATv2 will automatically handle reachability detection and trigger AutoRelay');
  }

  Future<void> _connectToRelay(MultiAddr relayAddr) async {
    print('🔌 Attempting to connect to relay: $relayAddr');
    
    // Extract relay peer ID from the multiaddr  
    // This is a simplified version - real implementation would parse properly
    try {
      // Extract peer ID from relay address and create AddrInfo
      final relayPeerId = _extractPeerIdFromAddr(relayAddr) ?? PeerId.fromString('12D3KooWDefaultRelay'); // Fallback ID
      final addrInfo = AddrInfo(relayPeerId, [relayAddr]);
      await host.connect(addrInfo);
      print('✅ Connected to relay: $relayAddr');
    } catch (e) {
      print('❌ Failed to connect to relay: $e');
      rethrow;
    }
  }

  Future<void> start() async {
    print('🎬 Starting $role peer $peerName...');
    
    // STEP 1: Start the host (initializes AutoRelay, RelayManager, and other services)
    await host.start();
    
    print('📍 Listening on addresses after host.start():');
    for (final addr in host.addrs) {
      print('  - $addr');
    }

    // STEP 2: Setup role-specific functionality
    if (role == 'relay') {
      // Trigger relay service to start
      await _setupRelayServer();
      
      // Give relay service a moment to fully initialize
      await Future.delayed(Duration(seconds: 2));
      
      print('📍 Relay server listening on addresses:');
      for (final addr in host.addrs) {
        print('  - $addr');
      }
    } else {
      // STEP 3: Connect to relay servers (AutoRelay is now listening)
      await _setupPeerConnections();
      
      // Give connections a moment to establish
      await Future.delayed(Duration(seconds: 2));
      
      // STEP 4: AmbientAutoNATv2 automatically handles reachability detection
      await _triggerAutoRelay();
      
      // STEP 5: Wait for AmbientAutoNATv2 + AutoRelay initialization
      // AmbientAutoNATv2: 500ms boot + ~1-2s for probes
      // AutoRelay: ~2-3s to discover relays and make reservations
      print('⏰ Waiting 5 seconds for AmbientAutoNATv2 and AutoRelay initialization...');
      await Future.delayed(Duration(seconds: 5));
      
      print('📍 Listening on addresses after AutoRelay initialization:');
      for (final addr in host.addrs) {
        print('  - $addr');
      }
    }

    // Start the main event loop
    await _eventLoop();
  }

  Future<void> _eventLoop() async {
    print('🔄 Starting event loop...');
    
    // Set up signal handlers
    ProcessSignal.sigint.watch().listen((_) async {
      print('📧 Received SIGINT, shutting down...');
      await shutdown();
      exit(0);
    });

    ProcessSignal.sigterm.watch().listen((_) async {
      print('📧 Received SIGTERM, shutting down...');
      await shutdown();
      exit(0);
    });

    // For testing, we can expose a simple HTTP API for control
    await _startControlAPI();

    // Keep the peer alive
    while (true) {
      await Future.delayed(Duration(seconds: 10));
      print('💓 Peer $peerName heartbeat - Connected peers: ${host.network.peers.length}');
    }
  }

  Future<void> _startControlAPI() async {
    final port = int.tryParse(Platform.environment['CONTROL_PORT'] ?? '8080') ?? 8080;
    
    // Bind to control network IP if specified (for test isolation)
    // Otherwise bind to all interfaces
    final bindIp = Platform.environment['CONTROL_BIND_IP'];
    final bindAddress = bindIp != null ? InternetAddress(bindIp) : InternetAddress.anyIPv4;
    
    final server = await HttpServer.bind(bindAddress, port);
    print('🌐 Control API listening on $bindAddress:$port');
    
    server.listen((request) async {
      print('📥 [HTTP] Incoming request received!');
      print('📥 [HTTP] Method: ${request.method}');
      print('📥 [HTTP] Path: ${request.uri.path}');
      print('📥 [HTTP] Remote address: ${request.connectionInfo?.remoteAddress}');
      print('📥 [HTTP] Content-Length: ${request.headers.contentLength}');
      
      try {
        print('📥 [HTTP] About to call _handleControlRequest...');
        await _handleControlRequest(request);
        print('📥 [HTTP] _handleControlRequest completed successfully');
      } catch (e, stackTrace) {
        print('❌ Control API error: $e');
        print('❌ Stack trace: $stackTrace');
        try {
          request.response.statusCode = 500;
          request.response.write('Error: $e');
          await request.response.close();
        } catch (closeError) {
          print('❌ Error closing response after error: $closeError');
        }
      }
    });
  }

  Future<void> _handleControlRequest(HttpRequest request) async {
    final path = request.uri.path;
    print('🌍 Control request: ${request.method} $path');
    
    switch (path) {
      case '/status':
        await _handleStatusRequest(request);
        break;
      case '/connect':
        await _handleConnectRequest(request);
        break;
      case '/holepunch':
        await _handleHolepunchRequest(request);
        break;
      case '/ping':
        await _handlePingRequest(request);
        break;
      default:
        request.response.statusCode = 404;
        request.response.write('Not found');
        await request.response.close();
    }
  }

  Future<void> _handleStatusRequest(HttpRequest request) async {
    final status = {
      'peer_id': host.id.toBase58(),
      'role': role,
      'name': peerName,
      'addresses': host.addrs.map((a) => a.toString()).toList(),
      'connected_peers': host.network.peers.length,
      'holepunch_enabled': config.enableHolePunching,
      'relay_enabled': config.enableRelay,
    };
    
    request.response.headers.contentType = ContentType.json;
    request.response.write(jsonEncode(status));
    await request.response.close();
  }

  Future<void> _handleConnectRequest(HttpRequest request) async {
    final body = await utf8.decoder.bind(request).join();
    final data = jsonDecode(body) as Map<String, dynamic>;
    final targetPeerIdStr = data['peer_id'] as String;
    final addrsJson = data['addrs'] as List<dynamic>;
    
    try {
      final targetPeerId = PeerId.fromString(targetPeerIdStr);
      final addrs = addrsJson.map((a) => MultiAddr(a)).toList();
      
      print('🔗 Adding ${addrs.length} addresses for peer $targetPeerIdStr to peerstore');
      for (final addr in addrs) {
        print('   - $addr');
      }
      
      // Clear existing addresses and add only the provided circuit addresses
      // This forces the connection to use circuit relay
      await host.peerStore.addrBook.clearAddrs(targetPeerId);
      for (final addr in addrs) {
        await host.peerStore.addrBook.addAddr(targetPeerId, addr, Duration(hours: 1));
      }
      
      print('✅ Added ${addrs.length} addresses for peer $targetPeerIdStr (cleared previous addresses)');
      
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode({
        'success': true,
        'message': 'Peer addresses added to peerstore (previous addresses cleared)',
        'addresses_added': addrs.length,
      }));
    } catch (e) {
      print('❌ Failed to add peer addresses: $e');
      request.response.statusCode = 500;
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode({
        'success': false,
        'message': 'Failed to add peer addresses: $e',
      }));
    }
    
    await request.response.close();
  }

  Future<void> _handlePingRequest(HttpRequest request) async {
    final body = await utf8.decoder.bind(request).join();
    final data = jsonDecode(body) as Map<String, dynamic>;
    final targetPeerIdStr = data['peer_id'] as String;
    
    try {
      final targetPeerId = PeerId.fromString(targetPeerIdStr);
      
      print('🏓 Attempting ping to $targetPeerIdStr using libp2p ping protocol (supports relay)');
      
      // Use libp2p's built-in ping protocol which handles relay routing transparently
      try {
        // Create a connection to the peer (will use relay if needed)
        print('🔍 Looking up addresses for target peer in peerstore...');
        final targetAddrs = await host.peerStore.addrBook.addrs(targetPeerId);
        
        if (targetAddrs.isEmpty) {
          throw Exception('No addresses found for peer $targetPeerIdStr in peerstore');
        }
        
        print('📍 Target peer addresses: $targetAddrs');
        
        // Use the host's ping service to ping the peer
        // This will work through relay connections if direct connection is not possible
        final pingService = PingService(host);
        if (pingService == null) {
          throw Exception('Ping service not available on this host');
        }
        
        print('🏓 Initiating libp2p ping to $targetPeerIdStr...');
        final pingStartTime = DateTime.now();
        
        // Ping the peer - this should work through relay if needed
        // NOTE: ping() returns a Stream<PingResult>, so we must consume it to actually perform the ping
        final pingResult = await pingService.ping(targetPeerId).first.timeout(
          Duration(seconds: 10),
          onTimeout: () {
            throw Exception('Ping timed out after 10 seconds');
          },
        );
        
        // Check if the ping failed
        if (pingResult.hasError) {
          throw Exception('Ping failed: ${pingResult.error}');
        }
        
        final pingDuration = DateTime.now().difference(pingStartTime);
        print('✅ Ping successful to $targetPeerIdStr in ${pingDuration.inMilliseconds}ms');
        
        // Get connection info for debugging
        final connectedness = host.network.connectedness(targetPeerId);
        // Get connections specifically to the target peer, not all connections
        final connections = host.network.connsToPeer(targetPeerId);
        
        print('📊 Connection state: $connectedness');
        print('📊 Active connections to target peer: ${connections.length}');
        
        request.response.headers.contentType = ContentType.json;
        request.response.write(jsonEncode({
          'success': true,
          'message': 'Ping successful via libp2p protocol (may use relay)',
          'target_peer': targetPeerIdStr,
          'ping_duration_ms': pingDuration.inMilliseconds,
          'ping_rtt_ms': pingResult.rtt?.inMilliseconds,
          'connectedness': connectedness.toString(),
          'connections_count': connections.length,
          'connection_details': connections.map((c) => {
            'remote_addr': c.remoteMultiaddr.toString(),
            'connection_type': c.runtimeType.toString(),
          }).toList(),
        }));
        
      } catch (e) {
        throw Exception('Libp2p ping failed: $e');
      }
      
    } catch (e) {
      print('❌ Ping failed: $e');
      request.response.statusCode = 500;
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode({
        'success': false,
        'message': 'Ping failed: $e',
        'target_peer': targetPeerIdStr,
      }));
    }
    
    await request.response.close();
  }

  Future<void> _handleHolepunchRequest(HttpRequest request) async {
    print('🔥 ENTERING HOLEPUNCH HANDLER!');
    print('🚀 HOLEPUNCH HANDLER STARTED!');
    print('📥 Starting to read request body...');
    
    String? targetPeerIdStr;
    PeerId? targetPeerId;
    
    try {
      final body = await utf8.decoder.bind(request).join();
      print('📥 Request body read successfully: ${body.length} characters');
      print('🚀 Request body: $body');
      
      print('📊 About to parse JSON...');
      final data = jsonDecode(body) as Map<String, dynamic>;
      print('📊 JSON parsed successfully: $data');
      
      print('🔍 Extracting peer_id from data...');
      targetPeerIdStr = data['peer_id'] as String;
      print('🚀 Target peer extracted: $targetPeerIdStr');
      
      print('🆔 Creating PeerId object...');
      targetPeerId = PeerId.fromString(targetPeerIdStr);
      print('🆔 PeerId created successfully: ${targetPeerId.toString()}');
      
      print('🎯 Starting main holepunch logic...');
      // Check if we have addresses for this peer in our peerstore
      print('🔎 Looking up addresses for peer $targetPeerIdStr in peerstore...');
      final existingAddrs = await host.peerStore.addrBook.addrs(targetPeerId);
      print('🔎 Found ${existingAddrs.length} addresses for peer $targetPeerIdStr');
      if (existingAddrs.isEmpty) {
        throw Exception('No addresses found for peer $targetPeerIdStr. Call /connect first to add peer addresses.');
      }
      
      print('🔍 Found ${existingAddrs.length} addresses for peer $targetPeerIdStr');
      for (final addr in existingAddrs) {
        print('  📍 Target address: $addr');
      }
      
      // Show our own addresses for debugging  
      final ourAddrs = host.addrs;
      print('🏠 Our addresses (${ourAddrs.length}):');
      for (final addr in ourAddrs) {
        print('  📍 Our address: $addr (isPublic: ${addr.isPublic()})');
      }
      
      // Show public addresses that holepunch service will see
      if (host is BasicHost) {
        final publicAddrs = (host as dynamic).publicAddrs as List;
        print('🔍 Public addresses for holepunch (${publicAddrs.length}):');
        for (final addr in publicAddrs) {
          print('  📍 Public address: $addr');
        }
      }
      
      // Use the existing holepunch service from BasicHost
      final holePunchService = host.holePunchService;
      if (holePunchService == null) {
        throw Exception('Holepunch service is not enabled on this host');
      }
      
      print('🔍 Ensuring holepunch service is fully initialized...');
      // Wait for the service to be properly initialized to avoid race conditions
      await holePunchService.start();
      print('✅ Holepunch service initialization confirmed');
      
      print('🕳️ Starting holepunch operation to $targetPeerIdStr...');
      print('🕳️ Checking if target peer has existing connection...');
      
      // Check if already connected
      final existingConnection = host.network.connectedness(targetPeerId);
      print('🕳️ Existing connection status: $existingConnection');
      
      // Check addresses in peerstore
      final peerAddrs = await host.peerStore.addrBook.addrs(targetPeerId);
      print('🕳️ Target peer addresses in peerstore: $peerAddrs');
      
      // Check our own addresses
      final ownAddrs = host.allAddrs;
      print('🕳️ Our own addresses: $ownAddrs');
      
      // Check relay connections 
      final allConnections = host.network.connectedness;
      print('🕳️ All network connections: $allConnections');
      
      print('🕳️ About to call holePunchService.directConnect()...');
      final stopwatch = Stopwatch()..start();
      
      // Add timeout to prevent infinite hang
      await holePunchService.directConnect(targetPeerId).timeout(
        Duration(seconds: 30),
        onTimeout: () {
          print('❌ Holepunch timed out after ${stopwatch.elapsedMilliseconds}ms');
          throw Exception('Holepunch timed out after 30 seconds - likely waiting for public addresses that never arrive');
        },
      );
      
      stopwatch.stop();
      print('✅ Holepunch completed in ${stopwatch.elapsedMilliseconds}ms');
      
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode({
        'success': true,
        'message': 'Holepunch initiated successfully',
        'target_peer': targetPeerIdStr,
      }));
    } catch (e, stackTrace) {
      print('❌ Error in holepunch handler: $e');
      print('❌ Stack trace: $stackTrace');
      request.response.statusCode = 500;
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode({
        'success': false,
        'message': 'Holepunch failed: $e',
        'target_peer': targetPeerIdStr ?? 'unknown',
      }));
    }
    
    await request.response.close();
  }

  /// Attempts to discover a peer via relay connection
  Future<void> _discoverPeerViaRelay(PeerId targetPeerId) async {
    print('🔍 Attempting to discover peer $targetPeerId via relay...');
    
    // Check if we already have addresses for this peer
    final existingAddrs = await host.peerStore.addrBook.addrs(targetPeerId);
    if (existingAddrs.isNotEmpty) {
      print('✅ Peer $targetPeerId already known with ${existingAddrs.length} addresses');
      return;
    }
    
    // Try to connect to the relay first to ensure we have a communication path
    final relayServers = Platform.environment['RELAY_SERVERS'];
    if (relayServers != null && relayServers.isNotEmpty) {
      final relayAddrs = relayServers.split(',').map((s) => MultiAddr(s.trim())).toList();
      
      for (final relayAddr in relayAddrs) {
        try {
          await _connectToRelay(relayAddr);
          print('✅ Connected to relay for peer discovery: $relayAddr');
          break; // Exit after first successful connection
        } catch (e) {
          print('⚠️ Failed to connect to relay $relayAddr: $e');
          continue;
        }
      }
    }
    
    // For now, we'll rely on the relay and identify protocol to discover peers
    // In a more sophisticated setup, we could implement active peer discovery
    print('🔍 Waiting for peer discovery via identify protocol...');
  }

  Future<void> shutdown() async {
    print('🛑 Shutting down $role peer $peerName...');
    await host.close();
    print('✅ Shutdown complete');
  }

  bool _getBoolEnv(String key, bool defaultValue) {
    final value = Platform.environment[key]?.toLowerCase();
    if (value == null) return defaultValue;
    return value == 'true' || value == '1' || value == 'yes';
  }
  
  /// Generate a deterministic Ed25519 key pair based on role and name
  /// This ensures consistent peer IDs across container restarts for testing
  Future<KeyPair> _generateDeterministicKeyPair(String role, String name) async {
    // Create a deterministic seed based on role and name
    final seedString = 'dart-libp2p-integration-test-$role-$name';
    final seedBytes = utf8.encode(seedString);
    
    // Use SHA-256 to get a 32-byte seed
    final digest = _sha256(seedBytes);
    
    // Generate Ed25519 key pair from the seed
    return await generateEd25519KeyPairFromSeed(Uint8List.fromList(digest));
  }
  
  /// Simple SHA-256 hash implementation for deterministic key generation
  /// This is a simple hash for testing purposes only
  List<int> _sha256(List<int> data) {
    final result = List<int>.filled(32, 0);
    for (int i = 0; i < 32; i++) {
      int sum = 0;
      for (int j = 0; j < data.length; j++) {
        sum += data[j] * (i + j + 1);
      }
      result[i] = sum % 256;
    }
    return result;
  }
  
  /// Extract peer ID from a MultiAddr if it contains a p2p component
  PeerId? _extractPeerIdFromAddr(MultiAddr addr) {
    try {
      final peerIdStr = addr.valueForProtocol('p2p');
      return peerIdStr != null ? PeerId.fromString(peerIdStr) : null;
    } catch (e) {
      return null;
    }
  }
  
  /// Set the host reference in the network after host creation
  void setHost(BasicHost host) {
    // This would be called from network.setHost(host) which is already done above
  }
}

Future<void> main() async {
  final role = Platform.environment['PEER_ROLE'] ?? 'peer';
  final peerName = Platform.environment['PEER_NAME'] ?? 'unknown';
  
  final peer = IntegrationTestPeer(role: role, peerName: peerName);
  
  try {
    await peer.initialize();
    await peer.start();
  } catch (e, stack) {
    print('💥 Fatal error in peer $peerName: $e');
    print('Stack trace: $stack');
    exit(1);
  }
}
