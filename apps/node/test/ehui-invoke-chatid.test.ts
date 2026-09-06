/**
 * R7.3 — parseEhuiInvokeRequest accepts optional chatId.
 */

import { describe, expect, it } from "vitest";

import { parseEhuiInvokeRequest } from "../src/agent-runtime-envoy/ehui-invoke.js";

describe("parseEhuiInvokeRequest chatId", () => {
  it("forwards chatId on plan", () => {
    const req = parseEhuiInvokeRequest({
      op: "plan",
      action: "show",
      chatId: "chat-abc",
    });
    expect(req).toEqual({
      op: "plan",
      action: "show",
      chatId: "chat-abc",
    });
  });

  it("omits chatId when absent", () => {
    const req = parseEhuiInvokeRequest({ op: "gitStatus" });
    expect(req).toEqual({ op: "gitStatus" });
  });
});
