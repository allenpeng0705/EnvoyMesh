/**
 * @vitest-environment jsdom
 * E2E (UI integration): nested tmux/TmuxAI tip in TerminalPanel with mocked xterm + transport.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { TerminalSessionSummary } from "@envoymesh/api";
import { TERMINAL_NESTED_MULTIPLEXER_TIP_KEY } from "../../src/lib/storage.js";
import { TerminalPanel } from "../../src/components/terminals/TerminalPanel.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

type TransportCallbacks = {
  onData?: (data: Uint8Array) => void;
  onStatusChange?: (status: "connecting" | "open" | "closed" | "error") => void;
};

let transportCallbacks: TransportCallbacks = {};

vi.mock("@xterm/xterm", () => ({
  Terminal: class MockTerminal {
    cols = 80;
    rows = 24;
    open() {}
    loadAddon() {}
    dispose() {}
    reset() {}
    write() {}
    writeln() {}
    focus() {}
    onData() {
      return { dispose: () => {} };
    }
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class MockFitAddon {
    fit() {}
  },
}));

vi.mock("../../src/components/terminals/TerminalAgentBar.js", () => ({
  TerminalAgentBar: () => null,
}));

vi.mock("../../src/lib/terminal-ws-client.js", () => ({
  TerminalWsClient: class MockTerminalWsClient {
    constructor(opts: TransportCallbacks) {
      transportCallbacks = opts;
    }
    connect() {
      transportCallbacks.onStatusChange?.("open");
      transportCallbacks.onData?.(new TextEncoder().encode("launching tmux attach\n"));
    }
    close() {}
    sendInput() {}
    sendResize() {}
  },
  HomeRemoteTerminalClient: class MockHomeRemoteTerminalClient {
    constructor(opts: TransportCallbacks) {
      transportCallbacks = opts;
    }
    async connect() {
      transportCallbacks.onStatusChange?.("open");
      transportCallbacks.onData?.(new TextEncoder().encode("tmuxai started\n"));
    }
    close() {}
    sendInput() {}
    sendResize() {}
  },
  terminalPathFromAttachWsUrl: (url: string) => url,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    connectionStatus: { homeRemote: { paired: false } },
  }),
}));

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    terminalAttach: vi.fn().mockResolvedValue({
      sessionId: "sess-tip",
      token: "tok",
      wsUrl: "ws://127.0.0.1:3031/ws/terminal/sess-tip?token=tok",
      cols: 80,
      rows: 24,
    }),
    terminalGetAssistState: vi.fn().mockResolvedValue({
      inlineSuggestEnabled: false,
      agentModeDefault: false,
    }),
    on: () => () => {},
  }),
}));

const runningSession: TerminalSessionSummary = {
  sessionId: "sess-tip",
  title: "Tip test",
  cwd: "/tmp",
  shell: "/bin/bash",
  state: "running",
  createdAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  transportCallbacks = {};
  localStorage.clear();
});

beforeEach(() => {
  localStorage.clear();
});

describe("E2E TerminalPanel nested multiplexer tip", () => {
  it("shows one-time tip when transport output mentions tmux", async () => {
    renderWithI18n(<TerminalPanel session={runningSession} />);
    expect(await screen.findByText(/Nested tmux\/TmuxAI/i)).toBeDefined();
  });

  it("dismisses tip and persists dismissal", async () => {
    renderWithI18n(<TerminalPanel session={runningSession} />);
    const dismiss = await screen.findByRole("button", { name: /Got it/i });
    fireEvent.click(dismiss);
    await waitFor(() => {
      expect(screen.queryByText(/Nested tmux\/TmuxAI/i)).toBeNull();
    });
    expect(localStorage.getItem(TERMINAL_NESTED_MULTIPLEXER_TIP_KEY)).toBe("1");
  });

  it("does not show tip when previously dismissed", async () => {
    localStorage.setItem(TERMINAL_NESTED_MULTIPLEXER_TIP_KEY, "1");
    renderWithI18n(<TerminalPanel session={runningSession} />);
    await waitFor(() => {
      expect(transportCallbacks.onData).toBeDefined();
    });
    expect(screen.queryByText(/Nested tmux\/TmuxAI/i)).toBeNull();
  });
});
