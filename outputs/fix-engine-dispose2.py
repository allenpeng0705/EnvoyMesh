"""Fix the misplaced dispose() in AI Engine — move it from the
end-of-file (inside _ErrorView) to the State class.

The previous patch script's rfind("super.dispose();") found the
dispose in the _load() helper, not the State class. The new
dispose was appended AFTER the entire file's closing class brace.
"""
from pathlib import Path
p = Path("apps/envoygo/lib/screens/settings/ai_engine_settings_screen.dart")
c = p.read_text()

# 1. Find the State class's end (line 199ish — the closing "  }" of
# its build() method). The State class is `_AiEngineSettingsScreenState`
# which ends right before `class _StatusCard`.
state_marker = """          ),
    );
  }
}

class _StatusCard extends StatelessWidget {"""
state_replacement = """          ),
    );
  }

  @override
  void dispose() {
    _configUnsub?.call();
    _configUnsub = null;
    _clientSub?.close();
    _clientSub = null;
    super.dispose();
  }
}

class _StatusCard extends StatelessWidget {"""

if state_marker not in c:
    print("state marker not found")
    raise SystemExit(1)
c = c.replace(state_marker, state_replacement, 1)
print("Step 1: dispose() added to _AiEngineSettingsScreenState")

# 2. Remove the misplaced dispose() at the end of the file.
import re
misplaced = re.compile(
    r"\n  @override\n  void dispose\(\) \{\n    _configUnsub\?\.call\(\);\n    _configUnsub = null;\n    _clientSub\?\.close\(\);\n    _clientSub = null;\n    super\.dispose\(\);\n  \}\n?",
    re.MULTILINE,
)
new_c, n = misplaced.subn("", c, count=1)
if n != 1:
    print(f"WARNING: misplaced dispose removed {n} times (expected 1)")
c = new_c
print("Step 2: misplaced dispose() at end of file removed")

p.write_text(c)
print("OK")