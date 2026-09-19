import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_heartbeat.dart';
import '../../coding/coding_schedule.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/product/node_service_client.dart';
import '../../widgets/home_folder_browser.dart';
import 'coding_new_task_sheet.dart';

/// List / create / pause / run-now / delete Coding schedules (Phase 68-C7).
Future<void> showCodingSchedulesSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => const _CodingSchedulesSheet(),
  );
}

class _CodingSchedulesSheet extends ConsumerStatefulWidget {
  const _CodingSchedulesSheet();

  @override
  ConsumerState<_CodingSchedulesSheet> createState() =>
      _CodingSchedulesSheetState();
}

class _CodingSchedulesSheetState extends ConsumerState<_CodingSchedulesSheet> {
  List<CodingSchedule> _rows = const [];
  bool _loading = true;
  String? _busyId;
  String? _error;

  NodeServiceClient? get _client => ref.read(nodeServiceProvider);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // ignore: discarded_futures
      _reload();
    });
  }

  Future<void> _reload() async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = _client;
    if (client == null) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = l10n.codingHeartbeatListFailed;
      });
      return;
    }
    try {
      final list = await client.listCodingSchedules();
      if (!mounted) return;
      setState(() {
        _rows = list;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = l10n.codingHeartbeatListFailed;
      });
    }
  }

  Future<void> _runAction(
    String id,
    Future<void> Function() action,
  ) async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _busyId = id;
      _error = null;
    });
    try {
      await action();
      await _reload();
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = l10n.codingHeartbeatActionFailed);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _openCreate() async {
    final created = await showCodingScheduleCreateDialog(context);
    if (created == true && mounted) await _reload();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final height = MediaQuery.sizeOf(context).height * 0.7;

    return SafeArea(
      child: SizedBox(
        height: height,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.codingSchedulesTitle,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Cron creates a new Coding task and runs the prompt once.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                  ),
                ],
              ),
            ),
            if (_loading)
              const Expanded(
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_rows.isEmpty)
              Expanded(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'No schedules yet.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                    ),
                  ),
                ),
              )
            else
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  itemCount: _rows.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (ctx, i) {
                    final row = _rows[i];
                    final busy = _busyId == row.id;
                    final harnessChoice =
                        codingHarnessFromWireId(row.harness);
                    final harnessLabel = harnessChoice != null
                        ? codingHarnessDisplayName(harnessChoice)
                        : row.harness;
                    return ListTile(
                      title: Text(row.name),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${row.cron} · $harnessLabel · '
                            '${row.enabled ? l10n.codingHeartbeatOn : l10n.codingHeartbeatOff} · '
                            '${l10n.codingHeartbeatRuns(row.runCount)}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          if (row.lastError != null &&
                              row.lastError!.trim().isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                row.lastError!,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(color: scheme.error),
                              ),
                            ),
                        ],
                      ),
                      isThreeLine: row.lastError != null &&
                          row.lastError!.trim().isNotEmpty,
                      trailing: busy
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : PopupMenuButton<String>(
                              onSelected: (value) {
                                final client = _client;
                                if (client == null) return;
                                if (value == 'toggle') {
                                  // ignore: discarded_futures
                                  _runAction(
                                    row.id,
                                    () async {
                                      await client.updateCodingSchedule(
                                        id: row.id,
                                        enabled: !row.enabled,
                                      );
                                    },
                                  );
                                } else if (value == 'run') {
                                  // ignore: discarded_futures
                                  _runAction(
                                    row.id,
                                    () async {
                                      await client.runCodingScheduleNow(row.id);
                                    },
                                  );
                                } else if (value == 'delete') {
                                  // ignore: discarded_futures
                                  _runAction(
                                    row.id,
                                    () async {
                                      await client.deleteCodingSchedule(row.id);
                                    },
                                  );
                                }
                              },
                              itemBuilder: (_) => [
                                PopupMenuItem(
                                  value: 'toggle',
                                  child: Text(
                                    row.enabled
                                        ? l10n.codingHeartbeatPause
                                        : l10n.codingHeartbeatResume,
                                  ),
                                ),
                                PopupMenuItem(
                                  value: 'run',
                                  child: Text(l10n.codingScheduleRunNow),
                                ),
                                PopupMenuItem(
                                  value: 'delete',
                                  child: Text(l10n.codingHeartbeatDelete),
                                ),
                              ],
                            ),
                    );
                  },
                ),
              ),
            if (_error != null)
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text(
                  _error!,
                  style: TextStyle(color: scheme.error),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busyId != null
                          ? null
                          : () => Navigator.of(context).pop(),
                      child: Text(l10n.commonClose),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      onPressed: _busyId != null ? null : _openCreate,
                      child: Text(l10n.codingScheduleCreate),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Create dialog for a schedule that starts a new task each time it fires.
Future<bool?> showCodingScheduleCreateDialog(BuildContext context) {
  return showDialog<bool>(
    context: context,
    builder: (_) => const _CodingScheduleCreateDialog(),
  );
}

class _CodingScheduleCreateDialog extends ConsumerStatefulWidget {
  const _CodingScheduleCreateDialog();

  @override
  ConsumerState<_CodingScheduleCreateDialog> createState() =>
      _CodingScheduleCreateDialogState();
}

class _CodingScheduleCreateDialogState
    extends ConsumerState<_CodingScheduleCreateDialog> {
  final _nameCtrl = TextEditingController();
  final _promptCtrl = TextEditingController();
  final _customCronCtrl = TextEditingController(text: '*/15 * * * *');
  final _cwdCtrl = TextEditingController();
  String _preset = '15m';
  CodingHarnessChoice _harness = CodingHarnessChoice.envoyHarness;
  bool _enabled = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _promptCtrl.dispose();
    _customCronCtrl.dispose();
    _cwdCtrl.dispose();
    super.dispose();
  }

  String get _cron => resolveCodingHeartbeatCron(
        presetOrCustom: _preset,
        customCron: _customCronCtrl.text,
      );

  bool get _canSave =>
      !_busy &&
      _nameCtrl.text.trim().isNotEmpty &&
      _promptCtrl.text.trim().isNotEmpty &&
      _cwdCtrl.text.trim().isNotEmpty &&
      _cron.isNotEmpty;

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    if (!_canSave) return;
    if (!isValidCodingScheduleCron(_cron)) {
      setState(() => _error = l10n.codingHeartbeatInvalidCron);
      return;
    }
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() => _error = l10n.codingHeartbeatSaveFailed);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await client.createCodingSchedule(
        CreateCodingScheduleInput(
          name: _nameCtrl.text.trim(),
          cron: _cron,
          prompt: _promptCtrl.text.trim(),
          cwd: _cwdCtrl.text.trim(),
          harness: codingHarnessWireId(_harness),
          enabled: _enabled,
        ),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = l10n.codingHeartbeatSaveFailed;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;

    Widget presetChip(String key, String label) {
      return FilterChip(
        label: Text(label),
        selected: _preset == key,
        onSelected: _busy ? null : (_) => setState(() => _preset = key),
      );
    }

    return AlertDialog(
      title: Text(l10n.codingScheduleCreate),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: _nameCtrl,
                enabled: !_busy,
                decoration: InputDecoration(
                  labelText: l10n.codingHeartbeatName,
                ),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 12),
              Text(l10n.codingHeartbeatSchedule),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  presetChip('5m', l10n.codingHeartbeatPreset5m),
                  presetChip('15m', l10n.codingHeartbeatPreset15m),
                  presetChip('1h', l10n.codingHeartbeatPreset1h),
                  presetChip('daily', l10n.codingHeartbeatPresetDaily),
                  presetChip('custom', l10n.codingHeartbeatPresetCustom),
                ],
              ),
              const SizedBox(height: 8),
              if (_preset == 'custom')
                TextField(
                  controller: _customCronCtrl,
                  enabled: !_busy,
                  decoration: const InputDecoration(
                    hintText: '*/15 * * * *',
                  ),
                  onChanged: (_) => setState(() {}),
                )
              else
                Text(
                  '$_cron (UTC)',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                        fontFamily: 'monospace',
                      ),
                ),
              const SizedBox(height: 12),
              TextField(
                controller: _promptCtrl,
                enabled: !_busy,
                maxLines: 3,
                decoration: InputDecoration(
                  labelText: l10n.codingHeartbeatPrompt,
                ),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 12),
              Text(
                l10n.chatsPiFolder,
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _cwdCtrl.text.trim().isEmpty
                          ? l10n.chatsPiFolderHint
                          : _cwdCtrl.text.trim(),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        color: _cwdCtrl.text.trim().isEmpty
                            ? scheme.onSurfaceVariant
                            : scheme.onSurface,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () async {
                            final client = ref.read(nodeServiceProvider);
                            if (client == null) return;
                            final picked = await HomeFolderBrowser.open(
                              context,
                              client: client,
                              initialPath: _cwdCtrl.text.trim().isEmpty
                                  ? null
                                  : _cwdCtrl.text.trim(),
                            );
                            if (picked == null) return;
                            setState(() => _cwdCtrl.text = picked);
                          },
                    child: Text(l10n.knowledgePanelBrowse),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<CodingHarnessChoice>(
                value: _harness,
                decoration: InputDecoration(
                  labelText: l10n.codingHarnessLabel,
                ),
                items: [
                  for (final h in CodingHarnessChoice.values)
                    DropdownMenuItem(
                      value: h,
                      child: Text(codingHarnessDisplayName(h)),
                    ),
                ],
                onChanged: _busy
                    ? null
                    : (v) {
                        if (v != null) setState(() => _harness = v);
                      },
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(l10n.codingHeartbeatEnabled),
                value: _enabled,
                onChanged: _busy ? null : (v) => setState(() => _enabled = v),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    _error!,
                    style: TextStyle(color: scheme.error),
                  ),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(false),
          child: Text(l10n.commonCancel),
        ),
        FilledButton(
          onPressed: _canSave ? _save : null,
          child: Text(
            _busy ? l10n.codingHeartbeatSaving : l10n.codingHeartbeatSave,
          ),
        ),
      ],
    );
  }
}
