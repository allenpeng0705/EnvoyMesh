import 'package:envoygo/models/feed_notification.dart';
import 'package:envoygo/providers/feed_notify_provider.dart';
import 'package:envoygo/services/node_service_client.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:envoygo/providers/contact_provider.dart'
    show nodeServiceProvider;

class _FakeNodeService extends Fake implements NodeServiceClient {
  List<FeedNotification> rows = [];
  final dismissed = <String>[];

  @override
  Future<List<FeedNotification>> listFeedNotifications() async => rows;

  @override
  Future<void> dismissFeedNotification(String id) async {
    dismissed.add(id);
    rows = rows.where((r) => r.id != id).toList();
  }
}

FeedNotification _row(String id, {String title = 'Post'}) {
  return FeedNotification(
    id: id,
    receivedAt: '2026-07-20T12:00:00.000Z',
    messageId: 'm-$id',
    publisherOwnerId: 'envoy:owner:alice',
    publishedAt: '2026-07-20T11:59:00.000Z',
    title: title,
    url: 'envoy://envoy:owner:alice/blog/posts/$id.md',
    kind: 'article',
    visibility: 'bonded',
    senderPeerId: '12D3',
  );
}

void main() {
  test('refresh loads rows from home RPC', () async {
    final fake = _FakeNodeService()..rows = [_row('a'), _row('b')];
    final container = ProviderContainer(
      overrides: [nodeServiceProvider.overrideWithValue(fake)],
    );
    addTearDown(container.dispose);

    await container.read(feedNotifyProvider.notifier).refresh();
    final state = container.read(feedNotifyProvider);
    expect(state.items.map((e) => e.id), ['a', 'b']);
    expect(state.isLoading, isFalse);
  });

  test('upsertFromEvent prepends and dedupes by id', () {
    final fake = _FakeNodeService();
    final container = ProviderContainer(
      overrides: [nodeServiceProvider.overrideWithValue(fake)],
    );
    addTearDown(container.dispose);

    final notifier = container.read(feedNotifyProvider.notifier);
    notifier.upsertFromEvent(_row('a', title: 'First').toJson());
    notifier.upsertFromEvent(_row('b').toJson());
    notifier.upsertFromEvent(_row('a', title: 'Updated').toJson());

    final items = container.read(feedNotifyProvider).items;
    expect(items.map((e) => e.id).toList(), ['a', 'b']);
    expect(items.first.title, 'Updated');
  });

  test('dismiss removes locally after RPC', () async {
    final fake = _FakeNodeService()..rows = [_row('a'), _row('b')];
    final container = ProviderContainer(
      overrides: [nodeServiceProvider.overrideWithValue(fake)],
    );
    addTearDown(container.dispose);

    final notifier = container.read(feedNotifyProvider.notifier);
    await notifier.refresh();
    await notifier.dismiss('a');

    expect(fake.dismissed, ['a']);
    expect(container.read(feedNotifyProvider).items.map((e) => e.id), ['b']);
  });
}
