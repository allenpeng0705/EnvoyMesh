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
  parseDiscoveryResponsePayload,
  createBroadcastRequestPayload,
  createSocialIntroSyncPayload,
  createShareRequestPayload,
  type AgentCredential,
  type EnvoyIntent,
  type SocialIntroSyncPayload,
  type Sensitivity,
} from "@envoymesh/protocol";
import { PUBLISHED_LIB_CAPABILITY } from "./discovery-inbound.js";
import { runLibraryRequestShare } from "@envoymesh/api";
import type {
  BondRecord,
  DiscoverPublishedLibraryPeerResult,
  DocumentAutonomyPolicy,
  HumanProfile,
  ProfileMediaPolicy,
} from "@envoymesh/api";
import {
  canAgentAutonomousShareGalleryPhoto,
  canAutonomousShareFile,
  friendMatchingGeoSearchTopics,
  friendMatchingGeoTagHashes,
  galleryPhotoShareSensitivity,
  getAgentCapabilityRoute,
  matchAgentCapabilityRoutes,
  resolveAgentCapabilityRouteById,
} from "@envoymesh/api";

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
  private readonly enableTrustIntroTools: boolean;

  constructor(enableTrustIntroTools = false) {
    this.enableTrustIntroTools = enableTrustIntroTools;
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
      description:
        "Send discovery.request to a bonded contact. Matches requestedCapabilities against their capability manifest (includes Profile About capability tags synced on save).",
      paramSchema: {
        type: "object",
        properties: {
          targetOwnerId: { type: "string", description: "Bonded contact owner id to query" },
          requestedTagHashes: { type: "array", items: { type: "string" }, description: "Topic / tag hashes to match" },
          requestedCapabilities: { type: "array", items: { type: "string" }, description: "Capabilities to match" },
          fileTitleQuery: { type: "string", description: "Published library title/path substring (FS-D)" },
          requestedContentHashPrefixes: {
            type: "array",
            items: { type: "string" },
            description: "Content hash prefixes (FS-D)",
          },
          maxResults: { type: "number", description: "Max matches per responder (default 5)" },
          timeoutMs: { type: "number", description: "RPC wait timeout (default 25000)" },
        },
        required: ["targetOwnerId"],
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

    this.register({
      name: "mesh.library_list",
      description: "List documents in the local vault (including published flags when the hook is configured)",
      paramSchema: { type: "object", properties: {}, required: [] },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.library_discover",
      description:
        "Query bonded contacts for published library metadata (FS-D). Requires discoverPublishedLibrary hook from the runtime.",
      paramSchema: {
        type: "object",
        properties: {
          fileTitleQuery: { type: "string" },
          contentHashPrefix: { type: "string" },
          maxResultsPerPeer: { type: "number" },
          targetOwnerIds: { type: "array", items: { type: "string" }, description: "Optional subset of owner ids" },
        },
        required: [],
      },
      sensitivityCeiling: "friends",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.library_publish",
      description: "Publish or unpublish a vault document in the bonded discovery catalog (metadata only)",
      paramSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Vault document id from mesh.library_list" },
          published: { type: "boolean", description: "true to publish, false to unpublish (default true)" },
        },
        required: ["documentId"],
      },
      sensitivityCeiling: "public",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.share_profile_gallery_photo",
      description:
        "Share a profile gallery photo with a bonded contact (autonomous when Settings → AI profile media policy allows)",
      paramSchema: {
        type: "object",
        properties: {
          targetOwnerId: { type: "string", description: "Recipient owner id" },
          photoId: { type: "string", description: "Gallery photo id from your profile" },
          vaultRelativePath: { type: "string", description: "Alternative: gallery vault path" },
          summary: { type: "string", description: "Optional note for owner approval inbox" },
        },
        required: ["targetOwnerId"],
      },
      sensitivityCeiling: "friends",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.share_propose",
      description: "Propose sharing a vault file with a bonded contact (creates Inbox item for owner approval)",
      paramSchema: {
        type: "object",
        properties: {
          targetOwnerId: { type: "string", description: "Recipient owner id" },
          vaultRelativePath: { type: "string", description: "Vault-relative path of the file to share" },
          sensitivity: { type: "string", enum: ["public", "friends", "private"] },
          summary: { type: "string", description: "Optional note shown in Inbox" },
        },
        required: ["targetOwnerId", "vaultRelativePath"],
      },
      sensitivityCeiling: "friends",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.library_request_share",
      description:
        "After discovery, ask a bonded contact to share a published file via chat (metadata only — bytes require their share accept)",
      paramSchema: {
        type: "object",
        properties: {
          targetOwnerHint: { type: "string", description: "Bonded contact display name or owner id" },
          fileTitleQuery: { type: "string", description: "Title or path fragment to match in their published catalog" },
          relativePath: { type: "string" },
          contentHashPrefix: { type: "string" },
        },
        required: ["targetOwnerHint"],
      },
      sensitivityCeiling: "friends",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.transfer_status",
      description: "Get file transfer status by correlation id, or list active transfers when correlationId is omitted",
      paramSchema: {
        type: "object",
        properties: {
          correlationId: { type: "string", description: "Share / transfer correlation id" },
        },
        required: [],
      },
      sensitivityCeiling: "friends",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.share_list_pending",
      description: "List inbound share offers waiting in Inbox",
      paramSchema: { type: "object", properties: {}, required: [] },
      sensitivityCeiling: "friends",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.share_list_proposals",
      description: "List agent-proposed outbound shares awaiting owner approval",
      paramSchema: { type: "object", properties: {}, required: [] },
      sensitivityCeiling: "friends",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.library_export_ipfs",
      description:
        "Export a vault document to IPFS (Kubo, Helia, or shadow mode per externalPublish.ipfsExportEngine). Requires exportLibraryItemToIpfs and externalPublish.allowIpfs.",
      paramSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Vault document id from mesh.library_list" },
        },
        required: ["documentId"],
      },
      sensitivityCeiling: "private",
      requiresApproval: true,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.library_verify_ipfs_gateway",
      description:
        "Fetch exported content from an allowlisted IPFS gateway and verify bytes match vault contentHash.",
      paramSchema: {
        type: "object",
        properties: {
          documentId: { type: "string" },
          gatewayUrl: { type: "string", description: "Optional gateway base; must be in allowlist" },
        },
        required: ["documentId"],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
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

    // Mode controller tools (Phase 9D)
    this.register({
      name: "mesh.set-mode",
      description: "Set the agent's operating mode (reactive or proactive)",
      paramSchema: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["reactive", "proactive"], description: "The operating mode" },
        },
        required: ["mode"],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.get-mode",
      description: "Get the agent's current operating mode and configuration",
      paramSchema: {
        type: "object",
        properties: {},
        required: [],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.set-contact-mode",
      description: "Set per-contact mode override (reactive, proactive, or default)",
      paramSchema: {
        type: "object",
        properties: {
          contactOwnerId: { type: "string", description: "The contact's owner ID" },
          mode: { type: "string", enum: ["reactive", "proactive"], description: "The mode for this contact" },
        },
        required: ["contactOwnerId", "mode"],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    // Style adapter tools (Phase 9F)
    this.register({
      name: "mesh.set-style",
      description: "Set the agent's writing style (tone, vocabulary, sentence length)",
      paramSchema: {
        type: "object",
        properties: {
          tone: { type: "string", enum: ["formal", "casual", "neutral"], description: "Writing tone" },
          vocabulary: { type: "array", items: { type: "string" }, description: "Preferred vocabulary words" },
          sentenceLength: { type: "number", description: "Target average sentence length" },
        },
        required: [],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.get-style",
      description: "Get the agent's current writing style profile",
      paramSchema: {
        type: "object",
        properties: {},
        required: [],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.set-contact-disclosure",
      description: "Configure whether to disclose the AI agent identity to a contact",
      paramSchema: {
        type: "object",
        properties: {
          contactOwnerId: { type: "string", description: "The contact's owner ID" },
          discloseAgent: { type: "boolean", description: "Whether to reveal the agent identity" },
          disclosureMessage: { type: "string", description: "Custom disclosure message" },
          customGreeting: { type: "string", description: "Custom greeting for this contact" },
        },
        required: ["contactOwnerId"],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.get-contact-disclosure",
      description: "Get the disclosure configuration for a contact",
      paramSchema: {
        type: "object",
        properties: {
          contactOwnerId: { type: "string", description: "The contact's owner ID" },
        },
        required: ["contactOwnerId"],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    // Trigger store tools (Phase 9G)
    this.register({
      name: "mesh.list-triggers",
      description: "List all proactive triggers (optional filter by type)",
      paramSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["time", "event", "topic"], description: "Filter by trigger type" },
        },
        required: [],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.add-trigger",
      description: "Add a new proactive trigger (time, event, or topic based)",
      paramSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Trigger name" },
          triggerType: { type: "string", enum: ["time", "event", "topic"], description: "Type of trigger" },
          condition: { type: "object", description: "Trigger condition" },
          action: { type: "object", description: "Action to execute when triggered" },
          description: { type: "string", description: "Optional description" },
        },
        required: ["name", "triggerType", "condition", "action"],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.remove-trigger",
      description: "Remove a proactive trigger",
      paramSchema: {
        type: "object",
        properties: {
          triggerId: { type: "string", description: "The trigger ID to remove" },
        },
        required: ["triggerId"],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.update-trigger",
      description: "Update a proactive trigger (enable/disable, rename)",
      paramSchema: {
        type: "object",
        properties: {
          triggerId: { type: "string", description: "The trigger ID to update" },
          enabled: { type: "boolean", description: "Enable or disable the trigger" },
          name: { type: "string", description: "New name for the trigger" },
          description: { type: "string", description: "New description" },
        },
        required: ["triggerId"],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    // Approval queue tools (Phase 9H)
    this.register({
      name: "mesh.list-pending",
      description: "List all pending approval items (optionally filtered by contact)",
      paramSchema: {
        type: "object",
        properties: {
          contactOwnerId: { type: "string", description: "Filter by contact owner ID" },
        },
        required: [],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.approve",
      description: "Approve a pending action in the approval queue",
      paramSchema: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "The approval item ID" },
          notes: { type: "string", description: "Optional notes" },
        },
        required: ["itemId"],
      },
      sensitivityCeiling: "private",
      requiresApproval: true,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.reject",
      description: "Reject a pending action in the approval queue",
      paramSchema: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "The approval item ID" },
          notes: { type: "string", description: "Optional notes" },
        },
        required: ["itemId"],
      },
      sensitivityCeiling: "private",
      requiresApproval: true,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.reject-all",
      description: "Reject all pending approval items at once",
      paramSchema: {
        type: "object",
        properties: {
          notes: { type: "string", description: "Optional notes applied to all rejections" },
        },
        required: [],
      },
      sensitivityCeiling: "private",
      requiresApproval: true,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.agent_card.request",
      description: "Request a peer agent's Agent Card (cached on agent.card.response)",
      paramSchema: {
        type: "object",
        properties: {
          targetOwnerId: { type: "string", description: "Bonded peer owner id" },
        },
        required: ["targetOwnerId"],
      },
      sensitivityCeiling: "friends",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.get_agent_card",
      description: "Read a cached Agent Card for a bonded peer owner",
      paramSchema: {
        type: "object",
        properties: {
          ownerId: { type: "string", description: "Peer owner id" },
        },
        required: ["ownerId"],
      },
      sensitivityCeiling: "friends",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.match_capability_route",
      description:
        "AI-only: rank EMP intent routes for a goal or capability ids (orchestration planner — not human discovery UI)",
      paramSchema: {
        type: "object",
        properties: {
          goal: { type: "string", description: "Natural-language task goal for keyword routing" },
          capabilityIds: {
            type: "array",
            items: { type: "string" },
            description: "Capability tags from discovery.response or Agent Card",
          },
          routeId: {
            type: "string",
            description: "When set, return a single route plan instead of ranking",
          },
          maxResults: { type: "number", description: "Max ranked routes (default 5)" },
        },
        required: [],
      },
      sensitivityCeiling: "public",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.capability_provider.start",
      description:
        "Start an in-process capability provider job: match route, execute mesh tool steps autonomously (EnvoyMesh-native — not bridge/RPC)",
      paramSchema: {
        type: "object",
        properties: {
          goal: { type: "string", description: "Task goal for route matching" },
          capabilityIds: {
            type: "array",
            items: { type: "string" },
            description: "Optional capability tags to narrow routing",
          },
          targetOwnerId: { type: "string", description: "Optional bonded peer owner id" },
        },
        required: ["goal"],
      },
      sensitivityCeiling: "friends",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.task.propose",
      description: "Send task.mandate + task.propose to a bonded peer agent (capability route executor)",
      paramSchema: {
        type: "object",
        properties: {
          targetOwnerId: { type: "string" },
          objective: { type: "string" },
          correlationId: { type: "string" },
        },
        required: ["targetOwnerId", "objective"],
      },
      sensitivityCeiling: "friends",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.escalate",
      description: "Escalate a pending item with a reason (low confidence, emotional content, etc.)",
      paramSchema: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "The approval item ID" },
          reason: { type: "string", enum: ["low_confidence", "emotional_content", "sensitive_topic", "high_cost", "manual"], description: "Reason for escalation" },
        },
        required: ["itemId", "reason"],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.list-all-approvals",
      description: "List all approval items regardless of status including approved, rejected, expired",
      paramSchema: {
        type: "object",
        properties: {},
        required: [],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    // Digest generator tools (Phase 9J)
    this.register({
      name: "mesh.get-digest",
      description: "Get the daily or weekly digest of agent activity",
      paramSchema: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["daily", "weekly"], description: "Digest period (defaults to daily)" },
        },
        required: [],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.set-digest-schedule",
      description: "Configure the digest frequency and output directory",
      paramSchema: {
        type: "object",
        properties: {
          frequency: { type: "string", enum: ["daily", "weekly", "off"], description: "Digest frequency" },
          outputDir: { type: "string", description: "Output directory for saved digests" },
        },
        required: [],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.get-digest-config",
      description: "Get the current digest configuration and next scheduled time",
      paramSchema: {
        type: "object",
        properties: {},
        required: [],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    // Session manager tools (Phase 9E)
    this.register({
      name: "mesh.list-sessions",
      description: "List all active conversation sessions",
      paramSchema: {
        type: "object",
        properties: {},
        required: [],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.session-summary",
      description: "Get conversation summary for a contact",
      paramSchema: {
        type: "object",
        properties: {
          ownerId: { type: "string", description: "The contact's owner ID" },
        },
        required: ["ownerId"],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    this.register({
      name: "mesh.acknowledge-escalation",
      description: "Acknowledge and clear a pending escalation for a contact",
      paramSchema: {
        type: "object",
        properties: {
          ownerId: { type: "string", description: "The contact's owner ID" },
        },
        required: ["ownerId"],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    // Phase 23A+ — Discovery clustering tool
    this.register({
      name: "mesh.discover_cluster",
      description: "Broadcast discovery across the mesh, cluster results into group chat suggestions",
      paramSchema: {
        type: "object",
        properties: {
          seedTopics: { type: "array", items: { type: "string" }, description: "Topic keywords to seed discovery" },
          seedCapabilities: { type: "array", items: { type: "string" }, description: "Capability tags to seed discovery" },
        },
        required: [],
      },
      sensitivityCeiling: "public",
      requiresApproval: false,
      isMeshTool: false,
    });

    // Phase 23D — Chat RAG search tool
    this.register({
      name: "mesh.chat_rag_search",
      description: "Search local chat history for relevant past conversations",
      paramSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query to find in chat history" },
          ownerId: { type: "string", description: "Optional: filter to a specific contact's owner ID" },
          maxResults: { type: "number", description: "Maximum results to return (default: 5)" },
        },
        required: ["query"],
      },
      sensitivityCeiling: "private",
      requiresApproval: false,
      isMeshTool: false,
    });

    if (this.enableTrustIntroTools) {
      this.register({
        name: "mesh.intro.matching_context",
        description:
          "Return Trust-mode friend-matching preferences text plus a redacted owner profile summary for ranking intros",
        paramSchema: {
          type: "object",
          properties: {},
          required: [],
        },
        sensitivityCeiling: "private",
        requiresApproval: false,
        isMeshTool: false,
      });

      this.register({
        name: "mesh.intro.sync",
        description:
          "Send social.intro.sync to another authorized agent (Trust mode coordination — non-binding)",
        paramSchema: {
          type: "object",
          properties: {
            recipientAgentPeerId: { type: "string", description: "Libp2p peer id of the counterparty agent" },
            counterpartyOwnerId: { type: "string", description: "Owner id for bond/policy lookup" },
            introCorrelationId: { type: "string", description: "Correlation id shared across intro messages" },
            interest: {
              type: "string",
              enum: ["explore", "decline", "request-human-review", "withdraw"],
              description: "Coordination signal",
            },
            profileFragmentRefs: {
              type: "array",
              items: { type: "string" },
              description: "Opaque fragment refs when fragments are not inlined",
            },
            counterpartyOwnerIdHint: { type: "string", description: "Optional hint for the peer agent" },
            noteToCounterpartyAgent: { type: "string", description: "Short note for the peer agent" },
          },
          required: ["recipientAgentPeerId", "counterpartyOwnerId", "introCorrelationId", "interest"],
        },
        sensitivityCeiling: "friends",
        requiresApproval: false,
        intent: "social.intro.sync",
        isMeshTool: true,
      });

      this.register({
        name: "mesh.intro.broadcast_search",
        description:
          "Issue broadcast.request via relay mesh for capability/tag discovery (Trust-mode matching helper)",
        paramSchema: {
          type: "object",
          properties: {
            requestedCapabilities: {
              type: "array",
              items: { type: "string" },
              description: "Capability strings to match",
            },
            requestedTagHashes: {
              type: "array",
              items: { type: "string" },
              description: "Topic tag hashes to match",
            },
            ttl: { type: "number", description: "Relay hop TTL (default 1)" },
            maxResponses: { type: "number", description: "Max broadcast responses (default 10)" },
            timeoutMs: { type: "number", description: "Collection timeout ms" },
            requestedSensitivity: {
              type: "string",
              enum: ["public", "friends", "private"],
              description: "Sensitivity floor",
            },
            queryId: { type: "string", description: "Optional stable query id (default random UUID)" },
          },
          required: [],
        },
        sensitivityCeiling: "public",
        requiresApproval: false,
        intent: "broadcast.request",
        isMeshTool: true,
      });

      this.register({
        name: "mesh.intro.run_autopilot",
        description:
          "Run one Trust-mode friend-discovery pass (matching context + relay broadcast search). Requires friend autopilot enabled.",
        paramSchema: {
          type: "object",
          properties: {
            maxResponses: { type: "number", description: "Max broadcast responses (default 10)" },
          },
          required: [],
        },
        sensitivityCeiling: "friends",
        requiresApproval: true,
        isMeshTool: false,
      });
    }
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
  /** Trust-mode intro tooling — callers load prefs/profile from node config */
  trustIntro?: {
    trustModeEnabled: boolean;
    friendAutopilotEnabled?: boolean;
    friendMatchingPreferencesText?: string;
    friendMatchingPreferencesSigned?: import("@envoymesh/protocol").FriendMatchingPreferencesPayload;
    humanProfileSummary?: { displayName?: string; bio?: string };
    humanProfileLocation?: {
      discoveryLocation?: import("@envoymesh/protocol").DiscoveryLocation;
      discoveryLocationPrecision?: import("@envoymesh/protocol").DiscoveryLocationPrecision;
    };
  };
  recordFriendAutopilotPass?: (input: {
    ok: boolean;
    error?: string;
    trigger: "manual" | "scheduled";
    correlationId?: string;
  }) => Promise<void>;
  /** Optional FS-D hooks — populated when the agent runtime is wired to NodeService. */
  listLibraryItems?: () => Promise<unknown>;
  discoverPublishedLibrary?: (params: Record<string, unknown> | undefined) => Promise<unknown>;
  exportLibraryItemToIpfs?: (documentId: string) => Promise<unknown>;
  verifyLibraryItemIpfsGateway?: (params: {
    documentId: string;
    gatewayUrl?: string;
  }) => Promise<unknown>;
  setLibraryItemPublished?: (documentId: string, published: boolean) => Promise<void>;
  submitAgentShareProposal?: (params: {
    targetOwnerId: string;
    vaultRelativePath: string;
    sensitivity: "public" | "friends" | "private";
    summary?: string;
  }) => Promise<unknown>;
  getBonds?: () => Promise<BondRecord[]>;
  sendChat?: (targetOwnerId: string, text: string) => Promise<import("@envoymesh/api").SendChatResult | void>;
  listActiveTransfers?: () => Promise<unknown>;
  getTransferStatus?: (correlationId: string) => Promise<unknown>;
  listPendingShareOffers?: () => Promise<unknown>;
  listAgentShareProposals?: () => Promise<unknown>;
  documentAutonomy?: DocumentAutonomyPolicy;
  profileMedia?: ProfileMediaPolicy;
  loadHumanProfile?: () => Promise<HumanProfile | undefined>;
  listPendingApprovals?: () => Promise<import("@envoymesh/api").PendingApprovalSummary[]>;
  approvePendingApproval?: (
    itemId: string,
    notes?: string,
  ) => Promise<import("@envoymesh/api").ApprovePendingApprovalResult>;
  rejectPendingApproval?: (
    itemId: string,
    notes?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  requestAgentCard?: (targetOwnerId: string) => Promise<{ ok: boolean; error?: string }>;
  getAgentCard?: (ownerId: string) => Promise<import("@envoymesh/api").CachedAgentCardSummary | undefined>;
  listAgentCards?: () => Promise<import("@envoymesh/api").CachedAgentCardSummary[]>;
  getLocalCapabilityManifest?: () => Promise<{ capabilities: string[]; keywords: string[] } | undefined>;
  listBondedAgentCapabilities?: () => Promise<Array<{ ownerId: string; capabilities: string[] }>>;
  startCapabilityProviderJob?: (params: {
    goal: string;
    capabilityIds?: string[];
    targetOwnerId?: string;
  }) => Promise<{ jobId: string; correlationId: string }>;
  sendTaskPropose?: (params: {
    targetOwnerId: string;
    objective: string;
    correlationId?: string;
  }) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
  shareFile?: (params: {
    targetOwnerId: string;
    vaultRelativePath: string;
    sensitivity: "public" | "friends" | "private";
  }) => Promise<void>;
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
  const registry = new ToolRegistry(context.trustIntro?.trustModeEnabled ?? false);
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
    } else if (toolName === "mesh.library_list") {
      if (!context.listLibraryItems) {
        return {
          ok: false,
          error: "listLibraryItems is not configured on this tool context",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const items = await context.listLibraryItems();
      return {
        ok: true,
        result: { items },
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.library_discover") {
      if (!context.discoverPublishedLibrary) {
        return {
          ok: false,
          error: "discoverPublishedLibrary is not configured on this tool context",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const peers = await context.discoverPublishedLibrary(params);
      return {
        ok: true,
        result: { peers },
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.library_publish") {
      if (!context.setLibraryItemPublished) {
        return {
          ok: false,
          error: "setLibraryItemPublished is not configured on this tool context",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const documentId = params.documentId as string | undefined;
      if (!documentId?.trim()) {
        return {
          ok: false,
          error: "documentId is required",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const published = params.published !== false;
      await context.setLibraryItemPublished(documentId.trim(), published);
      return {
        ok: true,
        result: { documentId: documentId.trim(), published },
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.share_profile_gallery_photo") {
      if (!context.submitAgentShareProposal || !context.loadHumanProfile) {
        return {
          ok: false,
          error: "loadHumanProfile and submitAgentShareProposal must be configured",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const targetOwnerId = params.targetOwnerId as string | undefined;
      const photoId = params.photoId as string | undefined;
      const vaultRelativePath = params.vaultRelativePath as string | undefined;
      if (!targetOwnerId?.trim()) {
        return {
          ok: false,
          error: "targetOwnerId is required",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const hp = await context.loadHumanProfile();
      const gallery = hp?.galleryPhotos ?? [];
      const photo = gallery.find(
        (p) =>
          (photoId?.trim() && p.photoId === photoId.trim()) ||
          (vaultRelativePath?.trim() && p.vaultRelativePath === vaultRelativePath.trim()),
      );
      if (!photo) {
        return {
          ok: false,
          error: "gallery photo not found on profile",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const bondLevel =
        (await context.getBonds?.())?.find((b) => b.peerOwnerId === targetOwnerId.trim())?.level ?? "public";
      const sensitivity = galleryPhotoShareSensitivity(photo.visibility);
      if (
        context.profileMedia &&
        context.shareFile &&
        canAgentAutonomousShareGalleryPhoto({
          policy: context.profileMedia,
          photo,
          bondLevel,
        })
      ) {
        await context.shareFile({
          targetOwnerId: targetOwnerId.trim(),
          vaultRelativePath: photo.vaultRelativePath,
          sensitivity,
        });
        return {
          ok: true,
          result: {
            autoShared: true,
            targetOwnerId: targetOwnerId.trim(),
            photoId: photo.photoId,
            vaultRelativePath: photo.vaultRelativePath,
          },
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const proposal = await context.submitAgentShareProposal({
        targetOwnerId: targetOwnerId.trim(),
        vaultRelativePath: photo.vaultRelativePath,
        sensitivity,
        summary: params.summary as string | undefined,
      });
      return {
        ok: true,
        result: proposal,
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.share_propose") {
      if (!context.submitAgentShareProposal) {
        return {
          ok: false,
          error: "submitAgentShareProposal is not configured on this tool context",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const targetOwnerId = params.targetOwnerId as string | undefined;
      const vaultRelativePath = params.vaultRelativePath as string | undefined;
      if (!targetOwnerId?.trim() || !vaultRelativePath?.trim()) {
        return {
          ok: false,
          error: "targetOwnerId and vaultRelativePath are required",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const sensitivity = (params.sensitivity as "public" | "friends" | "private") ?? "friends";
      const bondLevel =
        (await context.getBonds?.())?.find((b) => b.peerOwnerId === targetOwnerId.trim())?.level ?? "public";
      if (
        context.documentAutonomy &&
        context.shareFile &&
        canAutonomousShareFile({
          policy: context.documentAutonomy,
          bondLevel,
          sensitivity,
        })
      ) {
        await context.shareFile({
          targetOwnerId: targetOwnerId.trim(),
          vaultRelativePath: vaultRelativePath.trim(),
          sensitivity,
        });
        return {
          ok: true,
          result: { autoShared: true, targetOwnerId: targetOwnerId.trim(), vaultRelativePath: vaultRelativePath.trim() },
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const proposal = await context.submitAgentShareProposal({
        targetOwnerId: targetOwnerId.trim(),
        vaultRelativePath: vaultRelativePath.trim(),
        sensitivity,
        summary: params.summary as string | undefined,
      });
      return {
        ok: true,
        result: proposal,
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.library_request_share") {
      if (!context.discoverPublishedLibrary || !context.sendChat || !context.getBonds) {
        return {
          ok: false,
          error: "discoverPublishedLibrary, sendChat, and getBonds must be configured on this tool context",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const targetOwnerHint = params.targetOwnerHint as string | undefined;
      if (!targetOwnerHint?.trim()) {
        return {
          ok: false,
          error: "targetOwnerHint is required",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const outcome = await runLibraryRequestShare(
        {
          getBonds: context.getBonds,
          discoverPublishedLibrary: async (p): Promise<DiscoverPublishedLibraryPeerResult[]> =>
            (await context.discoverPublishedLibrary!(p as Record<string, unknown> | undefined)) as DiscoverPublishedLibraryPeerResult[],
          sendChat: context.sendChat,
        },
        {
          targetOwnerHint: targetOwnerHint.trim(),
          fileTitleQuery: params.fileTitleQuery as string | undefined,
          relativePath: params.relativePath as string | undefined,
          contentHashPrefix: params.contentHashPrefix as string | undefined,
        },
      );
      if (!outcome.ok) {
        return {
          ok: false,
          error: outcome.error,
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      return {
        ok: true,
        result: outcome.result,
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.transfer_status") {
      const correlationId = params.correlationId as string | undefined;
      if (correlationId?.trim()) {
        if (!context.getTransferStatus) {
          return {
            ok: false,
            error: "getTransferStatus is not configured on this tool context",
            toolName,
            correlationId: randomUUID(),
            latencyMs: Date.now() - startTime,
          };
        }
        const status = await context.getTransferStatus(correlationId.trim());
        return {
          ok: true,
          result: { status },
          toolName,
          correlationId: randomUUID(),
          latencyMs: Date.now() - startTime,
        };
      }
      if (!context.listActiveTransfers) {
        return {
          ok: false,
          error: "listActiveTransfers is not configured on this tool context",
          toolName,
          correlationId: randomUUID(),
          latencyMs: Date.now() - startTime,
        };
      }
      const transfers = await context.listActiveTransfers();
      return {
        ok: true,
        result: { transfers },
        toolName,
        correlationId: randomUUID(),
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.share_list_pending") {
      if (!context.listPendingShareOffers) {
        return {
          ok: false,
          error: "listPendingShareOffers is not configured on this tool context",
          toolName,
          correlationId: randomUUID(),
          latencyMs: Date.now() - startTime,
        };
      }
      const offers = await context.listPendingShareOffers();
      return {
        ok: true,
        result: { offers },
        toolName,
        correlationId: randomUUID(),
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.share_list_proposals") {
      if (!context.listAgentShareProposals) {
        return {
          ok: false,
          error: "listAgentShareProposals is not configured on this tool context",
          toolName,
          correlationId: randomUUID(),
          latencyMs: Date.now() - startTime,
        };
      }
      const proposals = await context.listAgentShareProposals();
      return {
        ok: true,
        result: { proposals },
        toolName,
        correlationId: randomUUID(),
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.library_export_ipfs") {
      if (!context.exportLibraryItemToIpfs) {
        return {
          ok: false,
          error: "exportLibraryItemToIpfs is not configured on this tool context",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const documentId = params.documentId as string | undefined;
      if (!documentId?.trim()) {
        return {
          ok: false,
          error: "documentId is required",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const exportResult = await context.exportLibraryItemToIpfs(documentId.trim());
      return {
        ok: true,
        result: exportResult,
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.library_verify_ipfs_gateway") {
      if (!context.verifyLibraryItemIpfsGateway) {
        return {
          ok: false,
          error: "verifyLibraryItemIpfsGateway is not configured on this tool context",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const documentId = params.documentId as string | undefined;
      if (!documentId?.trim()) {
        return {
          ok: false,
          error: "documentId is required",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const verifyResult = await context.verifyLibraryItemIpfsGateway({
        documentId: documentId.trim(),
        gatewayUrl: params.gatewayUrl as string | undefined,
      });
      return {
        ok: true,
        result: verifyResult,
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.list-pending") {
      if (!context.listPendingApprovals) {
        return {
          ok: false,
          error: "listPendingApprovals is not configured on this tool context",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const items = await context.listPendingApprovals();
      return {
        ok: true,
        result: { items, count: items.length },
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.approve") {
      if (!context.approvePendingApproval) {
        return {
          ok: false,
          error: "approvePendingApproval is not configured on this tool context",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const itemId = params.itemId as string | undefined;
      if (!itemId?.trim()) {
        return { ok: false, error: "itemId is required", toolName, correlationId, latencyMs: Date.now() - startTime };
      }
      const result = await context.approvePendingApproval(itemId.trim(), params.notes as string | undefined);
      return {
        ok: result.ok,
        result,
        error: result.ok ? undefined : result.error,
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.reject") {
      if (!context.rejectPendingApproval) {
        return {
          ok: false,
          error: "rejectPendingApproval is not configured on this tool context",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const itemId = params.itemId as string | undefined;
      if (!itemId?.trim()) {
        return { ok: false, error: "itemId is required", toolName, correlationId, latencyMs: Date.now() - startTime };
      }
      const result = await context.rejectPendingApproval(itemId.trim(), params.notes as string | undefined);
      return {
        ok: result.ok,
        result,
        error: result.ok ? undefined : result.error,
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.agent_card.request") {
      if (!context.requestAgentCard) {
        return {
          ok: false,
          error: "requestAgentCard is not configured on this tool context",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const targetOwnerId = params.targetOwnerId as string | undefined;
      if (!targetOwnerId?.trim()) {
        return { ok: false, error: "targetOwnerId is required", toolName, correlationId, latencyMs: Date.now() - startTime };
      }
      const result = await context.requestAgentCard(targetOwnerId.trim());
      return {
        ok: result.ok,
        result,
        error: result.ok ? undefined : result.error,
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.get_agent_card") {
      if (!context.getAgentCard) {
        return {
          ok: false,
          error: "getAgentCard is not configured on this tool context",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const ownerId = params.ownerId as string | undefined;
      if (!ownerId?.trim()) {
        return { ok: false, error: "ownerId is required", toolName, correlationId, latencyMs: Date.now() - startTime };
      }
      const card = await context.getAgentCard(ownerId.trim());
      return {
        ok: true,
        result: card ?? null,
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.match_capability_route") {
      const routeId = typeof params.routeId === "string" ? params.routeId.trim() : "";
      let localManifestCapabilities: string[] | undefined;
      if (context.getLocalCapabilityManifest) {
        const manifest = await context.getLocalCapabilityManifest();
        localManifestCapabilities = manifest?.capabilities;
      }
      if (routeId) {
        const route = resolveAgentCapabilityRouteById(routeId, { localManifestCapabilities });
        if (!route) {
          return {
            ok: false,
            error: `Unknown routeId: ${routeId}`,
            toolName,
            correlationId,
            latencyMs: Date.now() - startTime,
          };
        }
        return {
          ok: true,
          result: { route, audience: "agent" },
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const goal = typeof params.goal === "string" ? params.goal.trim() : undefined;
      const capabilityIds = Array.isArray(params.capabilityIds)
        ? params.capabilityIds.map((id) => String(id))
        : undefined;
      const maxResults =
        typeof params.maxResults === "number" && params.maxResults > 0
          ? Math.min(params.maxResults, 10)
          : undefined;
      if (!goal && (!capabilityIds || capabilityIds.length === 0)) {
        return {
          ok: false,
          error: "Provide goal and/or capabilityIds, or routeId for a single plan",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const routes = matchAgentCapabilityRoutes({
        goal,
        capabilityIds,
        localManifestCapabilities,
        maxResults,
      });
      return {
        ok: true,
        result: { routes, audience: "agent" },
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.capability_provider.start") {
      if (!context.startCapabilityProviderJob) {
        return {
          ok: false,
          error: "startCapabilityProviderJob is not configured on this tool context",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const goal = typeof params.goal === "string" ? params.goal.trim() : "";
      if (!goal) {
        return {
          ok: false,
          error: "goal is required",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const capabilityIds = Array.isArray(params.capabilityIds)
        ? params.capabilityIds.map((id) => String(id))
        : undefined;
      const targetOwnerId =
        typeof params.targetOwnerId === "string" ? params.targetOwnerId.trim() : undefined;
      try {
        const started = await context.startCapabilityProviderJob({
          goal,
          capabilityIds,
          targetOwnerId: targetOwnerId || undefined,
        });
        return {
          ok: true,
          result: started,
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
    } else if (toolName === "mesh.task.propose") {
      if (!context.sendTaskPropose) {
        return {
          ok: false,
          error: "sendTaskPropose is not configured on this tool context",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const targetOwnerId = typeof params.targetOwnerId === "string" ? params.targetOwnerId.trim() : "";
      const objective = typeof params.objective === "string" ? params.objective.trim() : "";
      if (!targetOwnerId || !objective) {
        return {
          ok: false,
          error: "targetOwnerId and objective are required",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const result = await context.sendTaskPropose({
        targetOwnerId,
        objective,
        correlationId: typeof params.correlationId === "string" ? params.correlationId : correlationId,
      });
      return {
        ok: result.ok,
        result: result.result,
        error: result.error,
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.intro.run_autopilot") {
      if (!context.trustIntro?.trustModeEnabled) {
        return {
          ok: false,
          error: "Trust mode disabled — mesh.intro.* tools are unavailable",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      if (!context.trustIntro.friendAutopilotEnabled) {
        return {
          ok: false,
          error: "Friend autopilot disabled — enable in Settings → Trust mode",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const geoTagHashes = friendMatchingGeoTagHashes({
        matchingLocation: context.trustIntro.friendMatchingPreferencesSigned?.matchingLocation,
        matchingLocationScope: context.trustIntro.friendMatchingPreferencesSigned?.matchingLocationScope,
        humanProfile: context.trustIntro.humanProfileLocation,
      });
      const geoSearchTopics = friendMatchingGeoSearchTopics({
        matchingLocation: context.trustIntro.friendMatchingPreferencesSigned?.matchingLocation,
        matchingLocationScope: context.trustIntro.friendMatchingPreferencesSigned?.matchingLocationScope,
        humanProfile: context.trustIntro.humanProfileLocation,
      });
      const matching = {
        friendMatchingPreferencesText: context.trustIntro.friendMatchingPreferencesText ?? "",
        humanProfileSummary: context.trustIntro.humanProfileSummary ?? {},
        geoSearchTopics,
        geoTagHashes,
      };
      const maxResponses =
        typeof params.maxResponses === "number" && params.maxResponses > 0
          ? Math.min(params.maxResponses, 25)
          : 10;
      const broadcast = await executeTool(
        "mesh.intro.broadcast_search",
        {
          requestedTagHashes: geoTagHashes,
          requestedSensitivity: "public",
          maxResponses,
          ttl: 1,
        },
        context,
        vaultSearchFn,
      );
      if (context.recordFriendAutopilotPass) {
        await context.recordFriendAutopilotPass({
          ok: broadcast.ok,
          error: broadcast.ok ? undefined : broadcast.error,
          trigger: "manual",
          correlationId,
        });
      }
      return {
        ok: broadcast.ok,
        result: { matching, broadcast: broadcast.result ?? null },
        error: broadcast.ok ? undefined : broadcast.error,
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    } else if (toolName === "mesh.intro.matching_context") {
      if (!context.trustIntro?.trustModeEnabled) {
        return {
          ok: false,
          error: "Trust mode disabled — mesh.intro.* tools are unavailable",
          toolName,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const geoTagHashes = friendMatchingGeoTagHashes({
        matchingLocation: context.trustIntro.friendMatchingPreferencesSigned?.matchingLocation,
        matchingLocationScope: context.trustIntro.friendMatchingPreferencesSigned?.matchingLocationScope,
        humanProfile: context.trustIntro.humanProfileLocation,
      });
      const geoSearchTopics = friendMatchingGeoSearchTopics({
        matchingLocation: context.trustIntro.friendMatchingPreferencesSigned?.matchingLocation,
        matchingLocationScope: context.trustIntro.friendMatchingPreferencesSigned?.matchingLocationScope,
        humanProfile: context.trustIntro.humanProfileLocation,
      });
      return {
        ok: true,
        result: {
          friendMatchingPreferencesText: context.trustIntro.friendMatchingPreferencesText ?? "",
          humanProfileSummary: context.trustIntro.humanProfileSummary ?? {},
          geoSearchTopics,
          geoTagHashes,
        },
        toolName,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
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
  if (tool.intent !== "broadcast.request" && !targetOwnerId) {
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
          correlationId,
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
      if (!targetOwnerId) {
        return {
          ok: false,
          error: "targetOwnerId is required for discovery.search",
          toolName: tool.name,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const peerRecordsForDisc = await context.peerDirectoryStore.listPeerRecords();
      const targetPeerDisc = peerRecordsForDisc.find((p) => p.ownerId === targetOwnerId);
      const transportPeerId = targetPeerDisc?.peerId;
      if (!transportPeerId) {
        return {
          ok: false,
          error: `Contact not found: ${targetOwnerId}`,
          toolName: tool.name,
          correlationId,
          latencyMs: Date.now() - startTime,
        };
      }
      const recipientEnvelopePeerId = targetPeerDisc?.devicePublicKeyPem
        ? derivePeerId(targetPeerDisc.devicePublicKeyPem)
        : targetOwnerId.startsWith("envoy_")
          ? targetOwnerId
          : transportPeerId;
      const tagHashes = (params.requestedTagHashes as string[] | undefined) ?? [];
      let caps = (params.requestedCapabilities as string[] | undefined) ?? [];
      const fileTitleQuery = params.fileTitleQuery as string | undefined;
      const hashPrefixes = params.requestedContentHashPrefixes as string[] | undefined;
      if (
        tagHashes.length === 0 &&
        caps.length === 0 &&
        !fileTitleQuery?.trim() &&
        (!hashPrefixes || hashPrefixes.length === 0)
      ) {
        caps = [...caps, PUBLISHED_LIB_CAPABILITY];
      }
      const envelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId,
          senderPublicKey: context.agentIdentity.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: recipientEnvelopePeerId,
          recipientRole: "human",
          intent: "discovery.request",
          correlationId,
          payload: createDiscoveryRequestPayload({
            requesterOwnerId: context.ownerIdentity.ownerId,
            requestedTagHashes: tagHashes,
            requestedCapabilities: caps,
            maxResults: (params.maxResults as number | undefined) ?? 5,
            requestedSensitivity:
              (params.requestedSensitivity as "public" | "friends" | "private" | undefined) ?? "public",
            fileTitleQuery,
            requestedContentHashPrefixes: hashPrefixes,
          }),
          agentCredential: context.agentCredential,
        }),
        context.agentIdentity.privateKeyPem,
      );

      const reply = await context.mesh.sendExpectReply(transportPeerId, envelope, {
        timeoutMs: (params.timeoutMs as number | undefined) ?? 25_000,
      });
      const result =
        reply.intent === "discovery.response"
          ? parseDiscoveryResponsePayload(reply.payload)
          : { unexpectedIntent: reply.intent, envelope: reply };
      return {
        ok: true,
        result,
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
            fileOrigin: "sender",
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

    case "social.intro.sync": {
      const recipientAgentPeerId = params.recipientAgentPeerId as string;
      const counterpartyOwnerId = params.counterpartyOwnerId as string;
      const bond = await context.trustStore.getTrustRecord(counterpartyOwnerId);
      const bondLevel = bond?.level ?? "public";
      const decision = evaluatePolicy({
        peerId: counterpartyOwnerId,
        bondLevel,
        intent: "social.intro.sync",
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

      const envelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId,
          senderPublicKey: context.agentIdentity.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: recipientAgentPeerId,
          recipientRole: "agent",
          intent: "social.intro.sync",
          payload: createSocialIntroSyncPayload({
            introCorrelationId: params.introCorrelationId as string,
            ownerId: context.ownerIdentity.ownerId,
            counterpartyOwnerIdHint: params.counterpartyOwnerIdHint as string | undefined,
            profileFragmentRefs: (params.profileFragmentRefs as string[]) ?? [],
            interest: params.interest as SocialIntroSyncPayload["interest"],
            noteToCounterpartyAgent: params.noteToCounterpartyAgent as string | undefined,
          }),
          agentCredential: context.agentCredential,
        }),
        context.agentIdentity.privateKeyPem,
      );

      await context.mesh.send(recipientAgentPeerId, envelope, {});
      return {
        ok: true,
        result: { sent: true, messageId: envelope.messageId },
        toolName: tool.name,
        correlationId,
        latencyMs: Date.now() - startTime,
      };
    }

    case "broadcast.request": {
      const envelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId,
          senderPublicKey: context.agentIdentity.publicKeyPem,
          senderRole: "agent",
          intent: "broadcast.request",
          payload: createBroadcastRequestPayload({
            queryId: (params.queryId as string) ?? randomUUID(),
            ttl: params.ttl as number | undefined,
            maxResponses: params.maxResponses as number | undefined,
            requestedTagHashes: (params.requestedTagHashes as string[]) ?? [],
            requestedCapabilities: (params.requestedCapabilities as string[]) ?? [],
            requestedSensitivity:
              (params.requestedSensitivity as "public" | "friends" | "private") ?? "public",
            senderOwnerId: context.ownerIdentity.ownerId,
            timeoutMs: params.timeoutMs as number | undefined,
          }),
          agentCredential: context.agentCredential,
        }),
        context.agentIdentity.privateKeyPem,
      );

      await context.mesh.send("", envelope, {});
      return {
        ok: true,
        result: { broadcastSent: true, messageId: envelope.messageId },
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
export function listAgentTools(opts?: { trustModeEnabled?: boolean }): ToolDefinition[] {
  const registry = new ToolRegistry(opts?.trustModeEnabled ?? false);
  return registry.listTools();
}
