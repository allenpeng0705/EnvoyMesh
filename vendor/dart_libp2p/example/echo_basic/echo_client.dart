import 'dart:convert';

import 'package:dart_libp2p/dart_libp2p.dart';
import 'package:dart_libp2p/core/network/context.dart';

class EchoClient {
  final Host host;
  static const String protocolId = '/echo/1.0.0';

  EchoClient(this.host);

  // Send a message to an echo server
  Future<void> sendEcho(PeerId targetPeer, String message) async {
    try {
      final ctx = Context();
      final stream = await host.newStream(targetPeer, [protocolId], ctx);
      
      print('📤 [ECHO CLIENT] Sending: "$message" to server [${_truncatePeerId(targetPeer)}]');
      await stream.write(utf8.encode(message + '\n'));
      
      // Close the stream after sending - the server will echo it to its console
      await stream.close();
    } catch (e) {
      print('❌ [ECHO CLIENT] Error sending echo to ${_truncatePeerId(targetPeer)}: $e');
    }
  }

  // Helper function to truncate peer IDs for display
  String _truncatePeerId(PeerId peerId) {
    final peerIdStr = peerId.toBase58();
    final strLen = peerIdStr.length;
    return peerIdStr.substring(strLen - 8, strLen);
  }
}
