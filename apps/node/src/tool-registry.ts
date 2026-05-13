/**
 * Tool Registry for the AI Agent
 *
 * The agent uses tools to interact with the EnvoyMesh network.
 * Each tool maps to a mesh intent or local operation.
 *
 * Tool definitions are extensible: new intents automatically become available.
 */

import { randomUUID } from "node:crypto";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import { createAuditEvent } from "@envoymesh/local-store";
import { evaluatePolicy } from "@envoymesh/bonds";
import type { LocalTrustStore, LocalPeerDirectoryStore, LocalTaskStore } from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  createUnsignedEnvelope,
  createChatMessagePayload,
  createKnowledgeQueryPayload,
  createDiscoveryRequestPayload,
  createShareRequestPayload,
  type AgentCredential,
  type EnvoyIntent,
} from "@envoymesh/protocol";
import type { Sensitivity } from "@envoymesh/protocol";

/**
 * Sensitivity ceiling for a tool.
 * Determines what bond level is needed to use the tool.
 */
export type ToolSensitivityCeiling = Sensitivity;

/**
 * Parameters for invoking a tool.
 */
export interface ToolParams {
  [key: string]: unknown;
}

/**
 * Result of a tool execution.
 */
export interface ToolResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  toolName: string;
  correlationId: string;
  latencyMs: number;
}

/**
 * Definition of a tool in the registry.
 */
export interface ToolDefinition {
  /** Unique name of the tool */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON schema for parameters */
  paramSchema: Record<string, unknown>;
  /** Maximum sensitivity level this tool can handle */
  sensitivityCeiling: ToolSensitivityCeiling;
  /** Whether this tool requires owner approval before execution */
  requiresApproval: boolean;
  /** The mesh intent this tool maps to (if any) */
  intent?: EnvoyIntent;
  /** Whether this tool sends a mesh message */
  isMeshTool: boolean;
}

/**
 * Registry of available tools for the agent.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  constructor() {
    this.registerDefaultTools();
  }

  /**
   * Register default tools that the agent can use.
   */
  private registerDefaultTools(): void {
    // Chat tools
    this.register({
      name: "chat.send",
      description: "Send a chat message to a contact",
      paramSchema: {
        type: "object",
        properties: {
          targetOwnerId: { type: "string", description: "The owner's ID of the recipient" },
          text: { type: "string", description: "The message text" },
        },
        required: ["targetOwnerId", "text"],
      },
      sensitivityCeiling: "friends",
      requiresApproval: true,
      intent: "chat.message",
      isMeshTool: true,
    });

    // Knowledge tools
    this.register({
      name: "knowledge.query",
      description: "Query a contact's knowledge base",
      paramSchema: {
        type: "object",
        properties: {
          targetOwnerId: { type: "string", description: "The owner's ID of the peer to query" },
          query: { type: "string", description: "The knowledge query" },
          requestedSensitivity: { type: "string", enum: ["public", "friends", "trusted", "private"], description: "Requested sensitivity level" },
        },
        required: ["targetOwnerId", "query"],
      },
      sensitivityCeiling: "friends",
      requiresApproval: false, // Allowed for bonded contacts
      intent: "knowledge.query",
      isMeshTool: true,
    });

    // Discovery tools
    this.register({
      name: "discovery.search",
      description: "Search for peers in the network",
      paramSchema: {
        type: "object",
        properties: {
          interests: { type: "array", items: { type: "string" }, description: "Interests to search for" },
          queryText: { type: "string", description: "Text query" },
          maxResults: { type: "number", description: "Maximum results to return" },
        },
        required: [],
      },
      sensitivityCeiling: "public",
      requiresApproval: false,
      intent: "discovery.request",
      isMeshTool: true,
    });

    // Share tools
    this.register({
      name: "share.send",
      description: "Share a file with a contact",
      paramSchema: {
        type: "object",
        properties: {
          targetOwnerId: { type: "string", description: "The owner's ID of the recipient" },
          path: { type: "string", description: "Path to the file in the vault" },
          sensitivity: { type: "string", enum: ["public", "friends", "private"], description: "Sensitivity level" },
        },
        required: ["targetOwnerId", "path"],
      },
      sensitivityCeiling: "trusted",
      requiresApproval: true,
      intent: "share.request",
      isMeshTool: true,
    });

    // Bond tools
    this.register({
      name: "bond.send_hello",
      description: "Send a bond request to a peer",
      paramSchema: {
        type: "object",
        properties: {
          targetOwnerId: { type: "string", description: "The owner's ID of the target peer" },
          displayName: { type: "string", description: "Your display name" },
          message: { type: "string", description: "Introduction message" },
          interests: { type: "array", items: { type: "string" }, description: "Your interests" },
        },
        required: ["targetOwnerId", "displayName"],
      },
      sensitivityCeiling: "public",
      requiresApproval: false,
      intent: "bond.request",
      isMeshTool: true,
    });

    // Vault search (local, not mesh)
    this.register({
      name: "vault.search",
      description: "Search your local vault for documents",
      paramSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Maximum results" },
        },
        required: ["query"],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      intent: undefined, // Local operation, not mesh
      isMeshTool: false,
    });

    // External agent management tools (Phase 9I)
    this.register({
      name: "mesh.list-external-sessions",
      description: "List all external agent sessions registered in the gateway",
      paramSchema: {
        type: "object",
        properties: {
          includeRevoked: { type: "boolean", description: "Include revoked agents" },
        },
        required: [],
      },
      sensitivityCeiling: "trusted",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.revoke-external-agent",
      description: "Revoke an external agent's access",
      paramSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "The agent's ID to revoke" },
        },
        required: ["agentId"],
      },
      sensitivityCeiling: "trusted",
      requiresApproval: true,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.list-external-agent-actions",
      description: "List recent actions performed by external agents",
      paramSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Filter by agent ID (optional)" },
          limit: { type: "number", description: "Max entries (default 50)" },
        },
        required: [],
      },
      sensitivityCeiling: "trusted",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.get-external-agent",
      description: "Get details of a registered external agent",
      paramSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "The agent's ID" },
        },
        required: ["agentId"],
      },
      sensitivityCeiling: "trusted",
      requiresApproval: false,
      isMeshTool: false,
    });
  }

  /**
   * Register a new tool.
   */
  register(definition: ToolDefinition): void {
    this.tools.set(definition.name, definition);
  }

  /**
   * Get a tool by name.
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * List all available tools.
   */
  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Check if a tool exists.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}

