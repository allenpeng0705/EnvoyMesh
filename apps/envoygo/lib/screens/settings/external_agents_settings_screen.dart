import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// External Agents settings — Phase EnvoyGo settings (slice 2 stub).
///
/// Phase 2 TODO: this screen will list authorized external agents
/// (OpenClaw / HomeClaw instances) with their capabilities and a
/// revoke button per agent. It needs new protocol types
/// (`ExternalAgentConfig`, `ListExternalAgentsResult`,
/// `RevokeExternalAgentParams`) and new home-node RPCs
/// (`getExternalAgents`, `revokeExternalAgent`).
class ExternalAgentsSettingsScreen extends ConsumerWidget {
  const ExternalAgentsSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('External Agents')),
      body: const Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'External Agents',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 8),
            Text(
              'Manage authorized OpenClaw / HomeClaw instances. '
              'Phase 2 will add the list + revoke actions. '
              'For now, see the home node\'s Agent Network tab.',
            ),
            SizedBox(height: 24),
            Card(
              child: ListTile(
                leading: Icon(Icons.hourglass_empty),
                title: Text('Coming soon'),
                subtitle: Text(
                  'Phase 2: needs new protocol types (ExternalAgentConfig) '
                  'and home-node RPCs (getExternalAgents, revokeExternalAgent).',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
