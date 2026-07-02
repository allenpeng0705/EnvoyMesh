"""Fix nodeServiceClient access in external_agents_settings_screen.dart."""
from pathlib import Path
p = Path("apps/envoygo/lib/screens/settings/external_agents_settings_screen.dart")
c = p.read_text()
if "nodeServiceProvider" in c and "nodeProvider).nodeServiceClient" not in c:
    print("already fixed")
    raise SystemExit(0)

# 1. Swap the import.
old_imp = "import '../../providers/node_provider.dart';"
new_imp = "import '../../providers/contact_provider.dart' show nodeServiceProvider;"
if old_imp not in c:
    raise SystemExit("import anchor not found")
c = c.replace(old_imp, new_imp, 1)

# 2. Swap the two calls.
old_use = "ref.read(nodeProvider).nodeServiceClient"
new_use = "ref.read(nodeServiceProvider)"
n = c.count(old_use)
if n == 0:
    raise SystemExit("usage anchor not found")
c = c.replace(old_use, new_use)

p.write_text(c)
print(f"OK: swapped {n} usages")