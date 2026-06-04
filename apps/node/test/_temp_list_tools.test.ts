import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../src/tool-registry.js";

describe("list", () => {
  it("default", () => {
    const r = new ToolRegistry();
    const tools = r.listTools();
    expect(tools.map((t) => t.name).sort().join(",")).toBe(
      "WRONG_VALUE_" + tools.length,
    );
  });
});
