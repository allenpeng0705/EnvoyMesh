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

  it("forwards listConfiguredPeers", async () => {
    const invoke = vi.fn(async () => [
      { id: "peer-a", endpoint: "127.0.0.1:18789" },
    ]);
    const ds = createRemoteEhuiDataSource({
      invokeEnvoyHarnessEhui: invoke,
    });
    await expect(ds.listConfiguredPeers()).resolves.toEqual([
      { id: "peer-a", endpoint: "127.0.0.1:18789" },
    ]);
    expect(invoke).toHaveBeenCalledWith({ op: "listConfiguredPeers" });
  });
});
