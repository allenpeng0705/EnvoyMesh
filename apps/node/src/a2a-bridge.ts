/**
 * Phase 48C — A2A Agent Card Bridge.
 *
 * Translates EnvoyMesh's AgentCard to the A2A v1.0 standard format,
 * published at `/.well-known/agent-card.json` on the relay HTTP server.
 *
 * External A2A clients (LangChain, Salesforce, etc.) can discover
 * EnvoyMesh agents via the standard well-known URI and use the
 * Agent Card to understand what the agent can do.
 *
 * Design: docs/a2a-mcp-interop-design.md §4.4.
 */

/**
 * Phase 48D — well-known path where the A2A JSON-RPC endpoint is
 * mounted (both on the relay HTTP server and on the node's local
 * bridge HTTP server when behind a reverse proxy). Exported so the
 * task-bridge module, the relay's HTTP route, and the Agent Card
 * metadata all agree on the same constant.
 */
export const A2A_JSONRPC_PATH = "/.well-known/a2a/jsonrpc";

/** A2A v1.0 Agent Card shape (subset — we produce this). */
export interface A2AAgentCard {
  name: string;
  description: string;
  version: string;
  supportedInterfaces: Array<{
    protocolVersion: string;
    protocolBinding: string;
    url: string;
  }>;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
  };
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
  }>;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  securitySchemes: Record<string, {
    type: string;
    scheme: string;
  }>;
  security: Array<Record<string, string[]>>;
  provider?: {
    name: string;
    url?: string;
  };
  metadata?: Record<string, unknown>;
}

/** EnvoyMesh Agent Card input shape (from AgentCardSchema). */
export interface EnvoyAgentCard {
  version: string;
  ownerId: string;
  displayName: string;
  nodeProfile: string;
  capabilities: string[];
  publicTopics: string[];
  trustPolicySummary?: {
    acceptsDirectBondRequests?: boolean;
    acceptsReferralRequests?: boolean;
    requiresHumanApprovalForRawFiles?: boolean;
  };
  supportedProtocolVersions: string[];
  webContentRoot?: string;
  agentNetworkProfile?: {
    modelFreshness?: number;
    spendPosture?: string;
    contextWindow?: string;
    strengths?: string[];
    throughputTokensPerSec?: number;
  };
}

/**
 * Translate an EnvoyMesh Agent Card to the A2A v1.0 format.
 *
 * Field mapping (design doc §4.4):
 *   displayName → name
 *   capabilities → skills (each capability becomes a skill)
 *   capabilities → capabilities (derived: streaming + pushNotifications)
 *   trustPolicySummary → securitySchemes (bearer auth via bond trust)
 *   agentNetworkProfile.strengths → skill tags
 *   agentNetworkProfile → metadata
 */
export function toA2AAgentCard(
  envoyCard: EnvoyAgentCard,
  gatewayUrl: string,
  options?: {
    nodeVersion?: string;
    description?: string;
  },
): A2AAgentCard {
  const name = envoyCard.displayName;
  const description = options?.description ??
    `EnvoyMesh agent node (${envoyCard.nodeProfile}). Owner: ${envoyCard.ownerId.slice(0, 20)}…`;

  // Build skills from capabilities
  const strengths = envoyCard.agentNetworkProfile?.strengths ?? [];
  const skills = envoyCard.capabilities.map((cap) => ({
    id: cap,
    name: cap,
    description: `Capability: ${cap}`,
    tags: strengths.includes(cap) ? [cap, "strength"] : [cap],
  }));

  // Add web content as a skill if present
  if (envoyCard.webContentRoot) {
    skills.push({
      id: "web-content",
      name: "Web Content",
      description: "Serves URL-addressable content over the mesh",
      tags: ["web", "content"],
    });
  }

  return {
    name,
    description,
    version: options?.nodeVersion ?? "0.1.0",
    supportedInterfaces: [
      {
        protocolVersion: "1.0",
        protocolBinding: "jsonrpc",
        url: gatewayUrl,
      },
    ],
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    skills,
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "text/plain"],
    securitySchemes: {
      bearer: {
        type: "http",
        scheme: "bearer",
      },
    },
    security: [{ bearer: [] }],
    provider: {
      name: `${name} (EnvoyMesh)`,
    },
    metadata: {
      ownerId: envoyCard.ownerId,
      nodeProfile: envoyCard.nodeProfile,
      envoyVersion: envoyCard.version,
      ...(envoyCard.agentNetworkProfile && {
        agentNetworkProfile: envoyCard.agentNetworkProfile,
      }),
      ...(envoyCard.webContentRoot && {
        webContentRoot: envoyCard.webContentRoot,
      }),
    },
  };
}

/**
 * HTTP handler for `/.well-known/agent-card.json`.
 *
 * Returns the A2A v1.0 Agent Card for this node. The card is built
 * from the node's EnvoyMesh Agent Card + the gateway URL.
 *
 * This handler should be mounted on the relay HTTP server (or the
 * node's bridge HTTP server) when `a2aBridge.enabled` is true.
 */
export async function handleA2AAgentCardRequest(
  req: { method?: string; url?: string },
  res: {
    writeHead: (status: number, headers?: Record<string, string>) => void;
    end: (data: string) => void;
  },
  envoyCard: EnvoyAgentCard | null,
  gatewayUrl: string,
  options?: { nodeVersion?: string },
): Promise<void> {
  // Only respond to GET
  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET", "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  if (!envoyCard) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Agent card not available — node not initialized" }));
    return;
  }

  const a2aCard = toA2AAgentCard(envoyCard, gatewayUrl, options);
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(a2aCard, null, 2));
}
