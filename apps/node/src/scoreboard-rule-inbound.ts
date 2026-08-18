/**
 * Federated scoreboard wire seam (design §9.2, libp2p round-trip).
 *
 * Outbound: `scoreboardEntryToFederatedRule` turns the local scoreboard's
 * latest `kept` entry into an owner-signed `FederatedRule` that a peer can
 * pull over the mesh (`scoreboard.rule` intent). Inbound:
 * `handleInboundScoreboardRule` verifies the signer's owner key from the
 * contact store, runs the fail-closed local validation gate
 * (`pullScoreboardRule` — schema, signature, runtime, hash integrity,
 * evidence floors, strict pass-rate beat), and on adoption appends an
 * owner-signed `kept` row to the local scoreboard.
 *
 * Trust model mirrors `adapter.manifest` inbound: unknown signer ⇒ rejected,
 * never adopted unverified.
 *
 * Design doc: `docs/improving-agent-network.en.md` §9.2.
 */

import { signCanonicalPayload } from "@envoymesh/identity";
import type { AgentRuntime, EnvoyEnvelope } from "@envoymesh/protocol";
import {
  FederatedRuleSchema,
  publishScoreboardRule,
  pullScoreboardRule,
  type FederatedRule,
} from "./mesh-scoreboard.js";
import {
  nextScoreboardVersion,
  type VerifierScoreboard,
  type VerifierScoreboardEntry,
} from "./verifier-scoreboard.js";

/**
 * Convert the local scoreboard's latest `kept` entry into a broadcastable,
 * owner-signed `FederatedRule`.
 *
 * `ruleJson` carries a placeholder ruleset body (the entry's hash and
 * hypothesis). The real data-driven ruleset content replaces it once the
 * design §5.3 composable rule engine lands; the wire mechanism, signature,
 * and receiver gate are all in place.
 */
export function scoreboardEntryToFederatedRule(input: {
  entry: VerifierScoreboardEntry;
  /** The publishing node's agent peerId (contributes to the aggregate stats). */
  publisherPeerId: string;
  /** The publishing owner's signing key — signs the federated rule. */
  ownerPrivateKeyPem: string;
  signerOwnerId: string;
  now?: () => Date;
}): FederatedRule {
  if (input.entry.status !== "kept") {
    throw new Error(`cannot broadcast a ${input.entry.status} scoreboard entry`);
  }
  const passes = Math.round(input.entry.nRuns * input.entry.passRateAfter);
  return publishScoreboardRule({
    runtime: input.entry.runtime,
    ruleVersion: input.entry.version,
    hypothesis: input.entry.hypothesis,
    ruleJson: JSON.stringify({
      rulesetHash: input.entry.rulesetHash,
      hypothesis: input.entry.hypothesis,
    }),
    federatedPasses: passes,
    federatedFailures: Math.max(0, input.entry.nRuns - passes),
    meanImprovement: input.entry.passRateAfter - input.entry.passRateBefore,
    contributingPeers: [input.publisherPeerId],
    ownerPrivateKeyPem: input.ownerPrivateKeyPem,
    signerOwnerId: input.signerOwnerId,
    now: input.now,
  });
}

export interface HandleInboundScoreboardRuleInput {
  envelope: EnvoyEnvelope;
  /** Resolve a signer's owner public key PEM (from the contact key store). */
  getOwnerPublicKey: (ownerId: string) => Promise<string | undefined>;
  /** Runtimes this node actually runs. */
  listRuntimes: () => readonly AgentRuntime[] | AgentRuntime[];
  /** Local verdict-history pass rate (from the aggregated ArbitrationStores). */
  getLocalPassRate: (runtime: AgentRuntime) => { n: number; passRate: number } | null;
  /** Local scoreboard — adopted rules land here as owner-signed `kept` rows. */
  scoreboard: VerifierScoreboard;
  /** Local owner key — signs the adopted scoreboard entry. */
  ownerPrivateKeyPem: string;
}

export type HandleInboundScoreboardRuleResult =
  | {
      handled: true;
      outcome: "adopted";
      localPassRate: number;
      candidatePassRate: number;
    }
  | { handled: true; outcome: "pending" | "rejected"; reason: string }
  | { handled: false; reason: string };

/**
 * Handle an inbound `scoreboard.rule` envelope: verify the signer owner,
 * run the local validation gate, and on adoption append an owner-signed
 * `kept` row to the local scoreboard. Idempotent per ruleset — re-receiving
 * the same rule on the next broadcast cycle does not append another row.
 */
export async function handleInboundScoreboardRule(
  input: HandleInboundScoreboardRuleInput,
): Promise<HandleInboundScoreboardRuleResult> {
  if (input.envelope.intent !== "scoreboard.rule") {
    return { handled: false, reason: `unexpected intent ${input.envelope.intent}` };
  }
  let rule: FederatedRule;
  try {
    rule = FederatedRuleSchema.parse(input.envelope.payload);
  } catch {
    return { handled: false, reason: "invalid scoreboard.rule payload schema" };
  }

  const result = await pullScoreboardRule(rule, {
    getOwnerPublicKey: input.getOwnerPublicKey,
    listRuntimes: input.listRuntimes,
    getLocalPassRate: input.getLocalPassRate,
    onAdopt: async (draft) => {
      const latest = await input.scoreboard.latest(draft.runtime);
      if (latest && latest.status === "kept" && latest.rulesetHash === draft.rulesetHash) {
        // Already adopted this ruleset — the periodic broadcast re-sends it.
        return;
      }
      const version = nextScoreboardVersion(latest);
      const unsigned: Omit<VerifierScoreboardEntry, "ownerSignature"> = { ...draft, version };
      await input.scoreboard.append({
        ...unsigned,
        ownerSignature: signCanonicalPayload(unsigned, input.ownerPrivateKeyPem),
      });
    },
  });

  if ("adopted" in result) {
    if (result.adopted) {
      return {
        handled: true,
        outcome: "adopted",
        localPassRate: result.localPassRate,
        candidatePassRate: result.candidatePassRate,
      };
    }
    return { handled: true, outcome: "rejected", reason: result.reason };
  }
  return { handled: true, outcome: "pending", reason: result.reason };
}
