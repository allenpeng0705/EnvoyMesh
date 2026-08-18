/**
 * Mesh-federated scoreboard tests (design §9.2, initial cut).
 *
 * Covers the local validation gate: owner-signature verification against a
 * known contact owner key, ruleset-hash integrity, federation-evidence floor,
 * local-evidence gate (`pending`, never adopted blind), and strict pass-rate
 * comparison before a pulled rule joins the local scoreboard.
 */
import { describe, expect, it } from "vitest";
import { generateOwnerIdentity, signCanonicalPayload } from "@envoymesh/identity";
import type { AgentRuntime } from "@envoymesh/protocol";
import type { FederatedRule } from "../src/mesh-scoreboard.js";
import {
  MIN_FEDERATED_EVIDENCE,
  MIN_LOCAL_EVIDENCE,
  publishScoreboardRule,
  pullScoreboardRule,
  type PullScoreboardRuleDeps,
} from "../src/mesh-scoreboard.js";
import { forFederatedRuleSigning } from "../src/mesh-scoreboard.js";
import type { VerifierScoreboardEntry } from "../src/verifier-scoreboard.js";

const PUBLISHER = generateOwnerIdentity();

const RULE_JSON = JSON.stringify({ maxSummaryLength: 120, requireCitations: true });

function publishedRule(overrides: Partial<FederatedRule> = {}): FederatedRule {
  return {
    ...publishScoreboardRule({
      runtime: "pi",
      ruleVersion: 7,
      hypothesis: "require citations to cut hallucination failures",
      ruleJson: RULE_JSON,
      federatedPasses: 40,
      federatedFailures: 10,
      meanImprovement: 0.05,
      contributingPeers: ["envoy_peer_a", "envoy_peer_b"],
      ownerPrivateKeyPem: PUBLISHER.privateKeyPem,
      signerOwnerId: PUBLISHER.ownerId,
      federatedAt: "2026-08-18T00:00:00.000Z",
    }),
    ...overrides,
  };
}

/** A validly-signed rule whose `rulesetHash` does not match its `ruleJson`
 *  (models a buggy-but-honest publisher, not a forger). */
function publishedRuleMismatchedHash(): FederatedRule {
  const base = publishedRule();
  const mismatched = { ...forFederatedRuleSigning(base), rulesetHash: "deadbeef" };
  return {
    ...mismatched,
    signature: signCanonicalPayload(mismatched, PUBLISHER.privateKeyPem),
  };
}

function makeDeps(
  overrides: Partial<PullScoreboardRuleDeps> = {},
): PullScoreboardRuleDeps & {
  adopted: Array<Omit<VerifierScoreboardEntry, "ownerSignature" | "version">>;
} {
  const adopted: Array<Omit<VerifierScoreboardEntry, "ownerSignature" | "version">> = [];
  return {
    getOwnerPublicKey: async () => PUBLISHER.publicKeyPem,
    listRuntimes: () => ["openclaw", "pi"] as AgentRuntime[],
    getLocalPassRate: () => ({ n: 25, passRate: 0.72 }),
    onAdopt: (draft) => {
      adopted.push(draft);
    },
    ...overrides,
    adopted,
  };
}

describe("publishScoreboardRule", () => {
  it("signs a federated rule and hashes the ruleset deterministically", () => {
    const a = publishedRule();
    const b = publishedRule();

    expect(a.signature.length).toBeGreaterThan(0);
    expect(a.signature).toBe(b.signature);
    expect(a.rulesetHash).toBe(b.rulesetHash);
    expect(a.rulesetHash).toHaveLength(43); // sha256 base64url
  });

  it("rejects invalid rule JSON", () => {
    expect(() =>
      publishScoreboardRule({
        runtime: "pi",
        ruleVersion: 1,
        hypothesis: "h",
        ruleJson: "{not json",
        federatedPasses: 0,
        federatedFailures: 0,
        meanImprovement: 0,
        contributingPeers: [],
        ownerPrivateKeyPem: PUBLISHER.privateKeyPem,
        signerOwnerId: PUBLISHER.ownerId,
      }),
    ).toThrow("valid JSON");
  });
});

