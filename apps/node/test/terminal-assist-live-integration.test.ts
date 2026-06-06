import { mkdtemp, readFileSync } from "node:fs/promises";
import { readFileSync as readFileSyncSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

import { TerminalAgentAssist } from "../src/terminal-agent-assist.js";
import { TerminalManager } from "../src/terminal-manager.js";

const LIVE = process.env.TERMINAL_ASSIST_LIVE === "1";

describe.skipIf(!LIVE)("TerminalAgentAssist live integration", () => {
  let profileDir: string;
  let manager: TerminalManager;
  let assist: TerminalAgentAssist;
  let sessionId: string;

  beforeEach(async () => {
    const cfgPath = join(process.cwd(), "apps/node/data/default/node-config.json");
    const cfg = JSON.parse(readFileSyncSync(cfgPath, "utf8")) as {
      modelProviders: import("@envoymesh/api").ModelProviderConfig;
      terminalAutoRunPolicy?: import("@envoymesh/api").TerminalAutoRunPolicy;
    };

    profileDir = await mkdtemp(join(tmpdir(), "envoy-term-live-"));
    manager = new TerminalManager({ profileDir });
    assist = new TerminalAgentAssist({
      manager,
      getModelProviders: async () => cfg.modelProviders,
      getAssistSettings: async () => ({
        chatModelName: cfg.modelProviders.modelName,
        terminalAutoRunPolicy: cfg.terminalAutoRunPolicy ?? "always-confirm",
      }),
    });
    const created = await manager.createTerminalSession({ title: "Live assist" });
    sessionId = created.sessionId;
  });

  afterEach(async () => {
    await manager.closeTerminalSession({ sessionId });
  });

  it("proposes openclaw version check via configured chat model", async () => {
    const proposal = await assist.runFromNaturalLanguage({
      sessionId,
      prompt: "check openclaw version",
    });
    expect(proposal.command.toLowerCase()).toMatch(/openclaw/);
  }, 60_000);
});
