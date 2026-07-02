"""Remove the External Agents tile from me_screen + delete the screen + client methods + runtime."""
import os
from pathlib import Path

# 1. Remove the External Agents tile from me_screen.dart.
p = Path("apps/envoygo/lib/screens/me/me_screen.dart")
c = p.read_text()
# The whole External Agents block (ListTile + onTap). Look for the
# unique tile leading: "leading: const Icon(Icons.shield_moon_outlined)".
start_marker = "                ListTile(\n                  leading: const Icon(Icons.shield_moon_outlined),"
end_marker = "                ),\n              ],\n            ),\n          ),\n          const SizedBox(height: 16),\n        ],\n"
i = c.find(start_marker)
if i < 0:
    print("tile not found (already removed?)")
else:
    j = c.find(end_marker, i)
    if j < 0:
        raise SystemExit("end marker not found")
    c = c[:i] + c[j + len(end_marker):]
    p.write_text(c)
    print("External Agents tile removed from me_screen.dart")

# 2. Remove the external_agents_settings_screen import.
import_marker = "import '../settings/external_agents_settings_screen.dart';\n"
if import_marker in c:
    c = p.read_text()
    c = c.replace(import_marker, "")
    p.write_text(c)
    print("import removed from me_screen.dart")

# 3. Delete the external_agents_settings_screen.dart file.
screen = Path("apps/envoygo/lib/screens/settings/external_agents_settings_screen.dart")
if screen.exists():
    os.remove(screen)
    print(f"deleted {screen}")

# 4. Remove the listExternalAgents + revokeExternalAgent client methods.
client = Path("apps/envoygo/lib/services/node_service_client.dart")
c = client.read_text()
# Find the section "External agents (Phase EnvoyGo settings slice 2)" and
# remove everything up to "// -- Contacts & bonds --".
import re
m = re.search(
    r"  // -- External agents \(Phase EnvoyGo settings slice 2\) --.*?(?=  // -- Contacts & bonds --)",
    c,
    re.DOTALL,
)
if m:
    c = c[:m.start()] + c[m.end():]
    client.write_text(c)
    print("client methods removed from node_service_client.dart")
else:
    print("client methods anchor not found (already removed?)")

# 5. Remove the home-node RPCs (json-rpc-router.ts) and the runtime
# methods (node-service-impl.ts). The patch scripts are scratch — they
# stay in outputs/ for history. The actual code changes:
# - node-service-impl.ts: remove the field + the 2 methods + the
#   import.
# - json-rpc-router.ts: remove the 2 cases.

# node-service-impl.ts: remove the field + the gateway import.
nsi = Path("apps/node/src/node-service-impl.ts")
c = nsi.read_text()
# Field
field_anchor = "\n  private readonly _externalAgentGateway = new ExternalAgentGateway();"
if field_anchor in c:
    c = c.replace(field_anchor, "", 1)
    print("node-service-impl.ts: _externalAgentGateway field removed")
# Gateway import
import_anchor = 'import { ExternalAgentGateway } from "./external-agent-gateway.js";\n'
if import_anchor in c:
    c = c.replace(import_anchor, "", 1)
    print("node-service-impl.ts: ExternalAgentGateway import removed")
# Methods
methods_anchor = """  async listExternalAgents(_params?: ListExternalAgentsParams): Promise<ListExternalAgentsResult> {
    const sessions = this._externalAgentGateway.listAgents(true);
    return { agents: sessions };
  }

  async revokeExternalAgent(params: RevokeExternalAgentParams): Promise<RevokeExternalAgentResult> {
    const alreadyRevoked = !this._externalAgentGateway.getAgent(params.agentId);
    const revoked = this._externalAgentGateway.revokeAgent(params.agentId);
    return {
      ok: revoked,
      agentId: params.agentId,
      alreadyRevoked,
    };
  }

"""
if methods_anchor in c:
    c = c.replace(methods_anchor, "", 1)
    print("node-service-impl.ts: 2 methods removed")
nsi.write_text(c)

# json-rpc-router.ts: remove the 2 cases.
router = Path("apps/node/src/json-rpc-router.ts")
c = router.read_text()
cases_anchor = """    case "listExternalAgents":
      return ns.listExternalAgents();
    case "revokeExternalAgent":
      return ns.revokeExternalAgent(
        params as unknown as import("@envoymesh/api").RevokeExternalAgentParams,
      );
"""
if cases_anchor in c:
    c = c.replace(cases_anchor, "", 1)
    print("json-rpc-router.ts: 2 cases removed")
router.write_text(c)

# 6. api package: revert the type additions (keep the RpcMethods union
# clean — the union re-exports forward to dist which the home node
# would need to rebuild anyway).
# Drop the new types from ws-protocol.ts.
wp = Path("packages/api/src/ws-protocol.ts")
c = wp.read_text()
new_types_marker = """

/* ---- Phase EnvoyGo settings (slice 2): External Agents ----
 * Mirror the in-process `ExternalAgentSession` from
 * `apps/node/src/external-agent-gateway.ts`. Keep these in sync. */
export type ExternalAgentCapability =
    | "find_knowledge"
    | "find_contact"
    | "send_message"
    | "get_owner_profile"
    | "query_graph"
    | "list_sessions"
    | "get_escalation_status";
export interface ExternalAgentConfig {
    agentId: string;
    agentPeerId: string;
    agentName: string;
    authorizedBy: string;
    capabilities: ExternalAgentCapability[];
    createdAt: string;
    lastActivityAt: string;
    isRevoked: boolean;
    revokedAt?: string;
}
export interface ListExternalAgentsParams {}
export interface ListExternalAgentsResult {
    agents: ExternalAgentConfig[];
}
export interface RevokeExternalAgentParams {
    agentId: string;
}
export interface RevokeExternalAgentResult {
    ok: boolean;
    agentId: string;
    alreadyRevoked: boolean;
}
"""
if new_types_marker in c:
    c = c.replace(new_types_marker, "", 1)
    wp.write_text(c)
    print("ws-protocol.ts: External Agents types removed")

# Drop from RpcMethods union.
c = wp.read_text()
if " | \"listExternalAgents\"" in c and " | \"revokeExternalAgent\"" in c:
    c = c.replace(" | \"listExternalAgents\" | \"revokeExternalAgent\" | ", " | ", 1)
    wp.write_text(c)
    print("ws-protocol.ts: RpcMethods union trimmed")

# Drop from node-service.ts.
ns = Path("packages/api/src/node-service.ts")
c = ns.read_text()
methods_marker = """  /** Phase EnvoyGo settings (slice 2): list external agents authorized to call local tools. */
  listExternalAgents(params?: ListExternalAgentsParams): Promise<ListExternalAgentsResult>;

  /** Phase EnvoyGo settings (slice 2): revoke an external agent's authorization. */
  revokeExternalAgent(params: RevokeExternalAgentParams): Promise<RevokeExternalAgentResult>;

"""
if methods_marker in c:
    c = c.replace(methods_marker, "", 1)
    print("node-service.ts: 2 interface methods removed")
# Drop the type imports.
imports_marker = """  ListExternalAgentsParams,
  ListExternalAgentsResult,
  RevokeExternalAgentParams,
  RevokeExternalAgentResult,
"""
if imports_marker in c:
    c = c.replace(imports_marker, "", 1)
    print("node-service.ts: 4 type imports removed")
ns.write_text(c)

print("\nAll External Agents wiring removed. Ready for AI Engine screen.")