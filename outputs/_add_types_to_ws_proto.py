"""Append new Phase 2 types to ws-protocol.ts."""
from pathlib import Path
p = Path("packages/api/src/ws-protocol.ts")
c = p.read_text()
if "ListExternalAgentsParams" in c:
    print("already appended")
    raise SystemExit(0)
# Append at the end. The file doesn't have a sourceMappingURL line in
# the .ts file (that's only in .d.ts), so we just append.
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
c = c.rstrip() + new_types
p.write_text(c)
print(f"OK: {len(c)} chars total")