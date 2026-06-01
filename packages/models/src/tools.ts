/**
 * Local Agent Tool Registry — types and policy
 *
 * Provides safe, auditable, policy-gated local tools that the orchestrator (model)
 * can call. Tools are local-only: they cannot send libp2p messages directly.
 * Outbound network traffic remains Envoy-controlled (via the mesh runtime).
 *
 * Design principles:
 * - Tools are defined as declarative descriptors — no direct implementation coupling
 * - Every tool call goes through evaluateToolPolicy() before execution
 * - All tool calls are audited via the existing audit event system
 * - Tools are read-only or minimally-side-effecting; no direct network egress
 * - Tool results are returned to the caller (model/orchestrator) only after policy passes
 *
 * Type-only dependencies: @envoymesh/protocol
 */

import type { Sensitivity } from "@envoymesh/protocol";

function toolAuditRandomId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

// ─── Tool descriptor ───────────────────────────────────────────────────────────

/**
 * Input parameter descriptor for a tool.
 */
export interface ToolParamDescriptor {
  name: string;
  description: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  required: boolean;
  defaultValue?: unknown;
}

/**
 * A declarative local tool descriptor.
 * Tools are registered in the registry and evaluated through policy before execution.
 */
export interface LocalToolDescriptor {
  /** Unique tool name, e.g. "vault_search". */
  name: string;
  /** Human-readable description shown to the model/orchestrator. */
  description: string;
  /** Ordered list of input parameters. */
  parameters: ToolParamDescriptor[];
  /** Minimum sensitivity level required to call this tool. */
  minSensitivity: Sensitivity;
  /** Whether calling this tool requires explicit owner approval. */
  requiresApproval: boolean;
  /**
   * Optional tag hints for capability matching.
   * Used by discovery when another peer asks what tools are available.
   */
  capabilityTags?: string[];
  /**
   * Optional filesystem path prefixes this tool is allowed to access.
   * If undefined, the tool has no path restrictions.
   * Paths must be normalized (no trailing slash, no `.` or `..` components).
   * Used by tool implementations to enforce allowlist checks.
   */
  allowedPaths?: readonly string[];
  /**
   * Maximum number of times this tool may be invoked per hour.
   * If undefined, no rate limit is enforced.
   * Enforced by the tool runtime guard before calling the implementation.
   */
  maxInvocationsPerHour?: number;
}

export type ToolCallPolicyDecision =
  | { action: "allow" }
  | { action: "deny"; reason: string }
  | { action: "approval_required"; reason: string };

export interface ToolCallRequest {
  toolName: string;
  parameters: Record<string, unknown>;
  callerSensitivity: Sensitivity;
  requesterPeerId?: string;
  requesterOwnerId?: string;
  correlationId?: string;
}

export interface ToolCallResult {
  ok: boolean;
  toolName: string;
  output?: unknown;
  error?: string;
  policyDecision: ToolCallPolicyDecision;
  auditEvent: ToolCallAuditEvent;
}

export interface ToolCallAuditEvent {
  version: "0.1";
  eventId: string;
  createdAt: string;
  toolName: string;
  outcome: "allow" | "deny" | "approval_required";
  reason?: string;
  requesterPeerId?: string;
  requesterOwnerId?: string;
  correlationId?: string;
  parameters?: Record<string, unknown>;
}

// ─── Policy evaluation ────────────────────────────────────────────────────────

const sensitivityRank: Record<Sensitivity, number> = {
  public: 0,
  friends: 1,
  trusted: 2,
  private: 3,
};

function sensitivityAllowed(requested: Sensitivity, ceiling: Sensitivity): boolean {
  return sensitivityRank[requested] <= sensitivityRank[ceiling];
}

/**
 * Evaluate whether a tool call is allowed given the caller's sensitivity and
 * whether the tool requires approval.
 */
export function evaluateToolPolicy(
  tool: LocalToolDescriptor,
  callerSensitivity: Sensitivity,
  requireApproval: boolean,
): ToolCallPolicyDecision {
  // Check sensitivity floor
  if (!sensitivityAllowed(tool.minSensitivity, callerSensitivity)) {
    return {
      action: "deny",
      reason: `${tool.name} requires sensitivity >= ${tool.minSensitivity}, caller has ${callerSensitivity}`,
    };
  }

  // Check approval requirement
  if (tool.requiresApproval && requireApproval) {
    return {
      action: "approval_required",
      reason: `${tool.name} requires owner approval`,
    };
  }

  return { action: "allow" };
}

// ─── Tool implementation signature ─────────────────────────────────────────────

/**
 * A tool implementation — receives validated parameters and returns a result.
 * Implementations must not send libp2p messages directly; all outbound
 * traffic goes through the Envoy mesh runtime.
 */
