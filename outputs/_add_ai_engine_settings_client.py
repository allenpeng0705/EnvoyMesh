"""Add updateAiEngineSettings to the client (uses the existing updateNodeConfig RPC)."""
from pathlib import Path
p = Path("apps/envoygo/lib/services/node_service_client.dart")
c = p.read_text()
if "updateAiEngineSettings" in c:
    print("already added")
    raise SystemExit(0)
# Insert right after getOpenClawStatus (before "// -- Terminals --" anchor).
anchor = "  // -- Terminals --"
new_block = '''  /// Update the AI Engine toggles on the home node. Mirrors the
  /// Social UI's "AI Engine" section in the home node's
  /// SettingsAITab.
  /// [bridgeEnabled] — whether the assistant bridge is active.
  /// [openclawEnabled] — whether the built-in OpenClaw gateway is
  /// spawned on next node start.
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