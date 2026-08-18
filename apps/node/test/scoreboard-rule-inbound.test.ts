/**
 * Federated scoreboard wire seam tests (design §9.2, libp2p round-trip).
 *
 * Publisher A converts its local `kept` scoreboard entry into an owner-signed
 * `FederatedRule`, broadcasts it as a `scoreboard.rule` envelope, and peer B
 * receives it through `handleInboundScoreboardRule` — verifying the signer
 * owner, running the fail-closed local gate, and adopting it into B's own
 * scoreboard (idempotently on re-broadcast).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateKeyPairSync } from "node:crypto";
import {
  derivePeerId,
  generateOwnerIdentity,
  signCanonicalPayload,
} from "@envoymesh/identity";
import type { AgentRuntime, EnvoyEnvelope } from "@envoymesh/protocol";
import { buildScoreboardRuleEnvelope } from "../src/scoreboard-rule-broadcast.js";
import {
  handleInboundScoreboardRule,
  scoreboardEntryToFederatedRule,
} from "../src/scoreboard-rule-inbound.js";
import {
  nextScoreboardVersion,
  VerifierScoreboard,
  type VerifierScoreboardEntry,
} from "../src/verifier-scoreboard.js";

const PUBLISHER = generateOwnerIdentity();
const RECEIVER = generateOwnerIdentity();
const agentKeyPair = generateKeyPairSync("ed25519");

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "envoy-scoreboard-rule-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function agentKeys() {
  return {
    agentPublicKeyPem: agentKeyPair.publicKey.export({ format: "pem", type: "spki" }).toString(),
    agentPrivateKeyPem: agentKeyPair.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString(),
  };
}

function keptEntry(overrides: Partial<VerifierScoreboardEntry> = {}): VerifierScoreboardEntry {
  const unsigned: Omit<VerifierScoreboardEntry, "ownerSignature"> = {
    version: 7,
    runtime: "pi",
    hypothesis: "require citations to cut hallucination failures",
    rulesetHash: "ruleset_abc",
    meanScore: 0.85,
    passRateBefore: 0.6,
    passRateAfter: 0.85,
    nRuns: 50,
    status: "kept",
    createdAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
  return {
    ...unsigned,
    ownerSignature: signCanonicalPayload(unsigned, PUBLISHER.privateKeyPem),
  };
}

/** Publisher A: kept entry → signed FederatedRule → agent-signed envelope. */
function publishedEnvelope(): EnvoyEnvelope {
  const rule = scoreboardEntryToFederatedRule({
    entry: keptEntry(),
    publisherPeerId: "envoy_agent_a",
    ownerPrivateKeyPem: PUBLISHER.privateKeyPem,
    signerOwnerId: PUBLISHER.ownerId,
    now: () => new Date("2026-08-18T00:00:00.000Z"),
  });
  return buildScoreboardRuleEnvelope({ ...agentKeys(), rule });
}

/** Peer B: fresh scoreboard (signed by B's own owner key) + gate deps. */
async function makeReceiver() {
  const scoreboard = new VerifierScoreboard({
    filePath: join(dir, "receiver-scoreboard.jsonl"),
    ownerPublicKeyPem: RECEIVER.publicKeyPem,
  });
  return {
    scoreboard,
    deps: {
      getOwnerPublicKey: async (ownerId: string) =>
        ownerId === PUBLISHER.ownerId ? PUBLISHER.publicKeyPem : undefined,
      listRuntimes: () => ["openclaw", "pi"] as AgentRuntime[],
      getLocalPassRate: () => ({ n: 25, passRate: 0.6 }),
      scoreboard,
      ownerPrivateKeyPem: RECEIVER.privateKeyPem,
    } as const,
  };
}

describe("scoreboardEntryToFederatedRule", () => {
  it("turns a kept entry into an owner-signed, hash-consistent FederatedRule", () => {
    const rule = scoreboardEntryToFederatedRule({
      entry: keptEntry(),
      publisherPeerId: "envoy_agent_a",
      ownerPrivateKeyPem: PUBLISHER.privateKeyPem,
      signerOwnerId: PUBLISHER.ownerId,
    });

    expect(rule.runtime).toBe("pi");
    expect(rule.ruleVersion).toBe(7);
    expect(rule.signerOwnerId).toBe(PUBLISHER.ownerId);
    expect(rule.federatedPasses + rule.federatedFailures).toBe(50);
    // nRuns 50 @ passRateAfter 0.85 → 42.5 → round 43 passes, 7 failures.
    expect(rule.federatedPasses).toBe(43);
    expect(rule.contributingPeers).toEqual(["envoy_agent_a"]);
  });

  it("rejects non-kept entries (a reverted experiment is not broadcast)", () => {
    expect(() =>
      scoreboardEntryToFederatedRule({
        entry: keptEntry({ status: "reverted" }),
        publisherPeerId: "envoy_agent_a",
        ownerPrivateKeyPem: PUBLISHER.privateKeyPem,
        signerOwnerId: PUBLISHER.ownerId,
      }),
    ).toThrow("cannot broadcast a reverted scoreboard entry");
  });
});

