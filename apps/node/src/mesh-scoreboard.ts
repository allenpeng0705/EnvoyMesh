/**
 * Mesh-federated verifier scoreboard (design §9.2, initial cut).
 *
 * Opt-in skill/rule sharing across peers running the same runtime: a peer
 * running `pi` can pull rule v7 from peer A, but the pulled rule is only
 * adopted after a **local validation gate** — the candidate must beat the
 * local node's own verdict-history pass rate (the deterministic stand-in for
 * the 5-step EVALUATE "re-run 50 tasks" step, which stays deferred).
 *
 * Trust model (concrete stand-in for the doc's "mesh-wide trust anchor,
 * out of scope" placeholder): every federated rule is Ed25519-signed by the
 * publishing owner, and the receiver verifies it against the signer's owner
 * public key from the contact key store — the same check `adapter.manifest`
 * inbound uses. Unknown signer ⇒ rejected; never adopted unverified.
 *
 * Only rules and aggregate pass rates are shared — never conversation
 * content, mandates, or runtime config (design §9.3).
 *
 * Design doc: `docs/improving-agent-network.en.md` §9.2.
 */

import { z } from "zod";
import {
  hashCanonicalPayload,
  signCanonicalPayload,
  verifyCanonicalPayload,
} from "@envoymesh/identity";
import { AgentRuntimeSchema, type AgentRuntime } from "@envoymesh/protocol";
import type { VerifierScoreboardEntry } from "./verifier-scoreboard.js";

/** A pulled rule needs at least this much cross-peer evidence to be considered. */
export const MIN_FEDERATED_EVIDENCE = 20;
/** The local node needs at least this many own verdicts before comparing. */
export const MIN_LOCAL_EVIDENCE = 10;

/**
 * A peer's claim that a verifier ruleset works, with aggregate stats.
 * The ruleset itself rides along in `ruleJson` so a peer can adopt it.
 */
export const FederatedRuleSchema = z.object({
  version: z.literal("0.1"),
  runtime: AgentRuntimeSchema,
  /** The ruleset version the publisher claims. */
  ruleVersion: z.number().int().positive(),
  /** Why this rule was proposed. */
  hypothesis: z.string().min(1),
  /** The verifier ruleset JSON a peer pulls on adoption. */
  ruleJson: z.string().min(1),
  /** Hash of the rule (sha256 over canonical JSON of the parsed rule). */
  rulesetHash: z.string().min(1),
  /** Aggregate passes across contributing peers. */
  federatedPasses: z.number().int().nonnegative(),
  /** Aggregate failures across contributing peers. */
  federatedFailures: z.number().int().nonnegative(),
  /** Publisher-reported improvement vs the previous version. */
  meanImprovement: z.number(),
  /** Which peers contributed the aggregate stats. */
  contributingPeers: z.array(z.string().min(1)),
  /** When the federation started tracking. */
  federatedAt: z.string().datetime(),
  /** The publishing owner (must be a known contact to verify). */
  signerOwnerId: z.string().min(1),
  /** Ed25519 of the publisher's owner over canonical JSON of the rest. */
  signature: z.string().min(1),
});
export type FederatedRule = z.infer<typeof FederatedRuleSchema>;

/** Strip the signature for signing / verification. */
export function forFederatedRuleSigning(rule: FederatedRule): Omit<FederatedRule, "signature"> {
  const { signature: _signature, ...unsigned } = rule;
  return unsigned;
}

export interface PublishScoreboardRuleInput {
  runtime: AgentRuntime;
  ruleVersion: number;
  hypothesis: string;
  ruleJson: string;
  federatedPasses: number;
  federatedFailures: number;
  meanImprovement: number;
  contributingPeers: string[];
  /** The publishing owner's signing key. */
  ownerPrivateKeyPem: string;
  signerOwnerId: string;
  federatedAt?: string;
  now?: () => Date;
}

/** Build an owner-signed federated rule ready to share with peers. */
export function publishScoreboardRule(input: PublishScoreboardRuleInput): FederatedRule {
  let rulesetHash: string;
  try {
    rulesetHash = hashCanonicalPayload(JSON.parse(input.ruleJson));
  } catch {
    throw new Error("federated rule must be valid JSON");
  }
  const unsigned: Omit<FederatedRule, "signature"> = {
    version: "0.1",
    runtime: input.runtime,
    ruleVersion: input.ruleVersion,
    hypothesis: input.hypothesis,
    ruleJson: input.ruleJson,
    rulesetHash,
    federatedPasses: input.federatedPasses,
    federatedFailures: input.federatedFailures,
    meanImprovement: input.meanImprovement,
    contributingPeers: input.contributingPeers,
    federatedAt: input.federatedAt ?? (input.now ?? (() => new Date()))().toISOString(),
    signerOwnerId: input.signerOwnerId,
  };
  return {
    ...unsigned,
    signature: signCanonicalPayload(unsigned, input.ownerPrivateKeyPem),
  };
}

