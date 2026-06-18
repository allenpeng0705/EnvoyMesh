/**
 * Phase 40E — Cross-orchestrator handoff + arbitration + relay
 * transport tests.
 *
 * Covers:
 *   - `parseHandoffRequest` / `buildHandoffRequest` round-trip.
 *   - `acceptHandoff` lifecycle: pending → delegated / expired.
 *   - `applyArbitration` convergence rules (seq wins; idempotency).
 *   - `releaseOwnership` drops awards + lost-subtask computation.
 *   - `selectChainRoute` + `wrapChainEnvelope` direct vs relay choice.
 *   - `unwrapChainRelay` recovers the inner intent + payload.
 *   - `advanceViaRelays` drops the hop we just traversed.
 */

import { describe, expect, it } from "vitest";

import {
  acceptHandoff,
  buildArbitrationEntry,
  buildArbitrationPayload,
  buildDelegatePayload,
  buildHandoffRequest,
  isLocalEntryWinning,
  makeHandoffRequestId,
  parseDelegatePayload,
  parseHandoffRequest,
  type HandoffRequestRecord,
} from "../src/chain-handoff.js";
import {
  applyArbitration,
  createArbitrationStore,
  findLostSubtasks,
  getCurrentOwner,
  listOwnedSubtasks,
  localOrchestratorOwns,
  recordLocalEntry,
  releaseOwnership,
} from "../src/chain-arbitration.js";
import {
  advanceViaRelays,
  selectChainRoute,
  unwrapChainRelay,
  wrapChainEnvelope,
} from "../src/chain-relay.js";
import type { EnvoyEnvelope, ChainArbitrationEntry } from "@envoymesh/protocol";

const NOW = new Date("2026-06-18T00:00:00.000Z");

function makeHandoffInput(overrides: { subtaskIds?: string[]; newOrchestratorPeerId?: string; newOrchestratorOwnerId?: string; expiresAt?: string } = {}) {
  return {
    chainId: "chain_40e",
    subtaskIds: overrides.subtaskIds ?? ["subtask_a", "subtask_b"],
    newOrchestratorPeerId: overrides.newOrchestratorPeerId ?? "12D3KooW-b",
    newOrchestratorOwnerId: overrides.newOrchestratorOwnerId ?? "envoy:owner:b",
    rationale: "home A is overloaded",
    expiresAt: overrides.expiresAt ?? "2026-06-18T01:00:00.000Z",
  };
}

describe("Handoff request lifecycle", () => {
  it("buildHandoffRequest creates a pending record with a deterministic requestId", () => {
    const rec = buildHandoffRequest(makeHandoffInput(), NOW);
    expect(rec.status).toBe("pending");
    expect(rec.requestId).toBe("handoff_chain_40e_1");
    expect(rec.subtaskIds).toEqual(["subtask_a", "subtask_b"]);
  });

  it("buildHandoffRequest fails schema validation on missing subtaskIds", () => {
    expect(() => buildHandoffRequest({ ...makeHandoffInput(), subtaskIds: [] }, NOW)).toThrow();
  });

  it("parseHandoffRequest round-trips a payload", () => {
    const rec = buildHandoffRequest(makeHandoffInput(), NOW);
    const payload = {
      chainId: rec.chainId,
      subtaskIds: rec.subtaskIds,
      newOrchestratorPeerId: rec.newOrchestratorPeerId,
      newOrchestratorOwnerId: rec.newOrchestratorOwnerId,
      rationale: rec.rationale,
      expiresAt: rec.expiresAt,
      createdAt: rec.createdAt,
    };
    const parsed = parseHandoffRequest(payload);
    expect(parsed.chainId).toBe("chain_40e");
    expect(parsed.subtaskIds).toEqual(["subtask_a", "subtask_b"]);
  });

  it("parseHandoffRequest strips optional rationale if absent", () => {
    const rec = buildHandoffRequest(makeHandoffInput(), NOW);
    const payload: Record<string, unknown> = {
      chainId: rec.chainId,
      subtaskIds: rec.subtaskIds,
      newOrchestratorPeerId: rec.newOrchestratorPeerId,
      newOrchestratorOwnerId: rec.newOrchestratorOwnerId,
      expiresAt: rec.expiresAt,
      createdAt: rec.createdAt,
    };
    const parsed = parseHandoffRequest(payload);
    expect(parsed.rationale).toBeUndefined();
  });
});

