import {
  coerceAgentNetworkRoleId,
  type AgentNetworkRoleId,
} from "@envoymesh/protocol";

/**
 * Normalize free-text into a collaboration role id.
 * Accepts well-known ids, `custom:<slug>`, or a slug/phrase → `custom:<slug>`.
 */
export function draftToAgentNetworkRoleId(draft: string): AgentNetworkRoleId | null {
  const trimmed = draft.trim().toLowerCase();
  if (!trimmed) return null;
  const direct = coerceAgentNetworkRoleId(trimmed);
  if (direct) return direct;
  const withoutPrefix = trimmed.startsWith("custom:") ? trimmed.slice("custom:".length) : trimmed;
  const slug = withoutPrefix
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
  if (!slug) return null;
  return coerceAgentNetworkRoleId(`custom:${slug}`);
}

/** Human label for a role id (strips `custom:` / localizes well-known). */
export function agentNetworkRoleLabel(
  roleId: string,
  t: (key: string, fallbackOrParams?: string) => string,
): string {
  const id = coerceAgentNetworkRoleId(roleId);
  if (!id) return roleId;
  if (id.startsWith("custom:")) {
    return id.slice("custom:".length).replace(/_/g, " ");
  }
  return t(`settings.agentNetwork.membership.role_${id}`, id);
}
