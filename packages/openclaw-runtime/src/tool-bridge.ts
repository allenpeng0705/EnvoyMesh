/**
 * EnvoyMesh Tool Bridge for OpenClaw
 *
 * Exports EnvoyMesh's ToolRegistry as a JSON catalog that OpenClaw
 * receives at startup. OpenClaw uses tool descriptions to decide
 * which tool to call for each user request.
 *
 * EnvoyMesh features mapped to tools:
 *   Make friends        → mesh.send_hello, mesh.discover_cluster
 *   Find documents      → mesh.library_discover, mesh.discover_cluster
 *   Ask for help        → mesh.intelligence_report, mesh.task_propose
 *   A2A negotiation     → mesh.task_propose, mesh.task_result, mesh.task_feedback
 *   Bond autonomy       → mesh.send_hello (auto-accept via policy)
 *   Knowledge query     → mesh.knowledge_query (vault + bonded peers)
 *   Chat history search → mesh.chat_rag_search
 */

export interface EnvoyToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** When to use this tool (hints for OpenClaw). */
  useWhen: string[];
  /** What the result looks like. */
  resultShape: string;
}

/**
 * The complete tool catalog OpenClaw receives at startup.
 * OpenClaw uses useWhen hints + descriptions to pick tools.
 */
export const ENVOY_TOOL_CATALOG: EnvoyToolDefinition[] = [
  {
    name: "mesh.discover_cluster",
    description: "Broadcast a topic search across the mesh and return clustered results. Finds peers by what they publish and what they can do.",
    parameters: {
      type: "object",
      properties: {
        seedTopics: { type: "array", items: { type: "string" }, description: "Topics to search for (e.g. ['wasm', 'rust'])" },
        seedCapabilities: { type: "array", items: { type: "string" }, description: "Skills to search for (e.g. ['rust_reviewer'])" },
      },
    },
    useWhen: [
      "User wants to find new people",
      "User asks 'who knows about X'",
      "User wants to make friends around a topic",
      "Before sending bond requests — discover who to bond with",
    ],
    resultShape: "Clustered list of peers with topics, capabilities, and bond status. Formatted as 'Group: X people around topic Y'",
  },

  {
    name: "mesh.send_hello",
    description: "Send a bond request (hello) to a specific peer. Requires the target peer's ownerId.",
    parameters: {
      type: "object",
      properties: {
        targetOwnerId: { type: "string", description: "The peer's owner ID (envoy:owner:...)" },
        message: { type: "string", description: "Optional introduction message" },
      },
      required: ["targetOwnerId"],
    },
    useWhen: [
      "After discovering peers via mesh.discover_cluster",
      "User explicitly says 'connect with Alice'",
      "Building the user's social graph",
    ],
    resultShape: "{ ok: true, sent: true } or { ok: false, error: 'bond already exists' }",
  },

  {
    name: "mesh.library_discover",
    description: "Search bonded peers' published libraries for documents. Returns metadata (title, hash, topics) — not file contents.",
    parameters: {
      type: "object",
      properties: {
        fileTitleQuery: { type: "string", description: "Search query for document title" },
        targetOwnerIds: { type: "array", items: { type: "string" }, description: "Optional: specific peers to search" },
      },
    },
    useWhen: [
      "User asks 'does anyone have docs about X'",
      "Looking for published documents across the mesh",
      "Before requesting a document download",
    ],
    resultShape: "List of { ownerId, metadata: { title, hash, topics, sensitivity } }",
  },

  {
    name: "mesh.knowledge_query",
    description: "Query the local vault + bonded peers' published knowledge bases. Returns a synthesized answer.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question to answer" },
      },
      required: ["question"],
    },
    useWhen: [
      "User asks a knowledge question",
      "User wants information from their vault or bonded peers",
      "Before recommending an action that needs factual grounding",
    ],
    resultShape: "String: synthesized answer from local vault + bonded peers",
  },

  {
    name: "mesh.intelligence_report",
    description: "Generate a comprehensive analysis of the user's entire mesh — health, trends, dormant bonds, reputation, growth opportunities.",
    parameters: { type: "object", properties: {} },
    useWhen: [
      "User asks 'what's happening in my mesh'",
      "Periodic check-in on network health",
      "User wants to know who to reconnect with",
    ],
    resultShape: "Markdown report with sections: Network Health, Trending Topics, Dormant Bonds, Most Trusted, Growth Opportunities",
  },

  {
    name: "mesh.task_propose",
    description: "Send a task proposal to a peer agent. Used for A2A negotiation — finding someone to do work.",
    parameters: {
      type: "object",
      properties: {
        targetOwnerId: { type: "string", description: "Target peer's ownerId" },
        objective: { type: "string", description: "What you need done" },
        capabilityTags: { type: "array", items: { type: "string" }, description: "Required skills" },
      },
      required: ["targetOwnerId", "objective"],
    },
    useWhen: [
      "User needs help with a task that requires specific skills",
      "User says 'find someone to review this code'",
      "Multi-agent collaboration",
    ],
    resultShape: "{ ok: true, taskId: '...' } or { ok: false, error: '...' }",
  },

  {
    name: "mesh.chat_rag_search",
    description: "Search local chat history for relevant past conversations. Useful for recalling context.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        ownerId: { type: "string", description: "Optional: filter to specific contact" },
      },
      required: ["query"],
    },
    useWhen: [
      "User asks 'what did Alice say about X'",
      "Recalling past conversation context",
      "Before summarizing a contact's history",
    ],
    resultShape: "List of { contactName, snippet, timestamp }",
  },
];

