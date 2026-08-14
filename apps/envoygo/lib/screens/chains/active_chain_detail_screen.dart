// Live active team-job detail: status, cancel, optional rebalance.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../models/chain_active.dart';
import '../../providers/node_provider.dart';
import '../../services/node_service_client.dart';

class ActiveChainDetailScreen extends ConsumerStatefulWidget {
  final String chainId;
  final String? initialGoal;

  const ActiveChainDetailScreen({
    super.key,
    required this.chainId,
    this.initialGoal,
  });

  @override
  ConsumerState<ActiveChainDetailScreen> createState() =>
      _ActiveChainDetailScreenState();
}

class _ActiveChainDetailScreenState
    extends ConsumerState<ActiveChainDetailScreen> {
  ChainActiveSummary? _state;
  bool _loading = true;
  bool _busy = false;
  /// Connection / poll / missing-chain errors (safe for polls to replace).
  String? _loadError;
  /// Cancel / rebalance errors — polls must not wipe these.
  String? _actionError;
  Timer? _poll;
  final _rebalanceCtl = TextEditingController(text: '1.00');
  int _refreshGen = 0;
  bool _refreshInFlight = false;
  bool _refreshQueued = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refresh();
      _restartPoll(const Duration(seconds: 8));
    });
  }

  void _restartPoll(Duration interval) {
    _poll?.cancel();
    _poll = Timer.periodic(interval, (_) => _refresh());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _rebalanceCtl.dispose();
    super.dispose();
  }

  NodeServiceClient? _clientOrNull() {
    final home = ref.read(nodeProvider.notifier).client;
    if (home == null || !home.isConnected) return null;
    return NodeServiceClient(home);
  }

  String? get _displayError => _actionError ?? _loadError;

  Future<void> _retryInputDelivery(ChainInputDelivery d) async {
    final l10n = AppLocalizations.of(context);
    final client = _clientOrNull();
    if (client == null) {
      setState(() => _actionError = l10n.commonNotConnectedHome);
      return;
    }
    setState(() {
      _busy = true;
      _actionError = null;
    });
    try {
      final result = await client.chainRetryInputDelivery(
        chainId: widget.chainId,
        workerPeerId: d.workerPeerId,
        sourceRelativePath: d.sourceRelativePath,
      );
      if (!mounted) return;
      if (result['ok'] != true) {
        setState(() {
          _actionError = (result['error'] as String?)?.isNotEmpty == true
              ? result['error'] as String
              : l10n.chainsDeliveryRetryFailed;
        });
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chainsDeliveryRetried)),
      );
      await _refresh();
    } catch (e) {
      if (mounted) setState(() => _actionError = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _deliveryPhaseLabel(AppLocalizations l10n, String phase) {
    switch (phase) {
      case 'verified':
        return l10n.chainsDeliveryPhaseVerified;
      case 'failed':
        return l10n.chainsDeliveryPhaseFailed;
      case 'transferring':
        return l10n.chainsDeliveryPhaseTransferring;
      default:
        return l10n.chainsDeliveryPhasePending;
    }
  }

  Future<void> _refresh() async {
    if (_refreshInFlight) {
      _refreshQueued = true;
      return;
    }
    _refreshInFlight = true;
    _refreshQueued = false;
    final gen = ++_refreshGen;
    final client = _clientOrNull();
    if (client == null) {
      if (!mounted || gen != _refreshGen) {
        _finishRefresh(gen);
        return;
      }
      setState(() {
        _loading = false;
        _loadError = AppLocalizations.of(context).commonNotConnectedHome;
      });
      _finishRefresh(gen);
      return;
    }
    try {
      final state = await client.getChainState(widget.chainId);
      if (!mounted || gen != _refreshGen) {
        _finishRefresh(gen);
        return;
      }
      setState(() {
        _state = state;
        _loading = false;
        _loadError = state == null
            ? AppLocalizations.of(context).chainsActiveGone
            : null;
      });
      if (state != null && (state.published || state.chainCancelled)) {
        _poll?.cancel();
        _poll = null;
      } else if (state?.iteration?.waitingForOwner == true) {
        _restartPoll(const Duration(seconds: 3));
      } else {
        _restartPoll(const Duration(seconds: 8));
      }
    } catch (e) {
      if (!mounted || gen != _refreshGen) {
        _finishRefresh(gen);
        return;
      }
      setState(() {
        _loading = false;
        _loadError = e.toString();
      });
    }
    _finishRefresh(gen);
  }

  void _finishRefresh(int gen) {
    if (gen != _refreshGen) return;
    _refreshInFlight = false;
    if (_refreshQueued && mounted) {
      _refreshQueued = false;
      unawaited(_refresh());
    }
  }

  Future<void> _cancel() async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.chainsCancelTitle),
        content: Text(l10n.chainsCancelBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.chainsCancelConfirm),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final client = _clientOrNull();
    if (client == null) {
      setState(() => _actionError = l10n.commonNotConnectedHome);
      return;
    }
    setState(() {
      _busy = true;
      _actionError = null;
    });
    try {
      await client.chainCancel(
        chainId: widget.chainId,
        reason: l10n.chainsCancelReason,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chainsCancelDone)),
      );
      await _refresh();
    } catch (e) {
      if (mounted) setState(() => _actionError = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _rebalance() async {
    final l10n = AppLocalizations.of(context);
    final amount = double.tryParse(_rebalanceCtl.text.trim());
    if (amount == null || amount <= 0) {
      setState(() => _actionError = l10n.chainsRebalanceInvalidAmount);
      return;
    }
    final client = _clientOrNull();
    if (client == null) {
      setState(() => _actionError = l10n.commonNotConnectedHome);
      return;
    }
    setState(() {
      _busy = true;
      _actionError = null;
    });
    try {
      final result = await client.chainRebalance(
        chainId: widget.chainId,
        additionalBudgetUsd: amount,
      );
      if (!mounted) return;
      if (result['ok'] != true) {
        setState(() {
          _actionError = (result['reason'] as String?)?.isNotEmpty == true
              ? result['reason'] as String
              : l10n.chainsRebalanceFailed;
        });
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chainsRebalanceDone)),
      );
      await _refresh();
    } catch (e) {
      if (mounted) setState(() => _actionError = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resolveIteration(String decision) async {
    final l10n = AppLocalizations.of(context);
    final client = _clientOrNull();
    if (client == null) {
      setState(() => _actionError = l10n.commonNotConnectedHome);
      return;
    }
    setState(() {
      _busy = true;
      _actionError = null;
    });
    try {
      final result = await client.chainResolveIteration(
        chainId: widget.chainId,
        decision: decision,
      );
      if (!mounted) return;
      if (result['ok'] != true) {
        setState(() {
          _actionError = (result['error'] as String?)?.isNotEmpty == true
              ? result['error'] as String
              : l10n.chainsIterationResolveFailed;
        });
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            decision == 'continue'
                ? l10n.chainsIterationContinued
                : l10n.chainsIterationAccepted,
          ),
        ),
      );
      await _refresh();
    } catch (e) {
      if (mounted) setState(() => _actionError = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  bool get _showRebalance {
    final st = _state;
    if (st == null) return false;
    if (st.published || st.chainCancelled) return false;
    if (st.rebalancePolicy == 'never') return false;
    final level = st.budgetWarningLevel;
    return level == 'warn' || level == 'exceeded';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final st = _state;
    final title = (st?.goal ?? widget.initialGoal)?.trim();
    final finalized = st != null && (st.published || st.chainCancelled);
    final canCancel = st != null && !finalized;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          (title != null && title.isNotEmpty)
              ? title
              : l10n.chainsChainId(_shortId(widget.chainId)),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: l10n.commonRefresh,
            onPressed: _busy ? null : _refresh,
          ),
        ],
      ),
      body: _loading && st == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_displayError != null) ...[
                  Text(
                    _displayError!,
                    style: TextStyle(color: theme.colorScheme.error),
                  ),
                  const SizedBox(height: 12),
                ],
                if (st != null) ...[
                  if (st.iteration?.waitingForOwner == true) ...[
                    Card(
                      color: theme.colorScheme.secondaryContainer,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              l10n.chainsIterationAskOwnerTitle,
                              style: theme.textTheme.titleMedium,
                            ),
                            const SizedBox(height: 8),
                            Text(l10n.chainsIterationAskOwnerBody),
                            if ((st.iteration?.latestDraftSummary ?? '')
                                .isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Text(
                                st.iteration!.latestDraftSummary!,
                                maxLines: 6,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodySmall,
                              ),
                            ],
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 8,
                              children: [
                                OutlinedButton(
                                  onPressed: _busy
                                      ? null
                                      : () => _resolveIteration('stop'),
                                  child: Text(l10n.chainsIterationAcceptDraft),
                                ),
                                FilledButton(
                                  onPressed: _busy
                                      ? null
                                      : () => _resolveIteration('continue'),
                                  child: Text(l10n.chainsIterationContinue),
                                ),
                              ],
                            ),
                          ],
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
                          Text(
                            st.statusLabel,
                            style: theme.textTheme.titleMedium,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            l10n.chainsAwardedSummary(
                              st.statusLabel,
                              st.awardedCount,
                              st.subtaskCount,
                            ),
                          ),
                          Text(
                            l10n.chainsBudgetLine(
                              st.budgetSpentUsd.toStringAsFixed(2),
                              st.budgetMaxUsd.toStringAsFixed(2),
                            ),
                          ),
                          if (st.budgetWarningLevel == 'warn' ||
                              st.budgetWarningLevel == 'exceeded')
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(
                                st.budgetWarningLevel == 'exceeded'
                                    ? l10n.chainsBudgetExceeded
                                    : l10n.chainsBudgetWarn,
                                style: TextStyle(
                                  color: theme.colorScheme.error,
                                ),
                              ),
                            ),
                          if (st.partialCount > 0)
                            Text(
                              l10n.chainsPartialCount(st.partialCount),
                            ),
                        ],
                      ),
                    ),
                  ),
                  if (st.steps.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Text(
                      l10n.chainsStepsTitle,
                      style: theme.textTheme.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      l10n.chainsAttachmentHonesty,
                      style: theme.textTheme.bodySmall,
                    ),
                    if (st.inputDeliveries.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        l10n.chainsDeliveryTitle,
                        style: theme.textTheme.titleSmall,
                      ),
                      const SizedBox(height: 6),
                      ...st.inputDeliveries.map((d) {
                        final canRetry =
                            !st.published &&
                            !st.chainCancelled &&
                            (d.phase == 'failed' || d.phase == 'transferring');
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Text(
                                  '[${d.displayName}] → ${d.shortWorker} · ${_deliveryPhaseLabel(l10n, d.phase)}'
                                  '${d.phase == 'failed' && (d.error?.isNotEmpty ?? false) ? '\n${d.error}' : ''}',
                                  style: theme.textTheme.bodySmall,
                                ),
                              ),
                              if (canRetry)
                                TextButton(
                                  onPressed: _busy
                                      ? null
                                      : () => _retryInputDelivery(d),
                                  child: Text(l10n.chainsDeliveryRetry),
                                ),
                            ],
                          ),
                        );
                      }),
                    ],
                    const SizedBox(height: 8),
                    ..._orderedSteps(st.steps).map((entry) {
                      final step = entry.step;
                      final obj = step.objective.length > 100
                          ? '${step.objective.substring(0, 100)}…'
                          : step.objective;
                      final waiting = step.waitingOn.isEmpty
                          ? null
                          : '${l10n.chainsStepsWaitingOn} ${step.waitingOn.map((w) => w.label ?? w.key).join(", ")}';
                      return Padding(
                        padding: EdgeInsets.only(
                          left: entry.depth * 12.0,
                          bottom: 10,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(obj, style: theme.textTheme.bodyMedium),
                            Text(
                              '${step.state}${step.requiredRole != null ? " · ${step.requiredRole}" : ""}',
                              style: theme.textTheme.bodySmall,
                            ),
                            if (waiting != null)
                              Text(waiting, style: theme.textTheme.bodySmall),
                          ],
                        ),
                      );
                    }),
                  ] else ...[
                    const SizedBox(height: 12),
                    Text(
                      l10n.chainsAttachmentHonesty,
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                  if (_showRebalance) ...[
                    const SizedBox(height: 16),
                    Text(
                      l10n.chainsRebalanceHeading,
                      style: theme.textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      l10n.chainsRebalanceHint,
                      style: theme.textTheme.bodySmall,
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _rebalanceCtl,
                            enabled: !_busy,
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                            ),
                            decoration: InputDecoration(
                              labelText: l10n.chainsRebalanceAmount,
                              border: const OutlineInputBorder(),
                              prefixText: '\$ ',
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        FilledButton(
                          onPressed: _busy ? null : _rebalance,
                          child: Text(l10n.chainsRebalanceAction),
                        ),
                      ],
                    ),
                  ],
                  if (canCancel) ...[
                    const SizedBox(height: 24),
                    OutlinedButton.icon(
                      onPressed: _busy ? null : _cancel,
                      icon: const Icon(Icons.cancel_outlined),
                      label: Text(l10n.chainsCancelConfirm),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: theme.colorScheme.error,
                      ),
                    ),
                  ],
                  if (finalized) ...[
                    const SizedBox(height: 16),
                    Text(
                      st.chainCancelled
                          ? l10n.chainsDetailCancelled
                          : l10n.chainsDetailPublished,
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ],
              ],
            ),
    );
  }
}

List<({ChainLiveStep step, int depth})> _orderedSteps(List<ChainLiveStep> steps) {
  final byId = {for (final s in steps) s.subtaskId: s};
  final depthMemo = <String, int>{};
  int depthOf(String id, Set<String> stack) {
    final cached = depthMemo[id];
    if (cached != null) return cached;
    if (stack.contains(id)) return 0;
    stack.add(id);
    final step = byId[id];
    var d = 0;
    for (final dep in step?.dependsOn ?? const <String>[]) {
      if (!byId.containsKey(dep)) continue;
      final nested = depthOf(dep, stack) + 1;
      if (nested > d) d = nested;
    }
    stack.remove(id);
    depthMemo[id] = d;
    return d;
  }

  final ordered = [...steps];
  ordered.sort((a, b) {
    final da = depthOf(a.subtaskId, {});
    final db = depthOf(b.subtaskId, {});
    if (da != db) return da.compareTo(db);
    return a.subtaskId.compareTo(b.subtaskId);
  });
  return [
    for (final s in ordered) (step: s, depth: depthOf(s.subtaskId, {})),
  ];
}

String _shortId(String id) {
  if (id.length <= 13) return id;
  return id.substring(0, 13);
}
