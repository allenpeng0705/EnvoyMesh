/**
 * R7.3 — remote data source forwards chatId on every invoke.
 */

import { describe, expect, it, vi } from "vitest";

import { createRemoteEhuiDataSource } from "../../src/lib/envoy-harness-ehui-data-source.js";

describe("createRemoteEhuiDataSource chatId", () => {
  it("attaches chatId to plan invokes", async () => {
    const invoke = vi.fn(async () => "ok");
    const ds = createRemoteEhuiDataSource(
      { invokeEnvoyHarnessEhui: invoke },
      { chatId: "c1" },
    );
    expect(ds.sessionId).toBe("c1");
    await ds.plan("show");
    expect(invoke).toHaveBeenCalledWith({
      op: "plan",
      action: "show",
      chatId: "c1",
    });
  });
});
