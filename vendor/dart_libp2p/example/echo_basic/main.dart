import 'dart:convert';
import 'dart:io';

import 'package:dart_libp2p/dart_libp2p.dart';
import '../shared/host_utils.dart';
import 'echo_client.dart';
import 'echo_server.dart';

void main() async {
  print('🔊 Starting Basic Echo Example');
  print('This example demonstrates one-way messaging where a client sends messages to an echo server.\n');

  try {
    // Create two hosts: client and server
    final clientHost = await createHostWithRandomPort();
    final serverHost = await createHostWithRandomPort();

    print('Client Host: [${truncatePeerId(clientHost.id)}] listening on ${clientHost.addrs}');
    print('Server Host: [${truncatePeerId(serverHost.id)}] listening on ${serverHost.addrs}');

    // Create echo client and server
    final echoClient = EchoClient(clientHost);
    EchoServer(serverHost); // Server just listens for echo requests

    // Connect client to server
    await clientHost.connect(AddrInfo(serverHost.id, serverHost.addrs));
    print('\n✅ Client connected to server successfully!');
    
    print('\n--- Echo Session Started! ---');
    print('Type a message and press Enter to send it to the echo server.');
    print('');
    print('📤 CLIENT [${truncatePeerId(clientHost.id)}] sends messages');
    print('🔊 SERVER [${truncatePeerId(serverHost.id)}] receives and displays them');
    print('');
    print('💡 Note: You\'ll see both CLIENT and SERVER logs since both run in this same process.');
    print('Type "quit" to exit.');
    print('------------------------------\n');

    // Set up graceful shutdown
    bool isShuttingDown = false;
    
    void cleanup() async {
      if (isShuttingDown) return;
      isShuttingDown = true;
      
      print('\n\n🛑 Shutting down...');
      try {
        await clientHost.close();
        await serverHost.close();
        print('✅ Cleanup completed.');
      } catch (e) {
        print('⚠️  Error during cleanup: $e');
      }
      exit(0);
    }

    // Handle Ctrl+C gracefully
    ProcessSignal.sigint.watch().listen((_) => cleanup());

    // Start a loop to read from stdin and send echo messages
    stdin.transform(utf8.decoder).transform(LineSplitter()).listen((line) {
      if (line.toLowerCase() == 'quit') {
        cleanup();
        return;
      }
      
      if (line.trim().isNotEmpty) {
        echoClient.sendEcho(serverHost.id, line);
      }
      
      stdout.write('> ');
    });

    stdout.write('> ');
    
  } catch (e) {
    print('❌ Error: $e');
    exit(1);
  }
}