/**
 * Full agent config sent to OpenClaw beyond the LLM.
 * Everything OpenClaw needs to be a useful EnvoyMesh agent.
 */
export interface EnvoyAgentConfig {
  /** Who the agent represents. */
  owner: {
    ownerId: string;
    displayName?: string;
    interests: string[];
    capabilities: string[];
  };
  /** What the agent is allowed to do. */
  permissions: {
    bondAutonomy: boolean;
    maxBondsPerDay: number;
    autoCircleContacts: boolean;
    maxSensitivity: "public" | "friends" | "direct";
  };
  /** Current mesh context. */
  bonds: Array<{ displayName: string; level: string; dormantDays?: number }>;
  /** LLM config (inherited from EnvoyMesh settings). */
  model: {
    provider: string;
    baseUrl?: string;
    model?: string;
  };
  /** Built-in OpenClaw web search (web_search tool). */
  webSearch?: {
    enabled: boolean;
    provider?: string;
  };
}

/**
 * Build agent config from EnvoyMesh state.
 */
export function buildAgentConfig(params: {
  owner: { ownerId: string; displayName?: string; interests: string[]; capabilities: string[] };
  permissions: { bondAutonomy: boolean; maxBondsPerDay: number; autoCircleContacts: boolean; maxSensitivity: string };
  bonds: Array<{ displayName: string; level: string; dormantDays?: number }>;
  model: { provider: string; baseUrl?: string; model?: string };
  webSearch?: { enabled: boolean; provider?: string };
}): EnvoyAgentConfig {
  return {
    owner: {
      ownerId: params.owner.ownerId,
      displayName: params.owner.displayName,
      interests: params.owner.interests,
      capabilities: params.owner.capabilities,
    },
    permissions: {
      bondAutonomy: params.permissions.bondAutonomy,
      maxBondsPerDay: params.permissions.maxBondsPerDay,
      autoCircleContacts: params.permissions.autoCircleContacts,
      maxSensitivity: (params.permissions.maxSensitivity as "public" | "friends" | "direct") ?? "public",
    },
    bonds: params.bonds,
    model: {
      provider: params.model.provider,
      baseUrl: params.model.baseUrl,
      model: params.model.model,
    },
    ...(params.webSearch ? { webSearch: params.webSearch } : {}),
  };
}

