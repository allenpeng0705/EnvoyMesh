// Phase 40 mobile mirror — read-only chain report detail.
//
// Renders a single published `ChainReport` fetched via `chainGetReport`.
// Sections render the executive summary + per-section body as plain text
// (no markdown renderer dependency — the wire format is markdown but the
// mobile surface is a quick-glance mirror, not a reading app).
//
// Mutations (pin/unpin, launch, cancel, rebalance) are intentionally not
// exposed; the home node's Social UI is the source of truth for chain
// authoring and editing.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../l10n/app_localizations.dart';
import '../../models/chain_report.dart';
import '../../providers/node_provider.dart';
import '../../services/node_service_client.dart';

class RecentChainDetailScreen extends ConsumerStatefulWidget {
  final String chainId;

  const RecentChainDetailScreen({super.key, required this.chainId});

  @override
  ConsumerState<RecentChainDetailScreen> createState() =>
      _RecentChainDetailScreenState();
}

class _RecentChainDetailScreenState
    extends ConsumerState<RecentChainDetailScreen> {
  ChainReport? _report;
  bool _loading = true;
  String? _error;

  /// True when the home node confirmed the report is gone (returned
  /// `null` for `chainGetReport`). This is distinct from a transient
  /// error (`_error`) — it means the report was GC'd or never existed.
  bool _notFound = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
      _notFound = false;
    });
    final nodeNotifier = ref.read(nodeProvider.notifier);
    final homeClient = nodeNotifier.client;
    if (homeClient == null || !homeClient.isConnected) {
      setState(() {
        _loading = false;
        _error = AppLocalizations.of(context).commonNotConnectedHome;
      });
      return;
    }
    final client = NodeServiceClient(homeClient);
    try {
      final report = await client.getChainReport(widget.chainId);
      if (!mounted) return;
      if (report == null) {
        // The home node returned a null report — the report was GC'd
        // (90-day policy unless pinned) or never existed. Show a softer
        // "not available" state rather than a hard error.
        setState(() {
          _loading = false;
          _notFound = true;
        });
        return;
      }
      setState(() {
        _report = report;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(_shortId(widget.chainId)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: l10n.commonRefresh,
            onPressed: _loading ? null : _load,
          ),
        ],
      ),
      body: _buildBody(l10n),
    );
  }

  Widget _buildBody(AppLocalizations l10n) {
    if (_loading && _report == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_notFound) {
      return ListView(
        children: [
          const SizedBox(height: 80),
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                Icon(Icons.analytics_outlined,
                    size: 48,
                    color: Theme.of(context).colorScheme.outline),
                const SizedBox(height: 12),
                Text(
                  l10n.chainsReportGone,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  l10n.chainsReportGoneHint,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () {
                    Navigator.of(context).pop();
                  },
                  child: Text(l10n.chainsBackToRecent),
                ),
              ],
            ),
          ),
        ],
      );
    }
    if (_error != null) {
      return ListView(
        children: [
          const SizedBox(height: 80),
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                Icon(Icons.error_outline,
                    size: 48, color: Theme.of(context).colorScheme.error),
                const SizedBox(height: 12),
                Text(
                  l10n.chainsLoadReportFailed,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _load,
                  child: Text(l10n.commonRetry),
                ),
              ],
            ),
          ),
        ],
      );
    }
    final r = _report!;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Header
        _HeaderCard(report: r),
        const SizedBox(height: 16),

        // Executive summary
        if (r.executiveSummary.isNotEmpty) ...[
          _SectionTitle(l10n.chainsSummary),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                r.executiveSummary,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Sections
        if (r.sections.isNotEmpty) ...[
          _SectionTitle(l10n.chainsSections),
          const SizedBox(height: 8),
          for (final s in r.sections) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      s.heading,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      s.bodyMarkdown,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 8),
        ],

        // Worker allocations
        if (r.chainSummary.workerAllocations.isNotEmpty) ...[
          _SectionTitle(l10n.chainsWorkerAllocations),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                children: [
                  for (final a in r.chainSummary.workerAllocations)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              _shortId(a.workerPeerId),
                              style:
                                  Theme.of(context).textTheme.bodySmall?.copyWith(
                                        fontFamily: 'monospace',
                                      ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          Text(
                            '\$${a.committedUsd.toStringAsFixed(2)}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            l10n.chainsManageOnSocial,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }
}

class _HeaderCard extends StatelessWidget {
  final ChainReport report;

  const _HeaderCard({required this.report});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final s = report.chainSummary;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.chainsChainId(_shortId(report.chainId)),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                if (report.pinned)
                  const Padding(
                    padding: EdgeInsets.only(left: 4),
                    child:
                        Icon(Icons.star, size: 18, color: Colors.amber),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              l10n.chainsPublished(_formatDate(report.createdAt)),
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 4,
              children: [
                _Stat(label: l10n.chainsWorkers, value: '${s.workerCount}'),
                _Stat(label: l10n.chainsSubtasks, value: '${s.subtaskCount}'),
                _Stat(
                  label: l10n.chainsSynthesis,
                  value: '\$${s.synthesisCostUsd.toStringAsFixed(2)}',
                ),
                _Stat(label: l10n.chainsDuration, value: _formatDuration(s.durationMs)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  const _Stat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall,
        ),
        Text(
          value,
          style: Theme.of(context).textTheme.titleSmall,
        ),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Text(
        text,
        style: Theme.of(context).textTheme.titleSmall,
      ),
    );
  }
}

String _shortId(String id) {
  if (id.length <= 13) return id;
  return id.substring(0, 13);
}

String _formatDate(DateTime t) {
  final local = t.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${local.year}-${two(local.month)}-${two(local.day)} '
      '${two(local.hour)}:${two(local.minute)}';
}

String _formatDuration(int ms) {
  if (ms < 1000) return '${ms}ms';
  final s = ms ~/ 1000;
  if (s < 60) return '${s}s';
  final m = s ~/ 60;
  final rs = s % 60;
  if (m < 60) return '${m}m ${rs}s';
  final h = m ~/ 60;
  final rm = m % 60;
  return '${h}h ${rm}m';
}
