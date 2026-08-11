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
      _poll = Timer.periodic(const Duration(seconds: 8), (_) => _refresh());
    });
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

String _shortId(String id) {
  if (id.length <= 13) return id;
  return id.substring(0, 13);
}
