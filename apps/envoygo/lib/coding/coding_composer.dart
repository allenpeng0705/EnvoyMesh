/// Sticky Coding composer prefs + capabilities + prompt shaping
/// (port of Social coding-composer-*.ts).
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

const kCodingComposerPrefsKey = 'envoymesh.codingComposerPrefs';

typedef CodingWorkingMode = String; // ask | plan | code
typedef CodingThinkingEffort = String; // off | low | medium | high
typedef CodingPermissionPolicy = String; // safe-only | always-confirm | off

class CodingAgentModeOption {
  const CodingAgentModeOption({
    required this.id,
    required this.label,
    this.workingMode,
  });

  final String id;
  final String label;
  final CodingWorkingMode? workingMode;
}

class CodingComposerCapabilities {
  const CodingComposerCapabilities({
    required this.model,
    required this.workingMode,
    required this.planSlash,
    required this.fast,
    required this.thinking,
    required this.importSession,
    required this.attach,
    this.agentModes = const [],
    this.canSetMode = false,
    this.permissions = false,
    this.permissionDisabledReason,
    this.permissionAskDisabledReason,
    this.permissionFullDisabledReason,
  });

  final bool model;
  final bool workingMode;
  final bool planSlash;
  final bool fast;
  final bool thinking;
  final bool importSession;
  final bool attach;
  final List<CodingAgentModeOption> agentModes;
  final bool canSetMode;
  final bool permissions;
  final String? permissionDisabledReason;
  /// Catalog ACP has no Mesh ask dock yet — Ask would cancel tools silently.
  final String? permissionAskDisabledReason;
  final String? permissionFullDisabledReason;
}

class CodingComposerPrefs {
  const CodingComposerPrefs({
    this.mode = 'code',
    this.fast = false,
    this.thinking = 'off',
    this.model,
    this.agentModeId,
    this.permissionPolicy = 'safe-only',
  });

  final CodingWorkingMode mode;
  final bool fast;
  final CodingThinkingEffort thinking;
  final String? model;
  final String? agentModeId;
  final CodingPermissionPolicy permissionPolicy;

  CodingComposerPrefs copyWith({
    CodingWorkingMode? mode,
    bool? fast,
    CodingThinkingEffort? thinking,
    String? model,
    bool clearModel = false,
    String? agentModeId,
    bool clearAgentModeId = false,
    CodingPermissionPolicy? permissionPolicy,
  }) {
    return CodingComposerPrefs(
      mode: mode ?? this.mode,
      fast: fast ?? this.fast,
      thinking: thinking ?? this.thinking,
      model: clearModel ? null : (model ?? this.model),
      agentModeId:
          clearAgentModeId ? null : (agentModeId ?? this.agentModeId),
      permissionPolicy: permissionPolicy ?? this.permissionPolicy,
    );
  }

  Map<String, dynamic> toJson() => {
        'mode': mode,
        'fast': fast,
        'thinking': thinking,
        if (model != null && model!.trim().isNotEmpty) 'model': model!.trim(),
        if (agentModeId != null && agentModeId!.trim().isNotEmpty)
          'agentModeId': agentModeId!.trim(),
        'permissionPolicy': permissionPolicy,
      };

  factory CodingComposerPrefs.fromJson(Map<String, dynamic> json) {
    final mode = json['mode']?.toString();
    final thinking = json['thinking']?.toString();
    final policy = json['permissionPolicy']?.toString();
    return CodingComposerPrefs(
      mode: mode == 'ask' || mode == 'plan' || mode == 'code' ? mode! : 'code',
      fast: json['fast'] == true,
      thinking: thinking == 'low' ||
              thinking == 'medium' ||
              thinking == 'high' ||
              thinking == 'off'
          ? thinking!
          : 'off',
      model: (json['model'] as String?)?.trim().isNotEmpty == true
          ? (json['model'] as String).trim()
          : null,
      agentModeId: (json['agentModeId'] as String?)?.trim().isNotEmpty == true
          ? (json['agentModeId'] as String).trim()
          : null,
      permissionPolicy: policy == 'safe-only' ||
              policy == 'always-confirm' ||
              policy == 'off'
          ? policy!
          : 'safe-only',
    );
  }
}

const _defaultPrefs = CodingComposerPrefs();

String codingComposerSessionKey({required String kind, required String id}) =>
    '$kind:${id.trim()}';

const _ehModes = [
  CodingAgentModeOption(id: 'default', label: 'Default', workingMode: 'code'),
  CodingAgentModeOption(id: 'plan', label: 'Plan', workingMode: 'plan'),
  CodingAgentModeOption(id: 'review', label: 'Review', workingMode: 'ask'),
];

const _claudeModes = [
  CodingAgentModeOption(id: 'default', label: 'Manual', workingMode: 'code'),
  CodingAgentModeOption(
    id: 'acceptEdits',
    label: 'Accept edits',
    workingMode: 'code',
  ),
  CodingAgentModeOption(id: 'plan', label: 'Plan', workingMode: 'plan'),
  CodingAgentModeOption(id: 'auto', label: 'Auto', workingMode: 'code'),
  CodingAgentModeOption(
    id: 'bypassPermissions',
    label: 'Full (bypass)',
    workingMode: 'code',
  ),
];

const _codexModes = [
  CodingAgentModeOption(id: 'read-only', label: 'Read only', workingMode: 'ask'),
  CodingAgentModeOption(id: 'agent', label: 'Agent', workingMode: 'code'),
  CodingAgentModeOption(
    id: 'agent-full-access',
    label: 'Full access',
    workingMode: 'code',
  ),
];

