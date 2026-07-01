import { describe, expect, it, vi } from "vitest";
import {
  installOpenClawPluginViaRuntime,
  searchOpenClawPluginsViaRuntime,
  uninstallOpenClawPluginViaRuntime,
  type ClawHubContext,
} from "../src/node-service-clawhub.js";

function mockClawHubContext(overrides: Partial<ClawHubContext> = {}): ClawHubContext {
  return {
    resolveOpenClawWorkspaceDir: () => "/tmp/openclaw-workspace",
    loadBridgeConfigClawhubToken: async () => undefined,
    stopOpenClaw: async () => {},
    startOpenClaw: async () => true,
    ...overrides,
  };
}

describe("node-service-clawhub", () => {
  it("rejects invalid plugin names on install", async () => {
    const result = await installOpenClawPluginViaRuntime(mockClawHubContext(), "../bad");
    expect(result).toEqual({ ok: false, message: "Invalid plugin name" });
  });

  it("rejects invalid plugin names on uninstall", async () => {
    const result = await uninstallOpenClawPluginViaRuntime(mockClawHubContext(), "bad name");
    expect(result).toEqual({ ok: false, message: "Invalid plugin name" });
  });

  it("returns error string when search fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const results = await searchOpenClawPluginsViaRuntime(mockClawHubContext(), "weather");
    expect(results[0]).toMatch(/^Error: network down/);
    vi.unstubAllGlobals();
  });
});
