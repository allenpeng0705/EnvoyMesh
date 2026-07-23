/**
 * Agent Network worker membership — opt-in gate.
 *
 * Every home node has a local agent. That agent is private by default and must
 * not be recruitable as a Chains / EMP worker until the owner enables
 * Capability Provider (`capabilityProviderEnabled`). Membership is advertised
 * on the Agent Card (and system.signal) via the EmpCapability string
 * `"capability-provider"`.
 */

export const AGENT_NETWORK_WORKER_CAPABILITY = "capability-provider" as const;

/** True when the peer's agent card (or capability list) opts into Agent Network work. */
export function isAgentNetworkWorker(capabilities: readonly string[]): boolean {
  return capabilities.includes(AGENT_NETWORK_WORKER_CAPABILITY);
}

/**
 * Add or strip the Agent Network worker capability without duplicating it.
 * Base capabilities (e.g. `task.execute`) stay; only membership flips.
 */
export function withAgentNetworkMembership(
  capabilities: readonly string[],
  optedIn: boolean,
): string[] {
  const without = capabilities.filter((c) => c !== AGENT_NETWORK_WORKER_CAPABILITY);
  if (!optedIn) return [...without];
  return [...without, AGENT_NETWORK_WORKER_CAPABILITY];
}
