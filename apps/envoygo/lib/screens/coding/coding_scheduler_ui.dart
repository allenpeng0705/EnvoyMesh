import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_heartbeat.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/product/node_service_client.dart';
import 'coding_schedules_ui.dart';

/// One list: continue an existing task, or start a new one.
Future<void> showCodingSchedulerSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => const _CodingSchedulerSheet(),
  );
}

class _SchedulerRow {
  const _SchedulerRow({
    required this.key,
    required this.name,
    required this.enabled,
    required this.kind,
    required this.meta,
    required this.toggle,
    required this.runNow,
    required this.remove,
    this.lastError,
  });

  final String key;
  final String name;
  final bool enabled;
  final String kind;
  final String meta;
  final String? lastError;
  final Future<dynamic> Function() toggle;
  final Future<dynamic> Function() runNow;
  final Future<dynamic> Function() remove;
}

String _short(String value) {
  final trimmed = value.trim();
  if (trimmed.length <= 8) return trimmed;
  return trimmed.substring(0, 8);
}

String _targetLabel(CodingHeartbeat hb) {
  final target = hb.target;
  if (target is CodingHeartbeatTargetEh) return 'EH · ${_short(target.chatId)}';
  if (target is CodingHeartbeatTargetPi) {
    return 'Pi · ${_short(target.sessionId)}';
  }
  if (target is CodingHeartbeatTargetExt) {
    return '${target.agentId} · ${_short(target.sessionId)}';
  }
  return '';
}

String _folder(String cwd) {
  final parts = cwd.split(RegExp(r'[/\\]'));
  return parts.isEmpty ? cwd : parts.last;
}

class _CodingSchedulerSheet extends ConsumerStatefulWidget {
  const _CodingSchedulerSheet();

  @override
  ConsumerState<_CodingSchedulerSheet> createState() =>
      _CodingSchedulerSheetState();
}

class _CodingSchedulerSheetState extends ConsumerState<_CodingSchedulerSheet> {
  List<_SchedulerRow> _rows = const [];
  bool _loading = true;
  String? _busyKey;
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
        _error = l10n.codingSchedulerListFailed;
      });
      return;
    }
    try {
      final heartbeats = await client.listCodingHeartbeats();
      final schedules = await client.listCodingSchedules();
      if (!mounted) return;
      final rows = <_SchedulerRow>[
        for (final hb in heartbeats)
          _SchedulerRow(
            key: 'continue:${hb.id}',
            name: hb.name,
            enabled: hb.enabled,
            kind: l10n.codingSchedulerKindContinue,
            meta: [
              hb.cron,
              _targetLabel(hb),
              l10n.codingHeartbeatRuns(hb.runCount),
            ].where((part) => part.isNotEmpty).join(' · '),
            lastError: hb.lastError,
            toggle: () => client.updateCodingHeartbeat(
              id: hb.id,
              enabled: !hb.enabled,
            ),
            runNow: () => client.runCodingHeartbeatNow(hb.id),
            remove: () => client.deleteCodingHeartbeat(hb.id),
          ),
        for (final row in schedules)
          _SchedulerRow(
            key: 'fresh:${row.id}',
            name: row.name,
            enabled: row.enabled,
            kind: l10n.codingSchedulerKindNew,
            meta: [
              row.cron,
              row.harness,
              _folder(row.cwd),
              l10n.codingHeartbeatRuns(row.runCount),
            ].where((part) => part.isNotEmpty).join(' · '),
            lastError: row.lastError,
            toggle: () => client.updateCodingSchedule(
              id: row.id,
              enabled: !row.enabled,
            ),
            runNow: () => client.runCodingScheduleNow(row.id),
            remove: () => client.deleteCodingSchedule(row.id),
          ),
      ]..sort((a, b) => a.name.compareTo(b.name));
      setState(() {
        _rows = rows;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = l10n.codingSchedulerListFailed;
      });
    }
  }

  Future<void> _run(String key, Future<void> Function() action) async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _busyKey = key;
      _error = null;
    });
    try {
      await action();
      await _reload();
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = l10n.codingSchedulerActionFailed);
    } finally {
      if (mounted) setState(() => _busyKey = null);
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
                    l10n.codingSchedulerTitle,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l10n.codingSchedulerDesc,
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
                      l10n.codingSchedulerEmpty,
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              )
            else
              Expanded(
                child: ListView.builder(
                  itemCount: _rows.length,
                  itemBuilder: (context, index) {
                    final row = _rows[index];
                    final busy = _busyKey == row.key;
                    return ListTile(
                      title: Text(row.name),
                      subtitle: Text(
                        '${row.kind} · ${row.enabled ? l10n.codingHeartbeatOn : l10n.codingHeartbeatOff}\n${row.meta}'
                        '${row.lastError == null ? '' : '\n${row.lastError}'}',
                      ),
                      isThreeLine: true,
                      trailing: PopupMenuButton<String>(
                        enabled: !busy,
                        onSelected: (value) {
                          if (value == 'toggle') {
                            // ignore: discarded_futures
                            _run(row.key, row.toggle);
                          } else if (value == 'run') {
                            // ignore: discarded_futures
                            _run(row.key, row.runNow);
                          } else if (value == 'delete') {
                            // ignore: discarded_futures
                            _run(row.key, row.remove);
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
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text(_error!, style: TextStyle(color: scheme.error)),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busyKey != null
                          ? null
                          : () => Navigator.of(context).pop(),
                      child: Text(l10n.commonClose),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      onPressed: _busyKey != null ? null : _openCreate,
                      child: Text(l10n.codingSchedulerNew),
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