/**
 * Context needed to execute a mesh tool.
 */
export interface MeshToolContext {
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  taskStore: Pick<LocalTaskStore, "appendAuditEvent">;
  agentIdentity: {
    agentId: string;
    agentPeerId: string;
    privateKeyPem: string;
    publicKeyPem: string;
  };
  ownerIdentity: {
    ownerId: string;
  };
  agentCredential: AgentCredential;
  mesh?: EnvoyMesh; // Optional - may not be available in all contexts
}

/**
 * Execute a tool by name with parameters.
 */
export async function executeTool(
  toolName: string,
  params: ToolParams,
  context: MeshToolContext,
  vaultSearchFn?: (query: string, limit?: number) => Promise<unknown>,
): Promise<ToolResult> {
  const registry = new ToolRegistry();
  const tool = registry.get(toolName);

  if (!tool) {
    return {
      ok: false,
      error: `Unknown tool: ${toolName}`,
      toolName,
      correlationId: randomUUID(),
      latencyMs: 0,
    };
  }

  const correlationId = randomUUID();
  const startTime = Date.now();

  // Audit the tool call
  await context.taskStore.appendAuditEvent(
    createAuditEvent({
      type: "tool.called",
      intent: tool.intent,
      messageId: correlationId,
      remotePeerId: params.targetOwnerId as string | undefined ?? "local",
      direction: tool.isMeshTool ? "outbound" : "local",
      verificationStatus: "verified",
      latencyMs: 0,
      outcome: "record",
      summary: `tool call: ${toolName}`,
      createdAt: new Date().toISOString(),
    }),
  );

  try {
    if (tool.isMeshTool && tool.intent) {
      return await executeMeshTool(tool, params, context, correlationId, startTime);
    } else if (toolName === "vault.search") {
      return await executeVaultSearch(params, vaultSearchFn, correlationId, startTime);
    } else {
      return {
        ok: false,
        error: `Tool ${toolName} is not executable directly`,
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: errorMessage,
      toolName,
      correlationId,
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Execute a mesh-based tool (sends intent over the network).
 */
async function executeMeshTool(
  tool: ToolDefinition,
  params: ToolParams,
  context: MeshToolContext,
  correlationId: string,
  startTime: number,
): Promise<ToolResult> {
  if (!context.mesh) {
    return {
      ok: false,
      error: "Mesh not available",
      toolName: tool.name,
      correlationId,
      latencyMs: Date.now() - startTime,
    };
  }

  const targetOwnerId = params.targetOwnerId as string | undefined;
  if (tool.intent !== "discovery.request" && !targetOwnerId) {
    return {
      ok: false,
      error: `Missing required parameter: targetOwnerId`,
      toolName: tool.name,
      correlationId,
      latencyMs: Date.now() - startTime,
    };
  }

  // Policy check: can we send to this target?
  if (targetOwnerId) {
    const bond = await context.trustStore.getTrustRecord(targetOwnerId);
    const bondLevel = bond?.level ?? "public";

    const decision = evaluatePolicy({
      peerId: targetOwnerId,
      bondLevel,
      intent: tool.intent!,
      requestedSensitivity: params.requestedSensitivity as Sensitivity ?? "public",
    });

    if (decision.action === "deny") {
      return {
        ok: false,
        error: `Policy denied: ${decision.reason}`,
        toolName: tool.name,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // Look up target peer ID
  let targetPeerId: string | undefined;
  if (targetOwnerId) {
    const peerRecords = await context.peerDirectoryStore.listPeerRecords();
    const targetPeer = peerRecords.find((p) => p.ownerId === targetOwnerId);
    targetPeerId = targetPeer?.peerId;
  }

  // Build the envelope based on intent
  const senderPeerId = context.agentIdentity.agentPeerId;

  switch (tool.intent) {
    case "chat.message": {
      if (!targetPeerId) {
        return {
          ok: false,
          error: `Contact not found: ${targetOwnerId}`,
          toolName: tool.name,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }

      const envelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId,
          senderPublicKey: context.agentIdentity.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: targetPeerId,
          recipientRole: "human",
          intent: "chat.message",
          payload: createChatMessagePayload({
            senderOwnerId: context.ownerIdentity.ownerId,
            text: params.text as string,
          }),
          agentCredential: context.agentCredential,
        }),
        context.agentIdentity.privateKeyPem,
      );

      await context.mesh.send(targetPeerId, envelope, {});
      return {
        ok: true,
        result: { sent: true, messageId: envelope.messageId },
        toolName: tool.name,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    }

    case "knowledge.query": {
      if (!targetPeerId) {
        return {
          ok: false,
          error: `Contact not found: ${targetOwnerId}`,
          toolName: tool.name,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }

      const envelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId,
          senderPublicKey: context.agentIdentity.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: targetPeerId,
          recipientRole: "human",
          intent: "knowledge.query",
          payload: createKnowledgeQueryPayload({
            query: params.query as string,
            requestedSensitivity: (params.requestedSensitivity as Sensitivity) ?? "public",
          }),
          agentCredential: context.agentCredential,
        }),
        context.agentIdentity.privateKeyPem,
      );

      // Send and wait for response
      const response = await context.mesh.sendExpectReply(targetPeerId, envelope, { timeoutMs: 30000 });
      return {
        ok: true,
        result: response,
        toolName: tool.name,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    }

    case "discovery.request": {
      const envelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId,
          senderPublicKey: context.agentIdentity.publicKeyPem,
          senderRole: "agent",
          intent: "discovery.request",
          payload: createDiscoveryRequestPayload({
            requesterOwnerId: context.ownerIdentity.ownerId,
            requestedCapabilities: (params.interests as string[]) ?? [],
            maxResults: params.maxResults as number | undefined,
          }),
          agentCredential: context.agentCredential,
        }),
        context.agentIdentity.privateKeyPem,
      );

      // Broadcast to relay for discovery
      await context.mesh.send(targetPeerId ?? "", envelope, {});

      return {
        ok: true,
        result: { searching: true, messageId: envelope.messageId },
        toolName: tool.name,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    }

    case "share.request": {
      if (!targetPeerId) {
        return {
          ok: false,
          error: `Contact not found: ${targetOwnerId}`,
          toolName: tool.name,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }

      const envelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId,
          senderPublicKey: context.agentIdentity.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: targetPeerId,
          recipientRole: "human",
          intent: "share.request",
          payload: createShareRequestPayload({
            requestType: "file",
            relativePath: params.path as string,
            requestedSensitivity: (params.sensitivity as "public" | "friends" | "private") ?? "friends",
          }),
          agentCredential: context.agentCredential,
        }),
        context.agentIdentity.privateKeyPem,
      );

      await context.mesh.send(targetPeerId, envelope, {});
      return {
        ok: true,
        result: { sent: true, messageId: envelope.messageId },
        toolName: tool.name,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    }

    case "bond.request": {
      const envelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId,
          senderPublicKey: context.agentIdentity.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: targetPeerId,
          recipientRole: "human",
          intent: "bond.request",
          payload: {
            version: "0.1" as const,
            senderOwnerId: context.ownerIdentity.ownerId,
            displayName: params.displayName as string ?? "AI Agent",
            message: params.message as string | undefined,
            interests: (params.interests as string[]) ?? [],
            whatShares: [],
            requestedBondLevel: "direct" as const,
          },
          agentCredential: context.agentCredential,
        }),
        context.agentIdentity.privateKeyPem,
      );

      await context.mesh.send(targetPeerId!, envelope, {});
      return {
        ok: true,
        result: { sent: true, messageId: envelope.messageId },
        toolName: tool.name,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    }

    default:
      return {
        ok: false,
        error: `Unhandled mesh intent: ${tool.intent}`,
        toolName: tool.name,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
  }
}

/**
 * Execute a local vault search.
 */
async function executeVaultSearch(
  params: ToolParams,
  vaultSearchFn: ((query: string, limit?: number) => Promise<unknown>) | undefined,
  correlationId: string,
  startTime: number,
): Promise<ToolResult> {
  if (!vaultSearchFn) {
    return {
      ok: false,
      error: "Vault search not available",
      toolName: "vault.search",
      correlationId,
      latencyMs: Date.now() - startTime,
    };
  }

  const query = params.query as string;
  const limit = params.limit as number | undefined;
  const results = await vaultSearchFn(query, limit);

  return {
    ok: true,
    result: results,
    toolName: "vault.search",
    correlationId,
    latencyMs: Date.now() - startTime,
  };
}

/**
 * Get a list of all available tools (for mesh.list-tools).
 */
export function listAgentTools(): ToolDefinition[] {
  const registry = new ToolRegistry();
  return registry.listTools();
}
