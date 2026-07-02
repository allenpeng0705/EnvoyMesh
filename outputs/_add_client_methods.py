"""Add listExternalAgents + revokeExternalAgent to NodeServiceClient."""
from pathlib import Path
p = Path("apps/envoygo/lib/services/node_service_client.dart")
c = p.read_text()
if "listExternalAgents" in c and "revokeExternalAgent" in c:
    print("already added")
    raise SystemExit(0)
# Insert before "// -- Contacts & bonds --"
anchor = "  // -- Contacts & bonds --"
new_methods = '''  // -- External agents (Phase EnvoyGo settings slice 2) --
  /// List all external agents authorized to call local tools
  /// (OpenClaw, HomeClaw, etc.).
  Future<List<Map<String, dynamic>>> listExternalAgents() async {
    final result = await _client.call('listExternalAgents');
    final map = result as Map<String, dynamic>;
    final agents = (map['agents'] as List<dynamic>?) ?? const [];
    return agents.cast<Map<String, dynamic>>();
  }

  /// Revoke an external agent's authorization.
  /// Returns null on success, or an error message.
  Future<String?> revokeExternalAgent(String agentId) async {
    try {
      await _client.call('revokeExternalAgent', {'agentId': agentId});
      return null;
    } catch (e) {
      return e.toString();
    }
  }

''' + anchor
if anchor not in c:
    raise SystemExit("anchor not found")
c = c.replace(anchor, new_methods, 1)
p.write_text(c)
print("OK")