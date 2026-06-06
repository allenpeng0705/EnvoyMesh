/** Parse optional shell command blocks from EnvoyAI / Assistant replies. */
export function parseAssistantTerminalCommand(
  text: string,
): { command: string; rationale?: string } | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const fence = trimmed.match(/```terminal\n([\s\S]*?)```/i);
  if (fence?.[1]?.trim()) {
    return { command: fence[1].trim().split("\n")[0]!.trim(), rationale: "From EnvoyAI (terminal block)" };
  }

  const line = trimmed.match(/^TERMINAL_CMD:\s*(.+)$/im);
  if (line?.[1]?.trim()) {
    return { command: line[1].trim(), rationale: "From EnvoyAI (TERMINAL_CMD)" };
  }

  return undefined;
}

const TERMINAL_CORRELATION_PREFIX_RE = /^\[correlationId=([^\]]+)\]\s*\n?/;

/** Read terminal session id from owner-agent message prefix (Phase 31D shared thread). */
export function parseTerminalAssistantCorrelationId(message: string): string | undefined {
  const match = message.match(/^\[correlationId=([^\]]+)\]/);
  const id = match?.[1]?.trim();
  return id || undefined;
}

/** Strip correlation prefix before sending text to EnvoyAI / planner. */
export function stripTerminalAssistantCorrelationPrefix(message: string): string {
  return message.replace(TERMINAL_CORRELATION_PREFIX_RE, "").trimStart();
}
