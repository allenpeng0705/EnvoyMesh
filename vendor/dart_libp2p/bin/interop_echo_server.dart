/// Interop echo server for Go↔Dart libp2p transport-level testing.
/// Listens on UDX with Noise+Yamux. Echoes raw bytes on accepted Yamux streams.
/// Prints "READY <port> <peer-id>" to stderr when ready.
import 'dart:async';
import 'dart:io';

import 'package:dart_udx/dart_udx.dart';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart'
    as p2p_conn_manager;

const String echoProtocol = '/echo/1.0.0';

Future<void> main(List<String> arguments) async {
  final listenAddr =
      arguments.isNotEmpty ? arguments[0] : '/ip4/127.0.0.1/udp/0/udx';

  final udxInstance = UDX();
  final localKeyPair = await crypto_ed25519.generateEd25519KeyPair();
  final connManager = p2p_conn_manager.ConnectionManager();

  final options = <p2p_config.Option>[
    p2p_config.Libp2p.identity(localKeyPair),
    p2p_config.Libp2p.connManager(connManager),
    p2p_config.Libp2p.transport(
        UDXTransport(connManager: connManager, udxInstance: udxInstance)),
    p2p_config.Libp2p.security(await NoiseSecurity.create(localKeyPair)),
    p2p_config.Libp2p.listenAddrs([MultiAddr(listenAddr)]),
    // Allow loopback addresses for local interop testing
    p2p_config.Libp2p.addrsFactory((addrs) => addrs),
  ];

  final host = await p2p_config.Libp2p.new_(options);
  await host.start();

  // Register echo handler — echoes any data back on /echo/1.0.0 streams
  host.setStreamHandler(echoProtocol, (stream, remotePeer) async {
    try {
      final data = await stream.read().timeout(Duration(seconds: 10));
      await stream.write(data);
    } catch (e) {
      stderr.writeln('ECHO_ERROR: $e');
      await stream.reset();
    } finally {
      if (!stream.isClosed) {
        await stream.close();
      }
    }
  });

  // Extract port from actual listen address
  final addrs = host.addrs;
  if (addrs.isEmpty) {
    stderr.writeln('ERROR: No listen addresses');
    exit(1);
  }

  final udxAddr = addrs.firstWhere(
    (a) => a.toString().contains('/udx'),
    orElse: () => addrs.first,
  );

  final parts = udxAddr.toString().split('/');
  final udpIdx = parts.indexOf('udp');
  final port = parts[udpIdx + 1];
  final peerId = host.id.toString();

  // Signal readiness
  stderr.writeln('READY $port $peerId');

  // Wait for shutdown signal
  final completer = Completer<void>();
  ProcessSignal.sigint.watch().listen((_) {
    if (!completer.isCompleted) completer.complete();
  });
  stdin.listen((_) {}, onDone: () {
    if (!completer.isCompleted) completer.complete();
  });

  await completer.future;

  await host.close();
  await connManager.dispose();
}
