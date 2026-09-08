import 'package:envoygo/services/discover_contact_code.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('looksLikePeerId', () {
    test('accepts 12D3… ids', () {
      expect(
        looksLikePeerId(
          '12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo',
        ),
        isTrue,
      );
    });

    test('rejects short text', () {
      expect(looksLikePeerId('food'), isFalse);
    });
  });

  group('parseDiscoverContactCode', () {
    test('parses envoy://contact', () {
      final parsed = parseDiscoverContactCode(
        'envoy://contact?v=1&peerId=12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo&ownerId=envoy:owner:abc&name=Ada',
      );
      expect(parsed, isA<DiscoverContactCode>());
      final c = parsed as DiscoverContactCode;
      expect(c.peerId, startsWith('12D3'));
      expect(c.ownerId, 'envoy:owner:abc');
      expect(c.displayName, 'Ada');
    });

    test('parses /p2p/ multiaddr tail', () {
      final parsed = parseDiscoverContactCode(
        '/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo',
      );
      expect(parsed, isA<DiscoverPeerIdCode>());
      expect(
        (parsed as DiscoverPeerIdCode).peerId,
        '12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo',
      );
    });

    test('interest text is not an id/link', () {
      expect(looksLikeDiscoverIdOrLink('food'), isFalse);
    });
  });
}
