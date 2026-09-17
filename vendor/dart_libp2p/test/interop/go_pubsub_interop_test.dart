import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
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
import 'package:dart_libp2p_pubsub/dart_libp2p_pubsub.dart';
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
        record.loggerName.contains('PubSub') ||
        record.loggerName.contains('GossipSub') ||
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

    if (listenAddrs != null) {
      config.listenAddrs = listenAddrs;
    }

    final host = await config.newNode() as BasicHost;
    await host.start();
    return host;
  }

  group('GossipSub Go-libp2p Interop', () {
    late GoProcessManager goServer;
    BasicHost? dartHost;
    PubSub? dartPubSub;

    setUp(() {
      goServer = GoProcessManager(binaryPath: goBinaryPath);
    });

    tearDown(() async {
      if (dartPubSub != null) {
        await dartPubSub!.stop();
        dartPubSub = null;
      }
      if (dartHost != null) {
        await dartHost!.close();
        dartHost = null;
      }
      await goServer.stop();
    });

    test('Go publishes, Dart receives via GossipSub', () async {
      const testTopic = 'test-interop-topic';
      const testMessage = 'hello from go-libp2p';

      // 1. Create Dart host + GossipSub
      final keyPair = await crypto_ed25519.generateEd25519KeyPair();
      dartHost = await createHost(keyPair,
          listenAddrs: [MultiAddr('/ip4/127.0.0.1/tcp/0')]);

      final router = GossipSubRouter();
      dartPubSub = PubSub(dartHost!, router, privateKey: keyPair.privateKey);
      await dartPubSub!.start();

      // Subscribe to topic
      final sub = dartPubSub!.subscribe(testTopic);
      print('Dart subscribed to $testTopic');

      // Get Dart's listen address
      final dartAddrs = dartHost!.addrs;
      expect(dartAddrs, isNotEmpty, reason: 'Dart host should have listen addresses');
      final dartAddr = dartAddrs.first;
      final dartPeerId = dartHost!.id;
      final fullAddr = '$dartAddr/p2p/${dartPeerId.toBase58()}';
      print('Dart listening on: $fullAddr');

      // 2. Start Go pubsub-server (which will connect to Dart)
      // Actually, Go should connect as client to Dart
      // Let's have Go be the pubsub-client that connects and publishes
      final goClient = GoProcessManager(binaryPath: goBinaryPath);

      // Set up the message listener BEFORE starting Go client
      // (broadcast stream doesn't buffer, so we must listen first)
      final messageCompleter = Completer<PubSubMessage>();
      final streamSub = sub.stream.listen((event) {
        if (!messageCompleter.isCompleted && event is PubSubMessage) {
          messageCompleter.complete(event);
        }
      });

      // Give Dart a moment to be ready
      await Future.delayed(Duration(seconds: 1));

      final result = await goClient.runPubSubClient(fullAddr, testTopic, testMessage);
      print('Go pubsub-client stdout: ${result.stdout}');
      print('Go pubsub-client stderr: ${result.stderr}');
      expect(result.exitCode, 0, reason: 'Go pubsub client should succeed');

      // 3. Wait for Dart to receive the message
      final received = await messageCompleter.future.timeout(
        Duration(seconds: 15),
        onTimeout: () => throw TimeoutException('Timed out waiting for GossipSub message from Go'),
      );
      await streamSub.cancel();

      expect(received, isA<PubSubMessage>());
      final msg = received;
      expect(String.fromCharCodes(msg.data), equals(testMessage));
      print('GossipSub Go→Dart interop verified');
    }, timeout: Timeout(Duration(seconds: 60)));

    test('Dart publishes, Go receives via GossipSub', () async {
      const testTopic = 'test-interop-topic';
      const testMessage = 'hello from dart-libp2p';

      // 1. Start Go pubsub-server that subscribes and waits for messages
      await goServer.startPubSubServer(topic: testTopic);
      final goAddr = goServer.listenAddr;
      final goPeerId = goServer.peerId;
      print('Go pubsub server: $goAddr (${goPeerId.toBase58()})');

      // 2. Create Dart host + GossipSub
      final keyPair = await crypto_ed25519.generateEd25519KeyPair();
      dartHost = await createHost(keyPair,
          listenAddrs: [MultiAddr('/ip4/127.0.0.1/tcp/0')]);

      // Connect to Go peer first
      await dartHost!.connect(
          AddrInfo(goPeerId, [goAddr]),
          context: core_context.Context());
      print('Connected to Go pubsub server');

      final router = GossipSubRouter();
      dartPubSub = PubSub(dartHost!, router, privateKey: keyPair.privateKey);
      await dartPubSub!.start();

      // Subscribe (needed for mesh formation)
      dartPubSub!.subscribe(testTopic);

      // Wait for GossipSub mesh to form (need Go's SUB + GRAFT to arrive)
      await Future.delayed(Duration(seconds: 5));

      // 3. Dart publishes
      await dartPubSub!.publish(testTopic, Uint8List.fromList(testMessage.codeUnits));
      print('Dart published message');

      // Wait a moment then publish again (in case first was sent before mesh fully formed)
      await Future.delayed(Duration(seconds: 2));
      await dartPubSub!.publish(testTopic, Uint8List.fromList(testMessage.codeUnits));
      print('Dart published message (retry)');

      // Wait for message delivery
      await Future.delayed(Duration(seconds: 5));

      // Print Go server's full output for debugging
      print('--- Go server output ---');
      for (final line in goServer.output) {
        print('  $line');
      }
      print('--- End Go server output ---');

      // 4. Check Go output for received message
      final output = await goServer.waitForOutput('Received: $testMessage',
          timeout: Duration(seconds: 10));
      print('Go received: $output');
      expect(output, contains('Received: $testMessage'));
      print('GossipSub Dart→Go interop verified');
    }, timeout: Timeout(Duration(seconds: 60)));
  });
}
