/**
 * In-memory per-session Ext Agent model overrides.
 * Keyed by `agentId:sessionKey` where sessionKey matches `backend.ask()` /
 * bridge `fromOwnerId` (home ownerId for owner callers, family profileId otherwise).
 */
const overrides = new Map<string, string>();

export function extAgentSessionModelKey(agentId: string, sessionKey: string): string {
  return `${agentId.trim()}:${sessionKey.trim()}`;
}

export function getExtAgentSessionModel(
  agentId: string,
  sessionKey: string,
): string | undefined {
  const key = extAgentSessionModelKey(agentId, sessionKey);
  if (!key.endsWith(":") && !key.startsWith(":")) {
    const value = overrides.get(key);
    return value?.trim() || undefined;
  }
  return undefined;
}

/** Set override, or clear when model is null/empty. */
export function setExtAgentSessionModel(
  agentId: string,
  sessionKey: string,
  model: string | null | undefined,
): string | undefined {
  const key = extAgentSessionModelKey(agentId, sessionKey);
  if (!agentId.trim() || !sessionKey.trim()) return undefined;
  const next = model?.trim() ?? "";
  if (!next) {
    overrides.delete(key);
    return undefined;
  }
  overrides.set(key, next);
  return next;
}

export function clearExtAgentSessionModel(agentId: string, sessionKey: string): void {
  setExtAgentSessionModel(agentId, sessionKey, null);
}

/** Agents that honor session `/model` via ask() plumbing. */
export const EXT_AGENT_SESSION_MODEL_AGENTS = [
  "hermes",
  "openhuman",
  "claudecode",
] as const;

export type ExtAgentSessionModelAgent =
  (typeof EXT_AGENT_SESSION_MODEL_AGENTS)[number];

export function supportsExtAgentSessionModel(agentId: string): boolean {
  return (EXT_AGENT_SESSION_MODEL_AGENTS as readonly string[]).includes(agentId.trim());
}

/** @internal tests */
export function _resetExtAgentSessionModelsForTests(): void {
  overrides.clear();
}
