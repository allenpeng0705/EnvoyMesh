import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:math';

import 'package:args/args.dart';
import 'package:dart_udx/dart_udx.dart';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/network/stream.dart' as core_network_stream;
import 'package:dart_libp2p/core/network/context.dart' as core_context;
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart' as p2p_conn_manager;
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart'; // For Protocol.p2p.code


const String PING_PROTOCOL_ID = '/dart-libp2p/example-ping/udx/1.0.0';

String shortPeerId(PeerId id) {
  final s = id.toString();
  if (s.length > 16) {
    return '${s.substring(0, 6)}...${s.substring(s.length - 6)}';
  }
  return s;
}

Future<void> main(List<String> arguments) async {
  final shutdownCompleter = Completer<void>();

  // Setup logging
  // Logger.root.level = Level.INFO; // Default to INFO, can be changed
  // Logger.root.onRecord.listen((record) {
  //   print('${record.level.name}: ${record.time}: ${record.loggerName}: ${record.message}');
  //   if (record.error != null) {
  //     print('  ERROR: ${record.error}');
  //   }
  //   if (record.stackTrace != null) {
  //     print('  STACKTRACE: ${record.stackTrace}');
  //   }
  // });

  final parser = ArgParser()
    ..addOption('listen', abbr: 'l', help: 'Listen multiaddress (e.g., /ip4/0.0.0.0/udp/0/udx)')
    ..addOption('target', abbr: 't', help: 'Target peer multiaddress (e.g., /ip4/127.0.0.1/udp/12345/udx/p2p/QmPeerId)')
    ..addOption('interval', abbr: 'i', help: 'Interval between pings in seconds', defaultsTo: '1')
    ..addFlag('help', abbr: 'h', negatable: false, help: 'Display this help message.');

  ArgResults results;
  try {
    results = parser.parse(arguments);
  } catch (e) {
    print('Error parsing arguments: $e');
    print(parser.usage);
    exit(1);
  }

  if (results['help'] as bool) {
    print('Dart libp2p UDX Ping Application');
    print(parser.usage);
    exit(0);
  }

  final listenAddrStr = results['listen'] as String?;
  final targetAddrStr = results['target'] as String?;

  if (listenAddrStr == null && targetAddrStr == null) {
    print('Error: You must specify a listen address (--listen) or a target peer (--target).');
    print(parser.usage);
    exit(1);
  }

  final pingIntervalSec = int.tryParse(results['interval'] as String) ?? 1;

  final udxInstance = UDX();
  final localKeyPair = await crypto_ed25519.generateEd25519KeyPair();
  // UDXTransport expects core_connmgr.ConnManager.
  // p2p_conn_manager.ConnectionManager implements core_connmgr.ConnManager.
  final connManager = p2p_conn_manager.ConnectionManager();

  Host? host; // Declare host here to be accessible in finally
  // HolePunchService is now obtained from host.holePunchService

  try {
    final options = <p2p_config.Option>[
      p2p_config.Libp2p.identity(localKeyPair),
      p2p_config.Libp2p.connManager(connManager), // Pass the specific instance
      p2p_config.Libp2p.transport(UDXTransport(connManager: connManager, udxInstance: udxInstance)),
      p2p_config.Libp2p.security(await NoiseSecurity.create(localKeyPair)),
      // Muxers will be provided by p2p_config.Libp2p.new_() using defaults
    ];

    if (listenAddrStr != null) {
      try {
        options.add(p2p_config.Libp2p.listenAddrs([MultiAddr(listenAddrStr)]));
      } catch (e) {
        print('Error parsing listen address "$listenAddrStr": $e');
        exit(1);
      }
    }

    host = await p2p_config.Libp2p.new_(options);
    await host.start();

    final hostIdForLog = shortPeerId(host.id);
    final fullHostId = host.id.toString();

    // HolePunchService is now managed by BasicHost if enabled in config.
    // We will access it via host.holePunchService when needed.
    // Ensure enableHolePunching is true in your Libp2p.new_ options if you want it.
    // For example, by default or via a specific Libp2p.holePunching() option.

    print('[$hostIdForLog] Host ID: $fullHostId');
    if (host.addrs.isNotEmpty) { // host is non-null here after start()
      print('[$hostIdForLog] Listening on:');
      for (var addr in host.addrs) { // host is non-null here
        print('  $addr/p2p/$fullHostId');
      }
      print('[$hostIdForLog] Use one of the above full addresses (including /p2p/...) as the target for another instance.');
    } else {
      print('[$hostIdForLog] Not actively listening on a predefined address. (This is okay if only targeting another peer).');
    }

    host.setStreamHandler(PING_PROTOCOL_ID, (stream, remotePeer) async {
      final currentHostLogId = shortPeerId(host!.id); // host is not null here
      final remotePeerLogId = shortPeerId(remotePeer);
      print('[$currentHostLogId] Received ping from $remotePeerLogId on stream ${stream.id()} for protocol ${stream.protocol()}');
      try {
        final data = await stream.read().timeout(Duration(seconds: 10));
        print('[$currentHostLogId] Ping data received (${data.length} bytes) from $remotePeerLogId.');
        await stream.write(data); // Echo the data back (pong)
        print('[$currentHostLogId] Pong sent to $remotePeerLogId.');
      } catch (e, s) {
        print('[$currentHostLogId] Error in ping handler for $remotePeerLogId: $e\n$s');
        await stream.reset();
      } finally {
        if (!stream.isClosed) {
          await stream.close();
        }
        print('[$currentHostLogId] Closed stream with $remotePeerLogId.');
      }
    });

    if (targetAddrStr != null) {
      final currentHostLogId = shortPeerId(host.id); // host is not null here
      MultiAddr targetMa;
      try {
        targetMa = MultiAddr(targetAddrStr);
      } catch (e) {
        print('[$currentHostLogId] Error parsing target address "$targetAddrStr": $e');
        exit(1);
      }

      // Attempting to use protocol name due to linter error.
      // The MultiAddr.valueForProtocol method signature is (int code),
      // but linter reports error as if it expects a String.
      final targetPeerIdStr = targetMa.valueForProtocol(Protocols.p2p.name);

      if (targetPeerIdStr == null) {
        print('[$currentHostLogId] Error: Target multiaddress "$targetAddrStr" must include a /p2p/<peer-id> component (using protocol name lookup).');
        exit(1);
      }
      PeerId targetPeerId;
      try {
        targetPeerId = PeerId.fromString(targetPeerIdStr);
      } catch (e) {
         print('[$currentHostLogId] Error parsing PeerId from "$targetPeerIdStr": $e');
         exit(1);
      }
      
      final connectAddr = targetMa.decapsulate(Protocols.p2p.name); // Use protocol name for decapsulate
      if (connectAddr != null) {
        await host.peerStore.addrBook.addAddrs(targetPeerId, [connectAddr], Duration(hours: 1));
        print('[$currentHostLogId] Added ${shortPeerId(targetPeerId)} ($connectAddr) to peerstore.');
      } else {
        print('[$currentHostLogId] Could not decapsulate /p2p component from $targetMa to get connection address.');
        // Decide if to exit or continue without adding to peerstore if newStream can handle it.
        // For now, we'll let newStream try.
      }

      // Attempt hole punch once before starting the ping loop
      final hps = host!.holePunchService; // host is not null here
      if (hps != null) {
        print('[$currentHostLogId] Attempting initial hole punch to ${shortPeerId(targetPeerId)}...');
        try {
          await hps.directConnect(targetPeerId).timeout(Duration(seconds: 20));
          print('[$currentHostLogId] Initial hole punch attempt to ${shortPeerId(targetPeerId)} completed.');
        } catch (e, s) {
          print('[$currentHostLogId] Initial hole punch attempt to ${shortPeerId(targetPeerId)} failed: $e');
          if (s != null) print(s);
          // Continue to try pinging anyway; direct connection might still be possible or relay might be used.
        }
      }

      int pingAttempt = 0;
      while (true) { // Loop indefinitely
        pingAttempt++;
        final remotePeerLogId = shortPeerId(targetPeerId);
        print('[$currentHostLogId] Pinging $remotePeerLogId (attempt $pingAttempt)...');
        
        final startTime = DateTime.now();
        core_network_stream.P2PStream? clientStream;

        try {
          clientStream = await host!.newStream( // host is not null here
            targetPeerId,
            [PING_PROTOCOL_ID],
            core_context.Context(),
          ).timeout(Duration(seconds: 15));
          print('[$currentHostLogId] Opened stream ${clientStream.id()} to ${shortPeerId(targetPeerId)} for protocol ${clientStream.protocol()}');

          final payload = Uint8List.fromList(List.generate(32, (_) => Random().nextInt(256)));
          await clientStream.write(payload);
          print('[$currentHostLogId] Sent ${payload.length} byte ping to ${shortPeerId(targetPeerId)}.');

          final pongData = await clientStream.read().timeout(Duration(seconds: 10));
          final rtt = DateTime.now().difference(startTime);
          print('[$currentHostLogId] Received ${pongData.length} byte pong from ${shortPeerId(targetPeerId)} in ${rtt.inMilliseconds}ms.');

          bool success = pongData.lengthInBytes == payload.lengthInBytes;
          if (success) {
            for(int k=0; k < payload.length; k++) {
              if (payload[k] != pongData[k]) {
                success = false;
                break;
              }
            }
          }
          if (!success) {
            print('[$currentHostLogId] Pong payload mismatch!');
          }

        } catch (e,s) {
          print('[$currentHostLogId] Ping to ${shortPeerId(targetPeerId)} failed: $e');
          if (s != null) print(s);
        } finally {
          if (clientStream != null && !clientStream.isClosed) {
            await clientStream.close();
          }
        }
        // Always delay if the loop continues (which it will, until SIGINT)
        await Future.delayed(Duration(seconds: pingIntervalSec));
      }
    } else if (listenAddrStr != null) { // This case implies targetAddrStr is null
      final currentHostLogId = shortPeerId(host.id); // host is not null here
      print('[$currentHostLogId] Listening for pings. Press Ctrl+C to exit.');
      // Keep alive, relying on SIGINT for shutdown (handled below)
    }

    // If we are listening OR pinging (targetAddrStr != null), we need to wait for SIGINT.
    if (listenAddrStr != null || targetAddrStr != null) {
        // Setup SIGINT handler
        ProcessSignal.sigint.watch().listen((signal) async {
            final currentHostLogId = host != null ? shortPeerId(host!.id) : "Host";
            print('\n[$currentHostLogId] SIGINT received, shutting down...');
            if (!shutdownCompleter.isCompleted) {
              shutdownCompleter.complete();
            }
        });

        if (targetAddrStr != null && listenAddrStr == null) {
             final currentHostLogId = shortPeerId(host!.id);
             print('[$currentHostLogId] Continuously pinging target. Press Ctrl+C to exit.');
        } else if (listenAddrStr != null && targetAddrStr != null) {
            final currentHostLogId = shortPeerId(host!.id);
            print('[$currentHostLogId] Listening and continuously pinging target. Press Ctrl+C to exit.');
        }
        // If only listenAddrStr is set, the message is already printed above.
        // If neither is set, we would have exited earlier.
        
        await shutdownCompleter.future; // Keep alive until SIGINT
    }
    // No automatic exit after ping loop anymore if only target was specified.

  } catch (e, s) {
    print('An unexpected error occurred: $e');
    print(s);
    exit(1);
  } finally {
    final String finalHostId = host != null ? shortPeerId(host.id) : "Host";
    print('\n[$finalHostId] Initiating final shutdown sequence...');
    if (host != null) { // Removed host.isStarted check
      await host.close();
      print('[$finalHostId] Host closed.');
    }

    // HolePunchService is closed by BasicHost.close() if it was initialized.
    
    // p2p_conn_manager.ConnectionManager has a dispose method.
     await connManager.dispose();
     print('[$finalHostId] Connection manager disposed.');

    // Removed udxInstance.destroy() as it's not available/needed.
    // await udxInstance.destroy(); 
    // print('[$finalHostId] UDX instance destroyed.'); // Removed
    print('[$finalHostId] Application shutdown complete.');
    // Ensure exit if we were only pinging and not listening
    // This exit might be redundant if SIGINT handler's exit(0) already triggered the finally.
    // However, if the ping sequence finishes normally without SIGINT, this is needed.
    // This block is removed as SIGINT is now the sole mechanism for shutdown when pinging.
    // if (targetAddrStr != null && listenAddrStr == null) {
    //     exit(0);
    // }
  }
}
