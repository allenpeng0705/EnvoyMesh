import 'dart:convert';
import 'dart:io';

import 'package:envoygo/eh/eh_timeline.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('replays the shared TypeScript/Dart lifecycle fixture idempotently', () {
    final fixture =
        jsonDecode(
              File(
                '../../packages/api/test/fixtures/eh-timeline-lifecycle.json',
              ).readAsStringSync(),
            )
            as Map<String, dynamic>;
    final updates = fixture['timelineUpdates'] as List<dynamic>;
    var state = const EhTimelineState(chatId: 'chat-1');
    for (final raw in updates) {
      state = reduceEhTimeline(state, Map<String, dynamic>.from(raw as Map));
    }
    expect(state.items.map((item) => item['type']), [
      'message',
      'activity',
      'completion',
    ]);
    final firstPass = state.items;
    for (final raw in updates) {
      state = reduceEhTimeline(state, Map<String, dynamic>.from(raw as Map));
    }
    expect(state.items, firstPass);
  });

  test('isolates chat updates and rejects stale replacements', () {
    var state = const EhTimelineState(chatId: 'chat-1');
    state = reduceEhTimeline(state, {
      'type': 'upsert',
      'item': {
        'id': 'a',
        'chatId': 'chat-2',
        'type': 'message',
        'createdAt': '2026-08-25T00:00:00.000Z',
      },
    });
    expect(state.items, isEmpty);
    state = reduceEhTimeline(state, {
      'type': 'upsert',
      'item': {
        'id': 'a',
        'chatId': 'chat-1',
        'type': 'message',
        'text': 'new',
        'createdAt': '2026-08-25T00:00:00.000Z',
        'updatedAt': '2026-08-25T00:00:02.000Z',
      },
    });
    state = reduceEhTimeline(state, {
      'type': 'upsert',
      'item': {
        'id': 'a',
        'chatId': 'chat-1',
        'type': 'message',
        'text': 'old',
        'createdAt': '2026-08-25T00:00:00.000Z',
        'updatedAt': '2026-08-25T00:00:01.000Z',
      },
    });
    expect(state.items.single['text'], 'new');
  });
}
