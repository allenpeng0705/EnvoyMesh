import 'dart:convert';
import 'dart:io';

import 'package:dart_libp2p/dart_libp2p.dart';

class EchoServer {
  final Host host;
  static const String protocolId = '/echo/1.0.0';

  EchoServer(this.host) {
    // Set a stream handler for our echo protocol
    host.setStreamHandler(protocolId, _handleEchoRequest);
  }

  // Handler for incoming echo requests
  Future<void> _handleEchoRequest(P2PStream stream, PeerId remotePeer) async {
    try {
      // Read the message from the stream
      final data = await stream.read();
      if (data.isNotEmpty) {
        final message = utf8.decode(data).trim();
        // Display the received message (echo it back to console)
        print('\n🔊 [ECHO SERVER] Received: "$message" from client [${_truncatePeerId(remotePeer)}]');
        stdout.write('> ');
      }
    } catch (e) {
      print('❌ [ECHO SERVER] Error reading from echo stream: $e');
    } finally {
      // Close the stream when done
      await stream.close();
    }
  }

  // Helper function to truncate peer IDs for display
  String _truncatePeerId(PeerId peerId) {
    final peerIdStr = peerId.toBase58();
    final strLen = peerIdStr.length;
    return peerIdStr.substring(strLen - 8, strLen);
  }
}
