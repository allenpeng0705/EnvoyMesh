import { describe, expect, it } from "vitest";
import { AgentNetworkLabClock } from "./support/agent-network-lab/lab-clock.js";
import { AgentNetworkLabTransport } from "./support/agent-network-lab/lab-transport.js";
import {
  attemptAwarded,
  awaitJournalPredicate,
  recoveryStarted,
} from "./support/agent-network-lab/lab-events.js";
import { labChainMandate, labSubtask } from "./support/agent-network-lab/lab-fixtures.js";
import type { ChainJournalEvent } from "../src/chain-active-journal.js";

describe("Agent Network deterministic lab foundation", () => {
  it("advances time without sleeping", () => {
    const clock = new AgentNetworkLabClock(1_000);
    clock.advanceBy(30_000);
    expect(clock.nowMs()).toBe(31_000);
  });

  it("injects partitions and one-shot message loss deterministically", () => {
    const transport = new AgentNetworkLabTransport();
    transport.partition("assigner", "openclaw");
    expect(transport.send({ intent: "task.chain.accept", from: "assigner", to: "openclaw" })).toBe(false);
    transport.heal("assigner", "openclaw");
    transport.dropNext("task.chain.heartbeat", { from: "openclaw" });
    expect(transport.send({ intent: "task.chain.heartbeat", from: "openclaw", to: "assigner" })).toBe(false);
    expect(transport.send({ intent: "task.chain.heartbeat", from: "openclaw", to: "assigner" })).toBe(true);
  });

  it("awaits journal predicates without arbitrary protocol sleeps", async () => {
    const events: ChainJournalEvent[] = [];
    const pending = awaitJournalPredicate({
      events: () => events,
      predicate: recoveryStarted(),
      timeoutMs: 500,
      pollMs: 5,
    });
    events.push({
      version: 1,
      eventId: "e1",
      chainId: "chain_lab_1",
      seq: 1,
      at: "2030-01-01T00:00:00.000Z",
      type: "recovery.started",
      data: { orchestratorEpoch: "orch_1" },
    });
    const hit = await pending;
    expect(hit.type).toBe("recovery.started");
    expect(
      attemptAwarded("subtask_lab_1")({
        version: 1,
        eventId: "e2",
        chainId: "chain_lab_1",
        seq: 2,
        at: "2030-01-01T00:00:01.000Z",
        type: "attempt.awarded",
        data: { subtaskId: "subtask_lab_1" },
      }),
    ).toBe(true);
    expect(labChainMandate().chainId).toBe("chain_lab_1");
    expect(labSubtask().requiredSkill).toBe("research");
  });
});
