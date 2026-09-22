import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_harness_probe.dart';
import '../../coding/coding_projects.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../widgets/coding_agent_fields.dart';
import '../../widgets/home_folder_browser.dart';
import 'coding_new_task_sheet.dart';

/// Register a folder as a Coding project (parity with Social Add project).
Future<CodingProject?> showCodingAddProjectSheet(
  BuildContext context,
  WidgetRef ref,
) {
  return showModalBottomSheet<CodingProject>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => const _CodingAddProjectSheet(),
  );
}

const _addProjectHarnessChoices = <CodingHarnessChoice>[
  CodingHarnessChoice.envoyHarness,
  CodingHarnessChoice.pi,
  CodingHarnessChoice.claudeCode,
  CodingHarnessChoice.codex,
  CodingHarnessChoice.openCode,
  CodingHarnessChoice.cursor,
  CodingHarnessChoice.codeWhale,
  CodingHarnessChoice.minimaxCode,
];

class _CodingAddProjectSheet extends ConsumerStatefulWidget {
  const _CodingAddProjectSheet();

  @override
  ConsumerState<_CodingAddProjectSheet> createState() =>
      _CodingAddProjectSheetState();
}

class _CodingAddProjectSheetState extends ConsumerState<_CodingAddProjectSheet> {
  final TextEditingController _pathController = TextEditingController();
  var _agent = const CodingAgentFieldsValue(
    harness: CodingHarnessChoice.envoyHarness,
  );
  var _busy = false;
  var _probing = false;
  List<String> _homeModels = const [];
  Map<CodingHarnessChoice, CodingHarnessProbeResult> _probes = {
    for (final h in _addProjectHarnessChoices)
      h: const CodingHarnessProbeResult(badge: CodingHarnessProbeBadge.checking),
  };

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_probeAll());
      unawaited(_loadHomeModels());
    });
  }

  @override
  void dispose() {
    _pathController.dispose();
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
      _addProjectHarnessChoices.map((h) async {
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
        _addProjectHarnessChoices,
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

  Future<void> _browse() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final l10n = AppLocalizations.of(context);
    final picked = await HomeFolderBrowser.open(
      context,
      client: client,
      initialPath: _pathController.text.trim().isEmpty
          ? null
          : _pathController.text.trim(),
      title: l10n.codingAddProjectTitle,
    );
    if (picked == null || !mounted) return;
    setState(() => _pathController.text = picked);
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final path = normalizeCodingProjectPath(_pathController.text);
    if (path.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chatsPiFolderRequired)),
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
      final project = await addCodingProject(
        path,
        defaultHarness: codingHarnessWireId(_agent.harness),
        defaultModel: _agent.model.trim().isEmpty ? null : _agent.model.trim(),
        defaultProviderKind:
            _agent.providerKind.trim().isEmpty ? null : _agent.providerKind.trim(),
        defaultEndpoint:
            _agent.endpoint.trim().isEmpty ? null : _agent.endpoint.trim(),
        defaultApiKey: _agent.apiKey.trim().isEmpty ? null : _agent.apiKey.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pop(project);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e
                .toString()
                .replaceFirst('Exception: ', '')
                .replaceFirst('Bad state: ', ''),
          ),
        ),
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
                l10n.codingAddProjectTitle,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                l10n.codingAddProjectDesc,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _pathController,
                enabled: !_busy,
                decoration: InputDecoration(
                  labelText: l10n.chatsPiFolder,
                  hintText: l10n.chatsPiFolderHint,
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    tooltip: l10n.knowledgePanelBrowse,
                    onPressed: _busy || client == null
                        ? null
                        : () => unawaited(_browse()),
                    icon: const Icon(Icons.folder_open),
                  ),
                ),
              ),
              const SizedBox(height: 16),
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
                enabledHarnesses: _addProjectHarnessChoices,
                probes: _probes,
                client: client,
                homeModels: _homeModels,
                busy: _busy,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy ||
                        _probes[_agent.harness]?.badge !=
                            CodingHarnessProbeBadge.ready
                    ? null
                    : () => unawaited(_submit()),
                child: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(l10n.codingAddProjectConfirm),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
