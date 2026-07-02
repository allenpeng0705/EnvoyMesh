"""Append new protocol types for Phase 2."""
from pathlib import Path
p = Path("packages/api/src/ws-protocol.d.ts")
c = p.read_text()
# Insert new types right before the sourceMappingURL line.
marker = "//# sourceMappingURL=ws-protocol.d.ts.map"
if marker not in c:
    raise SystemExit("sourceMappingURL marker not found")
new_types = """
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
c = c.replace(marker, new_types + marker, 1)
p.write_text(c)
print("OK")