// Phase 40 mobile mirror — read-only "Recent chains" list.
//
// Mobile is a thin status mirror of the home node's chain-reports store.
// This screen fetches the most recent N reports via `chainListReports`
// and renders them as a simple list. Tap a row to open the detail screen.
//
// The home node's chain-reports store is currently in flux (40B.10 wires
// the persistent JSON store). When the store is empty the screen shows
// an "empty" state with a hint pointing to the home node's Social UI
// for chain authoring.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/chain_report.dart';
import '../../providers/node_provider.dart';
import '../../services/node_service_client.dart';
import 'recent_chain_detail_screen.dart';

class RecentChainsScreen extends ConsumerStatefulWidget {
  const RecentChainsScreen({super.key});

  @override
  ConsumerState<RecentChainsScreen> createState() => _RecentChainsScreenState();
}

class _RecentChainsScreenState extends ConsumerState<RecentChainsScreen> {
  List<ChainReportSummary>? _reports;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  Future<void> _refresh() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final nodeNotifier = ref.read(nodeProvider.notifier);
    final homeClient = nodeNotifier.client;
    if (homeClient == null || !homeClient.isConnected) {
      setState(() {
        _loading = false;
        _reports = null;
        _error = 'Not connected to home node';
      });
      return;
    }
    final client = NodeServiceClient(homeClient);
    try {
      final reports = await client.listChainReports(limit: 50);
      if (!mounted) return;
      setState(() {
        _reports = reports;
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Recent chains'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _loading ? null : _refresh,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _reports == null) {
      return const Center(child: CircularProgressIndicator());
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
                  'Failed to load chains',
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
                  onPressed: _refresh,
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ],
      );
    }
    final reports = _reports ?? const [];
    if (reports.isEmpty) {
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
                  'No reports yet',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  'Chains you run on the home node will appear here.\nAuthor chains from the home node Social UI.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ],
      );
    }
    return ListView.separated(
      itemCount: reports.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, i) => _ChainRow(report: reports[i]),
    );
  }
}

class _ChainRow extends StatelessWidget {
  final ChainReportSummary report;

  const _ChainRow({required this.report});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: const Icon(Icons.analytics_outlined),
      title: Row(
        children: [
          Expanded(
            child: Text(
              'Chain ${_shortId(report.chainId)}',
              style: Theme.of(context).textTheme.titleSmall,
            ),
          ),
          if (report.pinned)
            const Padding(
              padding: EdgeInsets.only(left: 4),
              child: Icon(Icons.star, size: 16, color: Colors.amber),
            ),
        ],
      ),
      subtitle: Text(
        '${report.chainSummary.workerCount} workers · '
        '${report.chainSummary.subtaskCount} subtasks · '
        '\$${report.chainSummary.synthesisCostUsd.toStringAsFixed(2)} synthesis',
        style: Theme.of(context).textTheme.bodySmall,
      ),
      trailing: Text(
        _formatDate(report.createdAt),
        style: Theme.of(context).textTheme.bodySmall,
      ),
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => RecentChainDetailScreen(chainId: report.chainId),
          ),
        );
      },
    );
  }
}

/// Shorten `chain_8d2f4a1b-…` to `chain_8d2f4a1b` for compact display.
String _shortId(String id) {
  if (id.length <= 13) return id;
  return id.substring(0, 13);
}

/// Format ISO datetime as `YYYY-MM-DD HH:MM` (local time).
String _formatDate(DateTime t) {
  final local = t.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${local.year}-${two(local.month)}-${two(local.day)} ${two(local.hour)}:${two(local.minute)}';
}
