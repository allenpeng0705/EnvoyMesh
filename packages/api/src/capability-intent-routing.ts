import type { EnvoyIntent } from "@envoymesh/protocol";

/** Manifest capability tag for bonded published-library discovery (FS-D). */
export const PUBLISHED_LIBRARY_CAPABILITY = "envoymesh.published-library" as const;

export type AgentCapabilityDomain = "social" | "document" | "service";

export interface AgentRouteStep {
  phase: string;
  description: string;
  intents: EnvoyIntent[];
  /** Local mesh tools the agent may call before/alongside wire intents (orchestration hints only). */
  meshTools?: string[];
  /** Minimum bond tier hint for the agent planner — enforced on wire by Bond Engine. */
  minBond?: "public" | "referred" | "direct";
}

export interface AgentCapabilityRoute {
  routeId: string;
  label: string;
  domain: AgentCapabilityDomain;
  capabilityIds: string[];
  keywords: string[];
  steps: AgentRouteStep[];
  empPosture?: "social-proxy" | "document-acquisition" | "capability-provider";
}

export interface MatchAgentCapabilityRoutesInput {
  /** Natural-language goal from the agent (not shown to humans). */
  goal?: string;
  /** Capability ids from discovery.response, Agent Card, or manifest. */
  capabilityIds?: string[];
  /** Owner-approved local manifest capabilities (extends matching). */
  localManifestCapabilities?: string[];
  /** Additional registered routes (e.g. from node config). */
  customRoutes?: AgentCapabilityRoute[];
  maxResults?: number;
}

export interface MatchedAgentCapabilityRoute {
  routeId: string;
  label: string;
  domain: AgentCapabilityDomain;
  score: number;
  matchedCapabilityIds: string[];
  matchedKeywords: string[];
  steps: AgentRouteStep[];
  empPosture?: AgentCapabilityRoute["empPosture"];
}

const BUILTIN_AGENT_CAPABILITY_ROUTES: AgentCapabilityRoute[] = [
  {
    routeId: "document.published-library",
    label: "Published library — discover metadata and acquire files",
    domain: "document",
    capabilityIds: [PUBLISHED_LIBRARY_CAPABILITY],
    keywords: [
      "document",
      "library",
      "file",
      "publish",
      "vault",
      "share",
      "pdf",
      "paper",
      "acquire",
    ],
    empPosture: "document-acquisition",
    steps: [
      {
        phase: "discover",
        description: "Find peers advertising published vault metadata",
        intents: ["discovery.request"],
        meshTools: ["mesh.library_discover"],
        minBond: "referred",
      },
      {
        phase: "negotiate",
        description: "Clarify which published item matches the goal",
        intents: ["knowledge.query"],
        meshTools: ["mesh_requestKnowledge"],
        minBond: "referred",
      },
      {
        phase: "acquire",
        description: "Request bytes via pull-share or owner-approved push",
        intents: ["share.request", "share.preview", "share.accept"],
        meshTools: ["mesh.library_request_share"],
        minBond: "direct",
      },
    ],
  },
  {
    routeId: "document.knowledge-query",
    label: "Knowledge query — ask a peer agent/human without file transfer",
    domain: "document",
    capabilityIds: [],
    keywords: ["knowledge", "ask", "query", "answer", "explain", "summarize"],
    steps: [
      {
        phase: "discover",
        description: "Optional: locate a peer by tags or capabilities",
        intents: ["discovery.request"],
        minBond: "public",
      },
      {
        phase: "query",
        description: "Send knowledge.query and consume knowledge.response",
        intents: ["knowledge.query", "knowledge.response"],
        meshTools: ["mesh_requestKnowledge"],
        minBond: "referred",
      },
    ],
  },
  {
    routeId: "social.intro-bond",
    label: "Social intro — stranger-safe introduction toward human bond",
    domain: "social",
    capabilityIds: ["emp:social-proxy"],
    keywords: ["friend", "intro", "bond", "social", "meet", "connect", "hello"],
    empPosture: "social-proxy",
    steps: [
      {
        phase: "discover",
        description: "Broadcast or targeted discovery for matching strangers",
        intents: ["discovery.request"],
        meshTools: ["mesh.intro.broadcast_search"],
        minBond: "public",
      },
      {
        phase: "introduce",
        description: "Proxy-mediated intro proposal and owner commitment",
        intents: [
          "social.intro.propose",
          "social.intro.sync",
          "social.intro.owner-ready",
          "bond.request",
        ],
        minBond: "public",
      },
      {
        phase: "bond",
        description: "Human accepts bond; agents must not call bond.accept",
        intents: ["bond.accept"],
        minBond: "direct",
      },
      {
        phase: "chat",
        description: "Post-bond human or agent chat",
        intents: ["chat.message"],
        meshTools: ["mesh_sendChat"],
        minBond: "direct",
      },
    ],
  },
  {
    routeId: "service.task-negotiation",
    label: "Task service — agent-to-agent mandate and execution",
    domain: "service",
    capabilityIds: [],
    keywords: ["task", "service", "execute", "delegate", "mandate", "job", "work"],
    empPosture: "capability-provider",
    steps: [
      {
        phase: "discover",
        description: "Find a peer advertising task-relevant capabilities",
        intents: ["discovery.request"],
        minBond: "public",
      },
      {
        phase: "card",
        description: "Fetch Agent Card for scopes and supported EMP postures",
        intents: ["agent.card.request", "agent.card.response"],
        meshTools: ["mesh.agent_card.request", "mesh.get_agent_card"],
        minBond: "referred",
      },
      {
        phase: "negotiate",
        description: "Mandate-bound task proposal and negotiation",
        intents: [
          "task.mandate",
          "task.propose",
          "task.negotiate",
          "task.accept",
          "task.reject",
        ],
        minBond: "referred",
      },
      {
        phase: "execute",
        description: "Run task and collect result",
        intents: ["task.heartbeat", "task.result", "task.cancel"],
        minBond: "referred",
      },
    ],
  },
];

