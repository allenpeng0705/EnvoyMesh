import 'package:envoygo/models/feed_notification.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('FeedNotification', () {
    test('fromJson / toJson round-trip', () {
      final json = {
        'id': 'fn-1',
        'receivedAt': '2026-07-20T12:00:00.000Z',
        'messageId': 'msg-1',
        'publisherOwnerId': 'envoy:owner:alice',
        'publishedAt': '2026-07-20T11:59:00.000Z',
        'title': 'Hello post',
        'url': 'envoy://envoy:owner:alice/blog/posts/hello.md',
        'kind': 'article',
        'visibility': 'bonded',
        'summary': 'A short summary',
        'tags': ['photography'],
        'contentHash': 'abc',
        'listingUrl': 'envoy://envoy:owner:alice/blog/',
        'senderPeerId': '12D3KooAlice',
      };
      final row = FeedNotification.fromJson(json);
      expect(row.id, 'fn-1');
      expect(row.tags, ['photography']);
      expect(row.imageUrls, isEmpty);
      expect(row.toJson()['title'], 'Hello post');
    });

    test('fromJson parses imageUrls', () {
      final row = FeedNotification.fromJson({
        'id': 'fn-2',
        'receivedAt': '2026-07-20T12:00:00.000Z',
        'messageId': 'msg-2',
        'publisherOwnerId': 'envoy:owner:alice',
        'publishedAt': '2026-07-20T11:59:00.000Z',
        'title': 'Pics',
        'url': 'envoy://envoy:owner:alice/feeds/pics.md',
        'kind': 'feed',
        'visibility': 'bonded',
        'senderPeerId': '12D3KooAlice',
        'imageUrls': [
          'envoy://envoy:owner:alice/feeds/media/pics/0.jpg',
          'envoy://envoy:owner:alice/feeds/media/pics/1.jpg',
        ],
      });
      expect(row.imageUrls, hasLength(2));
      expect(row.toJson()['imageUrls'], hasLength(2));
    });

    test('fromJson throws when title missing', () {
      expect(
        () => FeedNotification.fromJson({
          'id': 'fn-1',
          'url': 'envoy://x/y',
        }),
        throwsA(isA<FormatException>()),
      );
    });
  });
}
