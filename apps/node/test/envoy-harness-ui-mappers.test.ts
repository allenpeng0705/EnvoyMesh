/**
 * U4 — the dedicated UI's host-side mappers: chain worker subtasks →
 * `team/jobs`, and verdict aggregation for `scoreboard/summary`.
 */

import { describe, expect, it } from "vitest";

import { aggregateVerdicts } from "@envoymesh/envoy-harness-peer";

import { chainWorkerSubtasksToTeamJobs } from "../src/node-service-chain-orchestration.js";

function subtask(chainId: string, subtaskId: string) {
  return {
    version: "0.1",
    subtaskId,
    chainId,
    chainMandateId: "mandate-1",
    depth: 1,
    requiredSkill: "research",
    objective: `objective ${subtaskId}`,
    requestedResult: "summary",
    constraints: [],
    dependsOn: [],
    createdAt: "2026-08-23T00:00:00.000Z",
  } as never;
}

describe("chainWorkerSubtasksToTeamJobs", () => {
  it("groups worker subtasks into one job per chain", () => {
    const jobs = chainWorkerSubtasksToTeamJobs(
      new Map([
        ["s1", { subtask: subtask("chain_1", "s1"), orchestratorPeerId: "o1" }],
        ["s2", { subtask: subtask("chain_1", "s2"), orchestratorPeerId: "o1" }],
        ["s3", { subtask: subtask("chain_2", "s3"), orchestratorPeerId: "o2" }],
      ]),
    );
    expect(jobs).toHaveLength(2);
    const chain1 = jobs.find((j) => j.jobId === "chain_1");
    expect(chain1?.agents.map((a) => a.id)).toEqual(["s1", "s2"]);
    expect(chain1?.agents[0]).toMatchObject({ host: "mesh-worker", status: "running" });
    expect(jobs.find((j) => j.jobId === "chain_2")?.agents).toHaveLength(1);
  });
});

describe("aggregateVerdicts", () => {
  it("aggregates verdict entries per (worker, skill)", () => {
    const entries = [
      {
        chainId: "c1",
        subtaskId: "s1",
        workerPeerId: "p1",
        workerRuntime: "envoy-harness",
        skillId: "research",
        verdict: { kind: "pass", score: 1, confidence: "high" },
        source: "rule",
        issuedBy: "x",
        issuedAt: "2026-08-23T00:00:00.000Z",
        signature: "",
      },
      {
        chainId: "c1",
        subtaskId: "s2",
        workerPeerId: "p1",
        workerRuntime: "envoy-harness",
        skillId: "research",
        verdict: { kind: "fail", reason: "no", rollback: true },
        source: "rule",
        issuedBy: "x",
        issuedAt: "2026-08-23T00:00:01.000Z",
        signature: "",
      },
    ] as never;
    expect(aggregateVerdicts(entries)).toEqual([
      {
        workerPeerId: "p1",
        skillId: "research",
        score: 0.5,
        passCount: 1,
        failCount: 1,
        partialCount: 0,
      },
    ]);
  });
});
