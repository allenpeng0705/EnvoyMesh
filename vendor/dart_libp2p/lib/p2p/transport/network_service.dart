// First, ensure you have the required permissions in AndroidManifest.xml
// Add these inside the <manifest> tag:
// <uses-permission android:name="android.permission.INTERNET"/>
// <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>

import 'dart:io';
import 'dart:typed_data';

class NetworkService {
  // TCP Socket Implementation
  Socket? _tcpSocket;
  bool _isConnected = false;
  
  Future<void> createTcpServer(String host, int port) async {
    try {
      final server = await ServerSocket.bind(host, port);
      
      server.listen((Socket client) {
        handleClient(client);
      });
    } catch (e) {
    }
  }

  Future<void> connectToTcpServer(String host, int port) async {
    try {
      _tcpSocket = await Socket.connect(host, port);
      _isConnected = true;
      
      _tcpSocket?.listen(
        (Uint8List data) {
          final message = String.fromCharCodes(data);
        },
        onError: (error) {
          _isConnected = false;
          _tcpSocket?.close();
        },
        onDone: () {
          _isConnected = false;
          _tcpSocket?.close();
        },
      );
    } catch (e) {
    }
  }

  void sendTcpMessage(String message) {
    if (_tcpSocket != null && _isConnected) {
      _tcpSocket?.write(message);
    }
  }

  void handleClient(Socket client) {
    
    client.listen(
      (Uint8List data) {
        final message = String.fromCharCodes(data);
        // Echo the message back
        client.write('Server received: $message');
      },
      onError: (error) {
        client.close();
      },
      onDone: () {
        client.close();
      },
    );
  }

  // UDP Socket Implementation
  RawDatagramSocket? _udpSocket;

  Future<void> createUdpSocket(String host, int port) async {
    try {
      _udpSocket = await RawDatagramSocket.bind(host, port);
      
      _udpSocket?.listen(
        (RawSocketEvent event) {
          if (event == RawSocketEvent.read) {
            final datagram = _udpSocket?.receive();
            if (datagram != null) {
              final message = String.fromCharCodes(datagram.data);
            }
          }
        },
        onError: (error) {
        },
        onDone: () {
        },
      );
    } catch (e) {
    }
  }

  void sendUdpMessage(String message, InternetAddress address, int port) {
    if (_udpSocket != null) {
      final data = Uint8List.fromList(message.codeUnits);
      _udpSocket?.send(data, address, port);
    }
  }

  void dispose() {
    _tcpSocket?.close();
    _udpSocket?.close();
  }
}

// // Usage example:
// void main() async {
//   final networkService = NetworkService();
  
//   // TCP Server example
//   await networkService.createTcpServer('0.0.0.0', 8080);
  
//   // TCP Client example
//   await networkService.connectToTcpServer('127.0.0.1', 8080);
//   networkService.sendTcpMessage('Hello Server!');
  
//   // UDP example
//   await networkService.createUdpSocket('0.0.0.0', 8081);
//   networkService.sendUdpMessage(
//     'Hello UDP!',
//     InternetAddress('127.0.0.1'),
//     8081
//   );
// }