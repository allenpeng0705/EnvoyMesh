/**
 * 3-tuple reputation tests (Phase 41 / MAP — Sprint 2).
 *
 * Covers:
 * - `scoreFromVerdicts`: empty / all-pass / all-fail / partial / disputed,
 *   defensive bias (fails weigh double), recency weighting.
 * - `ReputationBook3Tuple`: rolling window, per-(peer, runtime, skill)
 *   independence, snapshotFor.
 * - `deriveReputationBySkillForPeer`: cross-runtime projection for the
 *   Assigner roster.
 * - `recordVerdictEntry` / `getVerdictsFor`: verdict ledger append-only +
 *   idempotent semantics inside the widened ArbitrationStore.
 */
import { describe, expect, it } from "vitest";
import {
  createArbitrationStore,
  getVerdictsFor,
  isVerdictEntry,
  recordVerdictEntry,
} from "../src/chain-arbitration.js";
import {
  DEFAULT_REPUTATION_WINDOW,
  ReputationBook3Tuple,
  deriveReputationBySkillForPeer,
  scoreFromVerdicts,
  verdictContribution,
  verdictWeight,
} from "../src/chain-reputation-3tuple.js";
import type { VerdictEntry } from "@envoymesh/protocol";

let seq = 0;

function verdict(overrides: Partial<VerdictEntry> = {}): VerdictEntry {
  seq += 1;
  return {
    chainId: "chain_rep",
    subtaskId: `subtask_${seq}`,
    workerPeerId: "envoy_agent_alice",
    workerRuntime: "openclaw",
    skillId: "translate",
    verdict: { kind: "pass", score: 1, confidence: "high" },
    source: "rule",
    issuedBy: "envoy_agent_orch",
    issuedAt: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
    signature: `sig_${seq}`,
    ...overrides,
  };
}

const pass = (score = 1) => ({ kind: "pass" as const, score, confidence: "high" as const });
const partial = (score = 0.8) => ({ kind: "partial" as const, score });
const fail = () => ({ kind: "fail" as const, reason: "bad output", rollback: true });
const disputed = () => ({ kind: "disputed" as const, needsHuman: true as const, signals: ["ambiguous"] });

describe("scoreFromVerdicts", () => {
  it("empty → 0", () => {
    expect(scoreFromVerdicts([])).toBe(0);
  });

  it("all pass score 1 → 1; all fail → 0", () => {
    expect(scoreFromVerdicts([verdict({ verdict: pass() }), verdict({ verdict: pass() })])).toBe(1);
    expect(scoreFromVerdicts([verdict({ verdict: fail() }), verdict({ verdict: fail() })])).toBe(0);
  });

  it("partial contributes 0.5·score; disputed 0.5", () => {
    expect(scoreFromVerdicts([verdict({ verdict: partial(0.8) })])).toBeCloseTo(0.4, 5);
    expect(scoreFromVerdicts([verdict({ verdict: disputed() })])).toBeCloseTo(0.5, 5);
  });

  it("defensive bias: fails count double and contribute nothing", () => {
    expect(verdictContribution(fail())).toBe(0);
    expect(verdictWeight(fail())).toBe(2);
    expect(verdictWeight(pass())).toBe(1);
    // One pass + one fail (pass newest): double-weighting lowers the score
    // below the naive 0.5 midpoint.
    const score = scoreFromVerdicts([verdict({ verdict: fail() }), verdict({ verdict: pass() })]);
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(0.8);
  });

  it("recency: a recent pass outranks an equal-pass/fail window where the fail is recent", () => {
    const recentPass = scoreFromVerdicts([
      verdict({ verdict: fail() }),
      verdict({ verdict: fail() }),
      verdict({ verdict: pass() }),
    ]);
    const recentFail = scoreFromVerdicts([
      verdict({ verdict: pass() }),
      verdict({ verdict: fail() }),
      verdict({ verdict: fail() }),
    ]);
    expect(recentPass).toBeGreaterThan(recentFail);
  });

  it("respects a custom window size", () => {
    const entries = Array.from({ length: 60 }, () => verdict({ verdict: pass() }));
    expect(scoreFromVerdicts(entries, { windowSize: 50 })).toBe(1);
    expect(scoreFromVerdicts(entries, { windowSize: 10 })).toBe(1);
  });
});

