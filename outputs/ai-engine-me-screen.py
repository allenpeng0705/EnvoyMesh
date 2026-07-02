"""Add AI Engine settings screen to me_screen + remove External Agents tile."""
from pathlib import Path

p = Path("apps/envoygo/lib/screens/me/me_screen.dart")
c = p.read_text()

# 1. Add the import for the new screen.
old_imp = "import '../settings/ai_model_settings_screen.dart';"
new_imp = '''import '../settings/ai_engine_settings_screen.dart';
import '../settings/ai_model_settings_screen.dart';'''
if "ai_engine_settings_screen" in c:
    print("AI Engine import already present")
else:
    c = c.replace(old_imp, new_imp, 1)
    print("import added")

# 2. Remove the External Agents tile from the Settings section.
# The block starts with "leading: const Icon(Icons.extension_outlined)"
# and ends with the matching "      ),".
start_marker = "          Card(\n            child: ListTile(\n              leading: const Icon(Icons.extension_outlined),"
end_marker = "          ),\n"
i = c.find(start_marker)
if i < 0:
    print("External Agents tile not found (already removed?)")
else:
    # Find the matching close of THIS Card. Walk forward until the
    # indent matches (10 spaces) for a line starting with "),".
    j = c.find("          ),\n", i)
    if j < 0:
        raise SystemExit("end marker not found")
    c = c[:i] + c[j + len(end_marker):]
    print("External Agents tile removed from Settings section")

# 3. Make the AI Engine section tappable. The current section is
# read-only. Wrap it in a Card that pushes the settings screen onTap.
old_section = """        // AI Engine (Phase 32 — read-only mirror of home node state).
        // (Note: the "Agent Network" tab on the home node is for onboarding
        // other nodes — pairing, fleet manifest, company invites — not the
        // AI engine. This is the AI engine.)
        if (nodeState.activeNode != null) ...[
          const _SectionHeader(title: 'AI Engine'),
          const AiEngineSection(),
          const SizedBox(height: 16),
        ],"""

new_section = """        // AI Engine (Phase 32 mirror + Phase EnvoyGo settings slice 2).
        // Tapping the section navigates to the AI Engine settings screen
        // (bridgeEnabled + openclawEnabled toggles).
        if (nodeState.activeNode != null) ...[
          const _SectionHeader(title: 'AI Engine'),
          Card(
            child: ListTile(
              leading: const Icon(Icons.psychology),
              title: const Text('AI Engine'),
              subtitle: const Text(
                'Bridge + OpenClaw toggles. Tap to configure.',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const AiEngineSettingsScreen(),
                  ),
                );
              },
            ),
          ),
          const AiEngineSection(),
          const SizedBox(height: 16),
        ],"""

if old_section not in c:
    print("AI Engine section anchor not found (already changed?)")
else:
    c = c.replace(old_section, new_section, 1)
    print("AI Engine section made tappable")

p.write_text(c)
print("OK")