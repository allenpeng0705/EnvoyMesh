/**
 * Role-policy lookup for envelope validation. Replaces the 90-line
 * if/else-if chain in the original `evaluateEnvelopeRolePolicy` with a
 * declarative table keyed by intent; new intents are data, not code.
 *
 * Policy shape: for each intent, the allowed (senderRole, recipientRole)
 * combinations. Anything not listed falls through to the default policy
 * (allow anything that does not match a more specific deny rule).
 */

import type { EnvoyActorRole, EnvoyIntent } from "./index.js";

type Role = EnvoyActorRole;

export interface RolePolicyDecision {
  ok: true;
}

export interface RolePolicyDenial {
  ok: false;
  reason: string;
}

export type RolePolicyResult = RolePolicyDecision | RolePolicyDenial;

/** Allow-list of (sender, recipient) pairs for a given intent. */
type RolePair = readonly [Role, Role];

const ALL_HUMAN_AGENT: readonly RolePair[] = [
  ["human", "human"],
  ["human", "agent"],
  ["agent", "human"],
  ["agent", "agent"],
];

const HUMAN_HUMAN_ONLY: readonly RolePair[] = [["human", "human"]];
const AGENT_AGENT_ONLY: readonly RolePair[] = [["agent", "agent"]];
const AGENT_TO_HUMAN: readonly RolePair[] = [["agent", "human"]];
const HUMAN_TO_AGENT_OR_HUMAN: readonly RolePair[] = [
  ["human", "agent"],
  ["human", "human"],
];

/**
 * Map of intent → allowed role pairs. Each entry is a list; the function
 * uses `.some(([s, r]) => s === sender && r === recipient)`.
 *
 * Intents not listed here fall through to the default policy (allow).
 */
const INTENT_ROLE_POLICIES: Record<string, readonly RolePair[]> = {
  "chat.message": ALL_HUMAN_AGENT,
  "chat.delivered": ALL_HUMAN_AGENT,
  "chat.room.sync": HUMAN_HUMAN_ONLY,
  "chat.room.message": HUMAN_HUMAN_ONLY,
  "social.intro.sync": AGENT_AGENT_ONLY,
  "social.intro.propose": AGENT_TO_HUMAN,
  "social.intro.owner-ready": HUMAN_TO_AGENT_OR_HUMAN,
  "task.create": AGENT_AGENT_ONLY,
  "task.propose": AGENT_AGENT_ONLY,
  "task.negotiate": AGENT_AGENT_ONLY,
  "task.accept": AGENT_AGENT_ONLY,
  "task.reject": AGENT_AGENT_ONLY,
  "task.result": AGENT_AGENT_ONLY,
  "task.cancel": AGENT_AGENT_ONLY,
  "task.heartbeat": AGENT_AGENT_ONLY,
  "report.create": AGENT_AGENT_ONLY,
  // Phase 38 — voice/video calls (human-to-human only)
  "call.invite": HUMAN_HUMAN_ONLY,
  "call.accept": HUMAN_HUMAN_ONLY,
  "call.reject": HUMAN_HUMAN_ONLY,
  "call.hangup": HUMAN_HUMAN_ONLY,
  "call.ice-candidate": HUMAN_HUMAN_ONLY,
  "call.mute": HUMAN_HUMAN_ONLY,
  // Phase 40 — Agent Network Collaboration Layer.
  // All chain intents are agent↔agent except `task.chain.report`, which is
  // agent → human (orchestrator publishing the final ChainReport to the owner).
  // Trust gating (worker→orchestrator bid requires `direct`, orchestrator→worker
  // propose/accept requires `referred`) is enforced separately in
  // chain-inbound.ts (40B.3) — not in this table.
  "task.chain.mandate": AGENT_AGENT_ONLY,
  "task.chain.propose": AGENT_AGENT_ONLY,
  "task.chain.bid": AGENT_AGENT_ONLY,
  "task.chain.accept": AGENT_AGENT_ONLY,
  "task.chain.partial": AGENT_AGENT_ONLY,
  "task.chain.merge": AGENT_AGENT_ONLY,
  "task.chain.cancel": AGENT_AGENT_ONLY,
  "task.chain.heartbeat": AGENT_AGENT_ONLY,
  "task.chain.report": AGENT_TO_HUMAN,
};

/**
 * Default role policy for any intent not in the table. Be permissive —
 * the original `evaluateEnvelopeRolePolicy` only denied role mismatches for
 * a small set of intents (chat.message, chat.room.*, chat.delivered,
 * social.intro.*, task.*, report.create). All other intents (including
 * system.*, profile.*, knowledge.*, etc.) accept any role combination.
 */
function defaultPolicy(
  intent: string,
  _senderRole: Role,
  _recipientRole: Role,
): RolePolicyResult {
  void intent;
  void _senderRole;
  void _recipientRole;
  return { ok: true };
}

export function evaluateEnvelopeRolePolicy(
  intent: EnvoyIntent,
  senderRole: EnvoyActorRole,
  recipientRole: EnvoyActorRole,
): RolePolicyResult {
  // chat.message and chat.delivered explicitly reject the system role.
  if (intent === "chat.message" || intent === "chat.delivered") {
    if (senderRole === "system" || recipientRole === "system") {
      return {
        ok: false,
        reason: `${intent} cannot involve system role`,
      };
    }
  }

  const pairs = INTENT_ROLE_POLICIES[intent];
  if (pairs) {
    if (pairs.some(([s, r]) => s === senderRole && r === recipientRole)) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `${intent} requires senderRole=agent (got ${senderRole})`,
    };
  }
  return defaultPolicy(intent, senderRole, recipientRole);
}
