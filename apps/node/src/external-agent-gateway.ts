/**
 * External Agent Gateway
 *
 * Provides secure local tools API for external agents (OpenClaw, HomeClaw, etc.)
 * External agents interact exclusively via these tools - never directly call libp2p.
 *
 * Security model:
 * - External agents authenticate via agent credential
 * - All actions are logged with externalAgent: true flag
 * - Sensitive actions go through approval queue
 * - Owner can revoke agent access
 */

import { randomUUID } from "node:crypto";

/**
 * External agent session.
 */
export interface ExternalAgentSession {
  agentId: string;
  agentPeerId: string;
  agentName: string;
  authorizedBy: string; // Owner ownerId
  capabilities: ExternalAgentCapability[];
  createdAt: string;
  lastActivityAt: string;
  isRevoked: boolean;
  revokedAt?: string;
}

/**
 * External agent capability.
 */
export type ExternalAgentCapability =
  | "find_knowledge"
  | "find_contact"
  | "send_message"
  | "get_owner_profile"
  | "query_graph"
  | "list_sessions"
  | "get_escalation_status";

/**
 * External agent action log entry.
 */
export interface ExternalAgentAction {
  id: string;
  agentId: string;
  toolName: string;
  params: Record<string, unknown>;
  outcome: "success" | "denied" | "error";
  error?: string;
  requiresApproval: boolean;
  approvedItemId?: string;
  timestamp: string;
  durationMs: number;
}

/**
 * External agent action context.
 */
export interface ExternalAgentContext {
  agentId: string;
  agentPeerId: string;
  capabilities: ExternalAgentCapability[];
}

/**
 * Default capabilities for external agents.
 */
export const DEFAULT_AGENT_CAPABILITIES: ExternalAgentCapability[] = [
  "find_knowledge",
  "find_contact",
  "send_message",
  "get_owner_profile",
];

/**
 * Create an external agent session.
 */
export function createExternalAgentSession(
  agentId: string,
  agentPeerId: string,
  agentName: string,
  authorizedBy: string,
  capabilities: ExternalAgentCapability[] = DEFAULT_AGENT_CAPABILITIES,
): ExternalAgentSession {
  const now = new Date().toISOString();
  return {
    agentId,
    agentPeerId,
    agentName,
    authorizedBy,
    capabilities,
    createdAt: now,
    lastActivityAt: now,
    isRevoked: false,
  };
}

/**
 * External Agent Gateway manages external agent access.
 */
export class ExternalAgentGateway {
  private sessions: Map<string, ExternalAgentSession>;
  private actionLogs: ExternalAgentAction[];
  private maxLogEntries: number;

  constructor(maxLogEntries = 1000) {
    this.sessions = new Map();
    this.actionLogs = [];
    this.maxLogEntries = maxLogEntries;
  }

  /**
   * Register a new external agent session.
   */
  registerAgent(session: ExternalAgentSession): void {
    this.sessions.set(session.agentId, session);
  }

  /**
   * Get an agent session.
   */
  getAgent(agentId: string): ExternalAgentSession | undefined {
    return this.sessions.get(agentId);
  }

  /**
   * Revoke an agent's access.
   */
  revokeAgent(agentId: string): boolean {
    const session = this.sessions.get(agentId);
    if (!session) return false;

    session.isRevoked = true;
    session.revokedAt = new Date().toISOString();
    return true;
  }

  /**
   * Check if an agent has a specific capability.
   */
  hasCapability(agentId: string, capability: ExternalAgentCapability): boolean {
    const session = this.sessions.get(agentId);
    if (!session || session.isRevoked) return false;
    return session.capabilities.includes(capability);
  }

  /**
   * Check if an agent is authorized.
   */
  isAuthorized(agentId: string): boolean {
    const session = this.sessions.get(agentId);
    return session !== undefined && !session.isRevoked;
  }

  /**
   * Update agent's last activity.
   */
  touchAgent(agentId: string): void {
    const session = this.sessions.get(agentId);
    if (session) {
      session.lastActivityAt = new Date().toISOString();
    }
  }

