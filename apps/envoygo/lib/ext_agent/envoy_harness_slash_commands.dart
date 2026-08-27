/// Envoy Harness slash catalog — mirrors Social `envoy-harness-slash-commands.ts`.

import 'ext_agent_slash_commands.dart';

const envoyHarnessCommandCatalogVersion = '1';

List<Map<String, dynamic>> get envoyHarnessSlashCommands => _staticCommands
    .map((c) => {
          'slash': _normalizeSlash(c['slash'] as String),
          'summary': c['summary'],
          if (c['argsHint'] != null) 'argsHint': c['argsHint'],
          'intercept': c['intercept'] ?? 'forward',
          'source': 'static',
        })
    .toList();

String _normalizeSlash(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return '';
  return trimmed.startsWith('/') ? trimmed : '/$trimmed';
}

Map<String, dynamic> _fwd(String slash, String summary, [String? argsHint]) => {
      'slash': slash,
      'summary': summary,
      if (argsHint != null) 'argsHint': argsHint,
      'intercept': 'forward',
    };

final List<Map<String, dynamic>> _staticCommands = [
  {
    'slash': '/help',
    'summary': 'List envoy-harness slash commands',
    'intercept': 'envoy',
  },
  {
    'slash': '/clear',
    'summary': 'Clear this conversation',
    'intercept': 'envoy',
  },
  {
    'slash': '/cancel',
    'summary': 'Cancel the in-flight turn',
    'intercept': 'envoy',
  },
  _fwd('/new', 'Start a fresh conversation (alias for /clear)'),
  _fwd('/reset', 'Alias for /clear'),
  {
    'slash': '/status',
    'summary': 'Refresh runtime status, model, and peer cluster',
    'intercept': 'envoy',
  },
  {
    'slash': '/peers',
    'summary': 'List configured peer cluster members',
    'intercept': 'envoy',
  },
  {
    'slash': '/cluster',
    'summary': 'Peer cluster health + routing preview',
    'intercept': 'envoy',
  },
  {
    'slash': '/team',
    'summary': 'Running / finished team jobs',
    'intercept': 'envoy',
  },
  {
    'slash': '/trace',
    'summary': 'Recent peer discovery events',
    'intercept': 'envoy',
  },
  {
    'slash': '/search',
    'summary': 'Search this conversation',
    'argsHint': '<term>',
    'intercept': 'envoy',
  },
  _fwd('/list-agents', 'Alias for /peers'),
  {
    'slash': '/model',
    'summary': 'Show the active model (change in Settings → AI)',
    'argsHint': '[show]',
    'intercept': 'envoy',
  },
  {
    'slash': '/cd',
    'summary': 'Show or set the project working folder',
    'argsHint': '[path]',
    'intercept': 'envoy',
  },
  _fwd('/project', 'Alias for /cd — set project folder', '[path]'),
  _fwd('/add-dir', 'Grant read access to another directory', '<path>'),
  _fwd('/review', 'Review the current diff or working tree'),
  _fwd('/code-review', 'Alias for /review', '[level] [--fix]'),
  _fwd('/security-review', 'Security review of branch changes'),
  _fwd('/compact', 'Summarize the conversation to free context', '[instructions]'),
  _fwd('/context', 'Summarize current context usage'),
  _fwd('/diff', 'Show git diff including untracked files'),
  _fwd('/init', 'Generate an AGENTS.md scaffold in the project'),
  _fwd('/plan', 'Enter plan mode', '[description]'),
  _fwd('/explain', 'Explain the selected code or recent changes', '[target]'),
  _fwd('/refactor', 'Refactor code with a stated goal', '[instructions]'),
  _fwd('/fix', 'Fix a bug or failing test', '[description]'),
  _fwd('/test', 'Write or run tests for recent changes', '[target]'),
  _fwd('/docs', 'Document APIs or modules', '[target]'),
  _fwd('/commit', 'Draft a commit message for staged changes'),
  _fwd('/run', 'Run the app or a command to verify changes', '[command]'),
  _fwd('/skills', 'List or use available skills'),
  _fwd('/mcp', 'List configured MCP tools', '[verbose]'),
  _fwd('/export', 'Export the conversation as plain text', '[filename]'),
  _fwd('/rename', 'Rename this session', '[name]'),
  _fwd('/fork', 'Branch into a new conversation', '[prompt]'),
  _fwd('/resume', 'Resume a saved session', '[id]'),
  _fwd('/copy', 'Copy the latest assistant response'),
  _fwd('/stop', 'Stop background work'),
  _fwd('/permissions', 'Adjust what the agent may do without asking'),
  _fwd('/hooks', 'View lifecycle hook configuration'),
  _fwd('/memory', 'Edit project memory files'),
  _fwd('/usage', 'Show token usage or session cost'),
  _fwd('/cost', 'Alias for /usage'),
  _fwd('/doctor', 'Diagnose setup issues'),
  _fwd('/debug', 'Enable verbose debug output', '[description]'),
  _fwd('/fast', 'Toggle fast mode when supported', '[on|off]'),
  _fwd('/effort', 'Set reasoning effort', '[level]'),
  _fwd('/goal', 'Set or clear a multi-turn goal', '[condition|clear]'),
  _fwd('/side', 'Ask a side question without polluting main context', '[question]'),
  _fwd('/btw', 'Alias for /side'),
  _fwd('/redo', 'Retry the last request'),
  _fwd('/rewind', 'Roll the conversation back to an earlier message', '[count]'),
  _fwd('/config', 'Show the harness configuration (model, provider, project)'),
];

