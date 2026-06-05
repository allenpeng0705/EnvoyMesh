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
export declare const ENVOY_TOOL_CATALOG: EnvoyToolDefinition[];
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
    bonds: Array<{
        displayName: string;
        level: string;
        dormantDays?: number;
    }>;
    /** LLM config (inherited from EnvoyMesh settings). */
    model: {
        provider: string;
        baseUrl?: string;
        model?: string;
    };
}
/**
 * Build agent config from EnvoyMesh state.
 */
export declare function buildAgentConfig(params: {
    owner: {
        ownerId: string;
        displayName?: string;
        interests: string[];
        capabilities: string[];
    };
    permissions: {
        bondAutonomy: boolean;
        maxBondsPerDay: number;
        autoCircleContacts: boolean;
        maxSensitivity: string;
    };
    bonds: Array<{
        displayName: string;
        level: string;
        dormantDays?: number;
    }>;
    model: {
        provider: string;
        baseUrl?: string;
        model?: string;
    };
}): EnvoyAgentConfig;
/**
 * Build the startup instructions OpenClaw receives.
 * This is the "system prompt" that tells OpenClaw what EnvoyMesh is
 * and how to use its tools.
 */
export declare function buildOpenClawSystemPrompt(ownerName?: string, config?: EnvoyAgentConfig): string;
//# sourceMappingURL=tool-bridge.d.ts.map