class EhTimelineState {
  const EhTimelineState({
    required this.chatId,
    this.items = const [],
    this.agentState,
    this.revision = 0,
  });

  final String chatId;
  final List<Map<String, dynamic>> items;
  final Map<String, dynamic>? agentState;
  final int revision;
}

EhTimelineState reduceEhTimeline(
  EhTimelineState current,
  Map<String, dynamic> update,
) {
  final type = update['type']?.toString();
  if (type == 'snapshot') {
    final snapshot = _stringMap(update['snapshot']);
    if (snapshot == null || snapshot['chatId'] != current.chatId) {
      return current;
    }
    final revision = _int(snapshot['revision']) ?? 0;
    if (revision < current.revision) return current;
    return EhTimelineState(
      chatId: current.chatId,
      items: dedupeEhTimelineItems(snapshot['items']),
      agentState: _stringMap(snapshot['state']),
      revision: revision,
    );
  }
  if (type == 'state') {
    final state = _stringMap(update['state']);
    if (state == null || state['chatId'] != current.chatId) return current;
    return EhTimelineState(
      chatId: current.chatId,
      items: current.items,
      agentState: state,
      revision: _int(update['revision']) ?? current.revision + 1,
    );
  }
  if (type == 'remove') {
    if (update['chatId'] != current.chatId) return current;
    final id = update['id']?.toString();
    return EhTimelineState(
      chatId: current.chatId,
      items: current.items.where((item) => item['id'] != id).toList(),
      agentState: current.agentState,
      revision: _int(update['revision']) ?? current.revision + 1,
    );
  }
  if (type != 'upsert') return current;
  final item = _stringMap(update['item']);
  if (item == null || item['chatId'] != current.chatId) return current;
  final revision = _int(update['revision']) ?? current.revision + 1;
  if (revision < current.revision) return current;
  final index = current.items.indexWhere((entry) => entry['id'] == item['id']);
  if (index < 0) {
    return EhTimelineState(
      chatId: current.chatId,
      items: [...current.items, item],
      agentState: current.agentState,
      revision: revision,
    );
  }
  if (_isStale(current.items[index], item)) return current;
  final items = [...current.items]..[index] = item;
  return EhTimelineState(
    chatId: current.chatId,
    items: items,
    agentState: current.agentState,
    revision: revision,
  );
}

List<Map<String, dynamic>> dedupeEhTimelineItems(dynamic raw) {
  if (raw is! List) return const [];
  final result = <Map<String, dynamic>>[];
  final indexes = <String, int>{};
  for (final value in raw) {
    final item = _stringMap(value);
    final id = item?['id']?.toString();
    if (item == null || id == null) continue;
    final index = indexes[id];
    if (index == null) {
      indexes[id] = result.length;
      result.add(item);
    } else if (!_isStale(result[index], item)) {
      result[index] = item;
    }
  }
  return result;
}

Map<String, dynamic>? _stringMap(dynamic value) {
  if (value is! Map) return null;
  return value.map((key, item) => MapEntry(key.toString(), item));
}

int? _int(dynamic value) => value is int ? value : int.tryParse('$value');

bool _isStale(Map<String, dynamic> existing, Map<String, dynamic> incoming) {
  final oldStamp = (existing['updatedAt'] ?? existing['createdAt'] ?? '')
      .toString();
  final newStamp = (incoming['updatedAt'] ?? incoming['createdAt'] ?? '')
      .toString();
  return newStamp.compareTo(oldStamp) < 0;
}
