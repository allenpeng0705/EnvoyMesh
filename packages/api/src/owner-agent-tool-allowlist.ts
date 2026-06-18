import type { OwnerAgentDomain, OwnerAgentPostureFlags } from "./owner-agent-types.js";

export type OwnerAgentToolKind = "mesh" | "job";

export interface OwnerAgentToolSpec {
  name: string;
  kind: OwnerAgentToolKind;
  domain: OwnerAgentDomain;
  description: string;
  /** Example params for the planner prompt (not validated at runtime). */
  paramHint?: string;
  requiresTrustMode?: boolean;
  requiresPosture?: "socialProxy" | "documentAcquisition" | "capabilityProvider";
}

/** Curated owner-agent tools (Phase 18B). Mesh names must exist in ToolRegistry. */
export const OWNER_AGENT_TOOL_ALLOWLIST: OwnerAgentToolSpec[] = [
  {
    name: "vault.search",
    kind: "mesh",
    domain: "document",
    description: "Search the owner's local vault for documents matching a query.",
    paramHint: '{ "query": "string", "limit": number }',
  },
  {
    name: "mesh.library_list",
    kind: "mesh",
    domain: "document",
    description: "List indexed library files on this node.",
    paramHint: "{}",
  },
  {
    name: "mesh.library_discover",
    kind: "mesh",
    domain: "document",
    description: "Find published file metadata on bonded contacts' libraries.",
    paramHint: '{ "fileTitleQuery": "string" }',
  },
  {
    name: "mesh.library_publish",
    kind: "mesh",
    domain: "document",
    description: "Publish or unpublish a local library item for discovery.",
    paramHint: '{ "documentId": "string", "published": boolean }',
  },
  {
    name: "mesh.library_request_share",
    kind: "mesh",
    domain: "document",
    description: "Ask a bonded contact to share a published file via chat.",
    paramHint: '{ "targetOwnerHint": "string", "fileTitleQuery": "string" }',
  },
  {
    name: "mesh.match_capability_route",
    kind: "mesh",
    domain: "service",
    description: "Match EMP workflow routes for a natural-language goal.",
    paramHint: '{ "goal": "string" } or { "routeId": "string" }',
  },
  {
    name: "mesh.capability_provider.start",
    kind: "mesh",
    domain: "service",
    description: "Start an async job to find peers who can fulfill a goal.",
    paramHint: '{ "goal": "string", "capabilityIds": ["string"] }',
    requiresPosture: "capabilityProvider",
  },
  {
    name: "mesh.task.propose",
    kind: "mesh",
    domain: "service",
    description: "Send task.mandate + task.propose to a bonded peer agent.",
    paramHint: '{ "targetOwnerId": "string", "objective": "string" }',
  },
  {
    name: "mesh.intro.broadcast_search",
    kind: "mesh",
    domain: "social",
    description: "Trust-mode broadcast search for strangers matching a topic.",
    paramHint: '{ "topic": "string", "maxResponses": number }',
    requiresTrustMode: true,
  },
  {
    name: "mesh.intro.run_autopilot",
    kind: "mesh",
    domain: "social",
    description: "Run one Trust-mode friend-discovery autopilot pass.",
    paramHint: '{ "maxResponses": number }',
    requiresTrustMode: true,
  },
  {
    name: "discovery.search",
    kind: "mesh",
    domain: "service",
    description: "Search bonded contacts by capability tags or keywords.",
    paramHint: '{ "targetOwnerId": "string", "query": "string" }',
  },
  {
    name: "mesh.list-pending",
    kind: "mesh",
    domain: "knowledge",
    description: "List actions waiting for owner approval.",
    paramHint: "{}",
  },
  {
    name: "owner.start_document_acquisition",
    kind: "job",
    domain: "document",
    description: "Start an async document hunt across vault and bonded catalogs.",
    paramHint: '{ "query": "string" }',
    requiresPosture: "documentAcquisition",
  },
  {
    name: "owner.run_social_proxy_pass",
    kind: "job",
    domain: "social",
    description: "Start a social-proxy discovery pass toward new friends.",
    paramHint: "{}",
    requiresPosture: "socialProxy",
    requiresTrustMode: true,
  },
  // Phase 40 — multi-agent chain orchestrator. The LLM planner calls this
  // when the owner asks for a multi-step workflow (e.g. "analyze X, Y, and Z").
  {
    name: "mesh.chain.run",
    kind: "job",
    domain: "service",
    description:
      "Decompose a multi-step goal into subtasks, broadcast a chain mandate, and collect worker bids. Use when the owner requests a multi-step workflow that needs multiple agents.",
    paramHint: '{ "goal": "string", "maxChainCostUsd"?: number, "costCeilingUsd"?: number }',
    requiresTrustMode: true,
  },
];

export function filterOwnerAgentTools(
  posture: OwnerAgentPostureFlags,
): OwnerAgentToolSpec[] {
  return OWNER_AGENT_TOOL_ALLOWLIST.filter((tool) => {
    if (tool.requiresTrustMode && !posture.trustMode) return false;
    if (tool.requiresPosture === "socialProxy" && !posture.socialProxy) return false;
    if (tool.requiresPosture === "documentAcquisition" && !posture.documentAcquisition) return false;
    if (tool.requiresPosture === "capabilityProvider" && !posture.capabilityProvider) return false;
    return true;
  });
}

export function findOwnerAgentTool(name: string): OwnerAgentToolSpec | undefined {
  return OWNER_AGENT_TOOL_ALLOWLIST.find((t) => t.name === name);
}

export function isOwnerAgentToolAllowed(
  toolName: string,
  posture: OwnerAgentPostureFlags,
): boolean {
  const spec = findOwnerAgentTool(toolName);
  if (!spec) return false;
  return filterOwnerAgentTools(posture).some((t) => t.name === toolName);
}
