import { describe, expect, it } from "vitest";
import { HookRegistry } from "@envoymesh/envoy-harness";

import {
  __resetEhSubagentAccountForTests,
  activeEhSubagentChildren,
} from "../src/agent-runtime-envoy/eh-subagent-account.js";
import {
  __resetEhSubagentChildAllowForTests,
  resolveEhChildAllowToolsForObjective,
} from "../src/agent-runtime-envoy/eh-subagent-child-allow.js";
import { installEhSubagentTaskGuard } from "../src/agent-runtime-envoy/eh-subagent-task-guard.js";

describe("eh-subagent-task-guard (FH-P2-B)", () => {
  it("blocks oversized task batch", async () => {
    __resetEhSubagentAccountForTests();
    __resetEhSubagentChildAllowForTests();
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
    __resetEhSubagentChildAllowForTests();
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

  it("keeps sibling parallel task batches until each posts", async () => {
    __resetEhSubagentAccountForTests();
    __resetEhSubagentChildAllowForTests();
    const hooks = new HookRegistry();
    installEhSubagentTaskGuard(hooks, { accountKey: "chat-1" });
    const first = { tasks: [{ objective: "job-a", allowTools: ["read_file"] }] };
    const second = {
      tasks: [{ objective: "job-b", allowTools: ["list_dir"] }],
    };
    expect(
      (await hooks.fire("PreToolUse", { tool: "task", args: first })).kind,
    ).toBe("continue");
    expect(
      (await hooks.fire("PreToolUse", { tool: "task", args: second })).kind,
    ).toBe("continue");
    expect(activeEhSubagentChildren("chat-1")).toBe(2);
    expect(resolveEhChildAllowToolsForObjective("job-a", "chat-1")).toEqual([
      "read_file",
    ]);
    expect(resolveEhChildAllowToolsForObjective("job-b", "chat-1")).toEqual([
      "list_dir",
    ]);

    await hooks.fire("PostToolUse", { tool: "task", args: first });
    expect(activeEhSubagentChildren("chat-1")).toBe(1);
    expect(
      resolveEhChildAllowToolsForObjective("job-a", "chat-1"),
    ).toBeUndefined();
    expect(resolveEhChildAllowToolsForObjective("job-b", "chat-1")).toEqual([
      "list_dir",
    ]);

    await hooks.fire("PostToolUse", { tool: "task", args: second });
    expect(activeEhSubagentChildren("chat-1")).toBe(0);
  });
});
