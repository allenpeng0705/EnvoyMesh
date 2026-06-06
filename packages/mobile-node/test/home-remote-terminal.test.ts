import { beforeEach, describe, expect, it, vi } from "vitest";

import { MobileNode, type MobileNodeConfig } from "../src/index.js";

function makeConfig(): MobileNodeConfig {
  return {
    profileDir: "/test-profile",
    relayUrls: ["ws://relay.example.com:9000"],
    modelProviders: { mode: "mock", modelName: "test-model" },
  };
}

describe("MobileNode home-remote terminal integration (mock home)", () => {
  let node: MobileNode;
  let homeRemoteCall: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    node = new MobileNode(makeConfig());
    await node.initStandalone("/test-profile");
    node.state.sharedIdentity = true;
    node.state.homeNodePeerId = "envoy_home_peer";
    (node as unknown as { _homeRemoteOnline: boolean })._homeRemoteOnline = true;

    homeRemoteCall = vi.fn(async (method: string, params: Record<string, unknown>) => {
      switch (method) {
        case "listTerminalSessions":
          return [{ sessionId: "term-1", title: "Home shell", state: "running", cwd: "/home", shell: "/bin/bash" }];
        case "createTerminalSession":
          return {
            sessionId: "term-new",
            title: (params.title as string) ?? "Shell",
            state: "running",
            cwd: "/home",
            shell: "/bin/bash",
          };
        case "terminalAttach":
          return {
            wsUrl: "ws://127.0.0.1:3031/ws/terminal/term-new?token=attach-secret",
            token: "attach-secret",
          };
        case "terminalRunFromNaturalLanguage":
          return {
            proposalId: "prop-1",
            sessionId: params.sessionId,
            command: "ls -la",
            riskTier: "safe",
            requiresConfirmation: false,
            createdAt: new Date().toISOString(),
          };
        case "terminalExecuteProposal":
          return undefined;
        default:
          throw new Error(`unexpected method ${method}`);
      }
    });

    vi.spyOn(node as unknown as { _homeRemoteCall: typeof homeRemoteCall }, "_homeRemoteCall").mockImplementation(
      homeRemoteCall,
    );
  });

  it("paired mobile lists and creates sessions on home only (manual shell path)", async () => {
    const sessions = await node.listTerminalSessions();
    expect(sessions).toHaveLength(1);
    expect(homeRemoteCall).toHaveBeenCalledWith("listTerminalSessions", {});

    const created = await node.createTerminalSession({ title: "Remote SSH" });
    expect(created.sessionId).toBe("term-new");
    expect(homeRemoteCall).toHaveBeenCalledWith("createTerminalSession", { title: "Remote SSH" });

    const attach = await node.terminalAttach({ sessionId: created.sessionId });
    expect(attach.wsUrl).toContain("term-new");
    expect(homeRemoteCall).toHaveBeenCalledWith("terminalAttach", { sessionId: "term-new" });
  });

  it("paired mobile Agent mode NL → confirm executes on home PTY path", async () => {
    const proposal = await node.terminalRunFromNaturalLanguage({
      sessionId: "term-new",
      prompt: "list files in this directory",
    });
    expect(proposal.command).toBe("ls -la");
    expect(homeRemoteCall).toHaveBeenCalledWith("terminalRunFromNaturalLanguage", {
      sessionId: "term-new",
      prompt: "list files in this directory",
    });

    await node.terminalExecuteProposal({
      sessionId: "term-new",
      proposalId: proposal.proposalId,
    });
    expect(homeRemoteCall).toHaveBeenCalledWith("terminalExecuteProposal", {
      sessionId: "term-new",
      proposalId: "prop-1",
    });
  });

  it("requires pairing before terminal RPC", async () => {
    const unpaired = new MobileNode(makeConfig());
    await unpaired.initStandalone("/unpaired-profile");
    await expect(unpaired.listTerminalSessions()).rejects.toThrow("terminal.pairHomeRequired");
  });

  it("opens home terminal tunnel via homeTerminalWsOpen", async () => {
    const openSpy = vi
      .spyOn(node as unknown as { _ensureHomeRemote: () => { openTerminalTunnel: (p: string) => Promise<{ ok: boolean }> } }, "_ensureHomeRemote")
      .mockReturnValue({
        openTerminalTunnel: vi.fn().mockResolvedValue({ ok: true }),
      } as never);

    const result = await node.homeTerminalWsOpen({ pathWithQuery: "/ws/terminal/term-1?token=tok" });
    expect(result.ok).toBe(true);
    expect(openSpy.mock.results[0]?.value.openTerminalTunnel).toHaveBeenCalledWith(
      "/ws/terminal/term-1?token=tok",
    );
  });
});
