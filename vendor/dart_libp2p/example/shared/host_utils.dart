/// Shared utilities for creating libp2p hosts in examples
import 'package:dart_libp2p/dart_libp2p.dart';
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart' as p2p_conn_manager;
import 'package:dart_udx/dart_udx.dart';

/// Creates a libp2p host with UDX transport and Noise security
Future<Host> createHost({String? listen}) async {
  final keyPair = await crypto_ed25519.generateEd25519KeyPair();
  final udx = UDX();
  final connMgr = p2p_conn_manager.ConnectionManager();

  final options = <p2p_config.Option>[
    p2p_config.Libp2p.identity(keyPair),
    p2p_config.Libp2p.connManager(connMgr),
    p2p_config.Libp2p.transport(UDXTransport(connManager: connMgr, udxInstance: udx)),
    p2p_config.Libp2p.security(await NoiseSecurity.create(keyPair)),
    if (listen != null) p2p_config.Libp2p.listenAddrs([MultiAddr(listen)]),
  ];

  final host = await p2p_config.Libp2p.new_(options);
  await host.start();
  return host;
}

/// Helper function to create a host that listens on a random UDP port
Future<Host> createHostWithRandomPort() async {
  return createHost(listen: '/ip4/0.0.0.0/udp/0/udx');
}

/// Helper function to truncate peer IDs for display
String truncatePeerId(PeerId peerId, [int length = 6]) {

  final peerIdStr = peerId.toBase58();
  final strLen = peerIdStr.length;
  return peerIdStr.substring(strLen - 8, strLen);
}
