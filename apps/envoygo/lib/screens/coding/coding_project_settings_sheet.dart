import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_harness_probe.dart';
import '../../coding/coding_projects.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../widgets/coding_agent_fields.dart';
import 'coding_new_task_sheet.dart';

/// Edit a project's name and default coding agent (Social project settings).
Future<CodingProject?> showCodingProjectSettingsSheet(
  BuildContext context,
  WidgetRef ref, {
  required CodingProject project,
}) {
  return showModalBottomSheet<CodingProject>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _CodingProjectSettingsSheet(project: project),
  );
}

const _settingsHarnessChoices = <CodingHarnessChoice>[
  CodingHarnessChoice.envoyHarness,
  CodingHarnessChoice.pi,
  CodingHarnessChoice.claudeCode,
  CodingHarnessChoice.codex,
  CodingHarnessChoice.openCode,
  CodingHarnessChoice.cursor,
  CodingHarnessChoice.codeWhale,
  CodingHarnessChoice.minimaxCode,
];

class _CodingProjectSettingsSheet extends ConsumerStatefulWidget {
  const _CodingProjectSettingsSheet({required this.project});

  final CodingProject project;

  @override
  ConsumerState<_CodingProjectSettingsSheet> createState() =>
      _CodingProjectSettingsSheetState();
}

class _CodingProjectSettingsSheetState
    extends ConsumerState<_CodingProjectSettingsSheet> {
  late final TextEditingController _labelController;
  late CodingAgentFieldsValue _agent;
  var _busy = false;
  var _probing = false;
  List<String> _homeModels = const [];
  Map<CodingHarnessChoice, CodingHarnessProbeResult> _probes = {
    for (final h in _settingsHarnessChoices)
      h: const CodingHarnessProbeResult(badge: CodingHarnessProbeBadge.checking),
  };

  @override
  void initState() {
    super.initState();
    _labelController = TextEditingController(text: widget.project.label);
    final harness = codingHarnessFromWireId(widget.project.defaultHarness ?? '') ??
        CodingHarnessChoice.envoyHarness;
    _agent = CodingAgentFieldsValue(
      harness: harness,
      model: widget.project.defaultModel ?? '',
      providerKind: widget.project.defaultProviderKind ?? '',
      endpoint: widget.project.defaultEndpoint ?? '',
      apiKey: widget.project.defaultApiKey ?? '',
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_probeAll());
      unawaited(_loadHomeModels());
    });
  }

  @override
  void dispose() {
    _labelController.dispose();
    super.dispose();
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
      _settingsHarnessChoices.map((h) async {
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
        _settingsHarnessChoices,
        (h) => next[h],
      );
      if (snapped != null && snapped != _agent.harness) {
        _agent = _agent.copyWith(
          harness: snapped,
          model: '',
          providerKind: '',
          endpoint: '',
          apiKey: '',
        );
      }
    });
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final label = _labelController.text.trim();
    if (label.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.codingProjectNameLabel)),
      );
      return;
    }
    if (_probes[_agent.harness]?.badge != CodingHarnessProbeBadge.ready) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.codingHarnessNoneReady)),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      await updateCodingProject(
        widget.project.path,
        label: label,
        defaultHarness: codingHarnessWireId(_agent.harness),
        defaultModel: _agent.model.trim(),
        defaultProviderKind: _agent.providerKind.trim(),
        defaultEndpoint: _agent.endpoint.trim(),
        defaultApiKey: _agent.apiKey.trim(),
      );
      final projects = await loadCodingProjects();
      CodingProject? saved;
      for (final p in projects) {
        if (p.path == widget.project.path) {
          saved = p;
          break;
        }
      }
      if (!mounted) return;
      Navigator.of(context).pop(saved ?? widget.project);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final client = ref.watch(nodeServiceProvider);

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
                l10n.codingProjectSettingsTitle,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                l10n.codingProjectSettingsDesc,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                widget.project.path,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _labelController,
                enabled: !_busy,
                decoration: InputDecoration(
                  labelText: l10n.codingProjectNameLabel,
                  border: const OutlineInputBorder(),
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
                enabledHarnesses: _settingsHarnessChoices,
                probes: _probes,
                client: client,
                homeModels: _homeModels,
                busy: _busy,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy ? null : () => unawaited(_submit()),
                child: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(l10n.codingProjectSettingsSave),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
