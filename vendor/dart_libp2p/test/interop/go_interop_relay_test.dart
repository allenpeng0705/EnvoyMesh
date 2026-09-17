import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/network/context.dart' as core_context;
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/config/stream_muxer.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/tcp_transport.dart';
import 'package:logging/logging.dart';
import 'package:test/test.dart';

import 'package:dart_libp2p/p2p/protocol/circuitv2/client/reservation.dart';

import 'helpers/go_process_manager.dart';

/// Yamux muxer provider for Config.
class _TestYamuxMuxerProvider extends StreamMuxer {
  _TestYamuxMuxerProvider({required MultiplexerConfig yamuxConfig})
      : super(
          id: YamuxConstants.protocolId,
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
  Logger.root.level = Level.INFO;
  Logger.root.onRecord.listen((record) {
    if (record.level >= Level.WARNING ||
        record.loggerName.contains('Noise') ||
        record.loggerName.contains('Yamux') ||
        record.loggerName.contains('BasicHost') ||
        record.loggerName.contains('identify') ||
        record.loggerName.contains('Identify') ||
        record.loggerName.contains('Circuit') ||
        record.loggerName.contains('Relay')) {
      print('${record.level.name}: ${record.loggerName}: ${record.message}');
    }
  });

  late String goBinaryPath;

  final yamuxConfig = MultiplexerConfig(
    keepAliveInterval: Duration(seconds: 30),
    maxStreamWindowSize: 1024 * 1024,
    initialStreamWindowSize: 256 * 1024,
    streamWriteTimeout: Duration(seconds: 10),
    maxStreams: 256,
  );

  setUpAll(() async {
    final goSourceDir = '${Directory.current.path}/interop/go-peer';
    goBinaryPath = await GoProcessManager.ensureBinary(goSourceDir);
    print('Go peer binary: $goBinaryPath');
  });

  /// Creates a BasicHost with TCP transport and optional relay support.
  Future<BasicHost> createHost(KeyPair keyPair,
      {List<MultiAddr>? listenAddrs, bool enableRelay = false}) async {
    final connMgr = ConnectionManager();
    final resMgr = ResourceManagerImpl(limiter: FixedLimiter());
    final muxerDef = _TestYamuxMuxerProvider(yamuxConfig: yamuxConfig);

    final config = p2p_config.Config()
      ..peerKey = keyPair
      ..securityProtocols = [await NoiseSecurity.create(keyPair)]
      ..muxers = [muxerDef]
      ..transports = [
        TCPTransport(resourceManager: resMgr, connManager: connMgr)
      ]
      ..connManager = connMgr
      ..addrsFactory = (addrs) => addrs;
    config.enableRelay = enableRelay;

    if (listenAddrs != null) {
      config.listenAddrs = listenAddrs;
    }

    final host = await config.newNode() as BasicHost;
    await host.start();
    return host;
  }

  group('Circuit Relay v2 Go-libp2p Interop', () {
    late GoProcessManager goRelay;
    late GoProcessManager goEchoServer;
    BasicHost? dartHost;

    setUp(() {
      goRelay = GoProcessManager(binaryPath: goBinaryPath);
      goEchoServer = GoProcessManager(binaryPath: goBinaryPath);
    });

    tearDown(() async {
      await goEchoServer.stop();
      await goRelay.stop();
      if (dartHost != null) {
        await dartHost!.close();
        dartHost = null;
      }
    });

    test('Dart dials Go echo-server through Go relay', () async {
      // 1. Start Go relay
      await goRelay.startRelay();
      final relayAddr = goRelay.listenAddr;
      final relayPeerId = goRelay.peerId;
      print('Go relay: $relayAddr (${relayPeerId.toBase58()})');

      // 2. Start Go echo-server behind relay
      final relayFullAddr = '$relayAddr/p2p/${relayPeerId.toBase58()}';
      await goEchoServer.startRelayEchoServer(relayFullAddr);
      final circuitAddr = goEchoServer.circuitAddr;
      final echoServerPeerId = goEchoServer.peerId;
      print('Go echo-server circuit addr: $circuitAddr');

      // 3. Create Dart client with relay enabled
      final keyPair = await crypto_ed25519.generateEd25519KeyPair();
      dartHost = await createHost(keyPair, enableRelay: true);
      print('Dart host started');

      // 4. Connect to the relay first
      await dartHost!.connect(
          AddrInfo(relayPeerId, [relayAddr]),
          context: core_context.Context());
      print('Connected to relay');

      // 5. Dial through relay to echo server
      final circuitMA = MultiAddr(circuitAddr);
      await dartHost!.connect(
          AddrInfo(echoServerPeerId, [circuitMA]),
          context: core_context.Context());
      print('Connected to echo server through relay');

      // 6. Open echo stream and verify
      final stream = await dartHost!
          .newStream(echoServerPeerId, ['/echo/1.0.0'], core_context.Context());
      print('Stream opened: protocol=${stream.protocol()}');
      expect(stream.protocol(), '/echo/1.0.0');

      final random = Random();
      final pingData =
          Uint8List.fromList(List.generate(32, (_) => random.nextInt(256)));

      await stream.write(pingData);
      await stream.closeWrite();
      print('Sent ${pingData.length} bytes');

      final response = await stream.read();
      print('Received ${response.length} bytes');
      expect(response, orderedEquals(pingData));
      print('Echo through relay verified');

      await stream.close();
    }, timeout: Timeout(Duration(seconds: 60)));

    test('Go dials Dart echo-handler through Go relay', () async {
      // 1. Start Go relay
      await goRelay.startRelay();
      final relayAddr = goRelay.listenAddr;
      final relayPeerId = goRelay.peerId;
      print('Go relay: $relayAddr');

      // 2. Create Dart host with relay enabled and listening
      final keyPair = await crypto_ed25519.generateEd25519KeyPair();
      final dartPeerId = await PeerId.fromPublicKey(keyPair.publicKey);
      dartHost = await createHost(keyPair,
          listenAddrs: [MultiAddr('/ip4/127.0.0.1/tcp/0')],
          enableRelay: true);
      print('Dart host started');

      // Register echo handler
      dartHost!.setStreamHandler('/echo/1.0.0',
          (P2PStream stream, PeerId remotePeer) async {
        try {
          final data = await stream.read();
          print('Echo handler: received ${data.length} bytes from $remotePeer');
          await stream.write(data);
          await stream.closeWrite();
        } catch (e) {
          print('Echo handler error: $e');
          await stream.reset();
        }
      });

      // 3. Connect Dart to relay and reserve a slot
      await dartHost!.connect(
          AddrInfo(relayPeerId, [relayAddr]),
          context: core_context.Context());
      print('Dart connected to relay');

      // Make a reservation on the relay
      final relayClient = dartHost!.circuitV2Client;
      expect(relayClient, isNotNull, reason: 'CircuitV2Client should be created when relay is enabled');
      final reservation = await relayClient!.reserve(relayPeerId);
      print('Dart reserved slot on relay, expires: ${reservation.expire}');

      // Build the circuit address for Go to dial
      final dartCircuitAddr =
          '$relayAddr/p2p-circuit/p2p/${dartPeerId.toBase58()}';
      print('Dart circuit addr: $dartCircuitAddr');

      // 4. Run Go echo-client targeting Dart through relay
      final goClient = GoProcessManager(binaryPath: goBinaryPath);
      final result =
          await goClient.runRelayEchoClient(dartCircuitAddr, 'hello via relay');
      print('Go relay-echo-client stdout: ${result.stdout}');
      print('Go relay-echo-client stderr: ${result.stderr}');

      expect(result.exitCode, 0,
          reason: 'Go relay-echo-client should succeed');
      expect(result.stdout.toString(), contains('Echo successful'));
      print('Go → Dart echo through relay verified');
    }, timeout: Timeout(Duration(seconds: 60)));
  });
}
