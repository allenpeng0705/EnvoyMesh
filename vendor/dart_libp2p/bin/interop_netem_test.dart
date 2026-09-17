/// Full-stack netem interop test for Go↔Dart testing.
/// Usage: dart run bin/interop_netem_test.dart <multiaddr/p2p/peerid> [keep_alive_secs]
///
/// Runs 5 test phases sequentially:
///   1. Connect + Identify
///   2. Echo (32 bytes)
///   3. Large Payload Echo (64KB)
///   4. Keep-Alive (idle + echo)
///   5. Sequential Multi-Stream (5 echo streams)
///
/// Exits 0 if all pass, 1 if any fail.
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

int passed = 0;
int failed = 0;

void report(String phase, bool ok, [String? detail]) {
  if (ok) {
    passed++;
    stderr.writeln('  PASS: $phase');
  } else {
    failed++;
    stderr.writeln('  FAIL: $phase${detail != null ? " — $detail" : ""}');
  }
}

Future<void> main(List<String> arguments) async {
  if (arguments.isEmpty) {
    stderr.writeln(
        'Usage: dart run bin/interop_netem_test.dart <multiaddr/p2p/peerid> [keep_alive_secs]');
    exit(1);
  }

  final targetAddrStr = arguments[0];
  final keepAliveSecs = arguments.length > 1 ? int.parse(arguments[1]) : 5;
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

  stderr.writeln('=== Netem Full-Stack Interop Test ===');
  stderr.writeln('Target: $targetAddrStr');
  stderr.writeln('Keep-alive: ${keepAliveSecs}s');
  stderr.writeln('');

  try {
    // Add address to peerstore
    if (connectAddr != null) {
      await host.peerStore.addrBook
          .addAddrs(targetPeerId, [connectAddr], Duration(hours: 1));
    }

    // ── Phase 1: Connect + Identify ──
    stderr.writeln('Phase 1: Connect + Identify');
    try {
      final stream = await host
          .newStream(targetPeerId, [echoProtocol], core_context.Context())
          .timeout(Duration(seconds: 15));

      // If we got a stream, connection + identify succeeded
      final protocols = await host.peerStore.protoBook.getProtocols(targetPeerId);
      final hasProtocols = protocols != null && protocols.isNotEmpty;
      report('Connect + Identify',
          hasProtocols, hasProtocols ? null : 'no protocols found');

      // Close this stream, we'll open new ones for subsequent phases
      if (!stream.isClosed) {
        await stream.close();
      }
    } catch (e) {
      report('Connect + Identify', false, '$e');
    }

    // ── Phase 2: Echo (32 bytes) ──
    stderr.writeln('Phase 2: Echo (32 bytes)');
    try {
      final stream = await host
          .newStream(targetPeerId, [echoProtocol], core_context.Context())
          .timeout(Duration(seconds: 15));

      final payload = Uint8List(32);
      for (int i = 0; i < 32; i++) {
        payload[i] = i & 0xFF;
      }
      await stream.write(payload);

      final response = await stream.read().timeout(Duration(seconds: 10));

      bool ok = response.length == payload.length;
      if (ok) {
        for (int i = 0; i < payload.length; i++) {
          if (response[i] != payload[i]) {
            ok = false;
            break;
          }
        }
      }

      if (!stream.isClosed) await stream.close();
      report('Echo 32 bytes', ok,
          ok ? null : 'got ${response.length} bytes, expected ${payload.length}');
    } catch (e) {
      report('Echo 32 bytes', false, '$e');
    }

    // ── Phase 3: Large Payload Echo (64KB) ──
    stderr.writeln('Phase 3: Large Payload Echo (64KB)');
    try {
      final stream = await host
          .newStream(targetPeerId, [echoProtocol], core_context.Context())
          .timeout(Duration(seconds: 15));

      final payload = Uint8List(65536);
      for (int i = 0; i < payload.length; i++) {
        payload[i] = (i * 7 + 3) & 0xFF;
      }
      await stream.write(payload);

      // Read all response data — may come in multiple chunks
      final chunks = <Uint8List>[];
      int totalRead = 0;
      while (totalRead < payload.length) {
        final chunk = await stream.read().timeout(Duration(seconds: 30));
        chunks.add(Uint8List.fromList(chunk));
        totalRead += chunk.length;
      }

      // Combine chunks
      final response = Uint8List(totalRead);
      int offset = 0;
      for (final chunk in chunks) {
        response.setRange(offset, offset + chunk.length, chunk);
        offset += chunk.length;
      }

      bool ok = response.length == payload.length;
      if (ok) {
        for (int i = 0; i < payload.length; i++) {
          if (response[i] != payload[i]) {
            ok = false;
            break;
          }
        }
      }

      if (!stream.isClosed) await stream.close();
      report('Large Payload Echo 64KB', ok,
          ok ? null : 'got ${response.length} bytes, expected ${payload.length}');
    } catch (e) {
      report('Large Payload Echo 64KB', false, '$e');
    }

    // ── Phase 4: Keep-Alive ──
    stderr.writeln('Phase 4: Keep-Alive (${keepAliveSecs}s idle + echo)');
    try {
      stderr.writeln('  Holding connection idle for ${keepAliveSecs}s...');
      await Future.delayed(Duration(seconds: keepAliveSecs));

      // Now try an echo to verify connection survived
      final stream = await host
          .newStream(targetPeerId, [echoProtocol], core_context.Context())
          .timeout(Duration(seconds: 15));

      final payload =
          Uint8List.fromList('keep-alive-check'.codeUnits);
      await stream.write(payload);

      final response = await stream.read().timeout(Duration(seconds: 10));

      bool ok = response.length == payload.length;
      if (ok) {
        for (int i = 0; i < payload.length; i++) {
          if (response[i] != payload[i]) {
            ok = false;
            break;
          }
        }
      }

      if (!stream.isClosed) await stream.close();
      report('Keep-Alive', ok,
          ok ? null : 'echo failed after ${keepAliveSecs}s idle');
    } catch (e) {
      report('Keep-Alive', false, '$e');
    }

    // ── Phase 5: Sequential Multi-Stream ──
    stderr.writeln('Phase 5: Sequential Multi-Stream (5 echo streams)');
    try {
      bool allOk = true;
      for (int i = 0; i < 5; i++) {
        final stream = await host
            .newStream(targetPeerId, [echoProtocol], core_context.Context())
            .timeout(Duration(seconds: 15));

        final payload = Uint8List.fromList('stream-$i'.codeUnits);
        await stream.write(payload);

        final response = await stream.read().timeout(Duration(seconds: 10));

        bool ok = response.length == payload.length;
        if (ok) {
          for (int j = 0; j < payload.length; j++) {
            if (response[j] != payload[j]) {
              ok = false;
              break;
            }
          }
        }

        if (!stream.isClosed) await stream.close();

        if (!ok) {
          allOk = false;
          stderr.writeln('  Stream $i: FAIL');
        }
      }
      report('Sequential Multi-Stream', allOk,
          allOk ? null : 'one or more streams failed');
    } catch (e) {
      report('Sequential Multi-Stream', false, '$e');
    }
  } catch (e, s) {
    stderr.writeln('FATAL: $e');
    stderr.writeln(s);
    failed++;
  } finally {
    stderr.writeln('');
    stderr.writeln('=== Results: $passed passed, $failed failed ===');
    await host.close();
    await connManager.dispose();
  }

  exit(failed > 0 ? 1 : 0);
}
