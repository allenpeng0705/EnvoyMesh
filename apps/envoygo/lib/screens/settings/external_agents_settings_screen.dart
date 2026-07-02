import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/node_provider.dart';
import '../../services/node_service_client.dart';

/// External Agents settings — Phase EnvoyGo settings (slice 2).
///
/// Shows a list of all external agents (OpenClaw, HomeClaw, etc.)
/// currently authorized to call local tools on the home node. Each
/// row shows:
///   - agent name (bold) + agentId (small grey)
///   - chip row of capability tags
///   - "Authorized by <owner>" + "last activity <relative time>"
///   - "Revoked" pill if isRevoked === true
///   - red "Revoke" button if !isRevoked (with confirm dialog)
///
/// Pulls data via `listExternalAgents()` from `NodeServiceClient`.
/// Revokes via `revokeExternalAgent(agentId)` and refreshes.
class ExternalAgentsSettingsScreen extends ConsumerStatefulWidget {
  const ExternalAgentsSettingsScreen({super.key});

  @override
  ConsumerState<ExternalAgentsSettingsScreen> createState() =>
      _ExternalAgentsSettingsScreenState();
}

class _ExternalAgentsSettingsScreenState
    extends ConsumerState<ExternalAgentsSettingsScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _agents = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(nodeProvider).nodeServiceClient;
    if (client == null) {
      setState(() {
        _loading = false;
        _error = 'Not connected to a home node';
      });
      return;
    }
    try {
      final agents = await client.listExternalAgents();
      if (!mounted) return;
      setState(() {
        _agents = agents;
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

  Future<void> _revoke(String agentId, String displayName) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Revoke external agent?'),
        content: Text(
          'Revoke authorization for "$displayName" ($agentId)? '
          'The agent will need to be re-authorized before it can '
          'call local tools again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton.tonal(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Revoke'),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    final client = ref.read(nodeProvider).nodeServiceClient;
    if (client == null) return;
    final err = await client.revokeExternalAgent(agentId);
    if (!mounted) return;
    if (err == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Revoked $displayName')),
      );
      await _load();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Revoke failed: $err')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('External Agents'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : _load,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorView(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _agents.isEmpty
                      ? const _EmptyState()
                      : ListView.builder(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          itemCount: _agents.length,
                          itemBuilder: (ctx, i) =>
                              _AgentTile(
                            agent: _agents[i],
                            onRevoke: _revoke,
                          ),
                        ),
                ),
    );
  }
}

class _AgentTile extends StatelessWidget {
  final Map<String, dynamic> agent;
  final void Function(String agentId, String displayName) onRevoke;

  const _AgentTile({required this.agent, required this.onRevoke});

  @override
  Widget build(BuildContext context) {
    final agentId = agent['agentId']?.toString() ?? '<unknown>';
    final agentName = agent['agentName']?.toString() ?? agentId;
    final authorizedBy = agent['authorizedBy']?.toString() ?? '';
    final isRevoked = agent['isRevoked'] == true;
    final caps = (agent['capabilities'] as List<dynamic>?) ?? const [];
    final createdAt = agent['createdAt']?.toString();
    final lastActivityAt = agent['lastActivityAt']?.toString();
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    agentName,
                    style: Theme.of(context).textTheme.titleMedium,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (isRevoked) const _RevokedPill(),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              agentId,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (caps.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: caps
                    .map((c) => Chip(label: Text(c.toString())))
                    .toList(),
              ),
            ],
            const SizedBox(height: 8),
            if (authorizedBy.isNotEmpty)
              Text(
                'Authorized by $authorizedBy',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            if (createdAt != null)
              Text(
                'Created $createdAt',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            if (lastActivityAt != null && !isRevoked)
              Text(
                'Last activity $lastActivityAt',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            const SizedBox(height: 8),
            if (!isRevoked)
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.tonalIcon(
                  onPressed: () => onRevoke(agentId, agentName),
                  icon: const Icon(Icons.block),
                  label: const Text('Revoke'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _RevokedPill extends StatelessWidget {
  const _RevokedPill();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.grey.shade300,
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Text(
        'Revoked',
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return ListView(
      // ListView gives RefreshIndicator something to scroll
      children: const [
        SizedBox(height: 80),
        Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              children: [
                Icon(Icons.shield_moon, size: 48, color: Colors.grey),
                SizedBox(height: 16),
                Text(
                  'No external agents',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
                ),
                SizedBox(height: 8),
                Text(
                  'External agents (OpenClaw, HomeClaw, ...) appear here once '
                  'they are authorized by the home node.',
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final Future<void> Function() onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, color: Colors.red, size: 32),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}