const _cursorModes = [
  CodingAgentModeOption(id: 'ask', label: 'Ask', workingMode: 'ask'),
  CodingAgentModeOption(id: 'plan', label: 'Plan', workingMode: 'plan'),
  CodingAgentModeOption(id: 'agent', label: 'Agent', workingMode: 'code'),
];

const _sidecarNoMeshPerms = {
  'codex',
  'claudecode',
  'cursor',
  'opencode',
  'codewhale',
  'deepseek-harness',
  'minimax-code',
};

const _sidecarPermsReason =
    'This agent’s Coding run path does not support Mesh permission gating yet.';

const _catalogAskDisabledReason =
    'Ask every time needs an on-screen confirmation. Until that ships, use Safe default (read-only tools auto-run; others stay blocked).';

CodingComposerCapabilities codingComposerCapabilities(String harness) {
  final id = harness.trim();
  if (id == 'envoy-harness') {
    return const CodingComposerCapabilities(
      model: true,
      workingMode: false,
      planSlash: true,
      fast: true,
      thinking: false,
      importSession: true,
      attach: true,
      agentModes: _ehModes,
      canSetMode: true,
      permissions: true,
    );
  }
  if (id == 'pi') {
    return const CodingComposerCapabilities(
      model: true,
      workingMode: true,
      planSlash: false,
      fast: false,
      thinking: false,
      importSession: true,
      attach: true,
      permissions: true,
    );
  }

  const planSlash = {'codex', 'claudecode'};
  const fast = {'codex', 'claudecode'};
  const thinking = {'claudecode', 'codex'};
  final isSidecar = _sidecarNoMeshPerms.contains(id);
  List<CodingAgentModeOption> agentModes = const [];
  if (id == 'claudecode') agentModes = _claudeModes;
  else if (id == 'codex') agentModes = _codexModes;
  else if (id == 'cursor') agentModes = _cursorModes;

  return CodingComposerCapabilities(
    model: true,
    workingMode: agentModes.isEmpty,
    planSlash: planSlash.contains(id),
    fast: fast.contains(id),
    thinking: thinking.contains(id),
    importSession: true,
    attach: true,
    agentModes: agentModes,
    canSetMode: false,
    permissions: true,
    // Catalog ACP honors Safe/Full today; Ask would cancel without a dock.
    permissionAskDisabledReason: isSidecar ? null : _catalogAskDisabledReason,
    permissionFullDisabledReason: isSidecar ? _sidecarPermsReason : null,
  );
}

CodingWorkingMode? workingModeFromAgentMode(
  CodingComposerCapabilities caps,
  String? agentModeId,
) {
  if (agentModeId == null) return null;
  for (final m in caps.agentModes) {
    if (m.id == agentModeId) return m.workingMode;
  }
  return null;
}

Future<Map<String, CodingComposerPrefs>> _loadAll() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(kCodingComposerPrefsKey);
    if (raw == null || raw.isEmpty) return {};
    final parsed = jsonDecode(raw);
    if (parsed is! Map) return {};
    final out = <String, CodingComposerPrefs>{};
    for (final e in parsed.entries) {
      if (e.value is! Map) continue;
      out[e.key.toString()] =
          CodingComposerPrefs.fromJson(Map<String, dynamic>.from(e.value as Map));
    }
    return out;
  } catch (_) {
    return {};
  }
}

Future<void> _saveAll(Map<String, CodingComposerPrefs> all) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    kCodingComposerPrefsKey,
    jsonEncode({for (final e in all.entries) e.key: e.value.toJson()}),
  );
}

Future<CodingComposerPrefs> loadCodingComposerPrefs(String sessionKey) async {
  final all = await _loadAll();
  return all[sessionKey] ?? _defaultPrefs;
}

Future<CodingComposerPrefs> saveCodingComposerPrefs(
  String sessionKey,
  CodingComposerPrefs prefs,
) async {
  final all = await _loadAll();
  all[sessionKey] = prefs;
  await _saveAll(all);
  return prefs;
}

const _askPrefix =
    '[Mode: Ask] Answer questions and explain. Do not edit files unless the user explicitly asks.';
const _planPrefix =
    '[Mode: Plan] Produce a concrete plan only. Do not modify files or run mutating tools yet.';
const _reviewPrefix =
    '[Mode: Review] Review and discuss only. Do not edit files or run mutating tools.';

String shapeCodingComposerPrompt(
  String userText,
  CodingComposerPrefs prefs,
  CodingComposerCapabilities caps,
) {
  final body = userText.trim();
  final parts = <String>[];
  final fromAgent = workingModeFromAgentMode(caps, prefs.agentModeId);
  final mode = fromAgent ?? prefs.mode;

  if (caps.agentModes.isNotEmpty && prefs.agentModeId == 'review') {
    parts.add(_reviewPrefix);
  } else if ((caps.workingMode || caps.agentModes.isNotEmpty) &&
      mode == 'ask') {
    parts.add(_askPrefix);
  } else if ((caps.workingMode || caps.agentModes.isNotEmpty) &&
      mode == 'plan') {
    if (caps.planSlash) {
      return body.isEmpty ? '/plan' : '/plan $body';
    }
    parts.add(_planPrefix);
  }
  if (caps.thinking && prefs.thinking != 'off') {
    if (caps.planSlash || caps.fast) {
      parts.add(
        prefs.thinking == 'low'
            ? '[Thinking: low effort]'
            : prefs.thinking == 'medium'
                ? '[Thinking: medium effort]'
                : '[Thinking: high effort]',
      );
    }
  }
  if (parts.isEmpty) return body;
  if (body.isEmpty) return parts.join('\n');
  return '${parts.join('\n')}\n\n$body';
}

String fastToggleSlash(bool enabled) => enabled ? '/fast on' : '/fast off';