describe("ReputationBook3Tuple", () => {
  it("tracks (peer, runtime, skill) slots independently", () => {
    const book = new ReputationBook3Tuple(50);
    // 50 verdicts for (alice, openclaw, translate): 90% pass rate.
    // Fails go first (oldest) so the recent window is dominated by passes.
    for (let i = 0; i < 5; i++) book.recordVerdict(verdict({ verdict: fail() }));
    for (let i = 0; i < 45; i++) book.recordVerdict(verdict({ verdict: pass() }));
    // 50 for (alice, hermes, translate): 40% pass rate.
    for (let i = 0; i < 30; i++) {
      book.recordVerdict(
        verdict({ workerRuntime: "hermes", verdict: fail() }),
      );
    }
    for (let i = 0; i < 20; i++) {
      book.recordVerdict(
        verdict({ workerRuntime: "hermes", verdict: pass() }),
      );
    }

    const openclaw = book.getScore("envoy_agent_alice", "openclaw", "translate");
    const hermes = book.getScore("envoy_agent_alice", "hermes", "translate");
    expect(openclaw).toBeGreaterThan(0.8);
    expect(hermes).toBeLessThan(0.6);
    expect(openclaw).toBeGreaterThan(hermes);
    // A third slot (different skill) is untouched.
    expect(book.getScore("envoy_agent_alice", "openclaw", "research")).toBe(0);
    expect(book.getVerdictCount("envoy_agent_alice", "openclaw", "translate")).toBe(50);
  });

  it("caps the rolling window per slot", () => {
    const book = new ReputationBook3Tuple(DEFAULT_REPUTATION_WINDOW);
    for (let i = 0; i < 120; i++) book.recordVerdict(verdict({ verdict: pass() }));
    expect(book.getVerdictCount("envoy_agent_alice", "openclaw", "translate")).toBe(
      DEFAULT_REPUTATION_WINDOW,
    );
  });

  it("snapshotFor returns only that runtime's skills", () => {
    const book = new ReputationBook3Tuple();
    book.recordVerdict(verdict({ verdict: pass() }));
    book.recordVerdict(verdict({ skillId: "research", verdict: fail() }));
    book.recordVerdict(verdict({ workerRuntime: "hermes", skillId: "translate", verdict: pass() }));

    const snap = book.snapshotFor("envoy_agent_alice", "openclaw");
    expect(Object.keys(snap).sort()).toEqual(["research", "translate"]);
    expect(snap.translate).toBe(1);
    expect(snap.research).toBe(0);
  });
});

describe("deriveReputationBySkillForPeer", () => {
  it("aggregates verdicts across runtimes per skill", () => {
    const entries = [
      verdict({ workerRuntime: "openclaw", skillId: "translate", verdict: pass() }),
      verdict({ workerRuntime: "hermes", skillId: "translate", verdict: pass() }),
      verdict({ workerRuntime: "openclaw", skillId: "research", verdict: fail() }),
    ];
    const rep = deriveReputationBySkillForPeer(entries, "envoy_agent_alice");
    expect(rep).toBeDefined();
    expect(rep!.translate).toBe(1);
    expect(rep!.research).toBe(0);
    expect(Object.keys(rep!).sort()).toEqual(["research", "translate"]);
  });

  it("returns undefined when the peer has no verdicts", () => {
    expect(deriveReputationBySkillForPeer([verdict()], "envoy_agent_bob")).toBeUndefined();
  });
});

describe("verdict ledger in ArbitrationStore", () => {
  it("recordVerdictEntry appends under a (subtask, runtime) slot and is idempotent", () => {
    const store = createArbitrationStore();
    const v1 = verdict({ subtaskId: "subtask_x", verdict: pass() });
    const next = recordVerdictEntry(store, v1);
    expect(next.size).toBe(1);
    // Re-applying the same signed entry is a no-op (same store object).
    expect(recordVerdictEntry(next, v1)).toBe(next);
    // A re-verification (new signature) for the same slot replaces.
    const v2 = verdict({ subtaskId: "subtask_x", verdict: fail() });
    const next2 = recordVerdictEntry(next, v2);
    expect(next2.size).toBe(1);
    expect(isVerdictEntry(next2.get("subtask_x::openclaw"))).toBe(true);
  });

  it("getVerdictsFor filters by peer/skill and sorts by issuedAt", () => {
    const store = createArbitrationStore();
    const late = verdict({ workerPeerId: "envoy_agent_bob", skillId: "research", issuedAt: "2026-06-02T00:00:00.000Z" });
    const early = verdict({ skillId: "research", issuedAt: "2026-06-01T00:00:00.000Z" });
    const other = verdict({ skillId: "translate" });
    const s2 = recordVerdictEntry(recordVerdictEntry(recordVerdictEntry(store, early), late), other);

    const aliceResearch = getVerdictsFor(s2, { workerPeerId: "envoy_agent_alice", skillId: "research" });
    expect(aliceResearch.map((e) => e.subtaskId)).toEqual([early.subtaskId]);
    const all = getVerdictsFor(s2);
    expect(all).toHaveLength(3);
  });

  it("arbitration entries are skipped by getVerdictsFor", () => {
    const store = createArbitrationStore();
    const verdictEntry = verdict();
    const withVerdict = recordVerdictEntry(store, verdictEntry);
    // Phase 40E entry under a plain subtask key (won't collide with verdict slot keys).
    const arbitrationEntry = {
      version: "0.1" as const,
      arbitrationId: "arb_1",
      chainId: "chain_rep",
      subtaskIds: ["subtask_arb"],
      currentOwnerPeerId: "envoy_agent_alice",
      seq: 3,
      createdAt: "2026-06-01T00:00:00.000Z",
      issuedBy: "envoy_agent_orch",
    };
    withVerdict.set("subtask_arb", arbitrationEntry);
    expect(getVerdictsFor(withVerdict)).toHaveLength(1);
    expect(getVerdictsFor(withVerdict)[0]!.signature).toBe(verdictEntry.signature);
  });
});
