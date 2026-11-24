/**
 * FH-P1-A — EH Coding strips harness auto-tools from the ACP agent surface.
 */

import { describe, expect, it } from "vitest";

import {
  Agent,
  BUILTIN_TOOLS,
  InMemorySession,
  LocalMeshSubmitter,
  ToolRegistry,
  newSessionId,
  type ModelAdapter,
  type ModelResponse,
} from "@envoymesh/envoy-harness";
import {
  MESH_EH_ALLOWED_AUTO_TOOLS,
  stripMeshHarnessAutoTools,
} from "../src/agent-runtime-envoy/eh-tool-surface.js";

const okModel: ModelAdapter = {
  async complete(): Promise<ModelResponse> {
    return { content: [{ type: "text", text: "ok" }], stopReason: "end_turn" };
  },
};

describe("stripMeshHarnessAutoTools", () => {
  it("removes todo_write, wait_inbox, workflow when mesh allows task", () => {
    const tools = new ToolRegistry();
    for (const t of BUILTIN_TOOLS) {
      if (t.name === "read_file" || t.name === "bash") {
        tools.register(t);
      }
    }
    const declared = tools.list().map((t) => t.name);

    const mesh = new LocalMeshSubmitter({
      workerPeerId: "envoymesh-test",
      buildSubagent: () =>
        new Agent({
          model: okModel,
          tools: new ToolRegistry(),
          session: new InMemorySession(newSessionId(), {
            cwd: "/tmp/eh-surface-test",
            permissionMode: "read-only",
            startedAt: new Date().toISOString(),
          }),
        }),
    });

    const agent = new Agent({
      model: okModel,
      tools,
      session: new InMemorySession(newSessionId(), {
        cwd: "/tmp/eh-surface-test",
        permissionMode: "workspace-write",
        startedAt: new Date().toISOString(),
      }),
      cwd: "/tmp/eh-surface-test",
      meshSubmitter: mesh,
    });

    const widened = tools.list().map((t) => t.name);
    expect(widened).toContain("todo_write");
    expect(widened).toContain("wait_inbox");
    expect(widened).toContain("workflow");

    stripMeshHarnessAutoTools(tools, declared);
    const after = tools.list().map((t) => t.name).sort();
    expect(after).toEqual(["bash", "read_file", "suggest_follow_ups", "task"]);
    for (const stripped of ["todo_write", "wait_inbox", "workflow"]) {
      expect(after.includes(stripped)).toBe(false);
    }
    expect(MESH_EH_ALLOWED_AUTO_TOOLS.has("suggest_follow_ups")).toBe(true);
    expect(MESH_EH_ALLOWED_AUTO_TOOLS.has("task")).toBe(true);
    expect(typeof agent.run).toBe("function");
  });
});