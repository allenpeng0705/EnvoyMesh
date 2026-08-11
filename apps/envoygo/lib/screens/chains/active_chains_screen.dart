// Active team jobs on the home node, plus entry to start a new one.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../models/chain_active.dart';
import '../../providers/node_provider.dart';
import '../../services/node_service_client.dart';
import 'active_chain_detail_screen.dart';
import 'start_chain_screen.dart';

class ActiveChainsScreen extends ConsumerStatefulWidget {
  const ActiveChainsScreen({super.key});

  @override
  ConsumerState<ActiveChainsScreen> createState() => _ActiveChainsScreenState();
}

class _ActiveChainsScreenState extends ConsumerState<ActiveChainsScreen> {
  List<ChainActiveSummary>? _chains;
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
    final homeClient = ref.read(nodeProvider.notifier).client;
    if (homeClient == null || !homeClient.isConnected) {
      setState(() {
        _loading = false;
        _chains = null;
        _error = AppLocalizations.of(context).commonNotConnectedHome;
      });
      return;
    }
    final client = NodeServiceClient(homeClient);
    try {
      final chains = await client.listActiveChains();
      if (!mounted) return;
      setState(() {
        _chains = chains;
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

  void _openStart() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const StartChainScreen()),
    ).then((_) {
      if (mounted) _refresh();
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.chainsActiveTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: l10n.commonRefresh,
            onPressed: _loading ? null : _refresh,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openStart,
        icon: const Icon(Icons.add),
        label: Text(l10n.chainsStartFab),
      ),
      body: _buildBody(l10n),
    );
  }

  Widget _buildBody(AppLocalizations l10n) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_error!, textAlign: TextAlign.center),
        ),
      );
    }
    final chains = _chains ?? const <ChainActiveSummary>[];
    if (chains.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                l10n.chainsNoActive,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _openStart,
                icon: const Icon(Icons.add),
                label: Text(l10n.chainsStartFab),
              ),
            ],
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
        itemCount: chains.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          final chain = chains[index];
          final goal = chain.goal?.trim().isNotEmpty == true
              ? chain.goal!
              : chain.chainId;
          return Card(
            child: ListTile(
              title: Text(
                goal,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                '${l10n.chainsAwardedSummary(chain.statusLabel, chain.awardedCount, chain.subtaskCount)} · '
                '\$${chain.budgetSpentUsd.toStringAsFixed(2)}/\$${chain.budgetMaxUsd.toStringAsFixed(2)}',
              ),
              trailing: chain.budgetWarningLevel == 'warn' ||
                      chain.budgetWarningLevel == 'exceeded'
                  ? const Icon(Icons.warning_amber, color: Colors.orange)
                  : const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.of(context)
                    .push(
                  MaterialPageRoute(
                    builder: (_) => ActiveChainDetailScreen(
                      chainId: chain.chainId,
                      initialGoal: chain.goal,
                    ),
                  ),
                )
                    .then((_) {
                  if (mounted) _refresh();
                });
              },
            ),
          );
        },
      ),
    );
  }
}
