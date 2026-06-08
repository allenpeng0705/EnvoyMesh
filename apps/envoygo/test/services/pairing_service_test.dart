import 'package:envoygo/services/pairing_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PairingService.parsePairingUri', () {
    test('parses valid URI with all parameters', () {
      const uri = 'envoy://pair?token=abc123&peerId=12D3KooW&'
          'wsPort=3030&relayWsUrl=wss://relay.example.com&'
          'name=My%20Mac&lanIp=10.0.0.5';

      final data = PairingService.parsePairingUri(uri);

      expect(data, isNotNull);
      expect(data!.token, 'abc123');
      expect(data.peerId, '12D3KooW');
      expect(data.wsPort, 3030);
      expect(data.relayWsUrl, 'wss://relay.example.com');
      expect(data.name, 'My Mac');
      expect(data.lanIp, '10.0.0.5');
    });

    test('parses minimal URI with only required params', () {
      const uri = 'envoy://pair?token=abc123&peerId=12D3KooW';

      final data = PairingService.parsePairingUri(uri);

      expect(data, isNotNull);
      expect(data!.token, 'abc123');
      expect(data.peerId, '12D3KooW');
      expect(data.wsPort, 3030); // Default.
      expect(data.relayWsUrl, isNull);
      expect(data.name, isNull);
    });

    test('returns null for non-envoy URI', () {
      expect(PairingService.parsePairingUri('https://example.com'), isNull);
      expect(PairingService.parsePairingUri('envoy://other?x=1'), isNull);
      expect(PairingService.parsePairingUri(''), isNull);
    });

    test('returns null for missing required params', () {
      // Missing token.
      expect(
          PairingService.parsePairingUri(
              'envoy://pair?peerId=12D3KooW'),
          isNull);
      // Missing peerId.
      expect(
          PairingService.parsePairingUri(
              'envoy://pair?token=abc123'),
          isNull);
    });

    test('returns null for malformed URI', () {
      expect(
          PairingService.parsePairingUri('not a uri at all'),
          isNull);
      expect(
          PairingService.parsePairingUri('envoy://pair??token=abc'),
          isNull);
    });

    test('handles URI-encoded special characters', () {
      const uri =
          'envoy://pair?token=abc%3D123&peerId=12D3KooW&name=My%20%26%20Node';

      final data = PairingService.parsePairingUri(uri);

      expect(data, isNotNull);
      expect(data!.token, 'abc=123');
      expect(data.name, 'My & Node');
    });

    test('handles non-numeric wsPort gracefully', () {
      const uri =
          'envoy://pair?token=abc&peerId=12D3KooW&wsPort=invalid';

      final data = PairingService.parsePairingUri(uri);

      expect(data, isNotNull);
      expect(data!.wsPort, 3030); // Falls back to default.
    });
  });
}