const registeredCustomRoutes: AgentCapabilityRoute[] = [];

function builtinCapabilityIds(): Set<string> {
  const ids = new Set<string>();
  for (const route of BUILTIN_AGENT_CAPABILITY_ROUTES) {
    for (const id of route.capabilityIds) ids.add(id.toLowerCase());
  }
  return ids;
}

/** Build a generic task-service route for a third-party manifest capability tag. */
export function buildCustomCapabilityRoute(capabilityId: string): AgentCapabilityRoute {
  const slug = capabilityId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const tail = capabilityId.split(/[.:]/).pop()?.toLowerCase() ?? capabilityId;
  return {
    routeId: `custom:${slug || "service"}`,
    label: `Custom service: ${capabilityId}`,
    domain: "service",
    capabilityIds: [capabilityId],
    keywords: [tail, slug, capabilityId.toLowerCase()],
    empPosture: "capability-provider",
    steps: [
      {
        phase: "discover",
        description: `Locate peers advertising ${capabilityId}`,
        intents: ["discovery.request"],
        meshTools: ["mesh_findCapability"],
        minBond: "public",
      },
      {
        phase: "card",
        description: "Fetch Agent Card for scopes",
        intents: ["agent.card.request", "agent.card.response"],
        meshTools: ["mesh.agent_card.request", "mesh.get_agent_card"],
        minBond: "referred",
      },
      {
        phase: "negotiate",
        description: "Task mandate and negotiation",
        intents: ["task.mandate", "task.propose", "task.negotiate", "task.accept"],
        minBond: "referred",
      },
      {
        phase: "execute",
        description: "Collect task result",
        intents: ["task.result"],
        minBond: "referred",
      },
    ],
  };
}

/** Derive custom routes for manifest capabilities not covered by built-ins. */
export function deriveRoutesFromManifestCapabilities(capabilities: string[]): AgentCapabilityRoute[] {
  const covered = builtinCapabilityIds();
  const seen = new Set<string>();
  const routes: AgentCapabilityRoute[] = [];
  for (const capabilityId of capabilities) {
    const key = capabilityId.toLowerCase();
    if (covered.has(key) || seen.has(key)) continue;
    seen.add(key);
    routes.push(buildCustomCapabilityRoute(capabilityId));
  }
  return routes;
}

/** Register an additional agent route (AI orchestration only). */
export function registerAgentCapabilityRoute(route: AgentCapabilityRoute): void {
  const idx = registeredCustomRoutes.findIndex((r) => r.routeId === route.routeId);
  if (idx >= 0) registeredCustomRoutes[idx] = route;
  else registeredCustomRoutes.push(route);
}

export function unregisterAgentCapabilityRoute(routeId: string): void {
  const idx = registeredCustomRoutes.findIndex((r) => r.routeId === routeId);
  if (idx >= 0) registeredCustomRoutes.splice(idx, 1);
}

export function listRegisteredAgentCapabilityRoutes(): AgentCapabilityRoute[] {
  return [...registeredCustomRoutes];
}

function allAgentCapabilityRoutes(input: MatchAgentCapabilityRoutesInput): AgentCapabilityRoute[] {
  const manifestRoutes = deriveRoutesFromManifestCapabilities(input.localManifestCapabilities ?? []);
  const byId = new Map<string, AgentCapabilityRoute>();
  for (const route of [
    ...BUILTIN_AGENT_CAPABILITY_ROUTES,
    ...manifestRoutes,
    ...registeredCustomRoutes,
    ...(input.customRoutes ?? []),
  ]) {
    byId.set(route.routeId, route);
  }
  return [...byId.values()];
}