describe("pullScoreboardRule local validation gate", () => {
  it("adopts a rule that beats the local incumbent pass rate", async () => {
    const deps = makeDeps();
    // Candidate pass rate 0.8 vs local 0.72 → strictly better.
    const result = await pullScoreboardRule(publishedRule(), deps);

    expect(result).toEqual({ adopted: true, localPassRate: 0.72, candidatePassRate: 0.8 });
    expect(deps.adopted).toHaveLength(1);
    expect(deps.adopted[0]).toMatchObject({
      runtime: "pi",
      status: "kept",
      rulesetHash: publishedRule().rulesetHash,
      passRateBefore: 0.72,
      passRateAfter: 0.8,
      nRuns: 50,
    });
  });

  it("rejects when the signer owner key is unknown", async () => {
    const deps = makeDeps({
      getOwnerPublicKey: async () => undefined,
    });
    const result = await pullScoreboardRule(publishedRule(), deps);

    expect(result).toEqual({ adopted: false, reason: expect.stringContaining("owner key unknown") });
    expect(deps.adopted).toHaveLength(0);
  });

  it("rejects a tampered signature", async () => {
    const rule = publishedRule({ signature: "tampered" });
    const result = await pullScoreboardRule(rule, makeDeps());

    expect(result).toEqual({ adopted: false, reason: "federated rule signature verification failed" });
  });

  it("rejects a signed rule whose rulesetHash does not match its ruleJson", async () => {
    const deps = makeDeps();
    const result = await pullScoreboardRule(publishedRuleMismatchedHash(), deps);

    expect(result).toEqual({ adopted: false, reason: "rulesetHash does not match ruleJson" });
    expect(deps.adopted).toHaveLength(0);
  });

  it("rejects rules for a runtime this node does not run", async () => {
    const deps = makeDeps({ listRuntimes: () => ["openclaw"] as AgentRuntime[] });
    const result = await pullScoreboardRule(publishedRule(), deps);

    expect(result).toEqual({ adopted: false, reason: "this node does not run runtime=pi" });
  });

  it("rejects when the federation evidence is below the floor", async () => {
    const rule = publishScoreboardRule({
      runtime: "pi",
      ruleVersion: 7,
      hypothesis: "require citations",
      ruleJson: RULE_JSON,
      federatedPasses: 10,
      federatedFailures: 5, // 15 < 20 — signed as published
      meanImprovement: 0.05,
      contributingPeers: ["envoy_peer_a"],
      ownerPrivateKeyPem: PUBLISHER.privateKeyPem,
      signerOwnerId: PUBLISHER.ownerId,
      federatedAt: "2026-08-18T00:00:00.000Z",
    });
    const result = await pullScoreboardRule(rule, makeDeps());

    expect(result).toEqual({
      adopted: false,
      reason: expect.stringContaining(`insufficient federation evidence (15 < ${MIN_FEDERATED_EVIDENCE})`),
    });
  });

  it("holds pending when local evidence is insufficient — never adopted blind", async () => {
    const deps = makeDeps({ getLocalPassRate: () => ({ n: 3, passRate: 0.5 }) });
    const result = await pullScoreboardRule(publishedRule(), deps);

    expect(result).toEqual({
      pending: true,
      reason: expect.stringContaining(`insufficient local evidence (3 < ${MIN_LOCAL_EVIDENCE})`),
    });
    expect(deps.adopted).toHaveLength(0);
  });

  it("rejects when the candidate does not beat the local incumbent", async () => {
    const deps = makeDeps({ getLocalPassRate: () => ({ n: 25, passRate: 0.9 }) });
    const result = await pullScoreboardRule(publishedRule(), deps); // 0.8 ≤ 0.9

    expect(result).toEqual({
      adopted: false,
      reason: expect.stringContaining("does not beat local incumbent"),
    });
    expect(deps.adopted).toHaveLength(0);
  });

  it("rejects malformed federated rules", async () => {
    const result = await pullScoreboardRule({ not: "a rule" } as unknown as FederatedRule, makeDeps());
    expect(result).toEqual({ adopted: false, reason: "invalid federated rule schema" });
  });
});
