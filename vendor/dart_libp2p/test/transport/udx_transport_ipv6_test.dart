import 'package:test/test.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart';

void main() {
  group('UDXTransport IPv6 Dial Tests', () {
    test('Extract IPv6 address from multiaddr', () {
      final addr = MultiAddr(
          '/ip6/2400:6180:0:d2:0:2:8351:9000/udp/55222/udx/p2p/12D3KooWL3dpNwLsf8MNvdaiiMe3YvgMARoinCHTnej3nQ8pnFb1');
      
      final ip6 = addr.valueForProtocol('ip6');
      final ip4 = addr.valueForProtocol('ip4');
      final udp = addr.valueForProtocol('udp');
      
      print('Full addr: ${addr.toString()}');
      print('IPv6: $ip6');
      print('IPv4: $ip4');
      print('UDP: $udp');
      print('Host fallback: ${ip4 ?? ip6}');
      
      expect(ip6, equals('2400:6180:0:d2:0:2:8351:9000'));
      expect(ip4, isNull);
      expect(udp, equals('55222'));
    });

    test('UDXTransport canDial IPv6 address', () {
      final transport = UDXTransport(connManager: ConnectionManager());
      final addr = MultiAddr('/ip6/2400:6180:0:d2:0:2:8351:9000/udp/55222/udx');
      
      final canDial = transport.canDial(addr);
      print('Can dial IPv6: $canDial');
      
      expect(canDial, isTrue);
    });

    test('UDXTransport dial extracts correct host from IPv6 multiaddr', () async {
      final transport = UDXTransport(connManager: ConnectionManager());
      final addr = MultiAddr('/ip6/2400:6180:0:d2:0:2:8351:9000/udp/55222/udx');

      // This will fail to dial (no server), but we want to see what host value is extracted
      try {
        await transport.dial(addr, timeout: Duration(milliseconds: 100));
        fail('Expected dial to fail');
      } catch (e) {
        print('Expected dial failure: $e');
        // The error should reference the IPv6 address, confirming correct extraction
        expect(e.toString(), contains('2400:6180'));
      }
    }, skip: 'Requires IPv6 routing to remote host; background SocketExceptions leak as unhandled errors');
  });
}

