"""Close the Settings section that was left open by the previous patch.

The new Settings section starts at:
  if (nodeState.activeNode != null) ...[   <-- opens spread
    const _SectionHeader(title: 'Settings'),
    Card(
      child: Column(
        children: [
          ListTile(
            ...
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => const AiModelSettingsScreen(),
              ),
            ),
          ),
// MISSING: ],   close children: [ array
// MISSING: const SizedBox(height: 16),
// MISSING: ],   close the if (nodeState.activeNode != null) ...[ spread

        // Theme
        const _SectionHeader(title: 'Preferences'),

We need to insert the 3 missing lines right before "// Theme".
"""
from pathlib import Path
p = Path("apps/envoygo/lib/screens/me/me_screen.dart")
c = p.read_text()

# The unique anchor: the AI Model ListTile's onTap → MaterialPageRoute →
# builder, followed by the AI Model screen, then "        // Theme".
old = """                onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const AiModelSettingsScreen(),
                    ),
                  ),
                ),

        // Theme"""

new = """                onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const AiModelSettingsScreen(),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Theme"""

if old not in c:
    print("anchor not found")
    raise SystemExit(1)
c = c.replace(old, new, 1)
p.write_text(c)
print("OK: Settings section properly closed")