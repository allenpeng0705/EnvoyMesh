import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_harness_probe.dart';
import '../../coding/coding_projects.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../providers/node_provider.dart';
import '../../utils/open_external_url.dart';
import '../../widgets/coding_agent_fields.dart';
import '../../widgets/home_folder_browser.dart';

enum CodingHarnessChoice {
  envoyHarness,
  pi,
  claudeCode,
  codex,
  openCode,
  cursor,
  codeWhale,
  minimaxCode,
}

bool codingHarnessIsTierB(CodingHarnessChoice h) =>
    h != CodingHarnessChoice.envoyHarness && h != CodingHarnessChoice.pi;

/// Wire harness id (matches `@envoymesh/api` `CodingHarnessId`).
String codingHarnessWireId(CodingHarnessChoice h) {
  switch (h) {
    case CodingHarnessChoice.envoyHarness:
      return 'envoy-harness';
    case CodingHarnessChoice.pi:
      return 'pi';
    case CodingHarnessChoice.claudeCode:
      return 'claudecode';
    case CodingHarnessChoice.codex:
      return 'codex';
    case CodingHarnessChoice.openCode:
      return 'opencode';
    case CodingHarnessChoice.cursor:
      return 'cursor';
    case CodingHarnessChoice.codeWhale:
      return 'codewhale';
    case CodingHarnessChoice.minimaxCode:
      return 'minimax-code';
  }
}

CodingHarnessChoice? codingHarnessFromWireId(String id) {
  switch (id.trim()) {
    case 'envoy-harness':
      return CodingHarnessChoice.envoyHarness;
    case 'pi':
      return CodingHarnessChoice.pi;
    case 'claudecode':
      return CodingHarnessChoice.claudeCode;
    case 'codex':
      return CodingHarnessChoice.codex;
    case 'opencode':
      return CodingHarnessChoice.openCode;
    case 'cursor':
      return CodingHarnessChoice.cursor;
    case 'codewhale':
      return CodingHarnessChoice.codeWhale;
    case 'minimax-code':
      return CodingHarnessChoice.minimaxCode;
    default:
      return null;
  }
}

/// Ext Agent preset id for Tier B; null for Tier A.
String? codingHarnessToExtAgentId(CodingHarnessChoice h) {
  if (!codingHarnessIsTierB(h)) return null;
  return codingHarnessWireId(h);
}

String codingHarnessDisplayName(CodingHarnessChoice h) {
  switch (h) {
    case CodingHarnessChoice.envoyHarness:
      return 'Envoy';
    case CodingHarnessChoice.pi:
      return 'Pi';
    case CodingHarnessChoice.claudeCode:
      return 'Claude Code';
    case CodingHarnessChoice.codex:
      return 'Codex';
    case CodingHarnessChoice.openCode:
      return 'OpenCode';
    case CodingHarnessChoice.cursor:
      return 'Cursor';
    case CodingHarnessChoice.codeWhale:
      return 'CodeWhale';
    case CodingHarnessChoice.minimaxCode:
      return 'MiniMax Code';
  }
}

String _firstRunInstallLabel(
  AppLocalizations l10n, {
  required String hint,
  required String start,
}) {
  final lower = '${hint.toLowerCase()} ${start.toLowerCase()}';
  final firstRun = lower.contains('fetched from npm') ||
      lower.contains('fetched from pypi');
  return firstRun
      ? l10n.codingHarnessFirstRunCmd
      : l10n.codingHarnessInstallCmd;
}

const _allHarnessChoices = <CodingHarnessChoice>[
  CodingHarnessChoice.envoyHarness,
  CodingHarnessChoice.pi,
  CodingHarnessChoice.claudeCode,
  CodingHarnessChoice.codex,
  CodingHarnessChoice.openCode,
  CodingHarnessChoice.cursor,
  CodingHarnessChoice.codeWhale,
  CodingHarnessChoice.minimaxCode,
];

/// Create sheet: agent + model + project folder via [HomeFolderBrowser].
Future<void> showCodingNewTaskSheet(
  BuildContext context,
  WidgetRef ref, {
  String? initialCwd,
  required Future<void> Function(
    CodingHarnessChoice harness,
    String cwd, {
    String? model,
    String? providerKind,
    String? endpoint,
    String? apiKey,
  }) onConfirm,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _CodingNewTaskSheet(
      initialCwd: initialCwd,
      onConfirm: onConfirm,
    ),
  );
}

class _CodingNewTaskSheet extends ConsumerStatefulWidget {
  const _CodingNewTaskSheet({
    required this.onConfirm,
    this.initialCwd,
  });

  final String? initialCwd;
  final Future<void> Function(
    CodingHarnessChoice harness,
    String cwd, {
    String? model,
    String? providerKind,
    String? endpoint,
    String? apiKey,
  }) onConfirm;

  @override
  ConsumerState<_CodingNewTaskSheet> createState() =>
      _CodingNewTaskSheetState();
}

