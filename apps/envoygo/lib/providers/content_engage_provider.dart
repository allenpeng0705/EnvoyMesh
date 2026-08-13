import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/content_engage_notification.dart';
import 'contact_provider.dart' show nodeServiceProvider;

class ContentEngageState {
  final List<ContentEngageNotification> items;
  final bool isLoading;

  const ContentEngageState({
    this.items = const [],
    this.isLoading = false,
  });

  int get feedCount => items.where((i) => i.surface == 'feed').length;
  int get blogCount => items.where((i) => i.surface == 'blog').length;
  int get totalCount => items.length;

  /// Content nav badge while [viewingContent]; hide Like/Comment for the open
  /// Feed/Blog surface (same as Social ContentView folder-open UX).
  int visibleTotalCount({
    required bool viewingContent,
    required int surfaceIndex,
  }) {
    var n = totalCount;
    if (viewingContent && surfaceIndex == 0) n -= feedCount;
    if (viewingContent && surfaceIndex == 1) n -= blogCount;
    return n < 0 ? 0 : n;
  }

  int visibleFeedCount({
    required bool viewingContent,
    required int surfaceIndex,
  }) =>
      viewingContent && surfaceIndex == 0 ? 0 : feedCount;

  int visibleBlogCount({
    required bool viewingContent,
    required int surfaceIndex,
  }) =>
      viewingContent && surfaceIndex == 1 ? 0 : blogCount;

  ContentEngageState copyWith({
    List<ContentEngageNotification>? items,
    bool? isLoading,
  }) {
    return ContentEngageState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

/// Content sub-tab: 0=feed, 1=blog, 2=knowledge, 3=explore.
final contentSurfaceProvider = StateProvider<int>((ref) => 0);

final contentEngageProvider =
    StateNotifierProvider<ContentEngageNotifier, ContentEngageState>((ref) {
  return ContentEngageNotifier(ref);
});

class ContentEngageNotifier extends StateNotifier<ContentEngageState> {
  final Ref _ref;

  ContentEngageNotifier(this._ref) : super(const ContentEngageState());

  Future<void> refresh() async {
    final client = _ref.read(nodeServiceProvider);
    if (client == null) return;
    state = state.copyWith(isLoading: true);
    try {
      final items = await client.listContentEngageNotifications();
      items.sort((a, b) => b.receivedAt.compareTo(a.receivedAt));
      state = state.copyWith(items: items, isLoading: false);
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  void upsertFromEvent(Map<String, dynamic> data) {
    // Snapshot updates refresh Moments bars only — not Content badges.
    if (data['action'] == 'snapshot') return;
    late final ContentEngageNotification next;
    try {
      next = ContentEngageNotification.fromJson(data);
    } catch (_) {
      return;
    }
    final exists = state.items.any(
      (p) => p.id == next.id || p.messageId == next.messageId,
    );
    if (exists) return;
    state = state.copyWith(items: [next, ...state.items]);
  }

  /// Clear badges for [surface] (`feed` / `blog`) or `all` when Content opens.
  Future<void> dismiss({String surface = 'all'}) async {
    final client = _ref.read(nodeServiceProvider);
    if (client != null) {
      try {
        await client.dismissContentEngageNotifications(surface: surface);
      } catch (_) {
        /* best-effort */
      }
    }
    if (surface == 'all') {
      state = state.copyWith(items: const []);
    } else {
      state = state.copyWith(
        items: state.items.where((i) => i.surface != surface).toList(),
      );
    }
  }

  void clear() {
    state = const ContentEngageState();
  }
}
