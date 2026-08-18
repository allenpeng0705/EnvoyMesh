/**
 * Phase 40 — ChainBudgetLedger tests.
 *
 * Covers the core invariants of the orchestrator-side budget ledger:
 * - Reserve happy path (within budget)
 * - Reserve fails when the reservation would exceed maxChainCostUsd
 * - Reserve fails when the same subtaskId is reserved twice
 * - Reserve fails after finalize
 * - tryCommit moves reservation → committed spend (atomic)
 * - tryCommit is idempotent
 * - tryCommit without a prior reservation fails
 * - release returns the un-committed portion to free budget
 * - release on a missing subtask is a no-op (idempotent)
 * - synthesisBudgetPreFlight reports headroom with and without an estimate
 * - recordSynthesisSpend fails when it would push past the budget
 * - recordSynthesisSpend is idempotent
 * - finalize locks the ledger and verifies report numbers match
 * - finalize mismatch (workerAllocations sum or synthesisCostUsd) is rejected
 * - finalize is one-shot
 * - Concurrent reserve calls on the same chain serialize (no over-commit)
 */

import { describe, expect, it } from "vitest";

import {
  createChainBudgetLedger,
  type ChainBudgetLedger,
} from "../src/chain-budget-ledger.js";
import type { ChainMandate } from "@envoymesh/protocol";

const NOW = "2026-06-18T00:00:00.000Z";

function mandate(overrides: Partial<ChainMandate> = {}): ChainMandate {
  return {
    version: "0.1",
    chainMandateId: "chainmandate_test-1",
    chainId: "chain_test-1",
    issuerOwnerId: "envoy:owner:abc",
    orchestratorOwnerId: "envoy:owner:abc",
    maxChainCostUsd: 10,
    costCeilingUsd: 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public",
    deadlineAt: "2026-06-18T01:00:00.000Z",
    createdAt: NOW,
    signature: "test-signature",
    ...overrides,
  };
}