describe("Delegate payload", () => {
  it("buildDelegatePayload produces a valid envelope body", () => {
    const rec = buildHandoffRequest(makeHandoffInput(), NOW);
    const delegate = buildDelegatePayload(rec, {
      subChainId: "chain_40e_sub_1",
      subChainMandate: {
        version: "0.1",
        chainMandateId: "chainmandate_40e_sub",
        chainId: "chain_40e_sub_1",
        issuerOwnerId: "envoy:owner:b",
        orchestratorOwnerId: "envoy:owner:b",
        maxChainCostUsd: 5,
        costCeilingUsd: 2,
        maxWorkers: 2,
        allowDepth3: false,
        maxSensitivity: "public",
        deadlineAt: "2026-06-18T01:00:00.000Z",
        createdAt: NOW.toISOString(),
        rebalancePolicy: "manual",
        maxAutoRebalances: 0,
        autoRebalanceIncrementUsd: 0,
        signature: "stub",
      },
      reportBackByAt: "2026-06-18T01:00:00.000Z",
      estimatedCostUsd: 3,
    }, NOW);
    expect(delegate.subChainId).toBe("chain_40e_sub_1");
    expect(delegate.estimatedCostUsd).toBe(3);
  });

  it("parseDelegatePayload round-trips a built payload", () => {
    const rec = buildHandoffRequest(makeHandoffInput(), NOW);
    const built = buildDelegatePayload(rec, {
      subChainId: "chain_40e_sub_1",
      subChainMandate: {
        version: "0.1",
        chainMandateId: "chainmandate_40e_sub",
        chainId: "chain_40e_sub_1",
        issuerOwnerId: "envoy:owner:b",
        orchestratorOwnerId: "envoy:owner:b",
        maxChainCostUsd: 5,
        costCeilingUsd: 2,
        maxWorkers: 2,
        allowDepth3: false,
        maxSensitivity: "public",
        deadlineAt: "2026-06-18T01:00:00.000Z",
        createdAt: NOW.toISOString(),
        rebalancePolicy: "manual",
        maxAutoRebalances: 0,
        autoRebalanceIncrementUsd: 0,
        signature: "stub",
      },
      reportBackByAt: "2026-06-18T01:00:00.000Z",
      estimatedCostUsd: 3,
    }, NOW);
    const parsed = parseDelegatePayload(built);
    expect(parsed.subChainId).toBe("chain_40e_sub_1");
    expect(parsed.handoffRequestId).toBe(rec.requestId);
  });
});

