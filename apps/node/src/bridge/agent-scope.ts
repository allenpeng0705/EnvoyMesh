/**
 * Intents the home-node bridge / native agent credential is allowed to sign.
 *
 * Must include `agent.card.request` / `agent.card.response` — otherwise
 * {@link verifyAgentEnvelope} rejects card exchange (scope check) and Team
 * jobs / Agent Network never cache peer cards even when Online-direct.
 */
export const BRIDGE_AGENT_SCOPE = [
  "chat.message",
  "agent.card.request",
  "agent.card.response",
  "knowledge.query",
  "discovery.request",
  "discovery.response",
  "share.request",
  "share.preview",
  "share.accept",
  "social.intro.sync",
  "social.intro.propose",
  "bond.request",
] as const;

export type BridgeAgentScopeIntent = (typeof BRIDGE_AGENT_SCOPE)[number];

/** True when a persisted credential is missing required bridge mesh intents. */
export function bridgeAgentScopeNeedsRefresh(scope: readonly string[] | undefined): boolean {
  if (!scope || scope.length === 0) return true;
  return !BRIDGE_AGENT_SCOPE.every((intent) => scope.includes(intent));
}
