// Start a team job on the home node (preview → launch).
//
// Mirrors Social's one-click flow with a phone-sized surface: goal,
// skill/role assignment mode, plan preview, light worker picker, then start.
// Advanced fleet / iteration setup stays on Social.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/node_provider.dart';
import '../../services/node_service_client.dart';

class StartChainScreen extends ConsumerStatefulWidget {
  const StartChainScreen({super.key});

  @override
  ConsumerState<StartChainScreen> createState() => _StartChainScreenState();
}

class _StartChainScreenState extends ConsumerState<StartChainScreen> {
  final _goalCtl = TextEditingController();
  String _assignmentMode = 'skill';
  bool _loadingDefaults = true;
  bool _previewing = false;
  bool _starting = false;
  String? _error;
  Map<String, dynamic>? _preview;
  int? _iterationMaxRounds;
  String? _iterationJudgeMode;
  int? _extendMaxStepsPerRound;
  /// Selected agent peer ids for start (auto-seeded from suggested workers).
  final Set<String> _selectedWorkerPeerIds = {};
  bool _workerSelectionTouched = false;
  /// Home Join Agent Network — used for Phase 58A readiness hints.
  bool? _localJoinEnabled;

  static const _minGoalLen = 8;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadDefaults());
  }

  @override
  void dispose() {
    _goalCtl.dispose();
    super.dispose();
  }

  NodeServiceClient? _clientOrNull() {
    final home = ref.read(nodeProvider.notifier).client;
    if (home == null || !home.isConnected) return null;
    return NodeServiceClient(home);
  }

  Future<void> _loadDefaults() async {
    final client = _clientOrNull();
    if (client == null) {
      if (!mounted) return;
      setState(() {
        _loadingDefaults = false;
        _error = AppLocalizations.of(context).commonNotConnectedHome;
      });
      return;
    }
    try {
      final defaults = await client.chainGetDefaults();
      bool? join;
      try {
        final cfg = await client.getNodeConfig();
        join = cfg['capabilityProviderEnabled'] == true;
      } catch (_) {
        join = null;
      }
      if (!mounted) return;
      final mode = defaults['assignmentMode'] as String?;
      setState(() {
        _assignmentMode = mode == 'role' ? 'role' : 'skill';
        _iterationMaxRounds = defaults['iterationMaxRounds'] as int?;
        _iterationJudgeMode = defaults['iterationJudgeMode'] as String?;
        _extendMaxStepsPerRound = defaults['extendMaxStepsPerRound'] as int?;
        _localJoinEnabled = join;
        _loadingDefaults = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingDefaults = false;
        _error = e.toString();
      });
    }
  }

  List<Map<String, dynamic>> get _subtasks {
    final raw = _preview?['subtasks'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  List<Map<String, dynamic>> get _warnings {
    final raw = _preview?['planWarnings'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  List<Map<String, dynamic>> get _suggestedWorkers {
    final raw = _preview?['suggestedWorkers'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  /// Suggested workers plus any plan assignees missing from that list.
  List<Map<String, dynamic>> get _workerPickerRows {
    final byId = <String, Map<String, dynamic>>{};
    for (final w in _suggestedWorkers) {
      final id = (w['peerId'] as String?) ?? '';
      if (id.isEmpty) continue;
      byId[id] = w;
    }
    for (final s in _subtasks) {
      final id = (s['preferredWorkerPeerId'] as String?) ?? '';
      if (id.isEmpty || byId.containsKey(id)) continue;
      byId[id] = {
        'peerId': id,
        'summary': '',
        'online': false,
        'viaRelay': false,
        'matchedSubtaskIds': [s['subtaskId']].whereType<String>().toList(),
        'assigned': true,
      };
    }
    return byId.values.toList();
  }

  bool get _previewOk => _preview?['ok'] == true && _subtasks.isNotEmpty;

  void _seedWorkersFromPreview(Map<String, dynamic> result) {
    if (_workerSelectionTouched) return;
    final suggestedOnline = <String>{};
    for (final w in (result['suggestedWorkers'] as List? ?? const [])) {
      if (w is! Map) continue;
      final id = w['peerId'] as String?;
      if (id == null || id.isEmpty) continue;
      if (w['online'] == true) suggestedOnline.add(id);
    }
    final ids = <String>{};
    for (final s in (result['subtasks'] as List? ?? const [])) {
      if (s is! Map) continue;
      final id = s['preferredWorkerPeerId'] as String?;
      // Only auto-select assignees that are also online in the suggested pool.
      if (id != null && id.isNotEmpty && suggestedOnline.contains(id)) {
        ids.add(id);
      }
    }
    ids.addAll(suggestedOnline);
    _selectedWorkerPeerIds
      ..clear()
      ..addAll(ids);
  }

  Future<void> _previewPlan() async {
    final l10n = AppLocalizations.of(context);
    final goal = _goalCtl.text.trim();
    if (goal.length < _minGoalLen) {
      setState(() => _error = l10n.chainsStartGoalTooShort(_minGoalLen));
      return;
    }
    final client = _clientOrNull();
    if (client == null) {
      setState(() => _error = l10n.commonNotConnectedHome);
      return;
    }
    setState(() {
      _previewing = true;
      _error = null;
      _preview = null;
    });
    try {
      final result = await client.chainPreviewGoal(
        goal: goal,
        assignmentMode: _assignmentMode,
      );
      if (!mounted) return;
      if (result['ok'] != true) {
        setState(() {
          _previewing = false;
          _preview = result;
          _selectedWorkerPeerIds.clear();
          _error = (result['reason'] as String?)?.isNotEmpty == true
              ? result['reason'] as String
              : l10n.chainsStartPreviewFailed;
        });
        return;
      }
      setState(() {
        _previewing = false;
        _preview = result;
        _seedWorkersFromPreview(result);
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _previewing = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _startJob() async {
    final l10n = AppLocalizations.of(context);
    final goal = _goalCtl.text.trim();
    if (!_previewOk) {
      setState(() => _error = l10n.chainsStartNeedPreview);
      return;
    }
    if (_workerSelectionTouched && _selectedWorkerPeerIds.isEmpty) {
      setState(() => _error = l10n.chainsStartNeedWorkers);
      return;
    }
    final client = _clientOrNull();
    if (client == null) {
      setState(() => _error = l10n.commonNotConnectedHome);
      return;
    }
    setState(() {
      _starting = true;
      _error = null;
    });
    try {
      final planned = _subtasks
          .map((s) => <String, dynamic>{
                'subtaskId': s['subtaskId'],
                'depth': s['depth'] ?? 1,
                'requiredSkill': s['requiredSkill'] ?? '',
                if (s['requiredRole'] != null) 'requiredRole': s['requiredRole'],
                'objective': s['objective'] ?? '',
                if (s['requestedResult'] != null)
                  'requestedResult': s['requestedResult'],
                if (s['constraints'] != null) 'constraints': s['constraints'],
                if (s['dependsOn'] != null) 'dependsOn': s['dependsOn'],
                if (s['costCeilingUsd'] != null)
                  'costCeilingUsd': s['costCeilingUsd'],
                if (s['deadlineAt'] != null) 'deadlineAt': s['deadlineAt'],
                if (s['preferredWorkerPeerId'] != null)
                  'preferredWorkerPeerId': s['preferredWorkerPeerId'],
                if (s['createdAt'] != null) 'createdAt': s['createdAt'],
              })
          .toList();
      final result = await client.chainStartFromGoal(
        goal: goal,
        assignmentMode: _assignmentMode,
        plannedSubtasks: planned,
        planWarnings: _warnings.isEmpty ? null : _warnings,
        preferredWorkerPeerIds: _selectedWorkerPeerIds.isEmpty
            ? null
            : _selectedWorkerPeerIds.toList(),
        iterationMaxRounds: _iterationMaxRounds,
        iterationJudgeMode: _iterationJudgeMode,
        extendMaxStepsPerRound: _extendMaxStepsPerRound,
      );
      if (!mounted) return;
      if (result['ok'] != true) {
        final err = result['error'] as String?;
        setState(() {
          _starting = false;
          _error = err == 'no_workers'
              ? l10n.chainsStartNoWorkers
              : (err?.isNotEmpty == true ? err! : l10n.chainsStartFailed);
        });
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chainsStartStarted)),
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _starting = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final busy = _previewing || _starting || _loadingDefaults;
    final workerRows = _workerPickerRows;
    final startBlockedByEmptyWorkers =
        _workerSelectionTouched && _selectedWorkerPeerIds.isEmpty;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.chainsStartTitle)),
      body: _loadingDefaults
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  l10n.chainsStartIntro,
                  style: theme.textTheme.bodySmall,
                ),
                if (_localJoinEnabled == false ||
                    (_error != null &&
                        (_error == l10n.chainsStartNoWorkers ||
                            _error!.contains('no_workers')))) ...[
                  const SizedBox(height: 12),
                  _FleetReadinessHints(
                    joinOff: _localJoinEnabled == false,
                    l10n: l10n,
                    theme: theme,
                  ),
                ],
                const SizedBox(height: 16),
                Text(
                  l10n.chainsStartAssignmentMode,
                  style: theme.textTheme.titleSmall,
                ),
                const SizedBox(height: 8),
                SegmentedButton<String>(
                  segments: [
                    ButtonSegment(
                      value: 'skill',
                      label: Text(l10n.chainsStartModeSkill),
                      icon: const Icon(Icons.handyman_outlined),
                    ),
                    ButtonSegment(
                      value: 'role',
                      label: Text(l10n.chainsStartModeRole),
                      icon: const Icon(Icons.badge_outlined),
                    ),
                  ],
                  selected: {_assignmentMode},
                  onSelectionChanged: busy
                      ? null
                      : (next) {
                          if (next.isEmpty) return;
                          setState(() {
                            _assignmentMode = next.first;
                            _preview = null;
                            _selectedWorkerPeerIds.clear();
                            _workerSelectionTouched = false;
                          });
                        },
                ),
                const SizedBox(height: 8),
                Text(
                  _assignmentMode == 'role'
                      ? l10n.chainsStartModeRoleHint
                      : l10n.chainsStartModeSkillHint,
                  style: theme.textTheme.bodySmall,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _goalCtl,
                  enabled: !busy,
                  minLines: 4,
                  maxLines: 8,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    labelText: l10n.chainsStartGoalLabel,
                    hintText: l10n.chainsStartGoalHint,
                    alignLabelWithHint: true,
                    border: const OutlineInputBorder(),
                  ),
                  onChanged: (_) {
                    if (_preview != null) {
                      setState(() {
                        _preview = null;
                        _selectedWorkerPeerIds.clear();
                        _workerSelectionTouched = false;
                      });
                    }
                  },
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: TextStyle(color: theme.colorScheme.error),
                  ),
                ],
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: busy ? null : _previewPlan,
                  icon: _previewing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.preview_outlined),
                  label: Text(
                    _previewing
                        ? l10n.chainsStartPreviewing
                        : l10n.chainsStartPreview,
                  ),
                ),
                if (_preview != null) ...[
                  const SizedBox(height: 20),
                  Text(
                    l10n.chainsStartPlanHeading,
                    style: theme.textTheme.titleMedium,
                  ),
                  if (_warnings.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    ..._warnings.map((w) {
                      final msg = (w['message'] as String?)?.trim();
                      final code = (w['code'] as String?) ?? '';
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Text(
                          msg?.isNotEmpty == true ? msg! : code,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.tertiary,
                          ),
                        ),
                      );
                    }),
                  ],
                  const SizedBox(height: 8),
                  if (_subtasks.isEmpty)
                    Text(
                      l10n.chainsStartNoSubtasks,
                      style: theme.textTheme.bodySmall,
                    )
                  else
                    ..._subtasks.asMap().entries.map((entry) {
                      final i = entry.key;
                      final s = entry.value;
                      final skill = (s['requiredSkill'] as String?) ?? '';
                      final role = (s['requiredRole'] as String?)?.trim();
                      final objective =
                          (s['objective'] as String?)?.trim() ?? '';
                      final meta = [
                        if (role != null && role.isNotEmpty) role,
                        if (skill.isNotEmpty) skill,
                      ].join(' · ');
                      return Card(
                        child: ListTile(
                          leading: CircleAvatar(
                            radius: 14,
                            child: Text('${i + 1}'),
                          ),
                          title: Text(
                            objective.isNotEmpty
                                ? objective
                                : (s['subtaskId'] as String? ?? ''),
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: meta.isEmpty ? null : Text(meta),
                        ),
                      );
                    }),
                  const SizedBox(height: 20),
                  Text(
                    l10n.chainsStartWorkersHeading,
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l10n.chainsStartWorkersHint,
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 8),
                  if (workerRows.isEmpty)
                    Text(
                      l10n.chainsStartNoSuggestedWorkers,
                      style: theme.textTheme.bodySmall,
                    )
                  else
                    ...workerRows.map((w) {
                      final peerId = (w['peerId'] as String?) ?? '';
                      final summary = (w['summary'] as String?)?.trim();
                      final online = w['online'] == true;
                      final viaRelay = w['viaRelay'] == true;
                      final matched =
                          (w['matchedSubtaskIds'] as List?)?.length ?? 0;
                      final selected = _selectedWorkerPeerIds.contains(peerId);
                      final subtitle = [
                        if (summary != null && summary.isNotEmpty) summary,
                        if (matched > 0)
                          l10n.chainsStartWorkerMatches(matched),
                        if (online)
                          viaRelay
                              ? l10n.chainsStartWorkerRelay
                              : l10n.chainsStartWorkerOnline
                        else
                          l10n.chainsStartWorkerOffline,
                      ].join(' · ');
                      return CheckboxListTile(
                        value: selected,
                        onChanged: busy || peerId.isEmpty || !online
                            ? null
                            : (v) {
                                setState(() {
                                  _workerSelectionTouched = true;
                                  if (v == true) {
                                    _selectedWorkerPeerIds.add(peerId);
                                  } else {
                                    _selectedWorkerPeerIds.remove(peerId);
                                  }
                                });
                              },
                        title: Text(
                          peerId.length > 20
                              ? '${peerId.substring(0, 16)}…'
                              : peerId,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: online
                                ? null
                                : theme.colorScheme.onSurface
                                    .withValues(alpha: 0.45),
                          ),
                        ),
                        subtitle: Text(subtitle),
                        controlAffinity: ListTileControlAffinity.leading,
                        dense: true,
                      );
                    }),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: (!_previewOk ||
                            busy ||
                            startBlockedByEmptyWorkers)
                        ? null
                        : _startJob,
                    icon: _starting
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.play_arrow),
                    label: Text(
                      _starting
                          ? l10n.chainsStartStarting
                          : l10n.chainsStartConfirm,
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}

/// Phase 58A — thin phone checklist (CTAs live on home Social).
class _FleetReadinessHints extends StatelessWidget {
  const _FleetReadinessHints({
    required this.joinOff,
    required this.l10n,
    required this.theme,
  });

  final bool joinOff;
  final AppLocalizations l10n;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final steps = <String>[
      if (joinOff) l10n.chainsStartReadinessJoinOff,
      l10n.chainsStartReadinessBond,
      l10n.chainsStartReadinessRefresh,
    ];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l10n.chainsStartReadinessTitle,
              style: theme.textTheme.titleSmall,
            ),
            const SizedBox(height: 8),
            for (var i = 0; i < steps.length; i++) ...[
              if (i > 0) const SizedBox(height: 6),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${i + 1}. ', style: theme.textTheme.bodySmall),
                  Expanded(
                    child: Text(steps[i], style: theme.textTheme.bodySmall),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
