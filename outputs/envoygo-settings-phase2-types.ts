// @ts-nocheck - ambient module; types verified at use sites.

/** Phase EnvoyGo settings (slice 2) — External Agents protocol.
 *  Mirror the in-process `ExternalAgentSession` from
 *  `apps/node/src/external-agent-gateway.ts`. Keep these in sync.
 */
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