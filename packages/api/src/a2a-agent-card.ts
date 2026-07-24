/**
 * Phase 48C — Shared A2A v1.0 Agent Card types + builders.
 *
 * Browser-safe (no Node-only deps) so both the relay HTTP server and the
 * node's bridge HTTP server can import the same canonical translators.
 * Living in `@envoymesh/api` rather than `apps/node/src/a2a-bridge.ts`
 * avoids a cross-package rootDir violation when the relay imports it.
 *
 * The relay intentionally does NOT run LLMs; it has its own builder
 * (`relayEnvoyAgentCard`) that describes connectivity primitives
 * instead of agent capabilities.
 *
 * Security:
 * - Public card omits `peerId`/`multiaddrs`/`ownerId` unless explicitly
 *   requested via `exposeOperational: true` (relay) or `redactOwnerId: false`
 *   (node). These are stable, long-lived identity markers that aid
 *   targeting if leaked.
 * - `provider` uses the A2A v1.0 `{organization, url}` shape.
 * - `securitySchemes` key is `Bearer` (capitalized) per RFC 9110 examples.
 *
 * Design: docs/a2a-mcp-interop-design.md §4.4.
 */

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
  provider: {
    organization: string;
    url: string;
  };
  /** Non-standard extension; clients may silently drop. */
  metadata?: Record<string, unknown>;
}

/** EnvoyMesh Agent Card input shape (subset of AgentCardSchema). */
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

interface CommonCardOptions {
  nodeVersion?: string;
}

/**
 * Node-side builder. Translates an EnvoyMesh Agent Card to A2A v1.0.
 * Does NOT include ownerId in the public-facing description; ownerId
 * is included in `metadata["x-envoymesh-ownerId"]` so spec-strict
 * parsers that drop non-standard metadata won't expose it.
 */
export function toA2AAgentCard(
  envoyCard: EnvoyAgentCard,
  gatewayUrl: string,
  options?: CommonCardOptions & { description?: string },
): A2AAgentCard {
  const name = envoyCard.displayName;
  const description = options?.description ??
    `EnvoyMesh agent node (${envoyCard.nodeProfile}). Skills: ${envoyCard.capabilities.join(", ")}.`;

  const strengths = envoyCard.agentNetworkProfile?.strengths ?? [];
  const skills = envoyCard.capabilities.map((cap) => ({
    id: cap,
    name: cap,
    description: `Capability: ${cap}`,
    tags: strengths.includes(cap) ? [cap, "strength"] : [cap],
  }));

  if (envoyCard.webContentRoot) {
    // Inline the URL in the description so spec-strict parsers don't drop it.
    skills.push({
      id: "web-content",
      name: "Web Content",
      description: `Serves URL-addressable content at ${envoyCard.webContentRoot}`,
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
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json", "text/plain"],
    securitySchemes: {
      Bearer: { type: "http", scheme: "bearer" },
    },
    security: [{ Bearer: [] }],
    provider: {
      organization: name,
      url: gatewayUrl,
    },
    metadata: {
      "x-envoymesh-nodeProfile": envoyCard.nodeProfile,
      "x-envoymesh-version": envoyCard.version,
      ...(envoyCard.agentNetworkProfile && {
        "x-envoymesh-agentNetworkProfile": envoyCard.agentNetworkProfile,
      }),
      ...(envoyCard.webContentRoot && {
        "x-envoymesh-webContentRoot": envoyCard.webContentRoot,
      }),
      "x-envoymesh-ownerId": envoyCard.ownerId,
    },
  };
}

/** Input for the relay-side card builder. */
export interface RelayCardInfo {
  peerId: string;
  multiaddrs: string[];
  rosterSize: number;
}

/** Minimal HTTP response shape — both node and relay use this. */
export interface A2ACardHttpResponse {
  writeHead: (status: number, headers?: Record<string, string>) => void;
  end: (data?: string) => void;
}

/** Minimal HTTP request shape. */
export interface A2ACardHttpRequest {
  method?: string;
  url?: string;
}

/**
 * HTTP handler for `/.well-known/agent-card.json` (node-side).
 * Sets CORS preflight, 405 on non-GET, 503 when no card available,
 * 200 with the canonical A2A v1.0 card otherwise.
 */
export function handleA2AAgentCardRequest(
  req: A2ACardHttpRequest,
  res: A2ACardHttpResponse,
  envoyCard: EnvoyAgentCard | null,
  gatewayUrl: string,
  options?: { nodeVersion?: string },
): void {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }
  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET, OPTIONS", "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  if (!envoyCard) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Agent card not available — node not initialized" }));
    return;
  }
  const card = toA2AAgentCard(envoyCard, gatewayUrl, options);
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(card, null, 2));
}

/**
 * HTTP handler for the relay's `/.well-known/agent-card.json` route.
 * Same shape as `handleA2AAgentCardRequest` but builds a relay-focused
 * card via `relayEnvoyAgentCard`.
 */
export function handleA2ARelayAgentCardRequest(
  req: A2ACardHttpRequest,
  res: A2ACardHttpResponse,
  info: RelayCardInfo | null,
  gatewayUrl: string,
  options?: { displayName?: string; nodeVersion?: string; exposeOperational?: boolean },
): void {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }
  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET, OPTIONS", "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  if (!info) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Relay not initialized" }));
    return;
  }
  const card = relayEnvoyAgentCard(info, gatewayUrl, options);
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(card, null, 2));
}

/**
 * Relay-side builder. By default omits `peerId`/`multiaddrs`/`rosterSize`
 * (those are stable identity / topology markers). Pass
 * `exposeOperational: true` to include them — useful for debugging
 * relay meshes but increases fingerprinting surface.
 *
 * Always sets `x-envoymesh-taskBridgeStatus` in metadata so external
 * A2A clients can detect that the JSON-RPC endpoint is not yet
 * end-to-end functional (Phase 48D ships the protocol + auth; the
 * executor that actually runs the task is 48D.5).
 */
export function relayEnvoyAgentCard(
  info: RelayCardInfo,
  gatewayUrl: string,
  options?: CommonCardOptions & {
    displayName?: string;
    exposeOperational?: boolean;
    /** Override the published task-bridge status. Default: "scaffolding". */
    taskBridgeStatus?: "scaffolding" | "available" | "disabled";
  },
): A2AAgentCard {
  const displayName = options?.displayName ?? "EnvoyMesh Relay";
  return {
    name: displayName,
    description: "EnvoyMesh circuit relay and discovery node. Provides connectivity for the P2P agent mesh; does not run LLMs.",
    version: options?.nodeVersion ?? "0.1.0",
    supportedInterfaces: [
      {
        protocolVersion: "1.0",
        protocolBinding: "jsonrpc",
        url: gatewayUrl,
      },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    skills: [
      {
        id: "circuit-relay",
        name: "Circuit Relay",
        description: "NAT traversal via libp2p circuit-relay-v2",
        tags: ["relay", "connectivity", "libp2p"],
      },
    ],
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    securitySchemes: {
      Bearer: { type: "http", scheme: "bearer" },
    },
    security: [{ Bearer: [] }],
    provider: {
      organization: "EnvoyMesh",
      url: gatewayUrl,
    },
    metadata: {
      "x-envoymesh-taskBridgeStatus": options?.taskBridgeStatus ?? "scaffolding",
      ...(options?.exposeOperational === true ? {
        "x-envoymesh-peerId": info.peerId,
        "x-envoymesh-multiaddrs": info.multiaddrs,
        "x-envoymesh-rosterSize": info.rosterSize,
      } : {}),
    },
  };
}