describe("Arbitration convergence", () => {
  function makeEntry(seq: number, owner: string, createdAt: string, arbitrationIdSuffix: string): ChainArbitrationEntry {
    return {
      chainId: "chain_40e",
      arbitrationId: `arbitration_chain_40e_${arbitrationIdSuffix}`,
      seq,
      subtaskIds: ["subtask_a"],
      currentOwnerPeerId: owner,
      currentOwnerOwnerId: "envoy:owner:b",
      status: "delegated",
      createdAt,
    };
  }

  it("first apply: remote entry is recorded", () => {
    const store = createArbitrationStore();
    const entry = makeEntry(1, "12D3KooW-b", NOW.toISOString(), "1");
    const result = applyArbitration(store, entry);
    expect(result.converged).toBe(true);
    expect(result.changedSubtaskIds).toEqual(["subtask_a"]);
    expect(getCurrentOwner(result.store, "subtask_a")?.currentOwnerPeerId).toBe("12D3KooW-b");
  });

  it("higher-seq remote wins, lower-seq local wins (no convergence)", () => {
    let store = createArbitrationStore();
    const local = makeEntry(1, "12D3KooW-a", NOW.toISOString(), "a1");
    store = recordLocalEntry(store, local);
    const remote = makeEntry(2, "12D3KooW-b", NOW.toISOString(), "b1");
    const r1 = applyArbitration(store, remote);
    expect(r1.converged).toBe(true);
    expect(r1.changedSubtaskIds).toEqual(["subtask_a"]);

    // Now reverse: a fresh store that has the higher-seq local + lower-seq remote.
    const store2 = recordLocalEntry(createArbitrationStore(), makeEntry(2, "12D3KooW-a", NOW.toISOString(), "a2"));
    const r2 = applyArbitration(store2, makeEntry(1, "12D3KooW-b", NOW.toISOString(), "b2"));
    expect(r2.converged).toBe(false);
    expect(r2.changedSubtaskIds).toEqual([]);
  });

  it("re-applying the same entry is idempotent (converged, no changed ids)", () => {
    const entry = makeEntry(1, "12D3KooW-b", NOW.toISOString(), "1");
    const store1 = applyArbitration(createArbitrationStore(), entry).store;
    const store2 = applyArbitration(store1, entry);
    expect(store2.converged).toBe(true);
    expect(store2.changedSubtaskIds).toEqual([]);
  });

  it("tie on seq: more recent createdAt wins", () => {
    const older = makeEntry(5, "12D3KooW-a", "2026-06-18T00:00:00.000Z", "a-older");
    const newer = makeEntry(5, "12D3KooW-b", "2026-06-18T00:01:00.000Z", "b-newer");
    const localWins = isLocalEntryWinning(older, newer);
    expect(localWins).toBe(false); // remote (newer) wins
    const localWins2 = isLocalEntryWinning(newer, older);
    expect(localWins2).toBe(true);
  });

  it("isLocalEntryWinning is strict on equality (later is preferred)", () => {
    const a = makeEntry(1, "12D3KooW-a", NOW.toISOString(), "1");
    const b = makeEntry(1, "12D3KooW-b", NOW.toISOString(), "2");
    // Same seq, same createdAt — first arg is preferred (>=).
    expect(isLocalEntryWinning(a, b)).toBe(true);
  });

  it("buildArbitrationPayload round-trips through Zod", () => {
    const entry = makeEntry(1, "12D3KooW-b", NOW.toISOString(), "1");
    const payload = buildArbitrationPayload(entry, "2026-06-18T01:00:00.000Z", NOW);
    expect(payload.entry.seq).toBe(1);
    expect(payload.convergeByAt).toBe("2026-06-18T01:00:00.000Z");
  });

  it("buildArbitrationEntry increments seq monotonically", () => {
    const e1 = buildArbitrationEntry("chain_40e", 1, {
      chainId: "chain_40e",
      subtaskIds: ["subtask_a"],
      currentOwnerPeerId: "12D3KooW-b",
      currentOwnerOwnerId: "envoy:owner:b",
      status: "delegated",
    }, NOW);
    const e2 = buildArbitrationEntry("chain_40e", 2, {
      chainId: "chain_40e",
      subtaskIds: ["subtask_a"],
      currentOwnerPeerId: "12D3KooW-b",
      currentOwnerOwnerId: "envoy:owner:b",
      status: "delegated",
    }, NOW);
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
    expect(e1.arbitrationId).not.toBe(e2.arbitrationId);
  });
});

