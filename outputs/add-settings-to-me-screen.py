"""Add a Settings section to the me_screen with AI model + External agents tiles.
Only displayed when paired (nodeState.activeNode != null).
"""
from pathlib import Path
p = Path("apps/envoygo/lib/screens/me/me_screen.dart")
c = p.read_text()

# 1. Add the import for the settings screen.
old_imp = "import 'package:flutter_riverpod/flutter_riverpod.dart';"
if old_imp not in c:
    raise SystemExit("riverpod import not found")
new_imp = """import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../settings/ai_model_settings_screen.dart';
import '../settings/external_agents_settings_screen.dart';"""
c = c.replace(old_imp, new_imp, 1)
print("imports added")

# 2. Add a Settings section right after the "AI Engine" section.
#    Both tiles are only shown when paired (activeNode != null),
#    matching the user's "only displayed when paired" requirement.
anchor = """        // AI Engine (Phase 32 — read-only mirror of home node state).
        // (Note: the "Agent Network" tab on the home node is for onboarding
        // other nodes — pairing, fleet manifest, company invites — not the
        // AI engine. This is the AI engine.)
        if (nodeState.activeNode != null) ...[
          const _SectionHeader(title: 'AI Engine'),
          const AiEngineSection(),
          const SizedBox(height: 16),
        ],"""

new_section = """        // AI Engine (Phase 32 — read-only mirror of home node state).
        // (Note: the "Agent Network" tab on the home node is for onboarding
        // other nodes — pairing, fleet manifest, company invites — not the
        // AI engine. This is the AI engine.)
        if (nodeState.activeNode != null) ...[
          const _SectionHeader(title: 'AI Engine'),
          const AiEngineSection(),
          const SizedBox(height: 16),
        ],

        // Settings (Phase EnvoyGo settings). Only shown when paired —
        // the settings mutate the home node's config so they're
        // meaningless without a live connection.
        if (nodeState.activeNode != null) ...[
          const _SectionHeader(title: 'Settings'),
          Card(
            child: ListTile(
              leading: const Icon(Icons.smart_toy_outlined),
              title: const Text('AI Model'),
              subtitle: const Text(
                'Provider, endpoint, model name, API key',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const AiModelSettingsScreen(),
                  ),
                );
              },
            ),
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.extension_outlined),
              title: const Text('External Agents'),
              subtitle: const Text(
                'Manage authorized OpenClaw / HomeClaw instances',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const ExternalAgentsSettingsScreen(),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 16),
        ],"""

if anchor not in c:
    raise SystemExit("AI Engine anchor not found")
c = c.replace(anchor, new_section, 1)
print("settings section added")

# 3. Create a stub ExternalAgentsSettingsScreen so the import resolves.
#    Phase 2 will replace the body with the real implementation.
settings_dir = Path("apps/envoygo/lib/screens/settings")
settings_dir.mkdir(parents=True, exist_ok=True)
ext_screen = settings_dir / "external_agents_settings_screen.dart"
if not ext_screen.exists():
    ext_screen.write_text('''import 'package:flutter/material.dart';
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
              'For now, see the home node\\'s Agent Network tab.',
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
''')
    print("stub external_agents_settings_screen.dart created")

p.write_text(c)
print("me_screen.dart updated")