import { describe, expect, it } from "vitest";
import { HookRegistry } from "@envoymesh/envoy-harness";

import {
  __resetEhSubagentChildAllowForTests,
  clearActiveEhTaskChildren,
  installEhSubagentChildAllowGuard,
  resolveEhChildAllowToolsForObjective,
  setActiveEhTaskChildren,
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

  it("maps objective to parsed task child allowTools", () => {
    __resetEhSubagentChildAllowForTests();
    setActiveEhTaskChildren([
      { objective: "scan src", allowTools: ["read_file", "search_files"] },
    ]);
    expect(resolveEhChildAllowToolsForObjective("scan src")).toEqual([
      "read_file",
      "search_files",
    ]);
    clearActiveEhTaskChildren();
    expect(resolveEhChildAllowToolsForObjective("scan src")).toBeUndefined();
  });

  it("denies nested task on child allow guard", async () => {
    const hooks = new HookRegistry();
    installEhSubagentChildAllowGuard(hooks, ["read_file", "list_dir"]);
    const nested = await hooks.fire("PreToolUse", { tool: "task", args: {} });
    expect(nested.kind).toBe("block");
  });
});