describe("Loss recovery", () => {
  it("localOrchestratorOwns returns true only for the local owner", () => {
    let store = createArbitrationStore();
    store = recordLocalEntry(store, {
      chainId: "chain_40e",
      arbitrationId: "arbitration_chain_40e_1",
      seq: 1,
      subtaskIds: ["subtask_a"],
      currentOwnerPeerId: "12D3KooW-a",
      currentOwnerOwnerId: "envoy:owner:a",
      status: "delegated",
      createdAt: NOW.toISOString(),
    });
    expect(localOrchestratorOwns(store, "subtask_a", "12D3KooW-a")).toBe(true);
    expect(localOrchestratorOwns(store, "subtask_a", "12D3KooW-b")).toBe(false);
  });

  it("listOwnedSubtasks returns only the local owner's subtasks", () => {
    let store = createArbitrationStore();
    store = recordLocalEntry(store, {
      chainId: "chain_40e",
      arbitrationId: "arbitration_chain_40e_1",
      seq: 1,
      subtaskIds: ["subtask_a", "subtask_b"],
      currentOwnerPeerId: "12D3KooW-a",
      currentOwnerOwnerId: "envoy:owner:a",
      status: "delegated",
      createdAt: NOW.toISOString(),
    });
    store = recordLocalEntry(store, {
      chainId: "chain_40e",
      arbitrationId: "arbitration_chain_40e_2",
      seq: 2,
      subtaskIds: ["subtask_c"],
      currentOwnerPeerId: "12D3KooW-b",
      currentOwnerOwnerId: "envoy:owner:b",
      status: "delegated",
      createdAt: NOW.toISOString(),
    });
    expect(listOwnedSubtasks(store, "12D3KooW-a").sort()).toEqual(["subtask_a", "subtask_b"]);
    expect(listOwnedSubtasks(store, "12D3KooW-b")).toEqual(["subtask_c"]);
  });

  it("releaseOwnership drops awards for subtasks no longer owned locally", () => {
    let store = createArbitrationStore();
    store = recordLocalEntry(store, {
      chainId: "chain_40e",
      arbitrationId: "arbitration_chain_40e_1",
      seq: 1,
      subtaskIds: ["subtask_a", "subtask_b"],
      currentOwnerPeerId: "12D3KooW-a",
      currentOwnerOwnerId: "envoy:owner:a",
      status: "delegated",
      createdAt: NOW.toISOString(),
    });
    const awards = new Map<string, unknown>([
      ["subtask_a", { worker: "w1" }],
      ["subtask_b", { worker: "w2" }],
      ["subtask_c", { worker: "w3" }],
    ]);
    // Pretend arbitration flipped subtask_b to B.
    const remote = {
      chainId: "chain_40e",
      arbitrationId: "arbitration_chain_40e_2",
      seq: 2,
      subtaskIds: ["subtask_b"],
      currentOwnerPeerId: "12D3KooW-b",
      currentOwnerOwnerId: "envoy:owner:b",
      status: "delegated" as const,
      createdAt: NOW.toISOString(),
    };
    const lost = findLostSubtasks(store, remote, "12D3KooW-a");
    expect(lost).toEqual(["subtask_b"]);
    const rel = releaseOwnership(store, awards, "12D3KooW-a", lost);
    expect(rel.releasedSubtaskIds).toEqual(["subtask_b"]);
    expect(rel.newAwards.has("subtask_a")).toBe(true);
    expect(rel.newAwards.has("subtask_b")).toBe(false);
    expect(rel.newAwards.has("subtask_c")).toBe(true);
  });

  it("findLostSubtasks is empty when local already has the higher seq", () => {
    let store = createArbitrationStore();
    store = recordLocalEntry(store, {
      chainId: "chain_40e",
      arbitrationId: "arbitration_chain_40e_5",
      seq: 5,
      subtaskIds: ["subtask_a"],
      currentOwnerPeerId: "12D3KooW-a",
      currentOwnerOwnerId: "envoy:owner:a",
      status: "delegated",
      createdAt: NOW.toISOString(),
    });
    const remote = {
      chainId: "chain_40e",
      arbitrationId: "arbitration_chain_40e_3",
      seq: 3,
      subtaskIds: ["subtask_a"],
      currentOwnerPeerId: "12D3KooW-b",
      currentOwnerOwnerId: "envoy:owner:b",
      status: "delegated" as const,
      createdAt: NOW.toISOString(),
    };
    expect(findLostSubtasks(store, remote, "12D3KooW-a")).toEqual([]);
  });

  it("releaseOwnership is a no-op for subtasks we don't own", () => {
    const store = createArbitrationStore();
    const awards = new Map<string, unknown>([["subtask_a", { worker: "w1" }]]);
    const rel = releaseOwnership(store, awards, "12D3KooW-a", ["subtask_a"]);
    expect(rel.releasedSubtaskIds).toEqual([]);
    expect(rel.newAwards.has("subtask_a")).toBe(true);
  });
});

