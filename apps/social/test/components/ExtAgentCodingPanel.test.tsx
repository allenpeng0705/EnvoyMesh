/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { ExtAgentCodingPanel } from "../../src/components/views/ExtAgentCodingPanel.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { partialNodeService } from "../helpers/node-service-mock.js";

const askCodingHarness = vi.fn();
const probeExtAgent = vi.fn();
const onHandlers = new Map<string, Set<(payload: unknown) => void>>();

const mockNodeService = {
  ...partialNodeService({
    askCodingHarness,
    probeExtAgent,
    isConnected: true,
  }),
  // `on` deliberately stays outside `partialNodeService`: NodeServiceClient.on is
  // generic (`<K extends keyof NodeServiceEvents>(event: K, handler: (data: NodeServiceEvents[K]) => void)`),
  // and a dispatcher that stores `unknown`-taking handlers cannot be assigned to
  // that signature without a cast. The returned object is otherwise identical.
  on(event: string, handler: (payload: unknown) => void) {
    let set = onHandlers.get(event);
    if (!set) {
      set = new Set();
      onHandlers.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  },
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
}));

function emitTimeline(update: unknown) {
  for (const handler of onHandlers.get("eh:timeline") ?? []) {
    handler(update);
  }
}

describe("CodingHarnessPanel (ExtAgentCodingPanel alias)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    onHandlers.clear();
  });

  it("asks via askCodingHarness for codex and streams from eh:timeline", async () => {
    probeExtAgent.mockResolvedValue({
      reachable: true,
      installState: "installed",
      installGuide: { installed: true, steps: [] },
    });
    let resolveAsk!: (v: string) => void;
    askCodingHarness.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveAsk = resolve;
        }),
    );

    renderWithI18n(
      <ExtAgentCodingPanel
        harness="codex"
        cwd="/tmp/proj"
        sessionId="sess-stream"
      />,
    );

    await waitFor(() =>
      expect(
        screen
          .getByTestId("ext-agent-coding-panel")
          .getAttribute("data-streaming"),
      ).toBe("true"),
    );

    // The panel now delegates its input to the shared EH composer
    // (`EhChatComposer` → `ChatComposer`), which carries no per-panel testid;
    // its placeholder is the panel's `Message {name}…` copy. Submitting the
    // panel's own <form> is the same path its send button takes.
    const input = screen.getByPlaceholderText(/Message Codex/);
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() =>
      expect(askCodingHarness).toHaveBeenCalledWith({
        codingSessionId: "sess-stream",
        harness: "codex",
        prompt: "hello",
        cwd: "/tmp/proj",
        runtime: { permissionPolicy: "safe-only" },
      }),
    );

    emitTimeline({
      type: "upsert",
      revision: 1,
      item: {
        id: "turn:sess-stream:assistant",
        chatId: "__ext__:sess-stream",
        turnId: "sess-stream",
        type: "message",
        role: "assistant",
        text: "Hel",
        streaming: true,
        createdAt: "2026-09-11T00:00:00.000Z",
        updatedAt: "2026-09-11T00:00:00.000Z",
      },
    });

    await waitFor(() => {
      const rows = screen.getAllByTestId("ext-agent-coding-msg-assistant");
      expect(
        rows.some((el) => el.getAttribute("data-streaming") === "true"),
      ).toBe(true);
      expect(screen.getByText("Hel")).toBeTruthy();
    });

    resolveAsk("Hello final");
    await waitFor(() => {
      expect(screen.getByText("Hello final")).toBeTruthy();
    });
  });

  it("asks cursor via askCodingHarness without Ext Agent bridge calls", async () => {
    probeExtAgent.mockResolvedValue({
      reachable: true,
      installState: "installed",
      installGuide: { installed: true, steps: [] },
    });
    askCodingHarness.mockResolvedValue("ok from cursor");

    renderWithI18n(
      <ExtAgentCodingPanel
        harness="cursor"
        cwd="/tmp/proj"
        sessionId="sess-oneshot"
      />,
    );

    await waitFor(() =>
      expect(
        screen
          .getByTestId("ext-agent-coding-panel")
          .getAttribute("data-streaming"),
      ).toBe("false"),
    );

    const input = screen.getByPlaceholderText(/Message Cursor/);
    fireEvent.change(input, { target: { value: "ping" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() =>
      expect(askCodingHarness).toHaveBeenCalledWith({
        codingSessionId: "sess-oneshot",
        harness: "cursor",
        prompt: "ping",
        cwd: "/tmp/proj",
        runtime: { permissionPolicy: "safe-only" },
      }),
    );
  });
});
