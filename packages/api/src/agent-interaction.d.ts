import type { AgentInteractionMode } from "./node-service.js";
/** Skip LLM chat-assist auto-reply when a verified peer agent sends chat and structured A2A is preferred. */
export declare function shouldSkipAgentChatAssist(input: {
    senderRole: "human" | "agent" | "system";
    agentInteractionMode: AgentInteractionMode | undefined;
    agentVerified?: boolean;
}): boolean;
//# sourceMappingURL=agent-interaction.d.ts.map