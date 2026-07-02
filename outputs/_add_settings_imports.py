"""Add the settings screen imports to me_screen.dart."""
from pathlib import Path
p = Path("apps/envoygo/lib/screens/me/me_screen.dart")
c = p.read_text()
if "ai_model_settings_screen" in c and "external_agents_settings_screen" in c:
    print("already imported")
    raise SystemExit(0)

# Anchor on the riverpod import block — find a nearby line that we
# know is in the imports area.
old = "import 'package:flutter_riverpod/flutter_riverpod.dart';"
new = '''import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../settings/ai_model_settings_screen.dart';
import '../settings/external_agents_settings_screen.dart';'''
if old not in c:
    raise SystemExit("riverpod import anchor not found")
c = c.replace(old, new, 1)
p.write_text(c)
print("OK")