import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_heartbeat.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/product/node_service_client.dart';

/// Dialog to create a Coding heartbeat for [target] (Phase 68-C6).
Future<bool> showCodingHeartbeatDialog(
  BuildContext context, {
  required String workspaceTitle,
  required CodingHeartbeatTarget target,
}) async {
  final saved = await showDialog<bool>(
    context: context,
    builder: (ctx) => _CodingHeartbeatDialog(
      workspaceTitle: workspaceTitle,
      target: target,
    ),
  );
  return saved == true;
}

class _CodingHeartbeatDialog extends ConsumerStatefulWidget {
  const _CodingHeartbeatDialog({
    required this.workspaceTitle,
    required this.target,
  });

  final String workspaceTitle;
  final CodingHeartbeatTarget target;

  @override
  ConsumerState<_CodingHeartbeatDialog> createState() =>
      _CodingHeartbeatDialogState();
}

class _CodingHeartbeatDialogState extends ConsumerState<_CodingHeartbeatDialog> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _promptCtrl;
  late final TextEditingController _customCronCtrl;
  String _preset = '15m';
  bool _enabled = true;
  bool _busy = false;
  String? _error;

  var _didLocalizeDefaults = false;

  @override
  void initState() {
    super.initState();
    // English placeholders until [didChangeDependencies] applies l10n.
    _nameCtrl = TextEditingController(
      text: 'Heartbeat · ${widget.workspaceTitle}',
    );
    _promptCtrl = TextEditingController(
      text:
          'Check progress on this workspace and continue useful next steps.',
    );
    _customCronCtrl = TextEditingController(text: '*/15 * * * *');
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_didLocalizeDefaults) return;
    _didLocalizeDefaults = true;
    final l10n = AppLocalizations.of(context);
    _nameCtrl.text = l10n.codingHeartbeatDefaultName(widget.workspaceTitle);
    _promptCtrl.text = l10n.codingHeartbeatDefaultPrompt;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _promptCtrl.dispose();
    _customCronCtrl.dispose();
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
      _cron.isNotEmpty;

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    if (!_canSave) return;
    if (!isValidCodingHeartbeatCron(_cron)) {
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
      await client.createCodingHeartbeat(
        CreateCodingHeartbeatInput(
          name: _nameCtrl.text.trim(),
          cron: _cron,
          prompt: _promptCtrl.text.trim(),
          target: widget.target,
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
      final selected = _preset == key;
      return FilterChip(
        label: Text(label),
        selected: selected,
        onSelected: _busy
            ? null
            : (_) => setState(() => _preset = key),
      );
    }

    return AlertDialog(
      title: Text(l10n.codingHeartbeatAddTitle),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.codingHeartbeatAddDesc(widget.workspaceTitle),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: 16),
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
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(l10n.codingHeartbeatEnabled),
                value: _enabled,
                onChanged: _busy
                    ? null
                    : (v) => setState(() => _enabled = v),
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

/// List / pause / run-now / delete Coding heartbeats (Phase 68-C6).
Future<void> showCodingHeartbeatsSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => const _CodingHeartbeatsSheet(),
  );
}

class _CodingHeartbeatsSheet extends ConsumerStatefulWidget {
  const _CodingHeartbeatsSheet();

  @override
  ConsumerState<_CodingHeartbeatsSheet> createState() =>
      _CodingHeartbeatsSheetState();
}

class _CodingHeartbeatsSheetState extends ConsumerState<_CodingHeartbeatsSheet> {
  List<CodingHeartbeat> _rows = const [];
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
      final list = await client.listCodingHeartbeats();
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
                    l10n.codingHeartbeatListTitle,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l10n.codingHeartbeatListDesc,
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
                      l10n.codingHeartbeatEmpty,
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
                    final hb = _rows[i];
                    final busy = _busyId == hb.id;
                    return ListTile(
                      title: Text(hb.name),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${hb.cron} · ${codingHeartbeatTargetLabel(hb.target)} · '
                            '${hb.enabled ? l10n.codingHeartbeatOn : l10n.codingHeartbeatOff} · '
                            '${l10n.codingHeartbeatRuns(hb.runCount)}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          if (hb.lastError != null &&
                              hb.lastError!.trim().isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                hb.lastError!,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(color: scheme.error),
                              ),
                            ),
                        ],
                      ),
                      isThreeLine: hb.lastError != null &&
                          hb.lastError!.trim().isNotEmpty,
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
                                    hb.id,
                                    () async {
                                      await client.updateCodingHeartbeat(
                                        id: hb.id,
                                        enabled: !hb.enabled,
                                      );
                                    },
                                  );
                                } else if (value == 'run') {
                                  // ignore: discarded_futures
                                  _runAction(
                                    hb.id,
                                    () async {
                                      await client.runCodingHeartbeatNow(hb.id);
                                    },
                                  );
                                } else if (value == 'delete') {
                                  // ignore: discarded_futures
                                  _runAction(
                                    hb.id,
                                    () async {
                                      await client.deleteCodingHeartbeat(hb.id);
                                    },
                                  );
                                }
                              },
                              itemBuilder: (_) => [
                                PopupMenuItem(
                                  value: 'toggle',
                                  child: Text(
                                    hb.enabled
                                        ? l10n.codingHeartbeatPause
                                        : l10n.codingHeartbeatResume,
                                  ),
                                ),
                                PopupMenuItem(
                                  value: 'run',
                                  child: Text(l10n.codingHeartbeatRunNow),
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
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text(
                  _error!,
                  style: TextStyle(color: scheme.error),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: OutlinedButton(
                onPressed:
                    _busyId != null ? null : () => Navigator.of(context).pop(),
                child: Text(l10n.commonClose),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
