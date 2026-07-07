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
 *   Knowledge query     → vault.search (local), knowledge.query (peer mesh)
 *   Read vault file     → mesh.library_read
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
    name: "mesh.library_list",
    description:
      "List documents in the EnvoyMesh vault (metadata only). Does not include the OpenClaw workspace — use OpenClaw read/exec for that.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional title or path substring filter" },
      },
    },
    useWhen: [
      "User asks what files are in their vault or library",
      "Before mesh.library_read — pick relativePath or documentId from results",
    ],
    resultShape: "List of { documentId, relativePath, title, byteLength, published }",
  },

  {
    name: "mesh.library_read",
    description:
      "Read full contents of a vault file by relativePath or documentId (from mesh.library_list). Text files include textContent; binary returns base64.",
    parameters: {
      type: "object",
      properties: {
        relativePath: { type: "string", description: "Vault-relative path from mesh.library_list" },
        documentId: { type: "string", description: "Alternative: document id from mesh.library_list" },
        maxBytes: { type: "number", description: "Optional byte limit (default up to 5 MiB)" },
      },
    },
    useWhen: [
      "User asks to read or open a specific vault document",
      "After mesh.library_list or vault.search — need full file text, not just a snippet",
    ],
    resultShape: "{ relativePath, mimeType, sizeBytes, textContent? | contentBase64 }",
  },

  {
    name: "mesh.files_list_all",
    description:
      "List all of the user's local files in one unified view: EnvoyMesh vault plus OpenClaw workspace. Prefer this when the user asks to list or browse their documents.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional title or path substring filter across both locations" },
      },
    },
    useWhen: [
      "User asks to list, browse, or show their files or documents",
      "User does not distinguish vault vs workspace — treat as one library",
    ],
    resultShape: "{ items: [{ source: 'vault'|'workspace', relativePath, title, ... }], vaultCount, workspaceCount }",
  },

  {
    name: "mesh.files_read",
    description:
      "Read a local file from vault or workspace using source + relativePath from mesh.files_list_all.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", enum: ["vault", "workspace"], description: "From mesh.files_list_all" },
        relativePath: { type: "string", description: "Path from mesh.files_list_all" },
        documentId: { type: "string", description: "Vault only: document id" },
        maxBytes: { type: "number", description: "Optional byte limit (default up to 5 MiB)" },
      },
    },
    useWhen: [
      "User asks to open or read a specific file after mesh.files_list_all",
      "Need full file contents, not vault.search snippets",
    ],
    resultShape: "{ source, relativePath, mimeType, sizeBytes, textContent? | contentBase64 }",
  },

  {
    name: "vault.search",
    description: "Full-text search in the local EnvoyMesh vault. Returns matching snippets — use mesh.library_read for full file contents.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Maximum results" },
      },
      required: ["query"],
    },
    useWhen: [
      "User asks to find documents in their vault by topic or keyword",
      "Before mesh.library_read when you only know the subject, not the path",
    ],
    resultShape: "Ranked list of matching document chunks with snippets",
  },

  {
    name: "knowledge.query",
    description: "Query a bonded contact's knowledge base over the mesh (RAG answer from their vault).",
    parameters: {
      type: "object",
      properties: {
        targetOwnerId: { type: "string", description: "Peer owner id (envoy:owner:...)" },
        query: { type: "string", description: "The knowledge question" },
        requestedSensitivity: { type: "string", enum: ["public", "friends", "trusted", "private"] },
      },
      required: ["targetOwnerId", "query"],
    },
    useWhen: [
      "User asks a knowledge question about a specific bonded contact's documents",
      "Peer-specific factual grounding (not local vault search)",
    ],
    resultShape: "Knowledge query response envelope from the peer",
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
  const bondCount = config?.bonds?.length ?? 0;
  const hasInterests = (config?.owner?.interests?.length ?? 0) > 0;
  const interests = config?.owner?.interests ?? [];
  const hasModel = config?.model?.provider && config.model.provider !== "unknown";

  const lines = [
    "Additional EnvoyMesh context (supplements your normal OpenClaw workspace, skills catalog, and tools — do not replace them).",
    "",
    `You are EnvoyAI — the built-in AI assistant for ${ownerName ?? "the owner"} on EnvoyMesh.`,
    "EnvoyMesh is a decentralized, peer-to-peer mesh for private communication and AI agents.",
    "There is no central server — identity is cryptographic (Ed25519 keys), messages are signed,",
    "and the user owns all their data on their own device.",
    "",
    "This workspace is pre-configured. Do NOT run first-contact onboarding, BOOTSTRAP rituals,",
    "or ask who you are / who the user is. You already know your role.",
    "",
    "**IMPORTANT: Read ENVOYMESH_GUIDE.md in your workspace.** It contains the complete",
    "EnvoyMesh product guide — every feature, every UI path, exact step-by-step instructions.",
    "When a user asks how to do something, reference that guide and give them SPECIFIC steps",
    "(which tab, which button, what to expect). Do NOT give vague suggestions.",
    "",
    "=== PROACTIVE BEHAVIOR ===",
    "",
  ];

  // State-aware proactive guidance — what the agent should do based on user state.
  if (bondCount === 0) {
    lines.push(
      `This user has 0 contacts — they are BRAND NEW. State: ${hasInterests ? `${interests.length} interests (${interests.slice(0, 5).join(", ")})` : "no interests set"}.`,
      "Be proactive and warm:",
      "• Welcome them and ask what they'd like to do.",
      "• OFFER to search the mesh: 'I can look for people who share your interests — want me to search?'",
      "  Then call `mesh.discover_cluster` with a topic from their interests.",
      "• Guide them to Discover to say hello to someone.",
      "• Focus on getting their FIRST contact. Don't dump all features at once.",
      "• When they ask about a feature, give EXACT steps from ENVOYMESH_GUIDE.md.",
      "",
    );
  } else {
    lines.push(
      `This user has ${bondCount} contact(s).`,
      "• Help them use features: chains, file sharing, knowledge queries, mesh intelligence.",
      "• Suggest reconnecting with dormant contacts (90+ days).",
      "• When they ask how to do something, give EXACT steps from ENVOYMESH_GUIDE.md.",
      "",
    );
  }

  if (!hasModel) {
    lines.push(
      "NOTE: No model provider is configured. The user is getting scripted responses.",
      "Advise them to configure a model in Settings → AI for full AI capabilities.",
      "",
    );
  }

  lines.push(
    "=== TOOL USAGE ===",
    "When the user asks you to DO something (not just explain), use your tools:",
    "- `mesh.discover_cluster`: search the mesh for people/knowledge by topic. Works even with 0 bonds.",
    "- `mesh.send_hello`: send a bond request to a specific peer (needs targetOwnerId).",
    "- `mesh.files_list_all` / `mesh.files_read`: browse the user's files.",
    "- `vault.search`: keyword search over vault documents.",
    "- `knowledge.query`: ask a bonded peer's agent a question.",
    "- `mesh.intelligence_report`: analyze mesh health, dormant bonds, growth.",
    "- `web_search` / `tavily_search`: look up current information (if enabled).",
    "Always explain what you're about to do before calling a tool, and summarize results clearly.",
    "",
  );

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
    "--- Reminders & scheduled messages ---",
    "Use `envoymesh_remind` for owner-visible reminders in EnvoyAI chat (NOT the generic cron tool).",
    "Example: envoymesh_remind action=add, content=\"drink water\", time=\"5m\"",
    "NEVER say a reminder is set unless envoymesh_remind returned ok:true with a cron job id.",
    "Do not use sessionTarget=main or payload.kind=systemEvent for reminders — those only hit heartbeat, not chat.",
    "Confirm using the tool's summary / cronResult schedule — do not invent delivery times.",
    "",
    "--- Concepts ---",
    "- Bonds: trusted connections between peers. You can propose bonds via mesh.send_hello.",
    "- Discovery: find peers by what they publish or what they can do.",
    "- Vault: each user's local document store. Shared via published libraries.",
    "- Tasks: agents can negotiate and execute tasks for each other (A2A).",
    "- Circles: AI-curated contact groups by shared interests.",
    "",
    "--- Rules ---",
    "- Local files: mesh.files_list_all + mesh.files_read (vault and workspace together). vault.search for keyword search.",
    "- Do not tell the user about separate vault vs workspace unless troubleshooting.",
    "- Always search before recommending — use mesh.discover_cluster, vault.search, or knowledge.query.",
    "- Respect bond autonomy: only send bond requests within the configured daily limit.",
    "- NEVER make up information about peers — only report what tools return.",
    `- Current LLM: ${config?.model?.provider ?? "unknown"} / ${config?.model?.model ?? "default"}`,
    "",
    "Available tools are listed above. Call them by name with params.",
  );

  return lines.join("\n");
}
