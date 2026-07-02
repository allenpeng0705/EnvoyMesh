"""Remove the duplicate AI Model tile in the older Settings section.

There are TWO "Settings" sections in me_screen.dart:
  - Line 249 (older, simpler ListTile in Card, no Column wrapper)
  - Line 350 (newer, Phase EnvoyGo settings — Card with Column wrapper)

The newer one is correct. Remove the older.
"""
from pathlib import Path
p = Path("apps/envoygo/lib/screens/me/me_screen.dart")
c = p.read_text()

# The older Settings block — identified by its unique subtitle string
# "Provider, endpoint, model name, API key" (the newer one has the
# activeNode!.name interpolation).
old = """        // Settings (Phase EnvoyGo settings). Only shown when paired —
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
          const SizedBox(height: 16),
        ],

        // Chains"""

# Replace with just the comment + spacing (the newer Settings section
# is rendered separately after the AI Engine section).
new = """        // Chains"""

if old not in c:
    print("older Settings section not found")
    raise SystemExit(1)
c = c.replace(old, new, 1)
p.write_text(c)
print("OK: duplicate AI Model tile removed")
print()
print("Remaining AI Model / Settings references:")
import re
for i, line in enumerate(c.split("\n"), 1):
    if "AI Model" in line or "title: 'Settings'" in line:
        print(f"  line {i}: {line.strip()}")