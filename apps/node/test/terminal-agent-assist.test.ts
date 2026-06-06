import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMockModelProvider, buildModelProviders } from "@envoymesh/models";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPty = {
  cols: 80,
  rows: 24,
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  onExit: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
};

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => mockPty),
}));

vi.mock("@envoymesh/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@envoymesh/models")>();
  return {
    ...actual,
    buildModelProviders: vi.fn((_config, _approved, _options) => [
      createMockModelProvider({
        responseText: JSON.stringify({
          command: "sudo reboot",
          rationale: "restart machine",
          riskTier: "safe",
        }),
      }),
    ]),
  };
});

import { TerminalAgentAssist } from "../src/terminal-agent-assist.js";
import { TerminalManager } from "../src/terminal-manager.js";

describe("TerminalAgentAssist", () => {
  let profileDir: string;
  let manager: TerminalManager;
  let assist: TerminalAgentAssist;
  let sessionId: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-term-agent-"));
    manager = new TerminalManager({ profileDir });
    assist = new TerminalAgentAssist({
      manager,
      getModelProviders: async () => ({ mode: "mock" }),
      getAssistSettings: async () => ({
        terminalAssistModelName: "mock-model",
        chatModelName: "mock-model",
        terminalAutoRunPolicy: "always-confirm",
      }),
    });
    const created = await manager.createTerminalSession({ title: "Assist test" });
    sessionId = created.sessionId;
    mockPty.write.mockClear();
  });

  afterEach(async () => {
    await manager.closeTerminalSession({ sessionId });
  });

  it("proposes commands from NL with deterministic destructive tier", async () => {
    const proposal = await assist.runFromNaturalLanguage({
      sessionId,
      prompt: "reboot the machine",
    });
    expect(proposal.command).toBe("sudo reboot");
    expect(proposal.riskTier).toBe("destructive");
    expect(proposal.requiresConfirmation).toBe(true);
  });

  it("uses chat model name when no terminal assist override is configured", async () => {
    vi.mocked(buildModelProviders).mockClear();
    const chatOnlyAssist = new TerminalAgentAssist({
      manager,
      getModelProviders: async () => ({ mode: "mock", modelName: "chat-model" }),
      getAssistSettings: async () => ({
        chatModelName: "chat-model",
        terminalAutoRunPolicy: "always-confirm",
      }),
    });
    await chatOnlyAssist.runFromNaturalLanguage({ sessionId, prompt: "reboot the machine" });
    expect(buildModelProviders).toHaveBeenCalledWith(
      { mode: "mock", modelName: "chat-model" },
      true,
      expect.objectContaining({
        trustedLocalAssist: true,
        modelNameOverride: "chat-model",
      }),
    );
  });

  it("does not fall back to OpenClaw when the assist model is denied", async () => {
    const askOpenClaw = vi.fn();
    const deniedAssist = new TerminalAgentAssist({
      manager,
      getModelProviders: async () => ({ mode: "disabled" }),
      getAssistSettings: async () => ({
        chatModelName: "mock-model",
        terminalAutoRunPolicy: "always-confirm",
      }),
      askOpenClaw,
    });
    await expect(
      deniedAssist.runFromNaturalLanguage({ sessionId, prompt: "list files" }),
    ).rejects.toThrow("terminal.agent.modelDisabled");
    expect(askOpenClaw).not.toHaveBeenCalled();
  });

  it("blocks execute without confirmed for destructive proposals", async () => {
    const proposal = await assist.runFromNaturalLanguage({
      sessionId,
      prompt: "reboot the machine",
    });
    await expect(
      assist.executeProposal({
        sessionId,
        proposalId: proposal.proposalId,
      }),
    ).rejects.toThrow("terminal.agent.confirmRequired");
    expect(mockPty.write).not.toHaveBeenCalled();
  });

  it("executes destructive proposals when confirmed", async () => {
    const proposal = await assist.runFromNaturalLanguage({
      sessionId,
      prompt: "reboot the machine",
    });
    await assist.executeProposal({
      sessionId,
      proposalId: proposal.proposalId,
      confirmed: true,
    });
    expect(mockPty.write).toHaveBeenCalledWith("sudo reboot\n");
  });

  it("ingests TERMINAL_CMD replies from EnvoyAI", async () => {
    const proposal = await assist.ingestAssistantReply(sessionId, "TERMINAL_CMD: git status");
    expect(proposal?.command).toBe("git status");
    const state = await assist.getAssistState(sessionId);
    expect(state.assistantProposal?.command).toBe("git status");
    expect(state.pendingProposal?.command).toBe("git status");
  });

  it("auto-runs only one safe command for casual NL when no goal loop is active", async () => {
    vi.mocked(buildModelProviders).mockReturnValueOnce([
      createMockModelProvider({
        responseText: JSON.stringify({
          command: "claude --help",
          rationale: "show help",
          riskTier: "safe",
        }),
      }),
    ]);
    const safeAssist = new TerminalAgentAssist({
      manager,
      getModelProviders: async () => ({ mode: "mock" }),
      getAssistSettings: async () => ({
        terminalAssistModelName: "mock-model",
        chatModelName: "mock-model",
        terminalAutoRunPolicy: "safe-only",
      }),
    });
    await safeAssist.runFromNaturalLanguage({ sessionId, prompt: "How to use claude code?" });
    expect(mockPty.write).toHaveBeenCalledTimes(1);
    expect(mockPty.write).toHaveBeenCalledWith("claude --help\n");
  });

  it("clearResumeGoal removes persisted resume banner state", async () => {
    const persistedAssist = new TerminalAgentAssist({
      manager,
      profileDir,
      initialPersistedSessions: {
        [sessionId]: {
          lastGoal: "check version",
          goalLoop: { goal: "check version", stepCount: 1, maxSteps: 10, suspended: true },
        },
      },
      getModelProviders: async () => ({ mode: "mock" }),
      getAssistSettings: async () => ({
        terminalAssistModelName: "mock-model",
        chatModelName: "mock-model",
        terminalAutoRunPolicy: "always-confirm",
      }),
    });
    const before = await persistedAssist.getAssistState(sessionId);
    expect(before.canResumeGoal).toBe(true);

    const after = await persistedAssist.clearResumeGoal({ sessionId });
    expect(after.canResumeGoal).toBe(false);
    expect(after.resumeGoal).toBeUndefined();
  });
});
