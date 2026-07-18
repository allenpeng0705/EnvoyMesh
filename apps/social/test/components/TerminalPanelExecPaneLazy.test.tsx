/**
 * @vitest-environment jsdom
 *
 * Verifies that the TerminalPanel exec-pane xterm is constructed lazily —
 * only when the owner enables the exec pane, not on every mount. The
 * previous behaviour created a Terminal + FitAddon on every panel mount
 * even when execPaneEnabled was false (the default), which cost a
 * measurable chunk of the Terminals-tab open time.
 *
 * Mocking strategy: replace @xterm/xterm with a stub class that
 * constructor-spies every instantiation. Mock @xterm/addon-fit
 * similarly. Everything else in the panel runs real code (refs,
 * lifecycle).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// vi.mock factories are hoisted by Vitest. Define the spies + classes
// in vi.hoisted() so the test body can read them AFTER hoisting is done.
const { terminalCtorSpy, fitAddonCtorSpy, MockTerminal, MockFitAddon } =
  vi.hoisted(() => {
    const terminalCtorSpy = vi.fn();
    const fitAddonCtorSpy = vi.fn();

    class MockTerminal {
      cols = 80;
      rows = 24;
      options = { disableStdin: false } as { disableStdin: boolean };
      loadAddon = vi.fn();
      open = vi.fn();
      dispose = vi.fn();
      reset = vi.fn();
      write = vi.fn();
      writeln = vi.fn();
      focus = vi.fn();
      onData() {
        return { dispose: () => {} };
      }
      onExit() {
        return { dispose: () => {} };
      }
      constructor(opts: unknown) {
        terminalCtorSpy(opts);
      }
    }

    class MockFitAddon {
      fit = vi.fn();
      constructor() {
        fitAddonCtorSpy();
      }
    }

    return {
      terminalCtorSpy,
      fitAddonCtorSpy,
      MockTerminal,
      MockFitAddon,
    };
  });

vi.mock("@xterm/xterm", () => ({
  Terminal: MockTerminal,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: MockFitAddon,
}));

vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

vi.mock("../../src/components/terminals/TerminalAgentBar.js", () => ({
  TerminalAgentBar: () => null,
}));

// Mirror the e2e setup: jsdom doesn't have ResizeObserver (xterm's
// FitAddon needs it).
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    terminalAttach: vi.fn().mockResolvedValue({
      sessionId: "sess-1",
      token: "tok",
      wsUrl: "ws://127.0.0.1:3031/ws/terminal/sess-1?token=tok",
      cols: 80,
      rows: 24,
    }),
    terminalGetAssistState: vi.fn().mockResolvedValue({
      inlineSuggestEnabled: false,
      execPaneEnabled: false,
      agentModeDefault: false,
    }),
    getNodeConfig: vi.fn().mockResolvedValue({}),
    on: () => () => {},
  }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    connectionStatus: { homeRemote: { paired: false } },
  }),
}));

import type { TerminalSessionSummary } from "@envoymesh/api";
import { TerminalPanel } from "../../src/components/terminals/TerminalPanel.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

const stubSession: TerminalSessionSummary = {
  sessionId: "sess-1",
  title: "Test",
  cwd: "/tmp",
  shell: "/bin/bash",
  createdAt: "2026-07-18T09:00:00.000Z",
  state: "running",
  lastActivityAt: "2026-07-18T09:00:00.000Z",
  role: "interactive",
};

beforeEach(() => {
  terminalCtorSpy.mockClear();
  fitAddonCtorSpy.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("TerminalPanel — lazy exec-pane xterm construction", () => {
  it("does NOT construct an exec xterm on first mount (exec pane disabled)", () => {
    render(
      <I18nTestProvider>
        <TerminalPanel session={stubSession} active />
      </I18nTestProvider>,
    );

    // Sanity: the main Terminal WAS constructed (one per active panel).
    expect(terminalCtorSpy).toHaveBeenCalledTimes(1);
    expect(fitAddonCtorSpy).toHaveBeenCalledTimes(1);

    // Strong invariant (the actual perf win): the exec-pane xterm
    // was NOT constructed. Originally the effect ran unconditionally
    // on mount and created a second Terminal + FitAddon. With lazy
    // init, the count is exactly 1 (the main one).
    // cursorBlink=false in the exec opts is the discriminator.
    const execOpts = terminalCtorSpy.mock.calls.find(
      (args) => (args[0] as { cursorBlink?: boolean })?.cursorBlink === false,
    );
    expect(execOpts).toBeUndefined();
  });

  it("does NOT re-create terminals across re-render with no state change", () => {
    const { rerender } = render(
      <I18nTestProvider>
        <TerminalPanel session={stubSession} active />
      </I18nTestProvider>,
    );
    expect(terminalCtorSpy).toHaveBeenCalledTimes(1);

    rerender(
      <I18nTestProvider>
        <TerminalPanel session={stubSession} active />
      </I18nTestProvider>,
    );

    // No state change in props → React shouldn't re-create the main
    // terminal, and lazy-init must not create the exec one either.
    expect(terminalCtorSpy).toHaveBeenCalledTimes(1);
  });

  it("renders the exec-pane container even though the xterm is uninitialized", () => {
    render(
      <I18nTestProvider>
        <TerminalPanel session={stubSession} active />
      </I18nTestProvider>,
    );
    // The hidden container <div ref={execContainerRef}> must exist so
    // the user can re-enable the pane later.
    expect(document.querySelector(".terminal-exec-pane-xterm")).not.toBeNull();
  });
});
