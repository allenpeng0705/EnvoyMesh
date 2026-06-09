import 'package:envoygo/services/pairing_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PairingService.parsePairingUri', () {
    test('parses valid home-node URI with all parameters', () {
      final uri = 'envoy://pair?wsUrl=ws%3A%2F%2Frelay.example.com%2Fws'
          '&token=abc123'
          '&ownerPublicKey=-----BEGIN+PUBLIC+KEY-----'
          '&ownerId=envoy%3Aowner%3Aabc'
          '&lanWsUrl=ws%3A%2F%2F10.0.0.5%3A3030%2Fws'
          '&homeNodePeerId=12D3KooW'
          '&agentName=My%20Mac';

      final data = PairingService.parsePairingUri(uri);

      expect(data, isNotNull);
      expect(data!.token, 'abc123');
      expect(data.wsUrl, 'ws://relay.example.com/ws');
      expect(data.lanWsUrl, 'ws://10.0.0.5:3030/ws');
      expect(data.ownerId, 'envoy:owner:abc');
      expect(data.homeNodePeerId, '12D3KooW');
      expect(data.agentName, 'My Mac');
    });

    test('parses minimal URI with only required params', () {
      final uri = 'envoy://pair?wsUrl=ws%3A%2F%2Frelay.example.com%2Fws'
          '&token=abc123'
          '&ownerPublicKey=key'
          '&ownerId=envoy%3Aowner%3Aabc';

      final data = PairingService.parsePairingUri(uri);

      expect(data, isNotNull);
      expect(data!.token, 'abc123');
      expect(data.wsUrl, 'ws://relay.example.com/ws');
      expect(data.lanWsUrl, isNull);
      expect(data.homeNodePeerId, isNull);
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
              'envoy://pair?wsUrl=ws%3A%2F%2Frelay.example.com%2Fws&ownerPublicKey=k&ownerId=o'),
          isNull);
      // Missing wsUrl.
      expect(
          PairingService.parsePairingUri(
              'envoy://pair?token=abc&ownerPublicKey=k&ownerId=o'),
          isNull);
    });

    test('returns null for malformed URI', () {
      expect(PairingService.parsePairingUri('not a uri at all'), isNull);
      expect(
          PairingService.parsePairingUri('envoy://pair??token=abc'),
          isNull);
    });

    test('handles URI-encoded special characters', () {
      final uri =
          'envoy://pair?wsUrl=ws%3A%2F%2Frelay.example.com%2Fws&token=abc%3D123&ownerPublicKey=k&ownerId=o&agentName=My%20%26%20Node';

      final data = PairingService.parsePairingUri(uri);

      expect(data, isNotNull);
      expect(data!.token, 'abc=123');
      expect(data.agentName, 'My & Node');
    });

    test('handles empty string parameters as null', () {
      final uri =
          'envoy://pair?wsUrl=ws%3A%2F%2Frelay.example.com%2Fws&token=abc&ownerPublicKey=k&ownerId=o&lanWsUrl=';

      final data = PairingService.parsePairingUri(uri);

      expect(data, isNotNull);
      expect(data!.lanWsUrl, isNull);
    });
  });
}
