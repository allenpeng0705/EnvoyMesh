import 'package:test/test.dart';
import 'package:dart_libp2p/core/multiaddr.dart';

void main() {
  group('MultiAddr IPv4 Tests', () {
    test('Parse simple IPv4 address', () {
      final addr = MultiAddr('/ip4/127.0.0.1');
      expect(addr.toString(), equals('/ip4/127.0.0.1'));
      expect(addr.ip4, equals('127.0.0.1'));
      expect(addr.hasProtocol('ip4'), isTrue);
    });

    test('Parse IPv4 with TCP port', () {
      final addr = MultiAddr('/ip4/192.168.1.1/tcp/8080');
      expect(addr.toString(), equals('/ip4/192.168.1.1/tcp/8080'));
      expect(addr.ip4, equals('192.168.1.1'));
      expect(addr.tcpPort, equals(8080));
    });

    test('Parse IPv4 with UDP and UDX', () {
      final addr = MultiAddr('/ip4/152.42.240.103/udp/55222/udx');
      expect(addr.toString(), equals('/ip4/152.42.240.103/udp/55222/udx'));
      expect(addr.ip4, equals('152.42.240.103'));
      expect(addr.udpPort, equals(55222));
      expect(addr.hasUdx, isTrue);
    });

    test('Parse IPv4 with UDP, UDX and P2P', () {
      final addr = MultiAddr(
          '/ip4/152.42.240.103/udp/55222/udx/p2p/12D3KooWL3dpNwLsf8MNvdaiiMe3YvgMARoinCHTnej3nQ8pnFb1');
      expect(addr.ip4, equals('152.42.240.103'));
      expect(addr.udpPort, equals(55222));
      expect(addr.hasUdx, isTrue);
      expect(addr.peerId, equals('12D3KooWL3dpNwLsf8MNvdaiiMe3YvgMARoinCHTnej3nQ8pnFb1'));
    });

    test('Parse unspecified IPv4 address', () {
      final addr = MultiAddr('/ip4/0.0.0.0/udp/55222/udx');
      expect(addr.ip4, equals('0.0.0.0'));
      expect(addr.udpPort, equals(55222));
    });
  });

  group('MultiAddr IPv6 Tests', () {
    test('Parse simple IPv6 loopback', () {
      final addr = MultiAddr('/ip6/::1');
      expect(addr.toString(), equals('/ip6/::1'));
      expect(addr.ip6, equals('::1'));
      expect(addr.hasProtocol('ip6'), isTrue);
    });

    test('Parse full IPv6 address', () {
      final addr = MultiAddr('/ip6/2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(addr.ip6, equals('2001:0db8:85a3:0000:0000:8a2e:0370:7334'));
      expect(addr.hasProtocol('ip6'), isTrue);
    });

    test('Parse compressed IPv6 address', () {
      final addr = MultiAddr('/ip6/2001:db8:85a3::8a2e:370:7334');
      expect(addr.ip6, equals('2001:db8:85a3::8a2e:370:7334'));
    });

    test('Parse all-zeros IPv6 address', () {
      final addr = MultiAddr('/ip6/::');
      expect(addr.ip6, equals('::'));
    });

    test('Parse IPv6 unspecified with colons', () {
      final addr = MultiAddr('/ip6/0:0:0:0:0:0:0:0/udp/55222/udx');
      expect(addr.ip6, equals('0:0:0:0:0:0:0:0'));
      expect(addr.udpPort, equals(55222));
    });

    test('Parse IPv6 address with single-digit segments', () {
      final addr = MultiAddr('/ip6/2400:6180:0:d2:0:2:8351:9000');
      expect(addr.ip6, equals('2400:6180:0:d2:0:2:8351:9000'));
      expect(addr.hasProtocol('ip6'), isTrue);
    });

    test('Parse IPv6 with UDP port', () {
      final addr = MultiAddr('/ip6/fe80::1/udp/8080');
      expect(addr.ip6, equals('fe80::1'));
      expect(addr.udpPort, equals(8080));
    });

    test('Parse IPv6 with UDP and UDX', () {
      final addr = MultiAddr('/ip6/2400:6180:0:d2:0:2:8351:9000/udp/55222/udx');
      expect(addr.ip6, equals('2400:6180:0:d2:0:2:8351:9000'));
      expect(addr.udpPort, equals(55222));
      expect(addr.hasUdx, isTrue);
    });

    test('Parse full bootstrap peer IPv6 address', () {
      final addr = MultiAddr(
          '/ip6/2400:6180:0:d2:0:2:8351:9000/udp/55222/udx/p2p/12D3KooWL3dpNwLsf8MNvdaiiMe3YvgMARoinCHTnej3nQ8pnFb1');
      
      print('Full address: ${addr.toString()}');
      print('IPv6 value: ${addr.ip6}');
      print('UDP port: ${addr.udpPort}');
      print('Has UDX: ${addr.hasUdx}');
      print('Peer ID: ${addr.peerId}');
      
      expect(addr.ip6, equals('2400:6180:0:d2:0:2:8351:9000'));
      expect(addr.udpPort, equals(55222));
      expect(addr.hasUdx, isTrue);
      expect(addr.peerId, equals('12D3KooWL3dpNwLsf8MNvdaiiMe3YvgMARoinCHTnej3nQ8pnFb1'));
    });

    test('valueForProtocol returns correct IPv6 value', () {
      final addr = MultiAddr('/ip6/2400:6180:0:d2:0:2:8351:9000/udp/55222/udx');
      final ip6Value = addr.valueForProtocol('ip6');
      
      print('valueForProtocol(ip6): $ip6Value');
      
      expect(ip6Value, isNotNull);
      expect(ip6Value, equals('2400:6180:0:d2:0:2:8351:9000'));
    });
  });

  group('MultiAddr Encoding/Decoding Tests', () {
    test('IPv4 roundtrip encoding', () {
      final original = MultiAddr('/ip4/152.42.240.103/udp/55222/udx');
      final bytes = original.toBytes();
      final decoded = MultiAddr.fromBytes(bytes);
      
      expect(decoded.toString(), equals(original.toString()));
      expect(decoded.ip4, equals('152.42.240.103'));
    });

    test('IPv6 roundtrip encoding', () {
      final original = MultiAddr('/ip6/2400:6180:0:d2:0:2:8351:9000/udp/55222/udx');
      final bytes = original.toBytes();
      final decoded = MultiAddr.fromBytes(bytes);
      
      print('Original: ${original.toString()}');
      print('Bytes: $bytes');
      print('Decoded: ${decoded.toString()}');
      
      expect(decoded.ip6, equals('2400:6180:0:d2:0:2:8351:9000'));
      expect(decoded.udpPort, equals(55222));
    });

    test('Full IPv6 bootstrap peer roundtrip', () {
      final original = MultiAddr(
          '/ip6/2400:6180:0:d2:0:2:8351:9000/udp/55222/udx/p2p/12D3KooWL3dpNwLsf8MNvdaiiMe3YvgMARoinCHTnej3nQ8pnFb1');
      final bytes = original.toBytes();
      final decoded = MultiAddr.fromBytes(bytes);
      
      expect(decoded.ip6, equals('2400:6180:0:d2:0:2:8351:9000'));
      expect(decoded.udpPort, equals(55222));
      expect(decoded.hasUdx, isTrue);
      expect(decoded.peerId, equals('12D3KooWL3dpNwLsf8MNvdaiiMe3YvgMARoinCHTnej3nQ8pnFb1'));
    });
  });

  group('MultiAddr Component Access Tests', () {
    test('Get components from IPv4 multiaddr', () {
      final addr = MultiAddr('/ip4/152.42.240.103/udp/55222/udx');
      final components = addr.components;
      
      expect(components.length, equals(3));
      expect(components[0].$1.name, equals('ip4'));
      expect(components[0].$2, equals('152.42.240.103'));
      expect(components[1].$1.name, equals('udp'));
      expect(components[1].$2, equals('55222'));
      expect(components[2].$1.name, equals('udx'));
    });

    test('Get components from IPv6 multiaddr', () {
      final addr = MultiAddr('/ip6/2400:6180:0:d2:0:2:8351:9000/udp/55222/udx');
      final components = addr.components;
      
      print('Components:');
      for (var i = 0; i < components.length; i++) {
        print('  [$i] ${components[i].$1.name} = "${components[i].$2}"');
      }
      
      expect(components.length, equals(3));
      expect(components[0].$1.name, equals('ip6'));
      expect(components[0].$2, equals('2400:6180:0:d2:0:2:8351:9000'));
      expect(components[1].$1.name, equals('udp'));
      expect(components[1].$2, equals('55222'));
      expect(components[2].$1.name, equals('udx'));
    });
  });

  group('MultiAddr Edge Cases', () {
    test('IPv6 with leading zeros in segments', () {
      final addr = MultiAddr('/ip6/2001:0db8:0000:0000:0000:0000:0000:0001');
      expect(addr.ip6, equals('2001:0db8:0000:0000:0000:0000:0000:0001'));
    });

    test('IPv6 mixed notation with single and multiple digit segments', () {
      final addr = MultiAddr('/ip6/2400:6180:0:d2:0:2:8351:9000');
      expect(addr.ip6, equals('2400:6180:0:d2:0:2:8351:9000'));
    });

    test('IPv6 with zone identifier should be stripped', () {
      final addr = MultiAddr('/ip6/fe80::1%eth0');
      expect(addr.ip6, equals('fe80::1'));
    });
  });
}

