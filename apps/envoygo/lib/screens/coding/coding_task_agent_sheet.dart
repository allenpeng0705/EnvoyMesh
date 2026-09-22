import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_harness_probe.dart';
import '../../coding/coding_projects.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/coding_ext_sessions.dart';
import '../../services/product/node_service_client.dart';
import '../../widgets/coding_agent_fields.dart';
import 'coding_new_task_sheet.dart';

/// Change the agent/model for one existing Coding task (Social task agent).
Future<CodingAgentFieldsValue?> showCodingTaskAgentSheet(
  BuildContext context,
  WidgetRef ref, {
  required String taskTitle,
  required CodingAgentFieldsValue initial,
}) {
  return showModalBottomSheet<CodingAgentFieldsValue>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _CodingTaskAgentSheet(
      taskTitle: taskTitle,
      initial: initial,
    ),
  );
}

const _taskHarnessChoices = <CodingHarnessChoice>[
  CodingHarnessChoice.envoyHarness,
  CodingHarnessChoice.pi,
  CodingHarnessChoice.claudeCode,
  CodingHarnessChoice.codex,
  CodingHarnessChoice.openCode,
  CodingHarnessChoice.cursor,
  CodingHarnessChoice.codeWhale,
  CodingHarnessChoice.minimaxCode,
];

class _CodingTaskAgentSheet extends ConsumerStatefulWidget {
  const _CodingTaskAgentSheet({
    required this.taskTitle,
    required this.initial,
  });

  final String taskTitle;
  final CodingAgentFieldsValue initial;

  @override
  ConsumerState<_CodingTaskAgentSheet> createState() =>
      _CodingTaskAgentSheetState();
}

class _CodingTaskAgentSheetState extends ConsumerState<_CodingTaskAgentSheet> {
  late CodingAgentFieldsValue _agent;
  var _busy = false;
  var _probing = false;
  List<String> _homeModels = const [];
  Map<CodingHarnessChoice, CodingHarnessProbeResult> _probes = {
    for (final h in _taskHarnessChoices)
      h: const CodingHarnessProbeResult(badge: CodingHarnessProbeBadge.checking),
  };

  @override
  void initState() {
    super.initState();
    _agent = widget.initial;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_probeAll());
      unawaited(_loadHomeModels());
    });
  }

  Future<void> _loadHomeModels() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final cfg = await client.getNodeConfig();
      final mp = (cfg['modelProviders'] as Map?)?.cast<String, dynamic>();
      final localIds = <String>[];
      try {
        final installed = await client.listEnvoyLocalInstalledModels();
        for (final row in installed) {
          final id = row['id']?.toString() ?? row['model']?.toString() ?? '';
          if (id.trim().isNotEmpty) localIds.add(id.trim());
        }
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _homeModels = codingEnvoyHarnessModelSuggestions(
          modelProviders: mp,
          envoyLocalModelIds: localIds,
        );
      });
    } catch (_) {}
  }

  Future<void> _probeAll() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || !mounted) return;
    setState(() => _probing = true);
    final next = <CodingHarnessChoice, CodingHarnessProbeResult>{};
    await Future.wait(
      _taskHarnessChoices.map((h) async {
        next[h] = await probeCodingHarnessByWireId(
          client,
          wireId: codingHarnessWireId(h),
          extAgentId: codingHarnessToExtAgentId(h),
        );
      }),
    );
    if (!mounted) return;
    setState(() {
      _probes = next;
      _probing = false;
      final snapped = snapCodingHarnessToReady(
        _agent.harness,
        _taskHarnessChoices,
        (h) => next[h],
      );
      if (snapped != null && snapped != _agent.harness) {
        _agent = CodingAgentFieldsValue(
          harness: snapped,
          model: '',
          providerKind: '',
          endpoint: '',
          apiKey: '',
        );
      }
    });
  }

  bool get _dirty =>
      _agent.harness != widget.initial.harness ||
      _agent.model.trim() != widget.initial.model.trim() ||
      _agent.providerKind.trim() != widget.initial.providerKind.trim() ||
      _agent.endpoint.trim() != widget.initial.endpoint.trim() ||
      _agent.apiKey.trim() != widget.initial.apiKey.trim();

  Future<void> _submit() async {
    if (!_dirty) {
      if (mounted) Navigator.of(context).pop();
      return;
    }
    if (_probes[_agent.harness]?.badge != CodingHarnessProbeBadge.ready) {
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.codingHarnessNoneReady)),
      );
      return;
    }
    setState(() => _busy = true);
    if (!mounted) return;
    Navigator.of(context).pop(_agent);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final client = ref.watch(nodeServiceProvider);
    final switching = _agent.harness != widget.initial.harness;

    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
      ),
      child: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.codingTaskAgentTitle,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                l10n.codingTaskAgentDesc,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                widget.taskTitle,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Spacer(),
                  if (_probing)
                    const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  else
                    IconButton(
                      tooltip: l10n.commonRefresh,
                      onPressed: client == null
                          ? null
                          : () => unawaited(_probeAll()),
                      icon: const Icon(Icons.refresh, size: 20),
                    ),
                ],
              ),
              CodingAgentFields(
                value: _agent,
                onChanged: (next) => setState(() => _agent = next),
                enabledHarnesses: _taskHarnessChoices,
                probes: _probes,
                client: client,
                homeModels: _homeModels,
                busy: _busy,
              ),
              if (switching) ...[
                const SizedBox(height: 8),
                Text(
                  l10n.codingTaskAgentSwitchHint,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
              ],
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy || !_dirty
                    ? null
                    : () => unawaited(_submit()),
                child: Text(l10n.codingTaskAgentSave),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Apply a saved task-agent value to a Tier B session (same harness family).
Future<CodingExtSession?> applyCodingExtTaskAgent({
  required NodeServiceClient? client,
  required CodingExtSession session,
  required CodingAgentFieldsValue next,
}) async {
  final wire = codingHarnessWireId(next.harness);
  if (!isCodingTierBHarnessId(wire)) return null;
  final updated = await updateCodingExtSessionAgent(
    session.id,
    harness: wire,
    model: next.model,
    providerKind: next.providerKind,
    endpoint: next.endpoint,
  );
  if (updated == null) return null;
  if (client != null) {
    await client.setCodingHarnessRuntime(
      codingSessionId: updated.id,
      cwd: updated.cwd,
      runtime: {
        if (next.model.trim().isNotEmpty) 'model': next.model.trim(),
        if (next.providerKind.trim().isNotEmpty)
          'providerKind': next.providerKind.trim(),
        if (next.endpoint.trim().isNotEmpty) 'endpoint': next.endpoint.trim(),
        if (next.apiKey.trim().isNotEmpty) 'apiKey': next.apiKey.trim(),
      },
    );
  }
  return updated;
}
