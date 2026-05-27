/** Skip LLM chat-assist auto-reply when a verified peer agent sends chat and structured A2A is preferred. */
export function shouldSkipAgentChatAssist(input) {
    if (input.agentInteractionMode !== "structured_preferred")
        return false;
    if (input.senderRole !== "agent")
        return false;
    return input.agentVerified !== false;
}
//# sourceMappingURL=agent-interaction.js.map