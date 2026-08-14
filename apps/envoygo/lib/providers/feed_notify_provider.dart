import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/feed_notification.dart';
import 'contact_provider.dart' show nodeServiceProvider;

/// In-app Inbox state for Phase 45E `feed.notify` rows (via home node).
class FeedNotifyState {
  final List<FeedNotification> items;
  final bool isLoading;
  final String? error;

  const FeedNotifyState({
    this.items = const [],
    this.isLoading = false,
    this.error,
  });

  /// Unread rows for Inbox badge / publish-alerts list.
  List<FeedNotification> get unread =>
      items.where((i) => i.isUnread).toList(growable: false);

  FeedNotifyState copyWith({
    List<FeedNotification>? items,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return FeedNotifyState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

final feedNotifyProvider =
    StateNotifierProvider<FeedNotifyNotifier, FeedNotifyState>((ref) {
  return FeedNotifyNotifier(ref);
});

class FeedNotifyNotifier extends StateNotifier<FeedNotifyState> {
  final Ref _ref;

  FeedNotifyNotifier(this._ref) : super(const FeedNotifyState());

  /// Replace inbox from home `listFeedNotifications`.
  Future<void> refresh() async {
    final client = _ref.read(nodeServiceProvider);
    if (client == null) return;
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final items = await client.listFeedNotifications();
      // Newest first (home may already sort; be defensive).
      items.sort((a, b) => b.receivedAt.compareTo(a.receivedAt));
      state = state.copyWith(items: items, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// Upsert a live `feed:notify` push (idempotent by [FeedNotification.id]).
  void upsertFromEvent(Map<String, dynamic> data) {
    late final FeedNotification next;
    try {
      next = FeedNotification.fromJson(data);
    } catch (_) {
      return;
    }
    final without = state.items.where((i) => i.id != next.id).toList();
    state = state.copyWith(items: [next, ...without], clearError: true);
  }

  /// Mark read on home; keep the row for Content → Feed timeline.
  Future<void> dismiss(String id) async {
    final client = _ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      await client.dismissFeedNotification(id);
      final readAt = DateTime.now().toUtc().toIso8601String();
      state = state.copyWith(
        items: state.items
            .map((i) => i.id == id ? i.copyWith(readAt: readAt) : i)
            .toList(),
        clearError: true,
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  /// Mark all read (Inbox open / Social tab) without dropping Feed timeline rows.
  Future<void> dismissAll() async {
    final client = _ref.read(nodeServiceProvider);
    if (client != null) {
      try {
        await client.dismissAllFeedNotifications();
      } catch (e) {
        state = state.copyWith(error: e.toString());
        return;
      }
    }
    final readAt = DateTime.now().toUtc().toIso8601String();
    state = state.copyWith(
      items: state.items
          .map((i) => i.isUnread ? i.copyWith(readAt: readAt) : i)
          .toList(),
      clearError: true,
    );
  }

  void clear() {
    state = const FeedNotifyState();
  }
}
