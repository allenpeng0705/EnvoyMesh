/**
 * Agent Group Chat Responder (Phase 27)
 *
 * Request-only agent participation in group chats.
 * Anti-loop: never reply to senderRole=agent, max 3 responses/hour/group.
 *
 * Commands: @envoy summarize, @envoy find <query>, @envoy poll <question>
 */

/** Max recent messages to include when summarizing (bounds the prompt size). */
const SUMMARIZE_CONTEXT_MAX_MESSAGES = 20;

export interface AgentGroupChatDeps {
  /** Check if text contains an @envoy mention. */
  hasMention: (text: string) => boolean;
  /** Generate an answer using the model router. */
  generateAnswer: (prompt: string, context?: string) => Promise<string>;
  /** Send a chat.room.message as the agent. */
  sendAgentRoomMessage: (roomId: string, text: string) => Promise<void>;
  /** Per-room rate gate. Returns true when a response is allowed. */
  allowResponse?: (roomId: string) => boolean;
}

export interface AgentGroupChatDecision {
  /** Whether the agent should respond. */
  shouldRespond: boolean;
  /** Reason for the decision. */
  reason: string;
  /** The agent's response text (if shouldRespond). */
  response?: string;
}

/**
 * Parse the @envoy command after the mention. Recognized verbs are
 * `summarize`, `find`, and `poll`. Returns the verb + remainder text, or
 * `null` if no recognized command follows.
 */
function parseEnvoyCommand(text: string): { verb: "summarize" | "find" | "poll"; body: string } | null {
  // Use non-greedy .*? so the regex stops at the first @envoy mention.
  // Word boundary on the verb prevents "poll" matching inside "polling".
  const m = text.match(/@envoy\s+(summarize|find|poll)\b\s*(.*)$/i);
  if (!m) return null;
  const verbRaw = m[1]!.toLowerCase();
  const verb = verbRaw as "summarize" | "find" | "poll";
  return { verb, body: (m[2] ?? "").trim() };
}

/**
 * Evaluate whether the agent should respond to a group chat message.
 * Returns the decision and optionally the response text.
 */
export async function evaluateAgentGroupChatResponse(
  deps: AgentGroupChatDeps,
  input: {
    roomId: string;
    senderRole: "human" | "agent" | "system";
    text: string;
    /** Previous messages in the room for context. */
    recentMessages?: Array<{ sender: string; text: string }>;
  },
): Promise<AgentGroupChatDecision> {
  const text = (input.text ?? "").trim();
  if (text.length === 0) {
    return { shouldRespond: false, reason: "empty message" };
  }

  // ANTI-LOOP: Never reply to another agent
  if (input.senderRole === "agent") {
    return { shouldRespond: false, reason: "sender is an agent — anti-loop" };
  }

  // ANTI-LOOP: Must have @envoy mention
  if (!deps.hasMention(text)) {
    return { shouldRespond: false, reason: "no @envoy mention" };
  }

  // RATE LIMIT: Max 3 responses/hour/room (per-instance state; configurable via deps.allowResponse)
  if (deps.allowResponse && !deps.allowResponse(input.roomId)) {
    return { shouldRespond: false, reason: "rate limit exceeded for this room" };
  }

  // Parse the command
  const parsed = parseEnvoyCommand(text);
  let prompt: string;

  if (parsed === null) {
    // Generic @envoy mention without a recognized verb — provide a helpful answer.
    prompt = `You were mentioned in a group chat. The message was: "${text}". Provide a helpful, concise response.`;
  } else if (parsed.verb === "summarize") {
    // Bound the context so a long-lived group chat doesn't blow the prompt.
    const recent = input.recentMessages ?? [];
    const tail = recent.slice(-SUMMARIZE_CONTEXT_MAX_MESSAGES);
    const context = tail.map((m) => `${m.sender}: ${m.text}`).join("\n") || text;
    prompt = `Summarize this group chat conversation concisely. Focus on key decisions, action items, and open questions:\n\n${context}`;
  } else if (parsed.verb === "find") {
    const query = parsed.body;
    prompt = `Search for information about: ${query}. If this is a knowledge-base query, search the vault and bonded peers' libraries.`;
  } else {
    // parsed.verb === "poll"
    const question = parsed.body;
    prompt = `Create a poll for the group chat. Question: "${question}". Format as: "Poll: [question]\nOptions:\n1. Yes\n2. No\n3. Need more info"`;
  }

  const response = await deps.generateAnswer(prompt);

  return {
    shouldRespond: true,
    reason: `@envoy command detected`,
    response,
  };
}
