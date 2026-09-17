import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:dart_udx/dart_udx.dart';
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
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:logging/logging.dart';
import 'package:test/test.dart';

import 'helpers/go_process_manager.dart';

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
        record.loggerName.contains('Identify')) {
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

  Future<BasicHost> createHost(KeyPair keyPair,
      {List<MultiAddr>? listenAddrs}) async {
    final connMgr = ConnectionManager();
    final udxInstance = UDX();
    final muxerDef = _TestYamuxMuxerProvider(yamuxConfig: yamuxConfig);

    final config = p2p_config.Config()
      ..peerKey = keyPair
      ..securityProtocols = [await NoiseSecurity.create(keyPair)]
      ..muxers = [muxerDef]
      ..transports = [
        UDXTransport(connManager: connMgr, udxInstance: udxInstance)
      ]
      ..connManager = connMgr
      ..addrsFactory = (addrs) => addrs; // Preserve loopback addresses

    if (listenAddrs != null) {
      config.listenAddrs = listenAddrs;
    }

    final host = await config.newNode() as BasicHost;
    await host.start();
    return host;
  }

  group('BasicHost Go-libp2p UDX Interop', () {
    late GoProcessManager goProcess;
    BasicHost? dartHost;

    setUp(() {
      goProcess = GoProcessManager(binaryPath: goBinaryPath);
    });

    tearDown(() async {
      await goProcess.stop();
      if (dartHost != null) {
        await dartHost!.close();
        dartHost = null;
      }
    });

    test('Dart BasicHost connects to Go over UDX and completes identify',
        () async {
      await goProcess.startServer(transport: 'udx');
      final goAddr = goProcess.listenAddr;
      final goPeerId = goProcess.peerId;
      print('Go peer: $goAddr');

      final keyPair = await crypto_ed25519.generateEd25519KeyPair();
      dartHost = await createHost(keyPair);
      print('Dart host started');

      await dartHost!
          .connect(AddrInfo(goPeerId, [goAddr]), context: core_context.Context());
      print('Connected to Go peer over UDX');

      final protocols =
          await dartHost!.peerStore.protoBook.getProtocols(goPeerId);
      print('Go peer protocols: $protocols');
      expect(protocols, isNotEmpty,
          reason: 'Identify should have populated Go protocols in peerstore');
      expect(protocols, contains('/echo/1.0.0'));

      print('Identify exchange over UDX verified');
    }, timeout: Timeout(Duration(seconds: 30)));

    test('Dart BasicHost echoes via newStream to Go UDX server', () async {
      await goProcess.startServer(transport: 'udx');
      final goAddr = goProcess.listenAddr;
      final goPeerId = goProcess.peerId;

      final keyPair = await crypto_ed25519.generateEd25519KeyPair();
      dartHost = await createHost(keyPair);

      await dartHost!
          .connect(AddrInfo(goPeerId, [goAddr]), context: core_context.Context());
      print('Connected to Go peer over UDX');

      final stream = await dartHost!
          .newStream(goPeerId, ['/echo/1.0.0'], core_context.Context());
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
      print('Echo over UDX verified via BasicHost.newStream');

      await stream.close();
    }, timeout: Timeout(Duration(seconds: 30)));

    test('Go echo-client connects to Dart BasicHost over UDX', () async {
      final keyPair = await crypto_ed25519.generateEd25519KeyPair();
      final dartPeerId = await PeerId.fromPublicKey(keyPair.publicKey);

      dartHost = await createHost(keyPair,
          listenAddrs: [MultiAddr('/ip4/127.0.0.1/udp/0/udx')]);

      if (dartHost!.addrs.isEmpty) {
        throw Exception('Dart host failed to listen on any address');
      }

      final dartAddr = dartHost!.addrs.firstWhere(
        (addr) => addr.toString().contains('/udx'),
        orElse: () => throw Exception('Dart host not listening on UDX'),
      );
      print('Dart host listening on: $dartAddr');

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

      final targetAddr = '$dartAddr/p2p/${dartPeerId.toBase58()}';
      print('Go echo-client target: $targetAddr');

      final result = await goProcess.runEchoClient(
          targetAddr, 'hello from go-libp2p', transport: 'udx');
      print('Go echo-client stdout: ${result.stdout}');
      print('Go echo-client stderr: ${result.stderr}');

      expect(result.exitCode, 0, reason: 'Go echo-client should succeed');
      expect(result.stdout.toString(), contains('Echo successful'));
      print('Go → Dart echo over UDX via BasicHost verified');
    }, timeout: Timeout(Duration(seconds: 30)));

    test('Go pings Dart BasicHost over UDX', () async {
      final keyPair = await crypto_ed25519.generateEd25519KeyPair();
      final dartPeerId = await PeerId.fromPublicKey(keyPair.publicKey);

      dartHost = await createHost(keyPair,
          listenAddrs: [MultiAddr('/ip4/127.0.0.1/udp/0/udx')]);

      if (dartHost!.addrs.isEmpty) {
        throw Exception('Dart host failed to listen on any address');
      }

      final dartAddr = dartHost!.addrs.firstWhere(
        (addr) => addr.toString().contains('/udx'),
        orElse: () => throw Exception('Dart host not listening on UDX'),
      );
      print('Dart host listening on: $dartAddr');

      final targetAddr = '$dartAddr/p2p/${dartPeerId.toBase58()}';
      print('Go ping target: $targetAddr');

      final result = await goProcess.runPing(targetAddr, transport: 'udx');
      print('Go ping stdout: ${result.stdout}');
      print('Go ping stderr: ${result.stderr}');

      expect(result.exitCode, 0, reason: 'Go ping should succeed');
      expect(result.stdout.toString(), contains('Ping successful'));
      print('Go → Dart ping over UDX via BasicHost verified');
    }, timeout: Timeout(Duration(seconds: 30)));
  });
}
