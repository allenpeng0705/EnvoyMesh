import 'dart:io';
import 'dart:async';
import 'package:dart_libp2p/p2p/nat/nat_type.dart';
import 'package:dart_libp2p/p2p/nat/stun/stun_client.dart';
import 'package:test/test.dart';
import 'package:test/scaffolding.dart';

void main() {
  group('StunClient', () {
    test('should connect to STUN server', () async {
      final client = StunClient();
      final response = await client.discover();
      expect(response, isNotNull);
    });
    
    test('should retrieve external IP address', () async {
      final client = StunClient();
      final response = await client.discover();
      expect(response.externalAddress, isNotNull);
      expect(response.externalAddress?.toString(), isNot(equals('0.0.0.0')));
    }, timeout: Timeout(Duration(seconds: 10)));
    
    test('should detect NAT type', () async {
      final client = StunClient();
      final response = await client.discover();
      expect(response.natType, equals(NatType.fullCone));
    }, timeout: Timeout(Duration(seconds: 10)));

    test('StunClient should handle invalid STUN server', () async {
      final client = StunClient(serverHost: 'invalid.stun.server');
      try {
        await client.discover();
        fail('Should throw exception');
      } catch (e) {
        expect(e, isA<SocketException>());
        print('\nCaught exception type: ${e.runtimeType}');
        print('Stack trace:\n${StackTrace.current}');
      }
    });
  });
} 