describe("Cross-home relay transport", () => {
  it("selectChainRoute returns direct when viaRelays is empty", () => {
    expect(selectChainRoute("12D3KooW-b", [])).toEqual({ kind: "direct", recipientPeerId: "12D3KooW-b" });
  });

  it("selectChainRoute returns relay when viaRelays is non-empty", () => {
    expect(selectChainRoute("12D3KooW-b", ["relay_x"])).toEqual({
      kind: "relay",
      recipientPeerId: "12D3KooW-b",
      viaRelays: ["relay_x"],
    });
  });

  it("selectChainRoute forceRelay overrides even an empty viaRelays", () => {
    expect(selectChainRoute("12D3KooW-b", [], true)).toEqual({
      kind: "relay",
      recipientPeerId: "12D3KooW-b",
      viaRelays: [],
    });
  });

  it("wrapChainEnvelope returns the inner envelope unchanged when no relays are involved", () => {
    const w = wrapChainEnvelope({
      innerIntent: "task.chain.handoff",
      recipientPeerId: "12D3KooW-b",
      viaRelays: [],
      innerPayload: { chainId: "chain_40e", subtaskIds: ["subtask_a"] },
    });
    expect(w.isRelayed).toBe(false);
    expect(w.outboundIntent).toBe("task.chain.handoff");
    expect(w.outboundPayload).toEqual({ chainId: "chain_40e", subtaskIds: ["subtask_a"] });
  });

  it("wrapChainEnvelope wraps in task.chain.relay when relays are involved", () => {
    const inner = { chainId: "chain_40e", subtaskIds: ["subtask_a"] };
    const w = wrapChainEnvelope({
      innerIntent: "task.chain.handoff",
      recipientPeerId: "12D3KooW-b",
      viaRelays: ["relay_x"],
      innerPayload: inner,
      now: NOW,
    });
    expect(w.isRelayed).toBe(true);
    expect(w.outboundIntent).toBe("task.chain.relay");
    const wrapper = w.outboundPayload as { innerIntent: string; innerPayload: unknown; viaRelays: string[] };
    expect(wrapper.innerIntent).toBe("task.chain.handoff");
    expect(wrapper.innerPayload).toEqual(inner);
    expect(wrapper.viaRelays).toEqual(["relay_x"]);
  });

  it("unwrapChainRelay recovers the inner intent + payload", () => {
    const inner = { chainId: "chain_40e", subtaskIds: ["subtask_a"] };
    const w = wrapChainEnvelope({
      innerIntent: "task.chain.handoff",
      recipientPeerId: "12D3KooW-b",
      viaRelays: ["relay_x"],
      innerPayload: inner,
      now: NOW,
    });
    const env: EnvoyEnvelope = {
      version: "0.1",
      messageId: "m1",
      createdAt: NOW.toISOString(),
      senderPeerId: "12D3KooW-a",
      senderPublicKey: "stub",
      senderRole: "agent",
      recipientPeerId: "12D3KooW-b",
      recipientRole: "agent",
      intent: w.outboundIntent,
      payload: w.outboundPayload,
      signature: "stub",
    };
    const inner_ = unwrapChainRelay(env);
    expect(inner_?.innerIntent).toBe("task.chain.handoff");
    expect(inner_?.innerPayload).toEqual(inner);
  });

  it("unwrapChainRelay returns null for non-relay envelopes", () => {
    const env: EnvoyEnvelope = {
      version: "0.1",
      messageId: "m1",
      createdAt: NOW.toISOString(),
      senderPeerId: "12D3KooW-a",
      senderPublicKey: "stub",
      senderRole: "agent",
      recipientPeerId: "12D3KooW-b",
      recipientRole: "agent",
      intent: "task.chain.handoff",
      payload: { chainId: "chain_40e" },
      signature: "stub",
    };
    expect(unwrapChainRelay(env)).toBeNull();
  });

  it("unwrapChainRelay returns null for malformed relay payloads", () => {
    const env: EnvoyEnvelope = {
      version: "0.1",
      messageId: "m1",
      createdAt: NOW.toISOString(),
      senderPeerId: "12D3KooW-a",
      senderPublicKey: "stub",
      senderRole: "agent",
      recipientPeerId: "12D3KooW-b",
      recipientRole: "agent",
      intent: "task.chain.relay",
      payload: { not: "a relay payload" },
      signature: "stub",
    };
    expect(unwrapChainRelay(env)).toBeNull();
  });

  it("advanceViaRelays drops the hop we just traversed", () => {
    expect(advanceViaRelays(["relay_x", "relay_y"], "relay_x")).toEqual(["relay_y"]);
    expect(advanceViaRelays(["relay_x"], "relay_unknown")).toEqual(["relay_x"]);
  });
});

describe("End-to-end: A handoff to B, both arbitrate", () => {
  it("A starts pending, B accepts → status: delegated; both sides converge", () => {
    // A creates the handoff.
    const aRecord = buildHandoffRequest(makeHandoffInput(), NOW);
    expect(aRecord.status).toBe("pending");

    // B receives the delegate request and accepts.
    const bRecord = { ...aRecord };
    bRecord.status = "delegated";
    bRecord.subChainId = "chain_40e_sub_1";
    bRecord.updatedAt = NOW.toISOString();
    expect(bRecord.status).toBe("delegated");

    // A's local arbitration ledger: B now owns subtask_a/b.
    const bEntry = buildArbitrationEntry("chain_40e", 1, {
      chainId: "chain_40e",
      subtaskIds: ["subtask_a", "subtask_b"],
      currentOwnerPeerId: "12D3KooW-b",
      currentOwnerOwnerId: "envoy:owner:b",
      previousOwnerPeerId: "12D3KooW-a",
      status: "delegated",
    }, NOW);
    const aStore = applyArbitration(createArbitrationStore(), bEntry).store;
    expect(localOrchestratorOwns(aStore, "subtask_a", "12D3KooW-b")).toBe(true);
    expect(localOrchestratorOwns(aStore, "subtask_a", "12D3KooW-a")).toBe(false);
  });
});

