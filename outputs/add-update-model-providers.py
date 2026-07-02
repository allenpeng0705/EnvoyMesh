"""Add updateModelProviders to node_service_client.dart."""
from pathlib import Path
p = Path("apps/envoygo/lib/services/node_service_client.dart")
c = p.read_text()
old = """  Future<Map<String, dynamic>> getNodeConfig() async {
    return await _client.call('getNodeConfig') as Map<String, dynamic>;
  }

  /// Fetch the full pairing payload from the home node, including
  /// bootstrap peer addresses for multi-relay fallback."""

new = """  Future<Map<String, dynamic>> getNodeConfig() async {
    return await _client.call('getNodeConfig') as Map<String, dynamic>;
  }

  /// AI model settings (Phase EnvoyGo settings) — push a partial
  /// `modelProviders` update to the home node. The home node accepts
  /// any `Partial<NodeConfig>` shape; the partial-update contract
  /// means callers can ship only the fields they want to change and
  /// leave everything else untouched.
  ///
  /// Returns `true` on success. Throws on transport / RPC error.
  Future<bool> updateModelProviders(
      Map<String, dynamic> modelProvidersPatch) async {
    final result = await _client.call('updateNodeConfig', {
      'modelProviders': modelProvidersPatch,
    }) as Map<String, dynamic>;
    return result['ok'] == true;
  }

  /// Fetch the full pairing payload from the home node, including
  /// bootstrap peer addresses for multi-relay fallback."""

if old not in c:
    raise SystemExit("anchor not found")
c = c.replace(old, new, 1)
p.write_text(c)
print("OK")