export type ToolImplementation = (params: Record<string, unknown>) => Promise<unknown>;

// ─── Tool Registry ─────────────────────────────────────────────────────────────

interface RegisteredTool extends LocalToolDescriptor {
  execute: ToolImplementation;
}

/**
 * Local tool registry — holds all available tools and evaluates/calls them
 * through policy and audit.
 */
export class LocalToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(tool: LocalToolDescriptor, execute: ToolImplementation): void {
    this.tools.set(tool.name, { ...tool, execute });
  }

  listDescriptors(): LocalToolDescriptor[] {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      minSensitivity: t.minSensitivity,
      requiresApproval: t.requiresApproval,
      capabilityTags: t.capabilityTags,
      allowedPaths: t.allowedPaths,
      maxInvocationsPerHour: t.maxInvocationsPerHour,
    }));
  }

  getDescriptor(name: string): LocalToolDescriptor | undefined {
    const tool = this.tools.get(name);
    if (!tool) return undefined;
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      minSensitivity: tool.minSensitivity,
      requiresApproval: tool.requiresApproval,
      capabilityTags: tool.capabilityTags,
      allowedPaths: tool.allowedPaths,
      maxInvocationsPerHour: tool.maxInvocationsPerHour,
    };
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  async callTool(
    request: ToolCallRequest,
    requireApproval: boolean,
  ): Promise<ToolCallResult> {
    const tool = this.tools.get(request.toolName);
    const now = new Date().toISOString();

    if (!tool) {
      const auditEvent: ToolCallAuditEvent = {
        version: "0.1",
        eventId: `tool_${toolAuditRandomId()}`,
        createdAt: now,
        toolName: request.toolName,
        outcome: "deny",
        reason: `unknown tool: ${request.toolName}`,
        requesterPeerId: request.requesterPeerId,
        requesterOwnerId: request.requesterOwnerId,
        correlationId: request.correlationId,
        parameters: request.parameters,
      };
      return {
        ok: false,
        toolName: request.toolName,
        error: `unknown tool: ${request.toolName}`,
        policyDecision: { action: "deny", reason: "unknown tool" },
        auditEvent,
      };
    }

    const policyDecision = evaluateToolPolicy(tool, request.callerSensitivity, requireApproval);

    const auditEvent: ToolCallAuditEvent = {
      version: "0.1",
      eventId: `tool_${toolAuditRandomId()}`,
      createdAt: now,
      toolName: tool.name,
      outcome: policyDecision.action,
      reason: policyDecision.action !== "allow" ? policyDecision.reason : undefined,
      requesterPeerId: request.requesterPeerId,
      requesterOwnerId: request.requesterOwnerId,
      correlationId: request.correlationId,
      parameters: request.parameters,
    };

    if (policyDecision.action !== "allow") {
      return {
        ok: false,
        toolName: tool.name,
        error: policyDecision.reason,
        policyDecision,
        auditEvent,
      };
    }

    try {
      const output = await tool.execute(request.parameters);
      return {
        ok: true,
        toolName: tool.name,
        output,
        policyDecision,
        auditEvent,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        toolName: tool.name,
        error: errorMessage,
        policyDecision,
        auditEvent,
      };
    }
  }
}

// ─── Standard tool descriptors (for discovery / capability listing) ─────────────

/** Standard vault_search tool descriptor — for capability advertising only. */
export const VAULT_SEARCH_TOOL: LocalToolDescriptor = {
  name: "vault_search",
  description:
    "Search the local vault for documents matching a query. " +
    "Returns document titles, snippets, and relevance scores. " +
    "Does not return raw file paths outside the vault.",
  parameters: [
    {
      name: "query",
      description: "Search query string",
      type: "string",
      required: true,
    },
  ],
  minSensitivity: "public",
  requiresApproval: false,
  capabilityTags: ["vault.search", "knowledge.query"],
};

/** Standard peer_lookup tool descriptor — for capability advertising only. */
export const PEER_LOOKUP_TOOL: LocalToolDescriptor = {
  name: "peer_lookup",
  description:
    "Look up information about a known peer by their owner ID. " +
    "Returns peer ID, display name, and last-seen timestamp if the peer is in the directory.",
  parameters: [
    {
      name: "ownerId",
      description: "The owner's identity string (e.g. envoy:owner:...)",
      type: "string",
      required: true,
    },
  ],
  minSensitivity: "public",
  requiresApproval: false,
  capabilityTags: ["peer.lookup", "mesh.listen"],
};

/** Standard task_summary tool descriptor — for capability advertising only. */
export const TASK_SUMMARY_TOOL: LocalToolDescriptor = {
  name: "task_summary",
  description:
    "Get a summary count of all tasks in the local task journal, grouped by lifecycle state. " +
    "Does not reveal task content, only aggregate counts per state.",
  parameters: [],
  minSensitivity: "public",
  requiresApproval: false,
  capabilityTags: ["task.execute", "task.summary"],
};

