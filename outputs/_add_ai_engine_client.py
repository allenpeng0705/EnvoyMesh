"""Add getOpenClawStatus client method to NodeServiceClient."""
from pathlib import Path
p = Path("apps/envoygo/lib/services/node_service_client.dart")
c = p.read_text()
if "getOpenClawStatus" in c:
    print("already added")
    raise SystemExit(0)

# Insert before the "// -- Contacts & bonds --" anchor.
anchor = "  // -- Contacts & bonds --"
new_block = '''  // -- AI Engine (Phase EnvoyGo settings slice 2 — AI Engine) --
  /// Read the home node's OpenClaw gateway status (running flag,
  /// port, child pid, etc.). Used by the AI Engine settings screen
  /// to show the current state.
  Future<Map<String, dynamic>?> getOpenClawStatus() async {
    try {
      final result = await _client.call('getOpenClawStatus');
      if (result == null) return null;
      return result as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  /// Update the AI Engine toggles on the home node.
  /// [bridgeEnabled] — whether the assistant bridge is active
  /// (default false).
  /// [openclawEnabled] — whether the built-in OpenClaw gateway is
  /// spawned on next node start (default true).
  Future<bool> updateAiEngineSettings({
    bool? bridgeEnabled,
    bool? openclawEnabled,
  }) async {
    final patch = <String, dynamic>{};
    if (bridgeEnabled != null) patch['bridgeEnabled'] = bridgeEnabled;
    if (openclawEnabled != null) patch['openclawEnabled'] = openclawEnabled;
    if (patch.isEmpty) return true;
    final result = await _client.call('updateNodeConfig', patch);
    return (result as Map<String, dynamic>)['ok'] == true;
  }

''' + anchor
if anchor not in c:
    raise SystemExit("anchor not found")
c = c.replace(anchor, new_block, 1)
p.write_text(c)
print("OK")