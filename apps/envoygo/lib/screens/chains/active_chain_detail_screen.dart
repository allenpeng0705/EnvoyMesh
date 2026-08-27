// Live active team-job detail: status, cancel, optional rebalance.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../chain_step_control.dart';
import '../../l10n/app_localizations.dart';
import '../../models/chain_active.dart';
import '../../providers/node_provider.dart';
import '../../services/node_service_client.dart';
import '../../utils/chain_localization.dart';

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
  /// Cancel / rebalance / step-control errors — polls must not wipe these.
  String? _actionError;
  /// Phase 63 — subtask id while pick / reassign / auto speculation RPC runs.
  String? _speculationBusySubtaskId;
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
          _actionError = chainRpcErrorLabel(
            l10n,
            (result['error'] as String?) ?? (result['reason'] as String?),
          );
        });
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chainsDeliveryRetried)),
      );
      await _refresh();
    } catch (e) {
      if (mounted) {
        setState(() => _actionError = chainCaughtErrorLabel(l10n, e));
      }
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
        _loadError = chainCaughtErrorLabel(AppLocalizations.of(context), e);
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

  Future<void> _cancelStep(String subtaskId) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.chainsCancelStepTitle),
        content: Text(l10n.chainsCancelStepBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.chainsCancelStep),
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
      final result = await client.chainCancel(
        chainId: widget.chainId,
        subtaskId: subtaskId,
        reason: l10n.chainsCancelStepReason,
      );
      if (!mounted) return;
      final cancelled = result['cancelled'];
      final ok = cancelled is List && cancelled.contains(subtaskId);
      if (!ok) {
        setState(() => _actionError = l10n.chainsCancelStepFailed);
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chainsStepCancelled)),
      );
      await _refresh();
    } catch (e) {
      if (mounted) {
        setState(() => _actionError = chainCaughtErrorLabel(l10n, e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reassignStep(String subtaskId) async {
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
      final result = await client.chainReassignSubtask(
        chainId: widget.chainId,
        subtaskId: subtaskId,
      );
      if (!mounted) return;
      if (result['ok'] != true) {
        setState(() {
          _actionError = chainRpcErrorLabel(
            l10n,
            (result['error'] as String?) ?? (result['reason'] as String?),
          );
        });
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chainsStepReassigned)),
      );
      await _refresh();
    } catch (e) {
      if (mounted) {
        setState(() => _actionError = chainCaughtErrorLabel(l10n, e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
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
      final result = await client.chainCancel(
        chainId: widget.chainId,
        reason: l10n.chainsCancelReason,
      );
      if (!mounted) return;
      final cancelled = result['cancelled'];
      final ok = cancelled is List
          ? cancelled.isNotEmpty || result['ok'] == true
          : result['ok'] != false;
      if (!ok && result['ok'] == false) {
        setState(() {
          _actionError = (result['reason'] as String?)?.isNotEmpty == true
              ? result['reason'] as String
              : l10n.chainsCancelFailed;
        });
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chainsCancelDone)),
      );
      await _refresh();
    } catch (e) {
      if (mounted) {
        setState(() => _actionError = chainCaughtErrorLabel(l10n, e));
      }
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
      if (mounted) {
        setState(() => _actionError = chainCaughtErrorLabel(l10n, e));
      }
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
      if (mounted) {
        setState(() => _actionError = chainCaughtErrorLabel(l10n, e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resolveSpeculationPick(
    ChainSpeculationReview review,
    ChainSpeculationAttempt attempt,
  ) async {
    final l10n = AppLocalizations.of(context);
    final client = _clientOrNull();
    if (client == null) {
      setState(() => _actionError = l10n.commonNotConnectedHome);
      return;
    }
    setState(() {
      _speculationBusySubtaskId = review.subtaskId;
      _actionError = null;
    });
    try {
      final result = await client.chainResolveSpeculation(
        chainId: widget.chainId,
        subtaskId: review.subtaskId,
        action: 'pick',
        attemptId: attempt.attemptId,
      );
      if (!mounted) return;
      if (result['ok'] != true) {
        setState(() {
          _actionError = chainSpeculationResolveReasonLabel(
            l10n,
            result['reason'] as String?,
          );
        });
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chainsSpeculationReviewResolved)),
      );
      await _refresh();
    } catch (e) {
      if (mounted) {
        setState(() => _actionError = chainCaughtErrorLabel(l10n, e));
      }
    } finally {
      if (mounted) setState(() => _speculationBusySubtaskId = null);
    }
  }

  Future<void> _resolveSpeculationReassign(ChainSpeculationReview review) async {
    final l10n = AppLocalizations.of(context);
    final client = _clientOrNull();
    if (client == null) {
      setState(() => _actionError = l10n.commonNotConnectedHome);
      return;
    }
    setState(() {
      _speculationBusySubtaskId = review.subtaskId;
      _actionError = null;
    });
    try {
      final result = await client.chainResolveSpeculation(
        chainId: widget.chainId,
        subtaskId: review.subtaskId,
        action: 'reassign',
      );
      if (!mounted) return;
      if (result['ok'] != true) {
        setState(() {
          _actionError = chainSpeculationResolveReasonLabel(
            l10n,
            result['reason'] as String?,
          );
        });
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chainsStepReassigned)),
      );
      await _refresh();
    } catch (e) {
      if (mounted) {
        setState(() => _actionError = chainCaughtErrorLabel(l10n, e));
      }
    } finally {
      if (mounted) setState(() => _speculationBusySubtaskId = null);
    }
  }

  /// Owner override — defer to the orchestrator's deterministic auto-resolver.
  Future<void> _resolveSpeculationAuto() async {
    final l10n = AppLocalizations.of(context);
    final client = _clientOrNull();
    if (client == null) {
      setState(() => _actionError = l10n.commonNotConnectedHome);
      return;
    }
    final reviews = _state?.speculationReview;
    if (reviews == null || reviews.isEmpty) return;
    setState(() {
      _speculationBusySubtaskId = reviews.first.subtaskId;
      _actionError = null;
    });
    try {
      for (final review in reviews) {
        setState(() => _speculationBusySubtaskId = review.subtaskId);
        final result = await client.chainResolveSpeculation(
          chainId: widget.chainId,
          subtaskId: review.subtaskId,
          action: 'auto',
        );
        if (!mounted) return;
        if (result['ok'] == true) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l10n.chainsSpeculationReviewResolved)),
          );
          await _refresh();
          return;
        }
      }
      if (!mounted) return;
      setState(() => _actionError = l10n.chainsSpeculationReviewFailed);
    } catch (e) {
      if (mounted) {
        setState(() => _actionError = chainCaughtErrorLabel(l10n, e));
      }
    } finally {
      if (mounted) setState(() => _speculationBusySubtaskId = null);
    }
  }

  String _shortPeerId(String peerId) {
    if (peerId.length <= 16) return peerId;
    return '${peerId.substring(0, 14)}…';
  }

  bool get _showRebalance {
    final st = _state;
    if (st == null) return false;
    if (st.published || st.chainCancelled) return false;
    if (st.rebalancePolicy == 'never') return false;
    final level = st.budgetWarningLevel;
    return level == 'warn' || level == 'exceeded';
  }

  String _teamStrategyLabel(AppLocalizations l10n, String id) {
    switch (id) {
      case 'fastest':
        return l10n.chainsStrategyFastest;
      case 'cheapest':
        return l10n.chainsStrategyCheapest;
      case 'highest-confidence':
        return l10n.chainsStrategyHighestConfidence;
      case 'privacy-local':
        return l10n.chainsStrategyPrivacyLocal;
      case 'diverse-model':
        return l10n.chainsStrategyDiverseModel;
      case 'balanced':
      default:
        return l10n.chainsStrategyBalanced;
    }
  }

  Future<void> _showStepProvenance({
    required ChainLiveStep step,
    ChainProvenanceSummary? summary,
  }) async {
    if (!mounted) return;
    final client = _clientOrNull();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        return _ChainStepProvenanceSheet(
          chainId: widget.chainId,
          step: step,
          summary: summary,
          client: client,
        );
      },
    );
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
                  if (st.speculationReview.isNotEmpty) ...[
                    Card(
                      color: theme.colorScheme.tertiaryContainer,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(
                                  Icons.fork_left,
                                  size: 20,
                                  color:
                                      theme.colorScheme.onTertiaryContainer,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    l10n.chainsSpeculationReviewTitle,
                                    style: theme.textTheme.titleMedium,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(l10n.chainsSpeculationReviewBody),
                            for (final review in st.speculationReview) ...[
                              const SizedBox(height: 8),
                              Text(
                                review.reason == 'none_pass'
                                    ? l10n.chainsSpeculationReviewNonePass
                                    : l10n.chainsSpeculationReviewDisagree,
                                style: theme.textTheme.bodySmall,
                              ),
                              for (final attempt in review.attempts) ...[
                                const SizedBox(height: 8),
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            _shortPeerId(attempt.workerPeerId),
                                            style: theme.textTheme.bodyMedium,
                                          ),
                                          if (chainSpeculationRoleLabel(
                                                l10n,
                                                attempt.role,
                                              ) !=
                                              null)
                                            Text(
                                              chainSpeculationRoleLabel(
                                                l10n,
                                                attempt.role,
                                              )!,
                                              style: theme.textTheme.bodySmall,
                                            ),
                                        ],
                                      ),
                                    ),
                                    FilledButton.tonal(
                                      onPressed:
                                          _speculationBusySubtaskId != null
                                              ? null
                                              : () => _resolveSpeculationPick(
                                                    review,
                                                    attempt,
                                                  ),
                                      child: Text(
                                        l10n.chainsSpeculationReviewPick,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                              Align(
                                alignment: Alignment.centerLeft,
                                child: TextButton(
                                  onPressed: _speculationBusySubtaskId != null
                                      ? null
                                      : () =>
                                          _resolveSpeculationReassign(review),
                                  child: Text(
                                    l10n.chainsSpeculationReviewReassign,
                                  ),
                                ),
                              ),
                            ],
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              child: OutlinedButton.icon(
                                onPressed: _speculationBusySubtaskId != null
                                    ? null
                                    : _resolveSpeculationAuto,
                                icon: _speculationBusySubtaskId != null
                                    ? const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Icon(Icons.auto_awesome, size: 18),
                                label: Text(
                                  l10n.chainsSpeculationReviewAutoResolve,
                                ),
                              ),
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
                            st.statusLabel(l10n),
                            style: theme.textTheme.titleMedium,
                          ),
                          if (st.teamStrategyId != null &&
                              st.teamStrategyId!.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Chip(
                              label: Text(
                                _teamStrategyLabel(l10n, st.teamStrategyId!),
                              ),
                              visualDensity: VisualDensity.compact,
                              materialTapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                            ),
                          ],
                          if (st.recoveryPhase == 'recovering') ...[
                            const SizedBox(height: 8),
                            Chip(
                              label: Text(l10n.chainsDetailRecovering),
                              visualDensity: VisualDensity.compact,
                              materialTapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                            ),
                          ],
                          const SizedBox(height: 8),
                          Text(
                            l10n.chainsAwardedSummary(
                              st.statusLabel(l10n),
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
                            canRetryChainInputDelivery(
                              phase: d.phase,
                              updatedAt: d.updatedAt,
                            );
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
                      final matches = st.provenanceSummary
                          .where((p) => p.subtaskId == step.subtaskId);
                      final summary =
                          matches.isEmpty ? null : matches.first;
                      final attemptCount =
                          step.attemptCount > 0
                              ? step.attemptCount
                              : (summary?.attemptCount ?? 0);
                      final obj = step.objective.length > 100
                          ? '${step.objective.substring(0, 100)}…'
                          : step.objective;
                      final waiting = step.waitingOn.isEmpty
                          ? null
                          : '${l10n.chainsStepsWaitingOn} ${step.waitingOn.map((w) => w.label ?? w.key).join(", ")}';
                      final allowStepControl = !finalized;
                      final showCancel =
                          allowStepControl && canCancelChainStep(step.state);
                      final showReassign =
                          allowStepControl && canReassignChainStep(step.state);
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
                              [
                                chainStepStateLabel(l10n, step.state),
                                if (step.requiredRole != null) step.requiredRole!,
                                if (attemptCount > 0)
                                  l10n.chainsAttemptCount(attemptCount),
                              ].join(' · '),
                              style: theme.textTheme.bodySmall,
                            ),
                            if (waiting != null)
                              Text(waiting, style: theme.textTheme.bodySmall),
                            TextButton(
                              onPressed: () => _showStepProvenance(
                                step: step,
                                summary: summary,
                              ),
                              child: Text(l10n.chainsExecutionDetails),
                            ),
                            if (showCancel || showReassign)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Wrap(
                                  spacing: 8,
                                  children: [
                                    if (showCancel)
                                      TextButton(
                                        onPressed: _busy
                                            ? null
                                            : () => _cancelStep(step.subtaskId),
                                        child: Text(l10n.chainsCancelStep),
                                      ),
                                    if (showReassign)
                                      TextButton(
                                        onPressed: _busy
                                            ? null
                                            : () =>
                                                _reassignStep(step.subtaskId),
                                        child: Text(l10n.chainsReassignStep),
                                      ),
                                  ],
                                ),
                              ),
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

/// Phase 60A — shows the sheet immediately, then lazy-loads provenance.
class _ChainStepProvenanceSheet extends StatefulWidget {
  final String chainId;
  final ChainLiveStep step;
  final ChainProvenanceSummary? summary;
  final NodeServiceClient? client;

  const _ChainStepProvenanceSheet({
    required this.chainId,
    required this.step,
    required this.summary,
    required this.client,
  });

  @override
  State<_ChainStepProvenanceSheet> createState() =>
      _ChainStepProvenanceSheetState();
}

class _ChainStepProvenanceSheetState extends State<_ChainStepProvenanceSheet> {
  bool _loading = true;
  String? _loadError;
  Map<String, dynamic>? _provenance;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_load());
    });
  }

  Future<void> _load() async {
    final client = widget.client;
    if (client == null) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = AppLocalizations.of(context).commonNotConnectedHome;
      });
      return;
    }
    try {
      final provenance = await client.getChainStepProvenance(
        widget.chainId,
        widget.step.subtaskId,
      );
      if (!mounted) return;
      setState(() {
        _loading = false;
        _provenance = provenance;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = chainCaughtErrorLabel(AppLocalizations.of(context), e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final step = widget.step;
    final summary = widget.summary;
    final summaryMap = _provenance?['summary'];
    final summaryAttempts = summaryMap is Map
        ? (summaryMap['attemptCount'] as num?)?.toInt()
        : null;
    final summaryWorker =
        summaryMap is Map ? summaryMap['workerPeerId'] as String? : null;
    final summaryState =
        summaryMap is Map ? summaryMap['state'] as String? : null;
    final lastReason = summaryMap is Map
        ? summaryMap['lastReason'] as String?
        : summary?.lastReason;
    final events =
        (_provenance?['events'] as List?)?.whereType<Map>().toList() ??
            const <Map>[];

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.chainsExecutionDetails,
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Text(
                step.objective,
                style: theme.textTheme.bodyMedium,
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 8),
              Text(
                l10n.chainsProvenanceSummaryLine(
                  summaryAttempts ??
                      (step.attemptCount > 0
                          ? step.attemptCount
                          : (summary?.attemptCount ?? 0)),
                  _shortId(
                    summaryWorker ??
                        step.workerPeerId ??
                        summary?.workerPeerId ??
                        '—',
                  ),
                  summaryState ?? summary?.state ?? step.state,
                ),
                style: theme.textTheme.bodySmall,
              ),
              if (lastReason != null && lastReason.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  l10n.chainsLastReason(lastReason),
                  style: theme.textTheme.bodySmall,
                ),
              ],
              if (_loadError != null) ...[
                const SizedBox(height: 12),
                Text(
                  _loadError!,
                  style: TextStyle(color: theme.colorScheme.error),
                ),
              ],
              const SizedBox(height: 12),
              Text(
                l10n.chainsTechnicalDetails,
                style: theme.textTheme.titleSmall,
              ),
              const SizedBox(height: 6),
              if (_loading)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    children: [
                      const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        l10n.commonLoading,
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                )
              else if (events.isEmpty)
                Text(
                  l10n.chainsProvenanceEmpty,
                  style: theme.textTheme.bodySmall,
                )
              else
                ...events.map((raw) {
                  final e = Map<String, dynamic>.from(raw);
                  final seq = e['seq'];
                  final type = e['type']?.toString() ?? '';
                  final attemptId = e['attemptId']?.toString();
                  final worker = e['workerPeerId']?.toString();
                  final transport = e['transportPath']?.toString();
                  final reason = e['reason']?.toString();
                  final parts = <String>[
                    if (seq != null) '#$seq',
                    type,
                    if (attemptId != null && attemptId.isNotEmpty) attemptId,
                    if (worker != null && worker.isNotEmpty) _shortId(worker),
                    if (transport != null && transport.isNotEmpty) transport,
                    if (reason != null && reason.isNotEmpty) reason,
                  ];
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      parts.join(' · '),
                      style: theme.textTheme.bodySmall,
                    ),
                  );
                }),
            ],
          ),
        ),
      ),
    );
  }
}
