/// Ext Agent slash helpers for EnvoyGo (mirrors Social `ext-agent-slash-commands.ts`).

bool isExtAgentSlashSuggestInput(String value) {
  return RegExp(r'^/\S*$').hasMatch(value);
}

bool isExtAgentHelpCommand(String text) {
  final trimmed = text.trim();
  if (!trimmed.startsWith('/')) return false;
  final parts = trimmed.substring(1).split(RegExp(r'\s+'));
  final cmd = parts.isEmpty ? '' : parts.first;
  return cmd.toLowerCase() == 'help';
}

class ExtAgentModelSlashAction {
  final String type; // show | list | default | set
  final String? model;
  const ExtAgentModelSlashAction.show() : type = 'show', model = null;
  const ExtAgentModelSlashAction.list() : type = 'list', model = null;
  const ExtAgentModelSlashAction.default_() : type = 'default', model = null;
  const ExtAgentModelSlashAction.set(this.model) : type = 'set';
}

ExtAgentModelSlashAction? parseExtAgentModelCommand(String text) {
  final trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  final parts = trimmed.substring(1).split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty || parts.first.toLowerCase() != 'model') return null;
  final rest = parts.skip(1).join(' ').trim();
  if (rest.isEmpty || rest.toLowerCase() == 'show') {
    return const ExtAgentModelSlashAction.show();
  }
  if (rest.toLowerCase() == 'list') return const ExtAgentModelSlashAction.list();
  if (rest.toLowerCase() == 'default') {
    return const ExtAgentModelSlashAction.default_();
  }
  return ExtAgentModelSlashAction.set(rest);
}

const _mmxMediaKinds = {
  'image',
  'video',
  'speech',
  'music',
  'vision',
  'search',
  'quota',
  'auth',
};

/// Parse result for MiniMax media slash commands.
class ParsedMmxMediaCommand {
  final bool ok;
  final Map<String, String>? params;
  final String? error;
  const ParsedMmxMediaCommand.ok(this.params)
      : ok = true,
        error = null;
  const ParsedMmxMediaCommand.err(this.error)
      : ok = false,
        params = null;
}

/// Parse MiniMax media slash. `/mmx-auth` maps to kind `auth`.
/// Returns null when the text is not an MMX media command.
ParsedMmxMediaCommand? parseMmxMediaCommand(String text) {
  final trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  final parts =
      trimmed.substring(1).split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return null;
  var cmd = parts.first.toLowerCase();
  if (cmd == 'mmx-auth') cmd = 'auth';
  if (!_mmxMediaKinds.contains(cmd)) return null;
  final rest = parts.skip(1).toList();

  if (cmd == 'quota' || cmd == 'auth') {
    return ParsedMmxMediaCommand.ok({'kind': cmd});
  }
  if (cmd == 'vision') {
    if (rest.isEmpty) {
      return const ParsedMmxMediaCommand.err(
        'Usage: /vision <path-or-url> [question]',
      );
    }
    final target = rest.first.trim();
    final question = rest.skip(1).join(' ').trim();
    return ParsedMmxMediaCommand.ok({
      'kind': cmd,
      'target': target,
      if (question.isNotEmpty) 'prompt': question,
    });
  }
  final prompt = rest.join(' ').trim();
  if (prompt.isEmpty) {
    final usage = cmd == 'speech'
        ? 'Usage: /speech <text>'
        : cmd == 'search'
            ? 'Usage: /search <query>'
            : 'Usage: /$cmd <prompt>';
    return ParsedMmxMediaCommand.err(usage);
  }
  return ParsedMmxMediaCommand.ok({'kind': cmd, 'prompt': prompt});
}