  /**
   * Log an external agent action.
   */
  logAction(action: Omit<ExternalAgentAction, "id" | "timestamp">): ExternalAgentAction {
    const fullAction: ExternalAgentAction = {
      ...action,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    this.actionLogs.push(fullAction);

    // Trim log if needed
    if (this.actionLogs.length > this.maxLogEntries) {
      this.actionLogs = this.actionLogs.slice(-this.maxLogEntries);
    }

    return fullAction;
  }

  /**
   * Get action logs for an agent.
   */
  getAgentActions(agentId: string, limit = 50): ExternalAgentAction[] {
    return this.actionLogs
      .filter((a) => a.agentId === agentId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get all action logs.
   */
  getAllActions(limit = 100): ExternalAgentAction[] {
    return this.actionLogs.slice(-limit).reverse();
  }

  /**
   * List all registered agents.
   */
  listAgents(includeRevoked = false): ExternalAgentSession[] {
    const sessions = Array.from(this.sessions.values());
    if (includeRevoked) {
      return sessions.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    return sessions
      .filter((s) => !s.isRevoked)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Clear all logs.
   */
  clearLogs(): void {
    this.actionLogs = [];
  }
}

/**
 * Build the mesh.list-external-sessions tool.
 */
export function buildListExternalSessionsTool(
  gateway: ExternalAgentGateway,
): (params: Record<string, unknown>) => Promise<{
  ok: boolean;
  agents: ExternalAgentSession[];
  count: number;
}> {
  return async (params) => {
    const includeRevoked = params.includeRevoked as boolean | undefined;
    const agents = gateway.listAgents(includeRevoked);
    return { ok: true, agents, count: agents.length };
  };
}

/**
 * Build the mesh.revoke-external-agent tool.
 */
export function buildRevokeExternalAgentTool(
  gateway: ExternalAgentGateway,
): (params: Record<string, unknown>) => Promise<{
  ok: boolean;
  agentId?: string;
  error?: string;
}> {
  return async (params) => {
    const agentId = params.agentId as string | undefined;

    if (!agentId) {
      return { ok: false, error: "agentId is required" };
    }

    const revoked = gateway.revokeAgent(agentId);
    if (!revoked) {
      return { ok: false, error: "Agent not found" };
    }

    return { ok: true, agentId };
  };
}

/**
 * Build the mesh.list-external-agent-actions tool.
 */
export function buildListExternalAgentActionsTool(
  gateway: ExternalAgentGateway,
): (params: Record<string, unknown>) => Promise<{
  ok: boolean;
  actions: ExternalAgentAction[];
  count: number;
  agentId?: string;
}> {
  return async (params) => {
    const agentId = params.agentId as string | undefined;
    const limit = (params.limit as number | undefined) || 50;

    let actions: ExternalAgentAction[];
    if (agentId) {
      actions = gateway.getAgentActions(agentId, limit);
    } else {
      actions = gateway.getAllActions(limit);
    }

    return { ok: true, actions, count: actions.length, agentId };
  };
}

/**
 * Build the mesh.get-external-agent tool.
 */
export function buildGetExternalAgentTool(
  gateway: ExternalAgentGateway,
): (params: Record<string, unknown>) => Promise<{
  ok: boolean;
  agent?: ExternalAgentSession;
  error?: string;
}> {
  return async (params) => {
    const agentId = params.agentId as string | undefined;

    if (!agentId) {
      return { ok: false, error: "agentId is required" };
    }

    const agent = gateway.getAgent(agentId);
    if (!agent) {
      return { ok: false, error: "Agent not found" };
    }

    return { ok: true, agent };
  };
}

/**
 * Create a context for external agent action logging.
 */
export function createExternalAgentContext(
  agentId: string,
  agentPeerId: string,
  capabilities: ExternalAgentCapability[],
): ExternalAgentContext {
  return { agentId, agentPeerId, capabilities };
}
