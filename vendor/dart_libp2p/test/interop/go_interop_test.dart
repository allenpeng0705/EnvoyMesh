import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/context.dart' as core_context;
import 'package:dart_libp2p/core/network/mux.dart' as core_mux_types;
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/config/stream_muxer.dart';
import 'package:dart_libp2p/p2p/network/connmgr/null_conn_mgr.dart';
import 'package:dart_libp2p/core/network/stream.dart' as p2p_stream;
import 'package:dart_libp2p/p2p/protocol/multistream/client.dart' as ms_client;
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/p2p/transport/listener.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/stream.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/p2p/transport/tcp_transport.dart';
import 'package:logging/logging.dart';
import 'package:test/test.dart';

import 'helpers/go_process_manager.dart';

/// Helper to create a Yamux muxer provider for config.
class _TestYamuxMuxerProvider extends StreamMuxer {
  _TestYamuxMuxerProvider({required MultiplexerConfig yamuxConfig})
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
  // Enable logging for debugging interop issues
  Logger.root.level = Level.INFO;
  Logger.root.onRecord.listen((record) {
    // ignore very noisy loggers unless severe
    if (record.level >= Level.WARNING || record.loggerName.contains('Noise') || record.loggerName.contains('Yamux')) {
      print('${record.level.name}: ${record.loggerName}: ${record.message}');
    }
  });

  late String goBinaryPath;
  late GoProcessManager goProcess;
  late TCPTransport dartTransport;
  late BasicUpgrader dartUpgrader;
  late p2p_config.Config dartConfig;
  late KeyPair dartKeyPair;
  late PeerId dartPeerId;
  late ResourceManager resourceManager;
  late NullConnMgr connManager;

  final yamuxConfig = MultiplexerConfig(
    keepAliveInterval: Duration(seconds: 30),
    maxStreamWindowSize: 1024 * 1024,
    initialStreamWindowSize: 256 * 1024,
    streamWriteTimeout: Duration(seconds: 10),
    maxStreams: 256,
  );

  setUpAll(() async {
    // Build Go peer if needed
    final goSourceDir = '${Directory.current.path}/interop/go-peer';
    goBinaryPath = await GoProcessManager.ensureBinary(goSourceDir);
    print('Go peer binary: $goBinaryPath');
  });

  setUp(() async {
    goProcess = GoProcessManager(binaryPath: goBinaryPath);
    resourceManager = NullResourceManager();
    connManager = NullConnMgr();

    dartKeyPair = await crypto_ed25519.generateEd25519KeyPair();
    dartPeerId = await PeerId.fromPublicKey(dartKeyPair.publicKey);

    dartTransport = TCPTransport(
        connManager: connManager, resourceManager: resourceManager);
    dartUpgrader = BasicUpgrader(resourceManager: resourceManager);

    dartConfig = p2p_config.Config()
      ..peerKey = dartKeyPair
      ..securityProtocols = [await NoiseSecurity.create(dartKeyPair)]
      ..muxers = [_TestYamuxMuxerProvider(yamuxConfig: yamuxConfig)];
  });

  tearDown(() async {
    await goProcess.stop();
    await dartTransport.dispose();
  });

  group('Go-libp2p TCP Interoperability', () {
    test('Dart connects to Go server (TCP + Noise + Yamux)', () async {
      // Start Go server
      await goProcess.startServer();
      final goAddr = goProcess.listenAddr;
      final goPeerId = goProcess.peerId;
      print('Go peer: $goAddr');

      // Dart dials Go peer
      final rawConn = await dartTransport.dial(goAddr);
      print('TCP connected to Go peer');

      // Upgrade: Noise + Yamux
      final upgradedConn = await dartUpgrader.upgradeOutbound(
        connection: rawConn,
        remotePeerId: goPeerId,
        config: dartConfig,
        remoteAddr: goAddr,
      );

      print('Upgraded! Remote peer: ${upgradedConn.remotePeer}');
      print('Security: ${upgradedConn.state.security}');
      print('Muxer: ${upgradedConn.state.streamMultiplexer}');

      expect(upgradedConn.remotePeer.toString(), goPeerId.toString());
      expect(upgradedConn.state.security, contains('noise'));
      expect(upgradedConn.state.streamMultiplexer, contains('yamux'));

      await upgradedConn.close();
      print('Connection established and closed successfully.');
    }, timeout: Timeout(Duration(seconds: 30)));

    test('Dart pings Go server via echo protocol', () async {
      // Start Go server (which handles /echo/1.0.0)
      await goProcess.startServer();
      final goAddr = goProcess.listenAddr;
      final goPeerId = goProcess.peerId;

      // Connect and upgrade
      final rawConn = await dartTransport.dial(goAddr);
      final upgradedConn = await dartUpgrader.upgradeOutbound(
        connection: rawConn,
        remotePeerId: goPeerId,
        config: dartConfig,
        remoteAddr: goAddr,
      );

      // Open a stream and negotiate echo protocol via multistream-select
      final muxedConn = upgradedConn as core_mux_types.MuxedConn;
      final stream = await muxedConn.openStream(core_context.Context());
      print('Stream opened');

      // Negotiate /echo/1.0.0 protocol via multistream-select
      // YamuxStream implements both MuxedStream and P2PStream
      await ms_client.selectProtoOrFail('/echo/1.0.0', stream as p2p_stream.P2PStream<dynamic>);
      print('Echo protocol negotiated');

      // Send 32 random bytes, expect echo
      final random = Random();
      final pingData =
          Uint8List.fromList(List.generate(32, (_) => random.nextInt(256)));

      await stream.write(pingData);
      print('Sent ${pingData.length} bytes');

      final response = await stream.read(32);
      print('Received ${response.length} bytes');

      expect(response, orderedEquals(pingData));
      print('Echo verified!');

      await stream.close();
      await upgradedConn.close();
    }, timeout: Timeout(Duration(seconds: 30)));

    test('Go connects to Dart server (TCP + Noise + Yamux)', () async {
      // Start Dart listener
      final listenAddr = MultiAddr('/ip4/127.0.0.1/tcp/0');
      final listener = await dartTransport.listen(listenAddr);
      final actualAddr = listener.addr;
      print('Dart listening on: $actualAddr');

      // Build the full multiaddr with peer ID for Go to connect to
      final dartMultiaddr = '$actualAddr/p2p/${dartPeerId.toBase58()}';
      print('Dart multiaddr: $dartMultiaddr');

      // Accept connection and upgrade inbound (async)
      final acceptFuture = listener.accept().then((rawConn) async {
        if (rawConn == null) throw Exception('Accepted null connection');
        print('Dart accepted raw connection');
        final upgraded = await dartUpgrader.upgradeInbound(
          connection: rawConn,
          config: dartConfig,
        );
        print('Dart upgraded inbound connection from: ${upgraded.remotePeer}');
        return upgraded;
      });

      // Go connects to Dart
      final result = await goProcess.runClient(dartMultiaddr);
      print('Go client stdout: ${result.stdout}');
      print('Go client stderr: ${result.stderr}');
      expect(result.exitCode, 0, reason: 'Go client should connect successfully');
      expect(result.stdout.toString(), contains('Connected'));

      final upgradedConn = await acceptFuture.timeout(Duration(seconds: 15));
      expect(upgradedConn.state.security, contains('noise'));
      expect(upgradedConn.state.streamMultiplexer, contains('yamux'));

      await upgradedConn.close();
      await listener.close();
      print('Go -> Dart connection successful.');
    }, timeout: Timeout(Duration(seconds: 30)));
  });
}