describe("createChainBudgetLedger", () => {
  it("starts with zero spend and matches the mandate's budget ceiling", () => {
    const m = mandate({ maxChainCostUsd: 7.5 });
    const ledger: ChainBudgetLedger = createChainBudgetLedger(m);
    const snap = ledger.snapshot();
    expect(snap.chainId).toBe(m.chainId);
    expect(snap.maxChainCostUsd).toBe(7.5);
    expect(snap.reservedUsd).toBe(0);
    expect(snap.committedUsd).toBe(0);
    expect(snap.synthesisSpendUsd).toBe(0);
    expect(snap.workerAllocations.size).toBe(0);
    expect(ledger.isFinalized()).toBe(false);
  });

  it("reserve succeeds when within budget", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const r = await ledger.reserve("subtask_a", "p1", 2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("subtask_a");
    const snap = ledger.snapshot();
    expect(snap.reservedUsd).toBe(2);
    expect(snap.workerAllocations.get("subtask_a")?.reservedUsd).toBe(2);
  });

  it("reserve fails when it would push aggregate spend past maxChainCostUsd", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 5 }));
    await ledger.reserve("s1", "p1", 3);
    // Second reservation would push 3 + 3 = 6 > 5.
    const r = await ledger.reserve("s2", "p2", 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/maxChainCostUsd/);
  });

  it("reserve fails on duplicate subtaskId", async () => {
    const ledger = createChainBudgetLedger(mandate());
    expect((await ledger.reserve("s1", "p1", 1)).ok).toBe(true);
    const dup = await ledger.reserve("s1", "p2", 1);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.reason).toMatch(/already has a reservation/);
  });

  it("reserve fails after finalize", async () => {
    const ledger = createChainBudgetLedger(mandate());
    await ledger.reserve("s1", "p1", 1);
    await ledger.tryCommit("s1"); // promote to committed so finalize's report matches
    const final = await ledger.finalize({
      version: "0.1",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      orchestratorOwnerId: "envoy:owner:abc",
      orchestratorPeerId: "p",
      pinned: false,
      chainSummary: {
        durationMs: 0,
        subtaskCount: 1,
        workerCount: 1,
        workerAllocations: [{ subtaskId: "s1", workerPeerId: "p1", committedUsd: 1 }],
        synthesisCostUsd: 0,
      },
      executiveSummary: "x",
      sections: [],
      recipientRoles: ["human"],
      createdAt: NOW,
    });
    expect(final.ok).toBe(true);
    const after = await ledger.reserve("s2", "p2", 1);
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.reason).toMatch(/finalized/);
  });

  it("tryCommit promotes a reservation to committed spend", async () => {
    const ledger = createChainBudgetLedger(mandate());
    await ledger.reserve("s1", "p1", 2);
    const c = await ledger.tryCommit("s1");
    expect(c.ok).toBe(true);
    const snap = ledger.snapshot();
    expect(snap.reservedUsd).toBe(0);
    expect(snap.committedUsd).toBe(2);
    expect(snap.totalAcceptedUsd).toBe(2);
  });

  it("tryCommit is idempotent", async () => {
    const ledger = createChainBudgetLedger(mandate());
    await ledger.reserve("s1", "p1", 2);
    const first = await ledger.tryCommit("s1");
    const second = await ledger.tryCommit("s1");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(ledger.snapshot().committedUsd).toBe(2); // not double-counted
  });

  it("tryCommit fails when there is no prior reservation", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const c = await ledger.tryCommit("missing");
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toMatch(/no reservation/);
  });

  it("release returns the un-committed portion to free budget", async () => {
    const ledger = createChainBudgetLedger(mandate());
    await ledger.reserve("s1", "p1", 2);
    const rel = await ledger.release("s1", "worker offline");
    expect(rel.ok).toBe(true);
    expect(ledger.snapshot().reservedUsd).toBe(0);
    expect(ledger.snapshot().workerAllocations.size).toBe(0);
  });

  it("release on a missing subtask is a no-op", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const rel = await ledger.release("missing", "noop");
    expect(rel.ok).toBe(true);
  });

  it("release after tryCommit preserves the committed amount", async () => {
    const ledger = createChainBudgetLedger(mandate());
    await ledger.reserve("s1", "p1", 2);
    await ledger.tryCommit("s1");
    await ledger.release("s1", "worker crashed mid-work");
    const snap = ledger.snapshot();
    expect(snap.reservedUsd).toBe(0);
    expect(snap.committedUsd).toBe(2); // already committed; release cannot undo
  });

  it("synthesisBudgetPreFlight reports headroom with no estimate", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 10 }));
    await ledger.reserve("s1", "p1", 3);
    const r = await ledger.synthesisBudgetPreFlight();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.headroomUsd).toBe(7); // 10 - 0 - 3
  });

  it("synthesisBudgetPreFlight fails when the estimate would exceed headroom", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 5 }));
    await ledger.reserve("s1", "p1", 3);
    const r = await ledger.synthesisBudgetPreFlight(3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/exceeding remaining budget/);
  });

  it("synthesisBudgetPreFlight accepts an estimate that fits", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 5 }));
    await ledger.reserve("s1", "p1", 2);
    const r = await ledger.synthesisBudgetPreFlight(2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.headroomUsd).toBe(1);
  });

  it("recordSynthesisSpend succeeds when within budget", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 5 }));
    const r = await ledger.recordSynthesisSpend(1.5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(1.5);
    expect(ledger.snapshot().synthesisSpendUsd).toBe(1.5);
  });

  it("recordSynthesisSpend fails when it would exceed the budget", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 2 }));
    const r = await ledger.recordSynthesisSpend(3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/past maxChainCostUsd/);
  });

  it("recordSynthesisSpend is idempotent (same chainId)", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const first = await ledger.recordSynthesisSpend(1);
    const second = await ledger.recordSynthesisSpend(2);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value).toBe(1); // first call wins
    expect(ledger.snapshot().synthesisSpendUsd).toBe(1);
  });

  it("finalize succeeds when report numbers match the ledger", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 5 }));
    await ledger.reserve("s1", "p1", 1);
    await ledger.tryCommit("s1");
    await ledger.reserve("s2", "p2", 1);
    await ledger.tryCommit("s2");
    await ledger.recordSynthesisSpend(1);
    const report = {
      version: "0.1" as const,
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      orchestratorOwnerId: "envoy:owner:abc",
      orchestratorPeerId: "p",
      pinned: false,
      chainSummary: {
        durationMs: 0,
        subtaskCount: 2,
        workerCount: 2,
        workerAllocations: [
          { subtaskId: "s1", workerPeerId: "p1", committedUsd: 1 },
          { subtaskId: "s2", workerPeerId: "p2", committedUsd: 1 },
        ],
        synthesisCostUsd: 1,
      },
      executiveSummary: "x",
      sections: [],
      recipientRoles: ["human"] as ("human" | "agent" | "system")[],
      createdAt: NOW,
    };
    const f = await ledger.finalize(report);
    expect(f.ok).toBe(true);
    expect(ledger.isFinalized()).toBe(true);
  });

  it("finalize rejects when report workerAllocations sum does not match", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 5 }));
    await ledger.reserve("s1", "p1", 1);
    await ledger.tryCommit("s1");
    const report = {
      version: "0.1" as const,
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      orchestratorOwnerId: "envoy:owner:abc",
      orchestratorPeerId: "p",
      pinned: false,
      chainSummary: {
        durationMs: 0,
        subtaskCount: 1,
        workerCount: 1,
        // Report claims 2 USD but ledger only has 1 USD committed.
        workerAllocations: [{ subtaskId: "s1", workerPeerId: "p1", committedUsd: 2 }],
        synthesisCostUsd: 0,
      },
      executiveSummary: "x",
      sections: [],
      recipientRoles: ["human"] as ("human" | "agent" | "system")[],
      createdAt: NOW,
    };
    const f = await ledger.finalize(report);
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.reason).toMatch(/mismatch/);
    expect(ledger.isFinalized()).toBe(false);
  });

  it("finalize rejects when report synthesisCostUsd does not match", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 5 }));
    await ledger.recordSynthesisSpend(1);
    const report = {
      version: "0.1" as const,
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      orchestratorOwnerId: "envoy:owner:abc",
      orchestratorPeerId: "p",
      pinned: false,
      chainSummary: {
        durationMs: 0,
        subtaskCount: 0,
        workerCount: 0,
        workerAllocations: [],
        synthesisCostUsd: 2, // ledger has 1
      },
      executiveSummary: "x",
      sections: [],
      recipientRoles: ["human"] as ("human" | "agent" | "system")[],
      createdAt: NOW,
    };
    const f = await ledger.finalize(report);
    expect(f.ok).toBe(false);
  });

  it("finalize is one-shot", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const report = {
      version: "0.1" as const,
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      orchestratorOwnerId: "envoy:owner:abc",
      orchestratorPeerId: "p",
      pinned: false,
      chainSummary: {
        durationMs: 0,
        subtaskCount: 0,
        workerCount: 0,
        workerAllocations: [],
        synthesisCostUsd: 0,
      },
      executiveSummary: "x",
      sections: [],
      recipientRoles: ["human"] as ("human" | "agent" | "system")[],
      createdAt: NOW,
    };
    expect((await ledger.finalize(report)).ok).toBe(true);
    const second = await ledger.finalize(report);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toMatch(/already finalized/);
  });

  it("concurrent reserve calls on the same chain serialize (no over-commit)", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 4 }));
    const results = await Promise.all([
      ledger.reserve("s1", "p1", 2),
      ledger.reserve("s2", "p2", 2),
      ledger.reserve("s3", "p3", 2), // would push over budget
    ]);
    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);
    expect(successes.length).toBe(2);
    expect(failures.length).toBe(1);
    // Aggregate reserved must not exceed budget.
    expect(ledger.snapshot().reservedUsd).toBeLessThanOrEqual(4);
  });
});

