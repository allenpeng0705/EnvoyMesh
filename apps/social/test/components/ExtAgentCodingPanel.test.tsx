/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { ExtAgentCodingPanel } from "../../src/components/views/ExtAgentCodingPanel.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const askExtAgent = vi.fn();
const probeExtAgent = vi.fn();
const setExtAgentProjectPath = vi.fn().mockResolvedValue({});
const onHandlers = new Map<string, Set<(payload: unknown) => void>>();

const mockNodeService = {
  askExtAgent,
  probeExtAgent,
  setExtAgentProjectPath,
  isConnected: true,
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

describe("ExtAgentCodingPanel streaming", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    onHandlers.clear();
    setExtAgentProjectPath.mockResolvedValue({});
  });

  it("passes streamSessionId for codex and shows streaming assistant from eh:timeline", async () => {
    probeExtAgent.mockResolvedValue({
      reachable: true,
      installState: "installed",
      installGuide: { installed: true, steps: [] },
    });
    let resolveAsk!: (v: string) => void;
    askExtAgent.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveAsk = resolve;
        }),
    );

    renderWithI18n(
      <ExtAgentCodingPanel harness="codex" cwd="/tmp/proj" sessionId="sess-stream" />,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("ext-agent-coding-panel").getAttribute("data-streaming"),
      ).toBe("true"),
    );

    fireEvent.change(screen.getByTestId("ext-agent-coding-input"), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByTestId("ext-agent-coding-send"));

    await waitFor(() =>
      expect(askExtAgent).toHaveBeenCalledWith({
        agentId: "codex",
        prompt: "hello",
        streamSessionId: "sess-stream",
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
      expect(rows.some((el) => el.getAttribute("data-streaming") === "true")).toBe(
        true,
      );
      expect(screen.getByText("Hel")).toBeTruthy();
    });

    resolveAsk("Hello final");
    await waitFor(() => {
      expect(screen.getByText("Hello final")).toBeTruthy();
    });
  });

  it("keeps one-shot harnesses without streamSessionId", async () => {
    probeExtAgent.mockResolvedValue({
      reachable: true,
      installState: "installed",
      installGuide: { installed: true, steps: [] },
    });
    askExtAgent.mockResolvedValue("ok from cursor");

    renderWithI18n(
      <ExtAgentCodingPanel harness="cursor" cwd="/tmp/proj" sessionId="sess-oneshot" />,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("ext-agent-coding-panel").getAttribute("data-streaming"),
      ).toBe("false"),
    );

    fireEvent.change(screen.getByTestId("ext-agent-coding-input"), {
      target: { value: "ping" },
    });
    fireEvent.click(screen.getByTestId("ext-agent-coding-send"));

    await waitFor(() =>
      expect(askExtAgent).toHaveBeenCalledWith({
        agentId: "cursor",
        prompt: "ping",
      }),
    );
  });
});
