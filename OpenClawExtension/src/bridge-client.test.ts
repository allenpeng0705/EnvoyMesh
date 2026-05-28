import { afterEach, describe, expect, it, vi } from "vitest";
import { executeBridgeMeshTool, listBridgeMeshTools, sendBridgeMessage } from "./bridge-client.js";

describe("sendBridgeMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs to bridge with bearer secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendBridgeMessage({
      bridgeUrl: "http://127.0.0.1:3031/bridge/send",
      bridgeSecret: "sekrit",
      to: "envoy_abc",
      text: "hello mesh",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3031/bridge/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sekrit",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ to: "envoy_abc", text: "hello mesh" }),
      }),
    );
  });

  it("GETs list-tools and POSTs execute-tool", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, tools: [{ name: "mesh_listContacts" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { ok: true, data: [] } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const tools = await listBridgeMeshTools({
      bridgeUrl: "http://127.0.0.1:3031/bridge/send",
      bridgeSecret: "s",
    });
    expect(tools[0]?.name).toBe("mesh_listContacts");

    await executeBridgeMeshTool({
      bridgeUrl: "http://127.0.0.1:3031/bridge/send",
      bridgeSecret: "s",
      toolName: "mesh_listContacts",
      params: {},
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:3031/bridge/list-tools");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://127.0.0.1:3031/bridge/execute-tool");
  });
});