class _CodingNewTaskSheetState extends ConsumerState<_CodingNewTaskSheet> {
  final TextEditingController _pathController = TextEditingController();
  var _harness = CodingHarnessChoice.envoyHarness;
  var _busy = false;
  var _probing = false;
  var _model = '';
  var _providerKind = '';
  var _endpoint = '';
  var _apiKey = '';
  List<String> _homeModels = const [];
  List<CodingProject> _projects = const [];
  Map<CodingHarnessChoice, CodingHarnessProbeResult> _probes = {
    for (final h in _allHarnessChoices)
      h: const CodingHarnessProbeResult(badge: CodingHarnessProbeBadge.checking),
  };

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_bootstrap());
    });
  }

  @override
  void dispose() {
    _pathController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final initial = widget.initialCwd?.trim() ?? '';
    final projects = await loadCodingProjects();
    CodingProject? project;
    if (initial.isNotEmpty) {
      for (final p in projects) {
        if (p.path == initial) {
          project = p;
          break;
        }
      }
    }
    final prefill = await resolveCodingPrefill(
      cwd: initial.isEmpty ? null : initial,
      project: project,
    );
    final choice = codingHarnessFromWireId(prefill.harness);
    if (!mounted) return;
    setState(() {
      _projects = projects;
      if (choice != null) _harness = choice;
      if (prefill.cwd.trim().isNotEmpty) {
        _pathController.text = prefill.cwd.trim();
      } else if (initial.isNotEmpty) {
        _pathController.text = initial;
      }
      _model = prefill.model;
      _providerKind = prefill.providerKind;
      _endpoint = prefill.endpoint;
      _apiKey = prefill.apiKey;
    });

    final client = ref.read(nodeServiceProvider);
    if (client != null) {
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
        final home = codingEnvoyHarnessModelSuggestions(
          modelProviders: mp,
          envoyLocalModelIds: localIds,
        );
        if (mounted) setState(() => _homeModels = home);
      } catch (_) {}
    }
    // Only fall back to home-node defaults when the user has no registered
    // projects yet — otherwise a stale envoyHarnessCwd (often the EnvoyMesh
    // checkout) steals the path after Add project → aiNote.
    if (client != null &&
        _pathController.text.isEmpty &&
        projects.isEmpty) {
      try {
        final cfg = await client.getNodeConfig();
        final envoyCwd = cfg['envoyHarnessCwd']?.toString().trim();
        if (envoyCwd != null &&
            envoyCwd.isNotEmpty &&
            _pathController.text.isEmpty) {
          _pathController.text = envoyCwd;
        }
        if (_pathController.text.isEmpty) {
          final settings = (cfg['piSettings'] as Map?)?.cast<String, dynamic>();
          final paths = settings?['allowedPaths'];
          if (paths is List && paths.isNotEmpty) {
            final first = paths.first?.toString().trim() ?? '';
            if (first.isNotEmpty) _pathController.text = first;
          }
        }
      } catch (_) {}
    }
    if (_pathController.text.isEmpty && projects.isNotEmpty) {
      _pathController.text = projects.first.path;
    }
    if (mounted) setState(() {});
    await _probeAll();
  }

  Future<void> _probeAll() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || !mounted) return;
    setState(() => _probing = true);
    final next = <CodingHarnessChoice, CodingHarnessProbeResult>{};
    await Future.wait(
      _allHarnessChoices.map((h) async {
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
        _harness,
        _allHarnessChoices,
        (h) => next[h],
      );
      if (snapped != null) _harness = snapped;
    });
  }

  Future<void> _showResolveGuide(CodingHarnessChoice choice) async {
    final l10n = AppLocalizations.of(context);
    final probe = _probes[choice];
    final name = choice == CodingHarnessChoice.minimaxCode
        ? l10n.codingHarnessMinimax
        : choice == CodingHarnessChoice.envoyHarness
            ? l10n.chatsCodingEh
            : choice == CodingHarnessChoice.pi
                ? l10n.chatsCodingPi
                : codingHarnessDisplayName(choice);
    final cmd = probe?.installCommand?.trim() ?? '';
    final hint = probe?.hint?.trim() ?? '';
    final start = probe?.startHint?.trim() ?? '';
    final link = probe?.installLink?.trim() ?? '';

    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: Text(l10n.codingHarnessResolveTitle(name)),
          content: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  hint.isNotEmpty
                      ? hint
                      : l10n.codingHarnessResolveBody(name),
                ),
                if (start.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(start, style: Theme.of(ctx).textTheme.bodySmall),
                ],
                if (cmd.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    _firstRunInstallLabel(l10n, hint: hint, start: start),
                    style: Theme.of(ctx).textTheme.labelLarge,
                  ),
                  const SizedBox(height: 4),
                  SelectableText(
                    cmd,
                    style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                  ),
                ],
              ],
            ),
          ),
          actions: [
            if (cmd.isNotEmpty)
              TextButton(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: cmd));
                  if (ctx.mounted) {
                    ScaffoldMessenger.of(ctx).showSnackBar(
                      SnackBar(content: Text(l10n.codingHarnessCmdCopied)),
                    );
                  }
                },
                child: Text(l10n.codingHarnessCopyCmd),
              ),
            if (link.isNotEmpty)
              TextButton(
                onPressed: () async {
                  await openExternalUrl(link);
                },
                child: Text(l10n.codingHarnessOpenDocs),
              ),
            TextButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                unawaited(_probeAll());
              },
              child: Text(l10n.commonRefresh),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: Text(l10n.commonClose),
            ),
          ],
        );
      },
    );
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
    final probe = _probes[_harness];
    final badge = probe?.badge;
    if (badge == CodingHarnessProbeBadge.notReady) {
      await _showResolveGuide(_harness);
      return;
    }
    setState(() => _busy = true);
    try {
      final wireHarness = codingHarnessWireId(_harness);
      final model = _model.trim();
      final providerKind = _providerKind.trim();
      final endpoint = _endpoint.trim();
      final apiKey = _apiKey.trim();
      await saveCodingLastUsedPrefill(
        CodingTaskPrefill(
          harness: wireHarness,
          model: model,
          providerKind: providerKind,
          endpoint: endpoint,
          apiKey: apiKey,
          cwd: path,
        ),
      );
      await seedCodingProjectDefaultsIfEmpty(
        path,
        harness: wireHarness,
        model: model.isEmpty ? null : model,
        providerKind: providerKind.isEmpty ? null : providerKind,
        endpoint: endpoint.isEmpty ? null : endpoint,
        apiKey: apiKey.isEmpty ? null : apiKey,
      );
      await widget.onConfirm(
        _harness,
        path,
        model: model.isEmpty ? null : model,
        providerKind: providerKind.isEmpty ? null : providerKind,
        endpoint: endpoint.isEmpty ? null : endpoint,
        apiKey: apiKey.isEmpty ? null : apiKey,
      );
      if (mounted) Navigator.of(context).pop();
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
    final mayUseCoding = ref.watch(nodeProvider).mayUseCoding;
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
              Row(
                children: [
                  Expanded(
                    child: Text(
                      l10n.codingNewTaskTitle,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
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
              const SizedBox(height: 8),
              Text(
                l10n.codingNewTaskDesc,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
              Text(
                l10n.codingHarnessProbeHint,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
              if (_projects.isNotEmpty) ...[
                const SizedBox(height: 12),
                SizedBox(
                  height: 36,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      for (final p in _projects.take(8))
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ActionChip(
                            label: Text(p.label),
                            onPressed: _busy
                                ? null
                                : () async {
                                    final next = await resolveCodingPrefill(
                                      cwd: p.path,
                                      project: p,
                                    );
                                    if (!mounted) return;
                                    setState(() {
                                      _pathController.text = p.path;
                                      final c =
                                          codingHarnessFromWireId(next.harness);
                                      if (c != null) _harness = c;
                                      _model = next.model;
                                      _providerKind = next.providerKind;
                                      _endpoint = next.endpoint;
                                      _apiKey = next.apiKey;
                                    });
                                  },
                          ),
                        ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 16),
              CodingAgentFields(
                value: CodingAgentFieldsValue(
                  harness: _harness,
                  model: _model,
                  providerKind: _providerKind,
                  endpoint: _endpoint,
                  apiKey: _apiKey,
                ),
                onChanged: (next) {
                  setState(() {
                    _harness = next.harness;
                    _model = next.model;
                    _providerKind = next.providerKind;
                    _endpoint = next.endpoint;
                    _apiKey = next.apiKey;
                  });
                },
                enabledHarnesses: [
                  for (final h in _allHarnessChoices)
                    if (h == CodingHarnessChoice.envoyHarness ||
                        h == CodingHarnessChoice.pi ||
                        mayUseCoding)
                      h,
                ],
                probes: _probes,
                client: client,
                homeModels: _homeModels,
                busy: _busy,
                harnessAsRadios: true,
              ),
              const SizedBox(height: 8),
              Text(
                l10n.chatsPiFolder,

                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _pathController.text.trim().isEmpty
                          ? l10n.chatsPiFolderHint
                          : _pathController.text.trim(),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        color: _pathController.text.trim().isEmpty
                            ? Theme.of(context).colorScheme.onSurfaceVariant
                            : Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () async {
                            final c = ref.read(nodeServiceProvider);
                            if (c == null) return;
                            final picked = await HomeFolderBrowser.open(
                              context,
                              client: c,
                              initialPath: _pathController.text.trim().isEmpty
                                  ? null
                                  : _pathController.text.trim(),
                            );
                            if (picked == null) return;
                            setState(() => _pathController.text = picked);
                          },
                    child: Text(l10n.knowledgePanelBrowse),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy ||
                        _probes[_harness]?.badge !=
                            CodingHarnessProbeBadge.ready
                    ? null
                    : () => unawaited(_submit()),
                child: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(l10n.codingStartTask),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
