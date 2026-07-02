"""Three fixes for the bidirectional sync build errors:

1. Add `on()` method to `NodeServiceClient` (delegates to the
   underlying HomeRemoteClient). The current code calls `next.on(...)`
   on a `NodeServiceClient?`, but only the underlying HomeRemoteClient
   has the `on()` method. Without this delegation, the compile
   fails with "The method 'on' isn't defined for the type
   'NodeServiceClient'".

2. AI Engine import: `NodeServiceClient` is not imported (the import
   line only imports `nodeServiceProvider`). Add it to the `show`
   clause so the type is in scope.

3. AI Engine dispose() was appended after the class close brace
   (by the patch script's `c.rfind("super.dispose();")` heuristic),
   landing INSIDE the private `_ErrorView` class instead of
   `_AiEngineSettingsScreenState`. The fix: move the dispose() to
   the State class, and remove the misplaced one.
"""
from pathlib import Path

# === Fix 1: add on() method to NodeServiceClient ===
nsc = Path("apps/envoygo/lib/services/node_service_client.dart")
c = nsc.read_text()
# Insert the new on() method right after the constructor ends (i.e.
# right after the "}" that closes the constructor body).
# The constructor is at line 55. Find a unique anchor: the dispose()
# method signature.
old_anchor = """  void dispose() {"""
if old_anchor not in c:
    raise SystemExit("dispose() anchor not found in node_service_client.dart")
new_on = """  /// Subscribe to a push event from the home node. Returns an
  /// unsubscribe function. Re-exposes the underlying
  /// [HomeRemoteClient.on] so the settings screens can listen for
  /// `home:config-updated`.
  void Function() on(String event, void Function(dynamic) handler) {
    return _client.on(event, handler);
  }

  void dispose() {"""
c = c.replace(old_anchor, new_on, 1)
nsc.write_text(c)
print("Fix 1: NodeServiceClient.on() added")

# === Fix 2: AI Engine import — add NodeServiceClient to the import ===
ae = Path("apps/envoygo/lib/screens/settings/ai_engine_settings_screen.dart")
c = ae.read_text()
old_imp = "import '../../providers/contact_provider.dart' show nodeServiceProvider;"
new_imp = (
    "import '../../providers/contact_provider.dart' show nodeServiceProvider;\n"
    "import '../../services/node_service_client.dart' show NodeServiceClient;"
)
if "NodeServiceClient" in c.split("\n", 30)[0:30][0:30] or "show NodeServiceClient" in c:
    print("Fix 2: NodeServiceClient import already present (skipping)")
else:
    c = c.replace(old_imp, new_imp, 1)
    print("Fix 2: NodeServiceClient import added to AI Engine")

# === Fix 3: move the misplaced dispose() from _ErrorView to the State
# class. ===
# Find the State class's "}" — it currently has no dispose() method.
# We need to:
#   1. Add dispose() to the State class (right after the last field
#      declaration or after initState).
#   2. Remove the misplaced dispose() that's inside _ErrorView.

# Find the State class's closing "  }" — it's right before the first
# private widget class (`_StatusCard`). The State class ends with
# _load() and a closing "  }".
import re
# 1. Find the end of the State class.
state_end_re = re.compile(
    r"(  Future<void> _save\(\) async \{[\s\S]*?return ok;[\s\S]*?await.*?\}\s*\n\s*\n  \}\n)",
    re.MULTILINE,
)
m = state_end_re.search(c)
if not m:
    raise SystemExit("could not find State class end")
state_end = m.end()
print(f"State class ends at offset {state_end}")

# 2. Find the misplaced dispose() inside _ErrorView. It's the unique
# block that contains _configUnsub inside _ErrorView (right after
# _ErrorView's class close "  }").
misplaced_re = re.compile(
    r"(\n  @override\n  void dispose\(\) \{\n    _configUnsub\?\.call\(\);\n    _configUnsub = null;\n    _clientSub\?\.close\(\);\n    _clientSub = null;\n    super\.dispose\(\);\n  \})",
    re.MULTILINE,
)
m_misplaced = misplaced_re.search(c)
if not m_misplaced:
    raise SystemExit("could not find misplaced dispose()")

# Sanity: the misplaced one is in _ErrorView. The State class is
# before _ErrorView, so the State class ends BEFORE the misplaced
# dispose.
if m_misplaced.start() < state_end:
    print("misplaced dispose is inside the State class — unexpected")
    raise SystemExit(1)

# 3. Insert a new dispose() right at the State class end.
new_dispose = """\n  @override
  void dispose() {
    _configUnsub?.call();
    _configUnsub = null;
    _clientSub?.close();
    _clientSub = null;
    super.dispose();
  }
"""
c = c[:state_end] + new_dispose + c[state_end:]

# 4. Remove the misplaced dispose() inside _ErrorView.
c = misplaced_re.sub("", c)
ae.write_text(c)
print("Fix 3: dispose() moved from _ErrorView to the State class")

print("\nAll three fixes applied.")