Map<String, dynamic> buildEnvoyHarnessCommandCatalog({
  String? model,
  String? cwd,
}) {
  return {
    'agentId': 'envoy-harness',
    'agentName': 'envoy-harness',
    'commands': envoyHarnessSlashCommands,
    if (model != null) 'defaultModel': model,
    'catalogVersion': envoyHarnessCommandCatalogVersion,
    'fetchedAt': DateTime.now().toUtc().toIso8601String(),
    'limitations': [
      'Panel chat forwards most slash verbs as text; the harness may treat them like natural-language tasks.',
    ],
  };
}

String formatEnvoyHarnessSlashHelp({String? model, String? cwd}) {
  final catalog = buildEnvoyHarnessCommandCatalog(model: model, cwd: cwd);
  final base = formatExtAgentSlashHelp(catalog);
  if (cwd == null || cwd.trim().isEmpty) return base;
  return '$base\n\nProject folder: $cwd';
}

List<Map<String, dynamic>> filterEnvoyHarnessSlashCommands(
  List<Map<String, dynamic>> commands,
  String value,
) => filterExtAgentSlashCommands(commands, value);

bool isEnvoyHarnessSlashSuggestInput(String value) =>
    isExtAgentSlashSuggestInput(value);

String? envoyHarnessSlashName(String text) {
  final trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  final parts = trimmed.substring(1).split(RegExp(r'\s+'));
  if (parts.isEmpty) return null;
  return parts.first.toLowerCase();
}

class EnvoyHarnessCdSlashAction {
  final String type; // show | set
  final String? path;
  const EnvoyHarnessCdSlashAction.show() : type = 'show', path = null;
  const EnvoyHarnessCdSlashAction.set(this.path) : type = 'set';
}

EnvoyHarnessCdSlashAction? parseEnvoyHarnessCdCommand(String text) {
  final trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  final parts =
      trimmed.substring(1).split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return null;
  final cmd = parts.first.toLowerCase();
  if (cmd != 'cd' && cmd != 'project') return null;
  final rest = parts.skip(1).join(' ').trim();
  if (rest.isEmpty) return const EnvoyHarnessCdSlashAction.show();
  return EnvoyHarnessCdSlashAction.set(rest);
}

class EnvoyHarnessModelSlashAction {
  final String type;
  const EnvoyHarnessModelSlashAction.show() : type = 'show';
}

EnvoyHarnessModelSlashAction? parseEnvoyHarnessModelCommand(String text) {
  final trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  final parts =
      trimmed.substring(1).split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty || parts.first.toLowerCase() != 'model') return null;
  final rest = parts.skip(1).join(' ').trim();
  if (rest.isNotEmpty && rest.toLowerCase() != 'show') return null;
  return const EnvoyHarnessModelSlashAction.show();
}

bool isEnvoyHarnessLocalSlashCommand(String text) {
  final name = envoyHarnessSlashName(text);
  if (name == null) return false;
  if (name == 'help') return true;
  if (name == 'clear' || name == 'new' || name == 'reset') return true;
  if (name == 'cancel') return true;
  if (name == 'status') return true;
  if (name == 'peers' || name == 'list-agents') return true;
  if (name == 'cluster' || name == 'team' || name == 'trace') return true;
  if (name == 'search') return true;
  if (parseEnvoyHarnessModelCommand(text) != null) return true;
  if (parseEnvoyHarnessCdCommand(text) != null) return true;
  return false;
}

String formatEhClusterStatus(dynamic cluster) {
  if (cluster is! Map) return cluster.toString();
  final peers = cluster['peers'] as List? ?? [];
  final connected = cluster['connected'] ?? '?';
  final failed = cluster['failed'] ?? '?';
  final lines = <String>[
    'Cluster: $connected connected, $failed failed',
  ];
  for (final raw in peers) {
    if (raw is! Map) continue;
    final id = raw['id']?.toString() ?? '?';
    final health = raw['health'];
    final ok = health is Map && health['ok'] == true;
    lines.add('  $id ${ok ? 'ok' : 'fail'}');
  }
  return lines.join('\n');
}

String formatEhTeamJobs(dynamic jobs) {
  if (jobs is! List) return jobs.toString();
  if (jobs.isEmpty) return 'No team jobs.';
  return jobs.map((j) {
    if (j is! Map) return j.toString();
    return '${j['jobId'] ?? '?'} · ${j['status'] ?? '?'}';
  }).join('\n');
}

String formatEhDiscoveryEvents(dynamic events) {
  if (events is! List) return events.toString();
  if (events.isEmpty) return 'No peer discovery events yet.';
  return events
      .take(10)
      .map((e) {
        if (e is! Map) return e.toString();
        return '${e['type'] ?? '?'} ${e['peerId'] ?? '?'}';
      })
      .join('\n');
}
