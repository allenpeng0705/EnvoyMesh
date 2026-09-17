import { describe, expect, it } from "vitest";
import {
  shouldAskCatalogAcpTool,
  shouldAutoAllowCatalogPermission,
} from "../src/catalog-acp-policy.js";
import { _test } from "../src/catalog-acp-session.js";

describe("catalog ACP permission policy", () => {
  it("off always auto-allows", () => {
    expect(
      shouldAutoAllowCatalogPermission("off", {
        toolCall: { toolName: "write", input: { path: "a.ts" } },
      }),
    ).toBe(true);
  });

  it("always-confirm never auto-allows", () => {
    expect(
      shouldAutoAllowCatalogPermission("always-confirm", {
        toolCall: { toolName: "read_file", input: { path: "a.ts" } },
      }),
    ).toBe(false);
  });

  it("safe-only allows reads and denies writes", () => {
    expect(
      shouldAutoAllowCatalogPermission("safe-only", {
        toolCall: { toolName: "read_file", input: { path: "a.ts" } },
      }),
    ).toBe(true);
    expect(
      shouldAutoAllowCatalogPermission("safe-only", {
        toolCall: { toolName: "write", input: { path: "a.ts" } },
      }),
    ).toBe(false);
    expect(
      shouldAskCatalogAcpTool("bash", "safe-only", { command: "ls" }),
    ).toBe(false);
    expect(
      shouldAskCatalogAcpTool("bash", "safe-only", { command: "rm -rf /" }),
    ).toBe(true);
  });

  it("defaults to safe-only when policy omitted", () => {
    expect(
      shouldAutoAllowCatalogPermission(undefined, {
        toolCall: { toolName: "write" },
      }),
    ).toBe(false);
  });

  it("prefer deny-like option ids", () => {
    expect(
      _test.denyOptionId([
        { optionId: "allow-once" },
        { optionId: "reject" },
      ]),
    ).toBe("reject");
    expect(
      _test.denyOptionId([{ optionId: "allow-once" }]),
    ).toBeUndefined();
  });
});
