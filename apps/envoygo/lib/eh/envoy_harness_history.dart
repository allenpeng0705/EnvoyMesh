class EnvoyHarnessHistoryMessage {
  const EnvoyHarnessHistoryMessage({
    required this.id,
    required this.role,
    required this.text,
  });

  final String id;
  final String role;
  final String text;
}

List<EnvoyHarnessHistoryMessage> parseEnvoyHarnessHistory(dynamic turns) {
  if (turns is! List) return const [];
  final messages = <EnvoyHarnessHistoryMessage>[];
  for (final raw in turns) {
    if (raw is! Map) continue;
    final role = raw['role']?.toString();
    final text = raw['text']?.toString().trim() ?? '';
    if ((role == 'user' || role == 'assistant' || role == 'system') &&
        text.isNotEmpty) {
      messages.add(
        EnvoyHarnessHistoryMessage(
          id: raw['id']?.toString() ?? 'eh-history-${messages.length}',
          role: role!,
          text: text,
        ),
      );
    }
  }
  return messages;
}