String formatMmxMediaResult(Map<String, dynamic> result) {
  final kind = result['kind']?.toString() ?? 'media';
  final ok = result['ok'] == true;
  if (!ok) {
    return 'MiniMax /$kind failed: ${result['error'] ?? 'unknown error'}';
  }
  final lines = <String>['MiniMax /$kind'];
  final path = result['path']?.toString().trim();
  if (path != null && path.isNotEmpty) lines.add('Saved: $path');
  final text = result['text']?.toString().trim();
  if (text != null && text.isNotEmpty) lines.add(text);
  return lines.join('\n');
}

String? extAgentModelSuggestPrefix(String value) {
  final match = RegExp(r'^/model(?:\s+(.*))?$', caseSensitive: false).firstMatch(value);
  if (match == null) return null;
  if (!value.contains(RegExp(r'\s'))) return null;
  return (match.group(1) ?? '').toLowerCase();
}

List<Map<String, dynamic>> filterExtAgentSlashCommands(
  List<Map<String, dynamic>> commands,
  String value,
) {
  if (!isExtAgentSlashSuggestInput(value)) return const [];
  final prefix = value.toLowerCase();
  return commands.where((c) {
    final slash = (c['slash'] as String?)?.toLowerCase() ?? '';
    return slash.startsWith(prefix);
  }).toList();
}

List<Map<String, dynamic>> filterExtAgentModels(
  List<Map<String, dynamic>> models,
  String value,
) {
  final prefix = extAgentModelSuggestPrefix(value);
  if (prefix == null) return const [];
  if (prefix.isEmpty) return models;
  return models.where((m) {
    final id = (m['id'] as String?)?.toLowerCase() ?? '';
    final label = (m['label'] as String?)?.toLowerCase() ?? '';
    return id.startsWith(prefix) || label.startsWith(prefix);
  }).toList();
}

String formatExtAgentSlashHelp(Map<String, dynamic> catalog) {
  final name = (catalog['agentName'] as String?)?.trim().isNotEmpty == true
      ? catalog['agentName'] as String
      : (catalog['agentId'] as String? ?? 'Ext Agent');
  final lines = <String>['$name slash commands:'];
  final commands = (catalog['commands'] as List?) ?? const [];
  if (commands.isEmpty) {
    lines.add('(none)');
  } else {
    for (final raw in commands) {
      if (raw is! Map) continue;
      final slash = raw['slash']?.toString() ?? '';
      final args = (raw['argsHint'] as String?)?.trim();
      final summary = raw['summary']?.toString() ?? '';
      lines.add(args == null || args.isEmpty ? '$slash — $summary' : '$slash $args — $summary');
    }
  }
  if (catalog['supportsSessionModel'] == true) {
    final current = (catalog['sessionModel'] as String?) ??
        (catalog['defaultModel'] as String?) ??
        '(default)';
    lines.add('');
    lines.add('Current model: $current');
  }
  final limitations = (catalog['limitations'] as List?) ?? const [];
  if (limitations.isNotEmpty) {
    lines.add('');
    lines.add('Notes:');
    for (final note in limitations) {
      lines.add('• $note');
    }
  }
  return lines.join('\n');
}

String formatExtAgentModelShow(Map<String, dynamic> catalog) {
  final name = (catalog['agentName'] as String?) ?? 'Ext Agent';
  final session = catalog['sessionModel'] as String?;
  final current = session != null
      ? '$session (session override)'
      : '${catalog['defaultModel'] ?? '(default)'} (default)';
  return '$name model: $current';
}

String formatExtAgentModelList(Map<String, dynamic> catalog) {
  final name = (catalog['agentName'] as String?) ?? 'Ext Agent';
  final models = (catalog['models'] as List?) ?? const [];
  if (models.isEmpty) {
    return '$name: no model list available. Try /model <id> if you know the id.';
  }
  final lines = <String>['$name models:'];
  for (final raw in models) {
    if (raw is! Map) continue;
    final id = raw['id']?.toString() ?? '';
    final label = raw['label']?.toString();
    lines.add(label == null || label.isEmpty ? '• $id' : '• $id — $label');
  }
  return lines.join('\n');
}
