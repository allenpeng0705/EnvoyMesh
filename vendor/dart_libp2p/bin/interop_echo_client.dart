/// Interop echo client for Go↔Dart testing.
/// Usage: dart run bin/interop_echo_client.dart <multiaddr-with-p2p>
/// Connects, sends "hello interop" on /echo/1.0.0, verifies echo, exits 0 on success.
import 'dart:io';
import 'dart:typed_data';

import 'package:dart_udx/dart_udx.dart';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/network/context.dart' as core_context;
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart'
    as p2p_conn_manager;
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart';

const String echoProtocol = '/echo/1.0.0';

Future<void> main(List<String> arguments) async {
  if (arguments.isEmpty) {
    stderr.writeln('Usage: dart run bin/interop_echo_client.dart <multiaddr/p2p/peerid>');
    exit(1);
  }

  final targetAddrStr = arguments[0];
  final targetMa = MultiAddr(targetAddrStr);

  // Extract peer ID
  final targetPeerIdStr = targetMa.valueForProtocol(Protocols.p2p.name);
  if (targetPeerIdStr == null) {
    stderr.writeln('ERROR: multiaddr must include /p2p/<peer-id>');
    exit(1);
  }
  final targetPeerId = PeerId.fromString(targetPeerIdStr);
  final connectAddr = targetMa.decapsulate(Protocols.p2p.name);

  final udxInstance = UDX();
  final localKeyPair = await crypto_ed25519.generateEd25519KeyPair();
  final connManager = p2p_conn_manager.ConnectionManager();

  final options = <p2p_config.Option>[
    p2p_config.Libp2p.identity(localKeyPair),
    p2p_config.Libp2p.connManager(connManager),
    p2p_config.Libp2p.transport(
        UDXTransport(connManager: connManager, udxInstance: udxInstance)),
    p2p_config.Libp2p.security(await NoiseSecurity.create(localKeyPair)),
  ];

  final host = await p2p_config.Libp2p.new_(options);
  await host.start();

  try {
    // Add address to peerstore
    if (connectAddr != null) {
      await host.peerStore.addrBook
          .addAddrs(targetPeerId, [connectAddr], Duration(hours: 1));
    }

    // Open echo stream
    final stream = await host
        .newStream(targetPeerId, [echoProtocol], core_context.Context())
        .timeout(Duration(seconds: 15));

    final payload = Uint8List.fromList('hello interop'.codeUnits);
    await stream.write(payload);

    final response = await stream.read().timeout(Duration(seconds: 10));

    if (!stream.isClosed) {
      await stream.close();
    }

    // Verify
    if (response.length != payload.length) {
      stderr.writeln(
          'FAIL: length mismatch: got ${response.length}, want ${payload.length}');
      exit(1);
    }
    for (int i = 0; i < payload.length; i++) {
      if (response[i] != payload[i]) {
        stderr.writeln('FAIL: data mismatch at byte $i');
        exit(1);
      }
    }

    stderr.writeln('OK');
    exit(0);
  } catch (e, s) {
    stderr.writeln('FAIL: $e');
    stderr.writeln(s);
    exit(1);
  } finally {
    await host.close();
    await connManager.dispose();
  }
}