function tokenizeGoal(goal: string): string[] {
  return goal
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function scoreRoute(
  route: AgentCapabilityRoute,
  goalTokens: string[],
  capabilityIds: string[],
): MatchedAgentCapabilityRoute {
  const capabilitySet = new Set(capabilityIds.map((id) => id.toLowerCase()));
  const matchedCapabilityIds = route.capabilityIds.filter((id) =>
    capabilitySet.has(id.toLowerCase()),
  );

  // Require a meaningful keyword match: either the token equals the keyword,
  // the longer contains the shorter AND the shorter is at least 5 chars long,
  // or both are at least 5 chars with significant overlap. This avoids short
  // incidental tokens like "help" or "code" from triggering long custom
  // keywords like "coding-help" purely via substring containment, which made
  // every greeting (e.g. "What can you help me with?") route to a custom
  // service.
  const matchedKeywords = route.keywords.filter((kw) =>
    goalTokens.some((token) => {
      if (token === kw) return true;
      const [shorter, longer] = token.length <= kw.length ? [token, kw] : [kw, token];
      if (shorter.length < 5) return false;
      return longer.includes(shorter);
    }),
  );

  let score = 0;
  score += matchedCapabilityIds.length * 10;
  score += matchedKeywords.length * 5;

  if (capabilityIds.length === 0 && goalTokens.length === 0) {
    score = 0;
  } else if (
    capabilityIds.length > 0 &&
    matchedCapabilityIds.length === 0 &&
    goalTokens.length === 0
  ) {
    score = 0;
  } else if (
    // When the user gave a real goal, a manifest capability alone (no keyword
    // overlap with the goal) should NOT promote the route — otherwise any
    // owner message ("Hello", "what can you do?") would always pick the first
    // custom manifest route.
    goalTokens.length > 0 &&
    matchedKeywords.length === 0 &&
    matchedCapabilityIds.length > 0 &&
    route.routeId.startsWith("custom:")
  ) {
    score = 0;
  }

  return {
    routeId: route.routeId,
    label: route.label,
    domain: route.domain,
    score,
    matchedCapabilityIds,
    matchedKeywords,
    empPosture: route.empPosture,
    steps: route.steps,
  };
}

/** Rank routes for agent orchestration (not for human discovery UI). */
export function matchAgentCapabilityRoutes(
  input: MatchAgentCapabilityRoutesInput,
): MatchedAgentCapabilityRoute[] {
  const goalTokens = input.goal ? tokenizeGoal(input.goal) : [];
  const capabilityIds = [
    ...(input.capabilityIds ?? []),
    ...(input.localManifestCapabilities ?? []),
  ];
  const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10);

  const ranked = allAgentCapabilityRoutes(input)
    .map((route) => scoreRoute(route, goalTokens, capabilityIds))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.routeId.localeCompare(b.routeId))
    .slice(0, maxResults);

  return ranked;
}

/** Resolve a single route by id for step-by-step agent planning. */
export function getAgentCapabilityRoute(routeId: string): AgentCapabilityRoute | undefined {
  return allAgentCapabilityRoutes({}).find((route) => route.routeId === routeId);
}

/** Resolve route by id including manifest-derived and registered custom routes. */
export function resolveAgentCapabilityRouteById(
  routeId: string,
  input: Pick<MatchAgentCapabilityRoutesInput, "localManifestCapabilities" | "customRoutes"> = {},
): AgentCapabilityRoute | undefined {
  return allAgentCapabilityRoutes(input).find((route) => route.routeId === routeId);
}

/** List all built-in routes (agent tooling / tests). */
export function listAgentCapabilityRoutes(): AgentCapabilityRoute[] {
  return [...BUILTIN_AGENT_CAPABILITY_ROUTES];
}

/** Resolve the EMP route plan for document acquisition jobs. */
export function resolveDocumentAcquisitionAgentRoute(input: {
  query: string;
  manifestCapabilities?: string[];
}): { routeId: string; phases: string[] } {
  const matches = matchAgentCapabilityRoutes({
    goal: input.query,
    capabilityIds: [PUBLISHED_LIBRARY_CAPABILITY],
    localManifestCapabilities: input.manifestCapabilities,
    maxResults: 1,
  });
  const routeId = matches[0]?.routeId ?? "document.published-library";
  const route = getAgentCapabilityRoute(routeId);
  return {
    routeId,
    phases: route?.steps.map((step) => step.phase) ?? ["discover", "negotiate", "acquire"],
  };
}

/** Map document acquisition worker stage to agent route phase (for activity / auditing). */
export function documentAcquisitionStageToRoutePhase(stage: string): string | undefined {
  switch (stage) {
    case "bonded_catalog":
    case "wider_discovery":
    case "candidate_ranking":
      return "discover";
    case "negotiating":
      return "negotiate";
    case "share_requested":
    case "awaiting_share_accept":
    case "transferring":
      return "acquire";
    default:
      return undefined;
  }
}
