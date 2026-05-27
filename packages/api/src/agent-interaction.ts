import type { AgentInteractionMode } from "./node-service.js";

/** Skip LLM chat-assist auto-reply when a verified peer agent sends chat and structured A2A is preferred. */
export function shouldSkipAgentChatAssist(input: {
  senderRole: "human" | "agent" | "system";
  agentInteractionMode: AgentInteractionMode | undefined;
  agentVerified?: boolean;
}): boolean {
  if (input.agentInteractionMode !== "structured_preferred") return false;
  if (input.senderRole !== "agent") return false;
  return input.agentVerified !== false;
}
