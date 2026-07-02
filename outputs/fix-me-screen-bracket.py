"""Remove the leftover External Agents fragment from me_screen.dart.

The earlier patch script's `end_marker` ("          ),\n") was too
generic — it matched the wrong closing brace. The opening
`Card( child: ListTile( leading: const Icon(Icons.extension_outlined),`
was removed, but the closing half remained.

This script removes the leftover half (from "trailing: const
Icon(Icons.chevron_right)," through the matching "        ],").
"""
from pathlib import Path
p = Path("apps/envoygo/lib/screens/me/me_screen.dart")
c = p.read_text()

# The leftover fragment is unique because it contains the
# ExternalAgentsSettingsScreen reference + a "          )," close
# followed by "          const SizedBox(height: 16)," followed by
# "        ],".
old = """          ),
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
        ],

        // Chains"""

new = """          ),
          const SizedBox(height: 16),
        ],

        // Chains"""

if old not in c:
    print("fragment not found (already fixed?)")
    raise SystemExit(1)
c = c.replace(old, new, 1)
p.write_text(c)
print("OK: leftover fragment removed")