describe("handleInboundScoreboardRule (wire round-trip)", () => {
  it("adopts the publisher's rule into the receiver's scoreboard", async () => {
    const receiver = await makeReceiver();
    const envelope = publishedEnvelope();

    const result = await handleInboundScoreboardRule({ envelope, ...receiver.deps });

    expect(result.handled).toBe(true);
    expect(result.outcome).toBe("adopted");
    if (result.outcome === "adopted") {
      expect(result.candidatePassRate).toBeGreaterThan(result.localPassRate);
    }
    const rows = await receiver.scoreboard.readAll();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runtime: "pi", status: "kept", version: 1 });
  });

  it("is idempotent — a re-broadcast of the same rule does not append twice", async () => {
    const receiver = await makeReceiver();
    const envelope = publishedEnvelope();

    await handleInboundScoreboardRule({ envelope, ...receiver.deps });
    await handleInboundScoreboardRule({ envelope, ...receiver.deps });

    expect(await receiver.scoreboard.readAll()).toHaveLength(1);
  });

  it("rejects an unknown signer owner", async () => {
    const receiver = await makeReceiver();
    const result = await handleInboundScoreboardRule({
      ...receiver.deps,
      envelope: publishedEnvelope(),
      getOwnerPublicKey: async () => undefined,
    });

    expect(result).toEqual({
      handled: true,
      outcome: "rejected",
      reason: expect.stringContaining("owner key unknown"),
    });
    expect(await receiver.scoreboard.readAll()).toHaveLength(0);
  });

  it("holds pending when the receiver lacks local verdict history", async () => {
    const receiver = await makeReceiver();
    const result = await handleInboundScoreboardRule({
      ...receiver.deps,
      envelope: publishedEnvelope(),
      getLocalPassRate: () => null,
    });

    expect(result.handled).toBe(true);
    expect(result.outcome).toBe("pending");
    expect(await receiver.scoreboard.readAll()).toHaveLength(0);
  });

  it("rejects a payload that is not a valid FederatedRule", async () => {
    const receiver = await makeReceiver();
    const envelope = buildScoreboardRuleEnvelope({
      ...agentKeys(),
      rule: { not: "a rule" },
    });

    const result = await handleInboundScoreboardRule({ envelope, ...receiver.deps });

    expect(result).toEqual({ handled: false, reason: expect.stringContaining("schema") });
  });

  it("does not handle envelopes with a different intent", async () => {
    const receiver = await makeReceiver();
    const envelope = buildScoreboardRuleEnvelope({ ...agentKeys(), rule: keptEntry() });
    const wrongIntent = { ...envelope, intent: "adapter.manifest" } as EnvoyEnvelope;

    const result = await handleInboundScoreboardRule({ envelope: wrongIntent, ...receiver.deps });

    expect(result).toEqual({ handled: false, reason: "unexpected intent adapter.manifest" });
  });

  it("the adopted row verifies against the receiving owner's key and advances the version", async () => {
    const receiver = await makeReceiver();
    await handleInboundScoreboardRule({ envelope: publishedEnvelope(), ...receiver.deps });

    const latest = await receiver.scoreboard.latest("pi");
    expect(latest).not.toBeNull();
    expect(nextScoreboardVersion(latest)).toBe(2);
  });
});

describe("envelope identity", () => {
  it("builds an agent-to-agent scoreboard.rule envelope signed by the sender agent key", () => {
    const envelope = publishedEnvelope();

    expect(envelope.intent).toBe("scoreboard.rule");
    expect(envelope.senderRole).toBe("agent");
    expect(envelope.recipientRole).toBe("agent");
    expect(envelope.senderPeerId).toBe(derivePeerId(agentKeys().agentPublicKeyPem));
    expect(envelope.signature.length).toBeGreaterThan(0);
  });
});