/**
 * Build the startup instructions OpenClaw receives.
 * This is the "system prompt" that tells OpenClaw what EnvoyMesh is
 * and how to use its tools.
 */
export function buildOpenClawSystemPrompt(ownerName?: string, config?: EnvoyAgentConfig): string {
  const lines = [
    "Additional EnvoyMesh context (supplements your normal OpenClaw workspace, skills catalog, and tools — do not replace them).",
    "",
    `You are helping ${ownerName ?? "the owner"} on EnvoyMesh — a decentralized P2P mesh.`,
    "",
    "This workspace is pre-configured. Do NOT run first-contact onboarding, BOOTSTRAP rituals,",
    "or ask who you are / who the user is. You already know your role.",
    "",
    "Your job is to help the user navigate their mesh: make friends, find documents,",
    "discover people by skills, negotiate tasks with other agents, and provide",
    "network intelligence.",
    "",
    "When the user asks what you can help with, list concrete EnvoyMesh capabilities:",
    "peer discovery, bonds, vault/knowledge queries, document library search,",
    "task proposals to other agents, mesh intelligence reports, chat history search,",
    "and web search for current events.",
    "",
  ];

  if (config?.webSearch?.enabled) {
    const provider = config.webSearch.provider ?? "duckduckgo";
    lines.push(
      "--- Web search (ENABLED) ---",
      `Provider: ${provider}. Tool: web_search (also tavily_search when Tavily is configured).`,
      "You CAN look up current news, headlines, prices, weather, and post-cutoff facts.",
      "For any time-sensitive question: call web_search with a focused query BEFORE answering.",
      "Do NOT refuse with training-data cutoff excuses — search first, then summarize results.",
      "",
    );
  } else if (config?.webSearch?.enabled === false) {
    lines.push(
      "--- Web search ---",
      "Web search is disabled in EnvoyMesh settings. Answer from training data and mesh tools only.",
      "",
    );
  }

  if (config) {
    lines.push("--- Current state ---");
    lines.push(`Owner: ${config.owner.ownerId}`);
    if (config.owner.interests.length > 0) {
      lines.push(`Interests: ${config.owner.interests.join(", ")}`);
    }
    if (config.owner.capabilities.length > 0) {
      lines.push(`Capabilities: ${config.owner.capabilities.join(", ")}`);
    }
    lines.push("");
    lines.push("--- Permissions ---");
    lines.push(
      `Bond autonomy: ${config.permissions.bondAutonomy ? `ALLOWED (max ${config.permissions.maxBondsPerDay}/day)` : "DENIED"}`,
    );
    lines.push(`Max bond tier: ${config.permissions.maxSensitivity}`);
    lines.push(`Auto-circle: ${config.permissions.autoCircleContacts ? "enabled" : "disabled"}`);
    lines.push("");
    if (config.bonds.length > 0) {
      lines.push("--- Current bonds ---");
      for (const b of config.bonds) {
        const dormant = b.dormantDays && b.dormantDays > 90 ? ` [dormant ${b.dormantDays}d]` : "";
        lines.push(`- ${b.displayName} (${b.level})${dormant}`);
      }
      lines.push("");
    }
  }

  lines.push(
    "--- Concepts ---",
    "- Bonds: trusted connections between peers. You can propose bonds via mesh.send_hello.",
    "- Discovery: find peers by what they publish or what they can do.",
    "- Vault: each user's local document store. Shared via published libraries.",
    "- Tasks: agents can negotiate and execute tasks for each other (A2A).",
    "- Circles: AI-curated contact groups by shared interests.",
    "",
    "--- Rules ---",
    "- Always search before recommending — use mesh.discover_cluster or mesh.knowledge_query.",
    "- Respect bond autonomy: only send bond requests within the configured daily limit.",
    "- NEVER make up information about peers — only report what tools return.",
    `- Current LLM: ${config?.model?.provider ?? "unknown"} / ${config?.model?.model ?? "default"}`,
    "",
    "Available tools are listed above. Call them by name with params.",
  );

  return lines.join("\n");
}
