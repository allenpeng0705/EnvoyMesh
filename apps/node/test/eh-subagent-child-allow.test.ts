import { describe, expect, it } from "vitest";
import { HookRegistry } from "@envoymesh/envoy-harness";

import {
  __resetEhSubagentChildAllowForTests,
  clearActiveEhTaskChildren,
  installEhSubagentChildAllowGuard,
  popActiveEhTaskChildren,
  pushActiveEhTaskChildren,
  resolveEhChildAllowToolsForObjective,
} from "../src/agent-runtime-envoy/eh-subagent-child-allow.js";

describe("eh-subagent-child-allow (FH-P2-B)", () => {
  it("blocks tools outside allow-list on child hooks", async () => {
    const hooks = new HookRegistry();
    installEhSubagentChildAllowGuard(hooks, ["read_file"]);
    const blocked = await hooks.fire("PreToolUse", {
      tool: "bash",
      args: {},
    });
    expect(blocked.kind).toBe("block");
    const ok = await hooks.fire("PreToolUse", {
      tool: "read_file",
      args: {},
    });
    expect(ok.kind).toBe("continue");
  });

  it("stacks per-account batches for parallel task calls", () => {
    __resetEhSubagentChildAllowForTests();
    pushActiveEhTaskChildren("chat-a", [
      { objective: "scan src", allowTools: ["read_file", "search_files"] },
    ]);
    pushActiveEhTaskChildren("chat-a", [
      { objective: "write docs", allowTools: ["read_file"] },
    ]);
    pushActiveEhTaskChildren("chat-b", [
      { objective: "other", allowTools: ["list_dir"] },
    ]);

    expect(resolveEhChildAllowToolsForObjective("scan src", "chat-a")).toEqual([
      "read_file",
      "search_files",
    ]);
    expect(
      resolveEhChildAllowToolsForObjective("write docs", "chat-a"),
    ).toEqual(["read_file"]);
    expect(resolveEhChildAllowToolsForObjective("other", "chat-b")).toEqual([
      "list_dir",
    ]);

    const popped = popActiveEhTaskChildren("chat-a", [
      { objective: "scan src", allowTools: ["read_file", "search_files"] },
    ]);
    expect(popped?.[0]?.objective).toBe("scan src");
    expect(
      resolveEhChildAllowToolsForObjective("scan src", "chat-a"),
    ).toBeUndefined();
    expect(
      resolveEhChildAllowToolsForObjective("write docs", "chat-a"),
    ).toEqual(["read_file"]);

    clearActiveEhTaskChildren("chat-a");
    expect(
      resolveEhChildAllowToolsForObjective("write docs", "chat-a"),
    ).toBeUndefined();
  });

  it("denies nested task on child allow guard", async () => {
    const hooks = new HookRegistry();
    installEhSubagentChildAllowGuard(hooks, ["read_file", "list_dir"]);
    const nested = await hooks.fire("PreToolUse", { tool: "task", args: {} });
    expect(nested.kind).toBe("block");
  });
});
