import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ChainActiveJournal,
  emptyChainJournalProjection,
  replayChainJournal,
} from "../src/chain-active-journal.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ChainActiveJournal", () => {
  it("serializes concurrent appends with monotonic sequence numbers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chain-journal-"));
    dirs.push(dir);
    const journal = new ChainActiveJournal(dir);
    await journal.initChain("chain_a");
    const events = await Promise.all([
      journal.append("chain_a", "attempt.awarded", { attemptId: "a1" }),
      journal.append("chain_a", "attempt.partial_received", { attemptId: "a1", seq: 1 }),
      journal.append("chain_a", "artifact.produced", { attemptId: "a1" }),
    ]);
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3]);
    expect((await journal.read("chain_a")).map((event) => event.type)).toEqual([
      "attempt.awarded",
      "attempt.partial_received",
      "artifact.produced",
    ]);
  });

  it("keeps the valid prefix when a crash leaves a corrupt tail", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chain-journal-tail-"));
    dirs.push(dir);
    const journal = new ChainActiveJournal(dir);
    await journal.initChain("chain_b");
    await journal.append("chain_b", "chain.runtime_created");
    await appendFile(journal.filePath("chain_b"), "{partial", "utf8");
    const recovered = await journal.read("chain_b");
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.seq).toBe(1);
  });

  it("reduces attempt events deterministically", () => {
    const base = {
      version: 1 as const,
      eventId: "e1",
      chainId: "chain_c",
      seq: 1,
      at: "2030-01-01T00:00:00.000Z",
      type: "attempt.awarded",
      data: {
        attemptId: "attempt_1",
        chainId: "chain_c",
        subtaskId: "subtask_1",
        workerPeerId: "worker_1",
        role: "primary",
        state: "awarded",
        attemptNumber: 1,
        acceptedCostUsd: 1,
        createdAt: "2030-01-01T00:00:00.000Z",
        updatedAt: "2030-01-01T00:00:00.000Z",
      },
    };
    const projection = replayChainJournal([
      base,
      {
        ...base,
        eventId: "e2",
        seq: 2,
        at: "2030-01-01T00:00:01.000Z",
        type: "attempt.partial_received",
        data: { attemptId: "attempt_1", seq: 4, isFinal: true, confidence: 0.9 },
      },
    ], emptyChainJournalProjection());
    expect(projection.attempts.attempt_1).toMatchObject({
      state: "final_received",
      lastPartialSeq: 4,
      lastConfidence: 0.9,
    });
    expect(projection.selectedAttemptBySubtask.subtask_1).toBe("attempt_1");
  });

  it("does not let speculative awards overwrite selectedAttempt; selected wins", () => {
    const primary = {
      version: 1 as const,
      eventId: "e1",
      chainId: "chain_c",
      seq: 1,
      at: "2030-01-01T00:00:00.000Z",
      type: "attempt.awarded",
      data: {
        attemptId: "attempt_primary",
        chainId: "chain_c",
        subtaskId: "subtask_1",
        workerPeerId: "worker_1",
        role: "primary",
        state: "awarded",
        attemptNumber: 1,
        acceptedCostUsd: 1,
        createdAt: "2030-01-01T00:00:00.000Z",
        updatedAt: "2030-01-01T00:00:00.000Z",
      },
    };
    const speculative = {
      ...primary,
      eventId: "e2",
      seq: 2,
      at: "2030-01-01T00:00:01.000Z",
      data: {
        ...primary.data,
        attemptId: "attempt_spec",
        workerPeerId: "worker_2",
        role: "speculative",
        attemptNumber: 2,
      },
    };
    const selected = {
      ...primary,
      eventId: "e3",
      seq: 3,
      at: "2030-01-01T00:00:02.000Z",
      type: "attempt.state_changed",
      data: {
        attemptId: "attempt_spec",
        subtaskId: "subtask_1",
        state: "selected",
        reason: "equivalent_cheaper",
      },
    };
    const projection = replayChainJournal(
      [primary, speculative, selected],
      emptyChainJournalProjection(),
    );
    expect(projection.selectedAttemptBySubtask.subtask_1).toBe("attempt_spec");
    // After only primary+speculative awards, selection stays on primary.
    const mid = replayChainJournal([primary, speculative], emptyChainJournalProjection());
    expect(mid.selectedAttemptBySubtask.subtask_1).toBe("attempt_primary");
  });

  it("recover without checkpoint uses empty projection (not undefined)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chain-journal-no-ckpt-"));
    dirs.push(dir);
    const journal = new ChainActiveJournal(dir);
    await journal.append("chain_e", "attempt.awarded", {
      attemptId: "attempt_1",
      chainId: "chain_e",
      subtaskId: "subtask_1",
      workerPeerId: "worker_1",
      role: "primary",
      state: "awarded",
      attemptNumber: 1,
      acceptedCostUsd: 1,
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-01T00:00:00.000Z",
    });
    const recovered = await journal.recover("chain_e");
    expect(recovered.checkpoint).toBeUndefined();
    expect(recovered.projection.attempts.attempt_1?.attemptId).toBe("attempt_1");
    expect(recovered.projection.selectedAttemptBySubtask.subtask_1).toBe("attempt_1");
  });

  it("loads a checkpoint then replays only its valid journal tail", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chain-journal-checkpoint-"));
    dirs.push(dir);
    const journal = new ChainActiveJournal(dir);
    await journal.append("chain_d", "attempt.awarded", {
      attemptId: "attempt_1",
      chainId: "chain_d",
      subtaskId: "subtask_1",
      workerPeerId: "worker_1",
      role: "primary",
      state: "awarded",
      attemptNumber: 1,
      acceptedCostUsd: 1,
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-01T00:00:00.000Z",
    });
    const before = await journal.recover("chain_d");
    await journal.writeCheckpoint("chain_d", before.projection, before.lastSeq);
    await journal.append("chain_d", "attempt.state_changed", {
      attemptId: "attempt_1",
      state: "lost",
      reason: "disconnect",
    });

    const recovered = await journal.recover("chain_d");
    expect(recovered.checkpoint?.lastSeq).toBe(1);
    expect(recovered.tail.map((event) => event.seq)).toEqual([2]);
    expect(recovered.projection.attempts.attempt_1).toMatchObject({
      state: "lost",
      lastReason: "disconnect",
    });
  });
});
