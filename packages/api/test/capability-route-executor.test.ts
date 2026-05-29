import { describe, expect, it } from "vitest";
import {
  pickMeshToolForStep,
  resolveRouteStepExecution,
} from "../src/capability-route-executor.js";

describe("capability-route-executor", () => {
  it("picks mesh.library_discover for document discover step", () => {
    const tool = pickMeshToolForStep({
      phase: "discover",
      description: "discover",
      intents: ["discovery.request"],
      meshTools: ["mesh.library_discover"],
    });
    expect(tool).toBe("mesh.library_discover");
  });

  it("resolves library discover without target owner", () => {
    const resolved = resolveRouteStepExecution({
      step: {
        phase: "discover",
        description: "discover",
        intents: ["discovery.request"],
        meshTools: ["mesh.library_discover"],
      },
      goal: "find quarterly report pdf",
      correlationId: "corr-1",
    });
    expect(resolved.kind).toBe("execute");
    if (resolved.kind === "execute") {
      expect(resolved.toolName).toBe("mesh.library_discover");
    }
  });

  it("defers human-only bond.accept step", () => {
    const resolved = resolveRouteStepExecution({
      step: {
        phase: "bond",
        description: "bond",
        intents: ["bond.accept"],
      },
      goal: "make friends",
      correlationId: "corr-2",
    });
    expect(resolved).toEqual({
      kind: "defer",
      reason: "human-only intent; agent cannot execute",
    });
  });

  it("executes task.propose when target owner is known", () => {
    const resolved = resolveRouteStepExecution({
      step: {
        phase: "negotiate",
        description: "task",
        intents: ["task.propose"],
      },
      goal: "delegate work",
      targetOwnerId: "envoy:owner:peer",
      correlationId: "corr-3",
    });
    expect(resolved.kind).toBe("execute");
    if (resolved.kind === "execute") {
      expect(resolved.toolName).toBe("mesh.task.propose");
    }
  });

  it("skips discovery.search when target owner is already resolved", () => {
    const resolved = resolveRouteStepExecution({
      step: {
        phase: "discover",
        description: "discover",
        intents: ["discovery.request"],
        meshTools: ["discovery.search"],
      },
      goal: "find quarterly report",
      targetOwnerId: "envoy:owner:bob",
      correlationId: "corr-4",
    });
    expect(resolved).toEqual({
      kind: "skip",
      reason: "target owner already resolved",
    });
  });

  it("uses structured acquisition prompt for knowledge.query", () => {
    const resolved = resolveRouteStepExecution({
      step: {
        phase: "negotiate",
        description: "negotiate",
        intents: ["knowledge.query"],
        meshTools: ["knowledge.query"],
      },
      goal: "Ed25519 security draft",
      targetOwnerId: "envoy:owner:bob",
      correlationId: "corr-5",
    });
    expect(resolved.kind).toBe("execute");
    if (resolved.kind === "execute") {
      expect(resolved.toolName).toBe("knowledge.query");
      expect(resolved.params.query).toContain("Document acquisition");
      expect(resolved.params.query).toContain("relativePath");
      expect(resolved.params.query).toContain("Ed25519 security draft");
    }
  });
});
