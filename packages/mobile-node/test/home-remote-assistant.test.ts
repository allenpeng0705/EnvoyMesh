import { beforeEach, describe, expect, it, vi } from "vitest";

import { MobileNode, type MobileNodeConfig } from "../src/index.js";

function makeConfig(): MobileNodeConfig {
  return {
    profileDir: "/test-profile",
    relayUrls: ["ws://relay.example.com:9000"],
    modelProviders: { mode: "mock", modelName: "test-model" },
  };
}

describe("MobileNode assistant home proxy", () => {
  let node: MobileNode;

  beforeEach(async () => {
    node = new MobileNode(makeConfig());
    await node.initStandalone("/test-profile");
    node.state.sharedIdentity = true;
    node.state.homeNodePeerId = "envoy_home_peer";
    (node as unknown as { _homeRemoteOnline: boolean })._homeRemoteOnline = true;
  });

  it("proxies runOwnerAgentTurn to home when paired and online", async () => {
    const remoteTurn = {
      answer: "home answer",
      domain: "knowledge" as const,
      intent: "knowledge" as const,
      toolsUsed: [],
      approvalItems: [],
      modelUsed: "openclaw",
    };
    const callSpy = vi
      .spyOn(node as unknown as { _homeRemoteCall: (...args: unknown[]) => Promise<unknown> }, "_homeRemoteCall")
      .mockResolvedValue(remoteTurn);

    const turn = await node.runOwnerAgentTurn("list my library files");
    expect(callSpy).toHaveBeenCalledWith("runOwnerAgentTurn", { message: "list my library files" });
    expect(turn.answer).toBe("home answer");
  });

  it("throws assistant.homeOffline when paired but home is offline", async () => {
    (node as unknown as { _homeRemoteOnline: boolean })._homeRemoteOnline = false;
    await expect(node.runOwnerAgentTurn("hello")).rejects.toThrow("assistant.homeOffline");
  });

  it("sets assistantProxied on homeRemote status when online", () => {
    const status = node.getConnectionStatus();
    expect(status.homeRemote?.assistantProxied).toBe(true);
    expect(status.homeRemote?.paired).toBe(true);
  });
});
