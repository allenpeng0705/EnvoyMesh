/**
 * Agent Network worker membership — opt-in gate.
 *
 * Every home node has a local agent. That agent is private by default and must
 * not be recruitable as a Team jobs worker until the owner enables
 * Join Agent Network (`capabilityProviderEnabled` config flag). Membership is
 * advertised on the Agent Card via the membership tag `"agent-network-worker"`.
 *
 * See docs/agent-network-vocabulary.md.
 */

/** Advertised on Agent Card `membership[]` when Join Agent Network is on. */
export const AGENT_NETWORK_WORKER_MEMBERSHIP = "agent-network-worker" as const;

/** True when the peer's agent card membership opts into Agent Network work. */
export function isAgentNetworkMember(membership: readonly string[]): boolean {
  return membership.includes(AGENT_NETWORK_WORKER_MEMBERSHIP);
}

/**
 * Add or strip the Agent Network worker membership tag without duplicating it.
 * Base membership (e.g. `task.execute`) stays; only the worker opt-in flips.
 */
export function withAgentNetworkMembership(
  membership: readonly string[],
  optedIn: boolean,
): string[] {
  const without = membership.filter((c) => c !== AGENT_NETWORK_WORKER_MEMBERSHIP);
  if (!optedIn) return [...without];
  return [...without, AGENT_NETWORK_WORKER_MEMBERSHIP];
}
