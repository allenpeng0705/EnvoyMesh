/**
 * Intents the home-node bridge / native agent credential is allowed to sign.
 *
 * Must include `agent.card.request` / `agent.card.response` — otherwise
 * {@link verifyAgentEnvelope} rejects card exchange (scope check) and Team
 * jobs / Agent Network never cache peer cards even when Online-direct.
 *
 * Must include `task.chain.*` — Team job envelopes use senderRole=agent with
 * `envoy_agent_*` peer ids; without credential + scope, remote peers reject
 * them as "invalid signature" (peerId ≠ derivePeerId(pubkey)).
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
  "task.chain.mandate",
  "task.chain.propose",
  "task.chain.bid",
  "task.chain.accept",
  "task.chain.partial",
  "task.chain.merge",
  "task.chain.cancel",
  "task.chain.heartbeat",
  "task.chain.status",
  "task.chain.report",
  "task.chain.handoff",
  "task.chain.delegate",
  "task.chain.relay",
  "task.chain.arbitration",
  "task.chain.ready.request",
  "task.chain.ready.response",
  // Phase 60D — restart reconciliation.
  "task.chain.reconcile.request",
  "task.chain.reconcile.response",
  // Phase 60B — signed short-lived worker leases.
  "agent.worker.lease",
  "agent.worker.lease.revoke",
  "agent.worker.lease.request",
  // v2.2 — direct MAP-over-libp2p sub-agent submit (RemoteSubmitterTransport).
  "task.harness.submit.request",
  "task.harness.submit.response",
] as const;

export type BridgeAgentScopeIntent = (typeof BRIDGE_AGENT_SCOPE)[number];

/** True when a persisted credential is missing required bridge mesh intents. */
export function bridgeAgentScopeNeedsRefresh(scope: readonly string[] | undefined): boolean {
  if (!scope || scope.length === 0) return true;
  return !BRIDGE_AGENT_SCOPE.every((intent) => scope.includes(intent));
}