describe("createChainBudgetLedger verification budget (Phase 41 / MAP)", () => {
  it("starts with zero verification spend", () => {
    const ledger = createChainBudgetLedger(mandate());
    const snap = ledger.snapshot();
    expect(snap.verificationReservedUsd).toBe(0);
    expect(snap.verificationCommittedUsd).toBe(0);
    expect(snap.verificationAllocations.size).toBe(0);
  });

  it("reserveVerification succeeds within budget", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const r = await ledger.reserveVerification("subtask_a", 2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(2);
    const snap = ledger.snapshot();
    expect(snap.verificationReservedUsd).toBe(2);
    expect(snap.verificationAllocations.get("subtask_a")?.reservedUsd).toBe(2);
  });

  it("reserveVerification fails when it would push aggregate spend past maxChainCostUsd", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 5 }));
    await ledger.reserve("s1", "p1", 3);
    // 3 committed-spend + 3 verification reserve would be 6 > 5.
    const r = await ledger.reserveVerification("s1", 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/maxChainCostUsd/);
  });

  it("verification reservation shares the budget with worker awards", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 5 }));
    await ledger.reserveVerification("s1", 3);
    // 3 verification reserve + 3 worker reserve = 6 > 5.
    const r = await ledger.reserve("s2", "p1", 3);
    expect(r.ok).toBe(false);
  });

  it("tryCommitVerification moves reserved → committed", async () => {
    const ledger = createChainBudgetLedger(mandate());
    await ledger.reserveVerification("subtask_a", 2);
    const r = await ledger.tryCommitVerification("subtask_a");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(2);
    const snap = ledger.snapshot();
    expect(snap.verificationReservedUsd).toBe(0);
    expect(snap.verificationCommittedUsd).toBe(2);
    expect(snap.verificationAllocations.get("subtask_a")?.committedUsd).toBe(2);
  });

  it("tryCommitVerification is idempotent", async () => {
    const ledger = createChainBudgetLedger(mandate());
    await ledger.reserveVerification("subtask_a", 2);
    await ledger.tryCommitVerification("subtask_a");
    const second = await ledger.tryCommitVerification("subtask_a");
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value).toBe(2);
    expect(ledger.snapshot().verificationCommittedUsd).toBe(2); // not double-counted
  });

  it("tryCommitVerification without a prior reservation fails", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const r = await ledger.tryCommitVerification("missing");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no verification reservation/);
  });

  it("releaseVerification returns the un-committed portion to free budget", async () => {
    const ledger = createChainBudgetLedger(mandate());
    await ledger.reserveVerification("subtask_a", 2);
    const r = await ledger.releaseVerification("subtask_a", "escalation skipped");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(2);
    const snap = ledger.snapshot();
    expect(snap.verificationReservedUsd).toBe(0);
    expect(snap.verificationAllocations.size).toBe(0);
  });

  it("releaseVerification on a missing slot is a no-op", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const r = await ledger.releaseVerification("missing", "nothing to release");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(0);
  });

  it("committed verification spend counts toward the invariant", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 3 }));
    await ledger.reserve("s1", "p1", 2);
    await ledger.tryCommit("s1");
    const r = await ledger.reserveVerification("s1", 2); // 2 committed + 2 verify = 4 > 3
    expect(r.ok).toBe(false);
  });
});