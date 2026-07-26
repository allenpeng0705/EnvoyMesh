import 'package:envoygo/models/content_engage_notification.dart';
import 'package:envoygo/providers/content_engage_provider.dart';
import 'package:flutter_test/flutter_test.dart';

ContentEngageNotification _item({
  required String id,
  required String surface,
}) {
  return ContentEngageNotification(
    id: id,
    messageId: 'msg-$id',
    url: 'envoy://envoy:owner:me/${surface == 'feed' ? 'feeds' : 'blog'}/a.md',
    surface: surface,
    action: 'star',
    actorOwnerId: 'owner',
    senderPeerId: 'peer',
    receivedAt: '2026-07-26T00:00:00.000Z',
  );
}

void main() {
  group('ContentEngageState visible badge counts', () {
    final state = ContentEngageState(
      items: [
        _item(id: 'f1', surface: 'feed'),
        _item(id: 'f2', surface: 'feed'),
        _item(id: 'b1', surface: 'blog'),
      ],
    );

    test('shows all when Content is not open', () {
      expect(
        state.visibleTotalCount(viewingContent: false, surfaceIndex: 0),
        3,
      );
      expect(
        state.visibleFeedCount(viewingContent: false, surfaceIndex: 0),
        2,
      );
      expect(
        state.visibleBlogCount(viewingContent: false, surfaceIndex: 1),
        1,
      );
    });

    test('hides feed engages while Content → Feed is open', () {
      expect(
        state.visibleTotalCount(viewingContent: true, surfaceIndex: 0),
        1,
      );
      expect(
        state.visibleFeedCount(viewingContent: true, surfaceIndex: 0),
        0,
      );
      expect(
        state.visibleBlogCount(viewingContent: true, surfaceIndex: 0),
        1,
      );
    });

    test('hides blog engages while Content → Blog is open', () {
      expect(
        state.visibleTotalCount(viewingContent: true, surfaceIndex: 1),
        2,
      );
      expect(
        state.visibleFeedCount(viewingContent: true, surfaceIndex: 1),
        2,
      );
      expect(
        state.visibleBlogCount(viewingContent: true, surfaceIndex: 1),
        0,
      );
    });

    test('shows both while Content → Explore is open', () {
      expect(
        state.visibleTotalCount(viewingContent: true, surfaceIndex: 2),
        3,
      );
      expect(
        state.visibleFeedCount(viewingContent: true, surfaceIndex: 2),
        2,
      );
    });
  });
}
