// Phase 43H — read-only active chains mirror for EnvoyGo.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/chain_active.dart';
import '../../providers/node_provider.dart';
import '../../services/node_service_client.dart';

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
        _error = 'Not connected to home node';
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Active team jobs'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _loading ? null : _refresh,
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
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
          child: Text(
            'No active chains on the home node.\nStart one from the Social UI.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
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
                '${chain.statusLabel} · ${chain.awardedCount}/${chain.subtaskCount} awarded · '
                '\$${chain.budgetSpentUsd.toStringAsFixed(2)}/\$${chain.budgetMaxUsd.toStringAsFixed(2)}',
              ),
              trailing: chain.budgetWarningLevel == 'warn'
                  ? const Icon(Icons.warning_amber, color: Colors.orange)
                  : null,
            ),
          );
        },
      ),
    );
  }
}