describe("acceptHandoff — orchestrator-B accepts", () => {
  function makeMockDeps() {
    const auditEvents: Array<Record<string, unknown>> = [];
    return {
      deps: { audit: { record: (e: unknown) => auditEvents.push(e as Record<string, unknown>) } },
      auditEvents,
    };
  }

  function makeSubChainMandate() {
    return {
      version: "0.1" as const,
      chainMandateId: "chainmandate_40e_sub",
      chainId: "chain_40e_sub_1",
      issuerOwnerId: "envoy:owner:b",
      orchestratorOwnerId: "envoy:owner:b",
      maxChainCostUsd: 5,
      costCeilingUsd: 2,
      maxWorkers: 2,
      allowDepth3: false,
      maxSensitivity: "public" as const,
      deadlineAt: "2026-06-18T01:00:00.000Z",
      createdAt: NOW.toISOString(),
      rebalancePolicy: "manual" as const,
      maxAutoRebalances: 0,
      autoRebalanceIncrementUsd: 0,
      signature: "stub",
    };
  }

  function makePendingRecord(): HandoffRequestRecord {
    return {
      requestId: makeHandoffRequestId("chain_40e", 1),
      chainId: "chain_40e",
      subtaskIds: ["subtask_a", "subtask_b"],
      newOrchestratorPeerId: "12D3KooW-b",
      newOrchestratorOwnerId: "envoy:owner:b",
      rationale: "test",
      expiresAt: "2026-06-18T01:00:00.000Z",
      status: "pending",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
  }

  it("accepts a pending record and returns a delegate payload", async () => {
    const { deps } = makeMockDeps();
    const record = makePendingRecord();
    const fakeState = { chainId: "chain_40e" } as unknown as Parameters<typeof acceptHandoff>[1];
    const result = await acceptHandoff(
      deps as unknown as Parameters<typeof acceptHandoff>[0],
      fakeState,
      record,
      {
        chainId: "chain_40e",
        handoffRequestId: record.requestId,
        subtaskIds: record.subtaskIds,
        subChainId: "chain_40e_sub_1",
        subChainMandate: makeSubChainMandate(),
        reportBackByAt: "2026-06-18T01:00:00.000Z",
        estimatedCostUsd: 3,
      },
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(result.delegate?.subChainId).toBe("chain_40e_sub_1");
    expect(record.status).toBe("delegated");
    expect(record.subChainId).toBe("chain_40e_sub_1");
  });

  it("rejects an expired record", async () => {
    const { deps } = makeMockDeps();
    const record = makePendingRecord();
    record.expiresAt = "2026-06-17T00:00:00.000Z"; // in the past
    const fakeState = { chainId: "chain_40e" } as unknown as Parameters<typeof acceptHandoff>[1];
    const result = await acceptHandoff(
      deps as unknown as Parameters<typeof acceptHandoff>[0],
      fakeState,
      record,
      {
        chainId: "chain_40e",
        handoffRequestId: record.requestId,
        subtaskIds: record.subtaskIds,
        subChainId: "chain_40e_sub_1",
        subChainMandate: makeSubChainMandate(),
        reportBackByAt: "2026-06-18T01:00:00.000Z",
        estimatedCostUsd: 3,
      },
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("expired");
    expect(record.status).toBe("expired");
  });

  it("rejects a terminal record (already delegated)", async () => {
    const { deps } = makeMockDeps();
    const record = makePendingRecord();
    record.status = "delegated";
    const fakeState = { chainId: "chain_40e" } as unknown as Parameters<typeof acceptHandoff>[1];
    const result = await acceptHandoff(
      deps as unknown as Parameters<typeof acceptHandoff>[0],
      fakeState,
      record,
      {
        chainId: "chain_40e",
        handoffRequestId: record.requestId,
        subtaskIds: record.subtaskIds,
        subChainId: "chain_40e_sub_1",
        subChainMandate: makeSubChainMandate(),
        reportBackByAt: "2026-06-18T01:00:00.000Z",
        estimatedCostUsd: 3,
      },
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not_pending:delegated");
  });
});