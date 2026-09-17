import 'dart:async';

import 'package:test/test.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart' as p2p_conn_manager;
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart';
import 'package:dart_udx/dart_udx.dart';
import 'package:logging/logging.dart';

void main() {
  // Setup logging for tests to see detailed output if needed
  Logger.root.level = Level.INFO; // Adjust as needed, e.g., Level.ALL
  Logger.root.onRecord.listen((record) {
    print('${record.level.name}: ${record.time}: ${record.loggerName}: ${record.message}');
    if (record.error != null) {
      print('  ERROR: ${record.error}');
    }
    if (record.stackTrace != null) {
      print('  STACKTRACE: ${record.stackTrace}');
    }
  });

  group('UDX Transport Listening', () {
    late UDX udxInstance;
    late p2p_conn_manager.ConnectionManager connManager;
    late KeyPair hostKeyPair;
    Host? host; // Nullable, to be assigned in test and cleaned up

    setUp(() async {
      udxInstance = UDX();
      connManager = p2p_conn_manager.ConnectionManager();
      hostKeyPair = await crypto_ed25519.generateEd25519KeyPair();
    });

    tearDown(() async {
      if (host != null) {
        await host!.close();
        host = null;
      }
      await connManager.dispose();
      // UDX instance does not have a dispose/destroy method in dart_udx
    });

    test('should listen on UDX and report correct multiaddresses', () async {
      // Using 0.0.0.0 to listen on all interfaces, which might interact better with default AddrsFactory
      final listenMaInput = MultiAddr('/ip4/0.0.0.0/udp/0/udx');
      
      final options = <p2p_config.Option>[
        p2p_config.Libp2p.identity(hostKeyPair),
        p2p_config.Libp2p.connManager(connManager),
        p2p_config.Libp2p.transport(UDXTransport(connManager: connManager, udxInstance: udxInstance)),
        p2p_config.Libp2p.security(await NoiseSecurity.create(hostKeyPair)),
        p2p_config.Libp2p.listenAddrs([listenMaInput]),
      ];

      host = await p2p_config.Libp2p.new_(options);
      final hostId = host!.id;

      // Act
      await host!.start();
      
      // Allow some time for network events and address resolution
      await Future.delayed(Duration(milliseconds: 500)); 

      final reportedAddrs = host!.addrs;
      print('Host reported addresses: $reportedAddrs');

      // Assert
      expect(reportedAddrs, isNotEmpty, reason: "Host should have listen addresses after starting.");

      MultiAddr? foundUdxAddr;
      for (var addr in reportedAddrs) {
        // host.addrs returns addresses WITHOUT the /p2p component.
        // The /p2p component is added when dialing.
        if (addr.hasProtocol(Protocols.udx.name) && 
            addr.hasProtocol(Protocols.ip4.name)) { // Check for ip4 and udx
          foundUdxAddr = addr;
          break;
        }
      }
      
      expect(foundUdxAddr, isNotNull, reason: "Host should report a UDX listen address with IP, UDP, and UDX components.");

      if (foundUdxAddr != null) {
        // When listening on 0.0.0.0, the reported address will be a specific interface IP.
        final reportedIp = foundUdxAddr.valueForProtocol(Protocols.ip4.name);
        expect(reportedIp, isNotNull, reason: "IP address component should exist.");
        // A simple check for an IP-like format; could be more robust if needed.
        // Example: 192.168.14.42 from the logs.
        expect(RegExp(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$').hasMatch(reportedIp!), isTrue, reason: "Reported IP should be a valid IPv4 address.");
        
        final udpPortStr = foundUdxAddr.valueForProtocol(Protocols.udp.name);
        expect(udpPortStr, isNotNull, reason: "UDP port component should exist.");
        final udpPort = int.tryParse(udpPortStr!);
        expect(udpPort, isNotNull, reason: "UDP port should be a valid integer.");
        expect(udpPort, greaterThan(0), reason: "UDP port should be non-zero after binding to port 0.");

        expect(foundUdxAddr.hasProtocol(Protocols.udx.name), isTrue, reason: "Address should have UDX protocol component.");
        
        // Verify the host ID separately, as it's not part of the addresses from host.addrs
        expect(hostId, isNotNull); 
        // The P2P component is NOT expected in foundUdxAddr itself from host.addrs
        expect(foundUdxAddr.hasProtocol(Protocols.p2p.name), isFalse, reason: "/p2p component should not be in addresses from host.addrs");
      }
    }, timeout: Timeout(Duration(seconds: 15))); // Increased timeout for network operations
  });
}