export interface PullScoreboardRuleDeps {
  /** Resolve a signer's owner public key PEM (from the contact key store). */
  getOwnerPublicKey: (ownerId: string) => Promise<string | undefined>;
  /** Runtimes this node actually runs. Pulls for other runtimes are rejected. */
  listRuntimes: () => readonly AgentRuntime[] | AgentRuntime[];
  /**
   * Local verdict-history pass rate for the runtime (derived from the
   * ArbitrationStore). `null` when there is no local evidence at all.
   */
  getLocalPassRate: (runtime: AgentRuntime) => { n: number; passRate: number } | null;
  /**
   * Called on adoption with the unsigned `kept` scoreboard entry minus
   * `version`/`ownerSignature` — the caller computes the next per-runtime
   * version from its local `VerifierScoreboard`, signs it with the local
   * owner key, and appends it, so the adoption is append-only and audited.
   */
  onAdopt?: (
    draft: Omit<VerifierScoreboardEntry, "ownerSignature" | "version">,
  ) => void | Promise<void>;
}

export type PullScoreboardRuleResult =
  | { adopted: true; localPassRate: number; candidatePassRate: number }
  | { adopted: false; reason: string }
  | { pending: true; reason: string };

/**
 * Pull a federated rule and run the local validation gate.
 *
 * Order of checks (fail-closed):
 *  1. schema valid
 *  2. owner signature verifies against a **known** contact owner key
 *  3. the rule targets a runtime this node runs
 *  4. the rule's `rulesetHash` actually matches its `ruleJson`
 *  5. the federation has enough aggregate evidence
 *  6. the local node has enough of its own verdict history to compare
 *     (insufficient ⇒ `pending`, never adopted blind)
 *  7. the candidate strictly beats the local incumbent pass rate
 *     (design §9.1 EVALUATE — "strict greater pass rate; otherwise restore")
 */
export async function pullScoreboardRule(
  candidate: FederatedRule,
  deps: PullScoreboardRuleDeps,
): Promise<PullScoreboardRuleResult> {
  const parsed = FederatedRuleSchema.safeParse(candidate);
  if (!parsed.success) {
    return { adopted: false, reason: "invalid federated rule schema" };
  }
  const rule = parsed.data;

  const ownerPublicKeyPem = await deps.getOwnerPublicKey(rule.signerOwnerId);
  if (!ownerPublicKeyPem) {
    return {
      adopted: false,
      reason: `signer owner key unknown — cannot verify ${rule.signerOwnerId}`,
    };
  }
  if (!verifyCanonicalPayload(forFederatedRuleSigning(rule), rule.signature, ownerPublicKeyPem)) {
    return { adopted: false, reason: "federated rule signature verification failed" };
  }

  if (!deps.listRuntimes().includes(rule.runtime)) {
    return { adopted: false, reason: `this node does not run runtime=${rule.runtime}` };
  }

  // The signature covers both fields, so a malicious signer is already
  // bounded — but re-deriving the hash catches honest-bug / transport
  // corruption where the two fields drifted apart.
  try {
    if (hashCanonicalPayload(JSON.parse(rule.ruleJson)) !== rule.rulesetHash) {
      return { adopted: false, reason: "rulesetHash does not match ruleJson" };
    }
  } catch {
    return { adopted: false, reason: "rule JSON invalid" };
  }

  const totalEvidence = rule.federatedPasses + rule.federatedFailures;
  if (totalEvidence < MIN_FEDERATED_EVIDENCE) {
    return {
      adopted: false,
      reason: `insufficient federation evidence (${totalEvidence} < ${MIN_FEDERATED_EVIDENCE})`,
    };
  }
  const candidatePassRate = rule.federatedPasses / totalEvidence;

  const local = deps.getLocalPassRate(rule.runtime);
  if (!local || local.n < MIN_LOCAL_EVIDENCE) {
    return {
      pending: true,
      reason: `insufficient local evidence (${local?.n ?? 0} < ${MIN_LOCAL_EVIDENCE})`,
    };
  }

  if (candidatePassRate <= local.passRate) {
    return {
      adopted: false,
      reason: `candidate pass rate ${candidatePassRate.toFixed(3)} does not beat local incumbent ${local.passRate.toFixed(3)}`,
    };
  }

  if (deps.onAdopt) {
    await deps.onAdopt({
      runtime: rule.runtime,
      hypothesis: `adopted federated rule v${rule.ruleVersion} from ${rule.signerOwnerId}: ${rule.hypothesis}`,
      rulesetHash: rule.rulesetHash,
      meanScore: candidatePassRate,
      passRateBefore: local.passRate,
      passRateAfter: candidatePassRate,
      nRuns: totalEvidence,
      status: "kept",
      createdAt: new Date().toISOString(),
    });
  }

  return { adopted: true, localPassRate: local.passRate, candidatePassRate };
}
