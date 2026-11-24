import { describe, expect, it } from "vitest";
import { HookRegistry } from "@envoymesh/envoy-harness";

import {
  __resetEhSubagentAccountForTests,
  activeEhSubagentChildren,
} from "../src/agent-runtime-envoy/eh-subagent-account.js";
import { installEhSubagentTaskGuard } from "../src/agent-runtime-envoy/eh-subagent-task-guard.js";

describe("eh-subagent-task-guard (FH-P2-B)", () => {
  it("blocks oversized task batch", async () => {
    __resetEhSubagentAccountForTests();
    const hooks = new HookRegistry();
    installEhSubagentTaskGuard(hooks, { accountKey: "acct" });
    const tasks = Array.from({ length: 20 }, (_, i) => ({
      objective: `job-${i}`,
    }));
    const decision = await hooks.fire("PreToolUse", {
      tool: "task",
      args: { tasks },
    });
    expect(decision.kind).toBe("block");
  });

  it("acquires and releases on post", async () => {
    __resetEhSubagentAccountForTests();
    const hooks = new HookRegistry();
    installEhSubagentTaskGuard(hooks, { accountKey: "acct" });
    const args = { tasks: [{ objective: "a" }, { objective: "b" }] };
    const pre = await hooks.fire("PreToolUse", { tool: "task", args });
    expect(pre.kind).toBe("continue");
    expect(activeEhSubagentChildren("acct")).toBe(2);
    const post = await hooks.fire("PostToolUse", { tool: "task", args });
    expect(post.kind).toBe("continue");
    expect(activeEhSubagentChildren("acct")).toBe(0);
  });
});