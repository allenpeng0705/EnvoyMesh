import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/node_service_client.dart';

/// Remote control for Envoy Local on the home node.
///
/// Downloads and inference always run on the home computer — never on the
/// phone. Mirrors the Social Settings → AI → Envoy Local controls.
class EnvoyLocalSettingsScreen extends ConsumerStatefulWidget {
  const EnvoyLocalSettingsScreen({super.key});

  @override
  ConsumerState<EnvoyLocalSettingsScreen> createState() =>
      _EnvoyLocalSettingsScreenState();
}

class _EnvoyLocalSettingsScreenState
    extends ConsumerState<EnvoyLocalSettingsScreen> {
  bool _loading = true;
  bool _connected = false;
  bool _busy = false;
  bool _testing = false;
  /// Bumped on each primary action so Cancel cannot clear another action's busy.
  int _actionGen = 0;
  String? _error;
  Map<String, dynamic>? _status;
  List<Map<String, dynamic>> _installed = const [];
  List<Map<String, dynamic>> _catalog = const [];
  String? _hfSearchError;
  Timer? _pollTimer;
  ProviderSubscription<NodeServiceClient?>? _clientSub;
  void Function()? _configUnsub;

  bool get _inFlight =>
      _busy || (_status?['operationInProgress'] == true);

  bool get _localInUse =>
      _status?['enabled'] == true && _status?['running'] == true;

  @override
  void initState() {
    super.initState();
    _clientSub = ref.listenManual<NodeServiceClient?>(
      nodeServiceProvider,
      (prev, next) {
        _configUnsub?.call();
        _configUnsub = null;
        if (next != null) {
          _configUnsub = next.on('home:config-updated', (_) {
            if (mounted && !_busy) _refresh();
          });
          if (mounted) _refresh(initial: prev == null);
        } else if (mounted) {
          _markDisconnected();
        }
      },
      fireImmediately: true,
    );
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _configUnsub?.call();
    _clientSub?.close();
    super.dispose();
  }

  void _markDisconnected() {
    _syncPoll(false);
    setState(() {
      _loading = false;
      _connected = false;
      _busy = false;
      _status = null;
      _installed = const [];
      _catalog = const [];
      _hfSearchError = null;
      _error = AppLocalizations.of(context).settingsNotConnectedNode;
    });
  }

  Future<void> _refresh({bool initial = false}) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      if (mounted) _markDisconnected();
      return;
    }
    if (initial) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final results = await Future.wait([
        client.getEnvoyLocalStatus(),
        client.listEnvoyLocalInstalledModels(),
        client.searchEnvoyLocalModels(),
      ]);
      if (!mounted) return;
      final status = results[0] as Map<String, dynamic>;
      final installed = results[1] as List<Map<String, dynamic>>;
      final search = results[2] as Map<String, dynamic>;
      final models = (search['models'] as List?)
              ?.whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList() ??
          <Map<String, dynamic>>[];
      setState(() {
        _connected = true;
        _status = status;
        _installed = installed;
        _catalog = models;
        _hfSearchError = search['huggingfaceError'] as String?;
        _loading = false;
        // Do not clear errors while a primary action still owns the UI.
        if (!_busy) _error = null;
      });
      _syncPoll(status['operationInProgress'] == true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _connected = true;
        _error = e.toString();
      });
    }
  }

  void _syncPoll(bool shouldPoll) {
    if (shouldPoll) {
      _pollTimer ??= Timer.periodic(const Duration(seconds: 1), (_) {
        _pollStatusOnly();
      });
    } else {
      _pollTimer?.cancel();
      _pollTimer = null;
    }
  }

  Future<void> _pollStatusOnly() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || !mounted) return;
    try {
      final status = await client.getEnvoyLocalStatus();
      if (!mounted) return;
      final busy = status['operationInProgress'] == true;
      setState(() => _status = status);
      if (!busy) {
        _syncPoll(false);
        final installed = await client.listEnvoyLocalInstalledModels();
        if (mounted) setState(() => _installed = installed);
      }
    } catch (_) {
      // Keep last known status; next user action will surface errors.
    }
  }

  /// Returns false when the wall-clock idle wait timed out.
  Future<bool> _waitIdle(int gen) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return true;
    final deadline = DateTime.now().add(const Duration(hours: 1));
    while (mounted && DateTime.now().isBefore(deadline)) {
      if (gen != _actionGen) return true;
      final st = await client.getEnvoyLocalStatus();
      if (!mounted || gen != _actionGen) return true;
      setState(() => _status = st);
      if (st['operationInProgress'] != true) {
        _syncPoll(false);
        return true;
      }
      _syncPoll(true);
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    return false;
  }

  Future<void> _testChatModel() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final l10n = AppLocalizations.of(context);
    setState(() => _testing = true);
    try {
      final result = await client.testChatModel();
      if (!mounted) return;
      final ok = result['ok'] == true;
      final msg = ok
          ? l10n.settingsAiModelTestChatOk(
              result['modelName']?.toString() ?? 'envoy-local',
              (result['latencyMs'] as num?)?.toInt() ?? 0,
            )
          : l10n.settingsAiModelTestChatFail(
              result['error']?.toString() ?? 'unknown',
            );
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.settingsAiModelTestChatFail('$e'))),
      );
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  Future<void> _runAction(
    Future<void> Function(NodeServiceClient client) action, {
    bool waitIdle = true,
  }) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      if (mounted) _markDisconnected();
      return;
    }
    final gen = ++_actionGen;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action(client);
      if (!mounted || gen != _actionGen) return;
      if (waitIdle) {
        final ok = await _waitIdle(gen);
        if (!mounted || gen != _actionGen) return;
        if (!ok) {
          setState(() {
            _error =
                AppLocalizations.of(context).settingsEnvoyLocalIdleTimeout;
          });
          return;
        }
      }
      await _refresh();
      if (!mounted || gen != _actionGen) return;
      final st = _status;
      if (st != null &&
          (st['phase'] == 'error' ||
              (st['lastError'] as String?)?.isNotEmpty == true)) {
        setState(() => _error = st['lastError'] as String? ?? _error);
      }
    } catch (e) {
      if (mounted && gen == _actionGen) {
        setState(() => _error = e.toString());
      }
    } finally {
      if (mounted && gen == _actionGen) {
        setState(() => _busy = false);
      }
    }
  }

  /// Cancel must not take ownership of `_busy` (would re-enable Start mid-job).
  Future<void> _cancelDownload() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      if (mounted) _markDisconnected();
      return;
    }
    try {
      final next = await client.cancelEnvoyLocalDownload();
      if (!mounted) return;
      setState(() => _status = next);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  String _statusLabel(AppLocalizations l10n) {
    final st = _status;
    if (st == null) return l10n.commonLoading;
    final phase = st['phase'] as String? ?? '';
    final download = st['download'] as Map?;
    final dlPhase = download?['phase'] as String?;
    final effective = (dlPhase != null && dlPhase.isNotEmpty) ? dlPhase : phase;
    final inFlight =
        st['operationInProgress'] == true || effective == 'starting';

    if (inFlight ||
        effective == 'detecting' ||
        effective == 'extracting-runtime' ||
        effective.startsWith('download')) {
      if (effective == 'detecting') {
        return l10n.settingsEnvoyLocalStatusDetecting;
      }
      if (effective == 'extracting-runtime') {
        return l10n.settingsEnvoyLocalStatusExtracting;
      }
      if (effective == 'downloading-runtime' ||
          effective == 'downloading-model' ||
          effective.startsWith('download')) {
        return l10n.settingsEnvoyLocalStatusDownloading;
      }
      if (effective == 'starting' || st['operationInProgress'] == true) {
        return l10n.settingsEnvoyLocalStatusStarting;
      }
    }
    if (st['running'] == true || phase == 'ready') {
      return l10n.settingsEnvoyLocalStatusReady;
    }
    if (phase == 'error') return l10n.settingsEnvoyLocalStatusError;
    if (st['enabled'] != true) return l10n.settingsEnvoyLocalStatusDisabled;
    return phase.isNotEmpty ? phase : l10n.settingsEnvoyLocalStatusDisabled;
  }

  String? _progressLabel(AppLocalizations l10n) {
    final download = _status?['download'] as Map?;
    if (download == null) return null;
    final label = (download['label'] as String?)?.trim();
    final received = download['bytesReceived'];
    final total = download['bytesTotal'];
    String? bytes;
    if (received is num && total is num && total > 0) {
      final recvMb = (received / (1024 * 1024)).toStringAsFixed(1);
      final totalMb = (total / (1024 * 1024)).toStringAsFixed(1);
      bytes = l10n.settingsEnvoyLocalProgressBytes(recvMb, totalMb);
    } else if (received is num && received > 0) {
      final recvMb = (received / (1024 * 1024)).toStringAsFixed(1);
      bytes = l10n.settingsEnvoyLocalProgressReceived(recvMb);
    }
    if (label != null && label.isNotEmpty && bytes != null) {
      return '$label · $bytes';
    }
    return bytes ?? (label?.isNotEmpty == true ? label : null);
  }

  double? _progressFraction() {
    final download = _status?['download'] as Map?;
    if (download == null) return null;
    final fraction = download['fraction'];
    if (fraction is num) return fraction.clamp(0.0, 1.0).toDouble();
    final received = download['bytesReceived'];
    final total = download['bytesTotal'];
    if (received is num && total is num && total > 0) {
      return (received / total).clamp(0.0, 1.0);
    }
    return null;
  }

  Future<void> _setRegion(String? region) async {
    if (region == null || _inFlight) return;
    await _runAction(
      (c) async {
        final st = await c.setEnvoyLocalDownloadRegion(region);
        if (mounted) setState(() => _status = st);
      },
      waitIdle: false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final st = _status;
    final runtimeInstalled = st?['runtimeInstalled'] == true;
    final running = st?['running'] == true;
    final canStart = runtimeInstalled && _installed.isNotEmpty && !running;
    final canEnable = !runtimeInstalled || _installed.isEmpty;
    final regionPref =
        (st?['downloadRegionPreference'] as String?) ?? 'auto';
    final effectiveRegion = st?['modelDownloadRegion'] as String?;
    final progressText = _progressLabel(l10n);
    final progressFrac = _progressFraction();
    final lastError = st?['lastError'] as String?;
    final recommendedId = st?['recommendedModelId'] as String?;
    final recommendedLabel = st?['recommendedModelLabel'] as String?;
    final hardware = st?['hardwareSummary'] as String?;

    final curatedCatalog = _catalog
        .where((m) => m['source'] != 'huggingface')
        .take(12)
        .toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.meEnvoyLocal),
        actions: [
          if (_connected)
            IconButton(
              tooltip: l10n.settingsEnvoyLocalRefresh,
              onPressed: _inFlight ? null : () => _refresh(),
              icon: const Icon(Icons.refresh),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : !_connected
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.cloud_off_outlined,
                          size: 48,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          _error ?? l10n.settingsNotConnectedNode,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: () => _refresh(initial: true),
                          child: Text(l10n.commonRetry),
                        ),
                      ],
                    ),
                  ),
                )
              : RefreshIndicator(
              onRefresh: () => _refresh(),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    l10n.settingsEnvoyLocalIntro,
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 12),
                  if (_error != null) ...[
                    Card(
                      color: theme.colorScheme.errorContainer,
                      child: ListTile(
                        leading: Icon(
                          Icons.error_outline,
                          color: theme.colorScheme.onErrorContainer,
                        ),
                        title: Text(
                          _error!,
                          style: TextStyle(
                            color: theme.colorScheme.onErrorContainer,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  l10n.settingsEnvoyLocalStatusHeading,
                                  style: theme.textTheme.titleMedium,
                                ),
                              ),
                              Chip(
                                label: Text(
                                  _localInUse
                                      ? l10n.settingsEnvoyLocalInUse
                                      : l10n.settingsEnvoyLocalNotInUse,
                                ),
                                visualDensity: VisualDensity.compact,
                                backgroundColor: _localInUse
                                    ? theme.colorScheme.primaryContainer
                                    : theme.colorScheme.surfaceContainerHighest,
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(l10n.settingsEnvoyLocalRuntime(_statusLabel(l10n))),
                          if (st?['runtimeVersion'] != null)
                            Text(
                              l10n.settingsEnvoyLocalRuntimeVersion(
                                '${st!['runtimeVersion']}',
                              ),
                            ),
                          if (st?['accel'] != null)
                            Text(
                              l10n.settingsEnvoyLocalAccel('${st!['accel']}'),
                            ),
                          if (hardware != null && hardware.isNotEmpty)
                            Text(l10n.settingsEnvoyLocalHardware(hardware)),
                          Text(
                            l10n.settingsEnvoyLocalActiveModel(
                              (st?['activeModelId'] as String?)?.isNotEmpty ==
                                      true
                                  ? st!['activeModelId'] as String
                                  : '—',
                            ),
                          ),
                          if (progressText != null) ...[
                            const SizedBox(height: 12),
                            Text(progressText),
                            const SizedBox(height: 6),
                            LinearProgressIndicator(value: progressFrac),
                          ],
                          if (lastError != null && lastError.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text(
                              l10n.settingsEnvoyLocalLastError(lastError),
                              style: TextStyle(color: theme.colorScheme.error),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: regionPref == 'cn' ||
                            regionPref == 'global' ||
                            regionPref == 'auto'
                        ? regionPref
                        : 'auto',
                    decoration: InputDecoration(
                      labelText: l10n.settingsEnvoyLocalDownloadRegion,
                      border: const OutlineInputBorder(),
                      helperText: effectiveRegion == null
                          ? l10n.settingsEnvoyLocalDownloadRegionHint
                          : l10n.settingsEnvoyLocalDownloadRegionEffective(
                              effectiveRegion == 'cn'
                                  ? l10n.settingsEnvoyLocalRegionCn
                                  : l10n.settingsEnvoyLocalRegionGlobal,
                            ),
                    ),
                    items: [
                      DropdownMenuItem(
                        value: 'auto',
                        child: Text(l10n.settingsEnvoyLocalRegionAuto),
                      ),
                      DropdownMenuItem(
                        value: 'cn',
                        child: Text(l10n.settingsEnvoyLocalRegionCn),
                      ),
                      DropdownMenuItem(
                        value: 'global',
                        child: Text(l10n.settingsEnvoyLocalRegionGlobal),
                      ),
                    ],
                    onChanged: _inFlight ? null : _setRegion,
                  ),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (canEnable)
                        FilledButton.icon(
                          onPressed: _inFlight
                              ? null
                              : () => _runAction(
                                    (c) async {
                                      await c.enableEnvoyLocal();
                                    },
                                  ),
                          icon: _inFlight
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.download),
                          label: Text(
                            _inFlight
                                ? l10n.settingsEnvoyLocalEnabling
                                : l10n.settingsEnvoyLocalEnable,
                          ),
                        ),
                      if (canStart)
                        FilledButton.icon(
                          onPressed: _inFlight
                              ? null
                              : () => _runAction(
                                    (c) async {
                                      await c.startEnvoyLocal();
                                    },
                                  ),
                          icon: const Icon(Icons.play_arrow),
                          label: Text(
                            _inFlight
                                ? l10n.settingsEnvoyLocalStarting
                                : l10n.settingsEnvoyLocalStart,
                          ),
                        ),
                      if (running) ...[
                        OutlinedButton.icon(
                          onPressed: _inFlight
                              ? null
                              : () => _runAction(
                                    (c) async {
                                      await c.stopEnvoyLocal();
                                    },
                                    waitIdle: false,
                                  ),
                          icon: const Icon(Icons.stop),
                          label: Text(l10n.settingsEnvoyLocalStop),
                        ),
                        OutlinedButton.icon(
                          onPressed: _inFlight
                              ? null
                              : () => _runAction(
                                    (c) async {
                                      await c.restartEnvoyLocal();
                                    },
                                  ),
                          icon: const Icon(Icons.restart_alt),
                          label: Text(l10n.settingsEnvoyLocalRestart),
                        ),
                        FilledButton(
                          onPressed:
                              (_inFlight || _testing) ? null : _testChatModel,
                          child: Text(
                            _testing
                                ? l10n.settingsAiModelTestChatBusy
                                : l10n.settingsAiModelTestChat,
                          ),
                        ),
                      ],
                      if (_inFlight &&
                          st?['phase'] != 'starting' &&
                          st?['operationInProgress'] == true)
                        TextButton(
                          onPressed: _cancelDownload,
                          child: Text(l10n.settingsEnvoyLocalCancelDownload),
                        ),
                    ],
                  ),
                  if (running) ...[
                    const SizedBox(height: 8),
                    Text(
                      l10n.settingsEnvoyLocalStopHint,
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                  if (recommendedId != null &&
                      recommendedId.isNotEmpty &&
                      !_installed.any((m) => m['id'] == recommendedId)) ...[
                    const SizedBox(height: 20),
                    Text(
                      l10n.settingsEnvoyLocalRecommended,
                      style: theme.textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Card(
                      child: ListTile(
                        title: Text(recommendedLabel ?? recommendedId),
                        subtitle: Text(recommendedId),
                        trailing: TextButton(
                          onPressed: _inFlight
                              ? null
                              : () => _runAction(
                                    (c) async {
                                      await c.downloadEnvoyLocalModel(
                                        recommendedId,
                                      );
                                    },
                                  ),
                          child: Text(l10n.settingsEnvoyLocalDownload),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),
                  Text(
                    l10n.settingsEnvoyLocalInstalled,
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l10n.settingsEnvoyLocalInstalledHint,
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 8),
                  if (_installed.isEmpty)
                    Text(
                      l10n.settingsEnvoyLocalNoInstalled,
                      style: theme.textTheme.bodySmall,
                    )
                  else
                    ..._installed.map((m) {
                      final id = m['id'] as String? ?? '';
                      final active = m['active'] == true;
                      final fileName = m['fileName'] as String? ?? id;
                      return Card(
                        child: ListTile(
                          title: Text(fileName),
                          subtitle: Text(id),
                          trailing: active
                              ? Chip(
                                  label: Text(l10n.settingsEnvoyLocalActiveBadge),
                                  visualDensity: VisualDensity.compact,
                                )
                              : TextButton(
                                  onPressed: _inFlight || id.isEmpty
                                      ? null
                                      : () => _runAction(
                                            (c) async {
                                              await c.setEnvoyLocalActiveModel(
                                                id,
                                              );
                                            },
                                          ),
                                  child: Text(l10n.settingsEnvoyLocalSetActive),
                                ),
                        ),
                      );
                    }),
                  if (curatedCatalog.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    Text(
                      l10n.settingsEnvoyLocalCatalog,
                      style: theme.textTheme.titleMedium,
                    ),
                    if (_hfSearchError != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        l10n.settingsEnvoyLocalHfError(_hfSearchError!),
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.error,
                        ),
                      ),
                    ],
                    const SizedBox(height: 8),
                    ...curatedCatalog.map((m) {
                      final id = m['id'] as String? ?? '';
                      final label = m['label'] as String? ?? id;
                      final installed =
                          _installed.any((x) => x['id'] == id);
                      final recommended = m['recommended'] == true;
                      return Card(
                        child: ListTile(
                          title: Text(label),
                          subtitle: Text(
                            [
                              id,
                              if (recommended)
                                l10n.settingsEnvoyLocalRecommendedBadge,
                            ].join(' · '),
                          ),
                          trailing: installed
                              ? Chip(
                                  label: Text(
                                    l10n.settingsEnvoyLocalInstalledBadge,
                                  ),
                                  visualDensity: VisualDensity.compact,
                                )
                              : TextButton(
                                  onPressed: _inFlight || id.isEmpty
                                      ? null
                                      : () => _runAction(
                                            (c) async {
                                              await c.downloadEnvoyLocalModel(
                                                id,
                                              );
                                            },
                                          ),
                                  child:
                                      Text(l10n.settingsEnvoyLocalDownload),
                                ),
                        ),
                      );
                    }),
                  ],
                  const SizedBox(height: 24),
                  Text(
                    l10n.settingsEnvoyLocalPhoneNote,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
