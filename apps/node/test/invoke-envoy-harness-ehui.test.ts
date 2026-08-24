import { describe, expect, it } from "vitest";

import { parseEhuiInvokeRequest } from "../src/agent-runtime-envoy/ehui-invoke.js";

describe("parseEhuiInvokeRequest", () => {
  it("parses plan invoke", () => {
    expect(
      parseEhuiInvokeRequest({ op: "plan", action: "show" }),
    ).toEqual({ op: "plan", action: "show" });
  });

  it("parses memory read with name", () => {
    expect(
      parseEhuiInvokeRequest({
        op: "memory",
        memoryOp: "read",
        name: "notes",
      }),
    ).toEqual({ op: "memory", memoryOp: "read", name: "notes" });
  });

  it("parses gitDiff flags", () => {
    expect(
      parseEhuiInvokeRequest({ op: "gitDiff", staged: true, stat: true }),
    ).toEqual({ op: "gitDiff", staged: true, stat: true });
  });

  it("rejects unknown op", () => {
    expect(() => parseEhuiInvokeRequest({ op: "evil" })).toThrow(/unknown op/);
  });

  it("rejects missing request", () => {
    expect(() => parseEhuiInvokeRequest(undefined)).toThrow(/missing op/);
  });
});
