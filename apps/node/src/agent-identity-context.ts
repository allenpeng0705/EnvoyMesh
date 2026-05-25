import type { AgentIdentityStore } from "@envoymesh/local-store";

export const MAX_AGENT_IDENTITY_CHARS = 12_000;

export function formatAgentIdentitySection(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return "";
  }
  const body =
    trimmed.length > MAX_AGENT_IDENTITY_CHARS
      ? `${trimmed.slice(0, MAX_AGENT_IDENTITY_CHARS)}\n...(truncated)`
      : trimmed;
  return `\n\n## Agent identity\n${body}\n`;
}

export async function loadAgentIdentitySection(
  store: AgentIdentityStore | null | undefined,
): Promise<string> {
  if (!store) {
    return "";
  }
  try {
    const doc = await store.load();
    return formatAgentIdentitySection(doc.content);
  } catch {
    return "";
  }
}