// ─── Agent adapter tool descriptors (Phase 8G) ──────────────────────────────────

/**
 * mesh_findCapability — for external agents (OpenClaw/HomeClaw) to discover
 * which contacts match a set of keywords, through EnvoyMesh policy.
 *
 * This is the ONLY way an external agent can discover mesh peers.
 * External agents cannot call libp2p directly.
 *
 * Policy: only returns results for bonded (direct/referred) contacts.
 * Results are redacted: no raw peer IDs, listen addrs, or private metadata.
 */
export const MESH_FIND_CAPABILITY_TOOL: LocalToolDescriptor = {
  name: "mesh_findCapability",
  description:
    "Search bonded contacts by keywords and/or capability tags (Profile About tags sync into manifests on save). " +
    "Returns redacted contacts with capabilityTags and suggestedRouteId for agent orchestration. " +
    "Libp2p direct access is not allowed.",
  parameters: [
    {
      name: "keywords",
      description: "Keyword strings matched against display name and capability tags",
      type: "array",
      required: false,
    },
    {
      name: "capabilityIds",
      description: "Capability tags that must be present on the peer Agent Card",
      type: "array",
      required: false,
    },
    {
      name: "maxResults",
      description: "Maximum number of results to return (default 5)",
      type: "number",
      required: false,
      defaultValue: 5,
    },
  ],
  minSensitivity: "public",
  requiresApproval: false,
  capabilityTags: ["mesh.discovery", "mesh.findCapability"],
};

/**
 * mesh_requestKnowledge — for external agents to ask a specific contact for knowledge,
 * routed through EnvoyMesh policy.
 *
 * Policy: requires the caller (external agent, treated as private sensitivity)
 * to have a direct bond with the target owner. The knowledge.query EMP message
 * is signed by EnvoyMesh. The response is redacted before being returned.
 */
export const MESH_REQUEST_KNOWLEDGE_TOOL: LocalToolDescriptor = {
  name: "mesh_requestKnowledge",
  description:
    "Send a knowledge query to a specific bonded contact through EnvoyMesh. " +
    "The query is signed and routed by EnvoyMesh. Returns a safe, redacted answer. " +
    "Requires a direct bond with the target owner.",
  parameters: [
    {
      name: "targetOwnerId",
      description: "The owner's identity string (e.g. envoy:owner:...) of the target contact",
      type: "string",
      required: true,
    },
    {
      name: "query",
      description: "The knowledge query to send",
      type: "string",
      required: true,
    },
  ],
  minSensitivity: "public",
  requiresApproval: false,
  capabilityTags: ["mesh.knowledge", "mesh.requestKnowledge"],
};

/**
 * mesh_sendChat — for external agents to send a chat message to a bonded contact
 * through EnvoyMesh policy.
 *
 * Policy: requires a direct bond with the target owner. The chat.message EMP
 * is signed by EnvoyMesh.
 */
export const MESH_SEND_CHAT_TOOL: LocalToolDescriptor = {
  name: "mesh_sendChat",
  description:
    "Send a chat message to a specific bonded contact through EnvoyMesh. " +
    "The message is signed and routed by EnvoyMesh. " +
    "Requires a direct bond with the target owner.",
  parameters: [
    {
      name: "targetOwnerId",
      description: "The owner's identity string (e.g. envoy:owner:...) of the target contact",
      type: "string",
      required: true,
    },
    {
      name: "text",
      description: "The chat message text to send",
      type: "string",
      required: true,
    },
  ],
  minSensitivity: "public",
  requiresApproval: false,
  capabilityTags: ["mesh.chat", "mesh.sendChat"],
};

/**
 * mesh_listContacts — for external agents to list their bonded contacts
 * through EnvoyMesh policy.
 *
 * Policy: returns only bonded contacts. Results are redacted: no raw peer IDs,
 * listen addrs, or private metadata. The caller sensitivity acts as a ceiling.
 */
export const MESH_LIST_CONTACTS_TOOL: LocalToolDescriptor = {
  name: "mesh_listContacts",
  description:
    "List all bonded contacts in the EnvoyMesh. " +
    "Results are redacted: no raw peer IDs, listen addresses, or private metadata. " +
    "Only bonded (direct/referred) contacts are visible to external agents.",
  parameters: [
    {
      name: "minLevel",
      description: "Minimum trust level to return ('direct' or 'referred'). Default: 'direct'",
      type: "string",
      required: false,
      defaultValue: "direct",
    },
  ],
  minSensitivity: "public",
  requiresApproval: false,
  capabilityTags: ["mesh.contacts", "mesh.listContacts"],
};
