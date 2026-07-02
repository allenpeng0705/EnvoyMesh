"""Add Settings section to me_screen.dart (only when paired)."""
from pathlib import Path

p = Path("apps/envoygo/lib/screens/me/me_screen.dart")
c = p.read_text()

if "// Phase EnvoyGo settings — slice 1+2" in c or "AI Model tile" in c:
    print("already added")
    raise SystemExit(0)

# The anchor for insertion is the "Pair New Node" section's closing
# brace, followed by a blank line and the theme `Preferences` header.
# We anchor on a unique string just before the `Preferences` section.
anchor = "        // Theme\n        const _SectionHeader(title: 'Preferences'),"

if anchor not in c:
    raise SystemExit("anchor not found")

settings_section = '''        // Phase EnvoyGo settings — slice 1+2 (only when paired).
        if (nodeState.activeNode != null) ...[
          const _SectionHeader(title: 'Settings'),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.smart_toy_outlined),
                  title: const Text('AI Model'),
                  subtitle: Text(
                    'Provider ${nodeState.activeNode!.name} uses for the assistant',
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const AiModelSettingsScreen(),
                    ),
                  ),
                ),
                ListTile(
                  leading: const Icon(Icons.shield_moon_outlined),
                  title: const Text('External Agents'),
                  subtitle: const Text(
                    'OpenClaw / HomeClaw instances authorized to call local tools',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) =>
                          const ExternalAgentsSettingsScreen(),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],

'''

c = c.replace(anchor, settings_section + anchor, 1)
p.write_text(c)
print("OK")