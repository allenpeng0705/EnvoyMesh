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
const codingRespondToPermission = vi.fn();
const codingRespondToUserQuestion = vi.fn();
const onHandlers = new Map<string, Set<(payload: unknown) => void>>();

const mockNodeService = {
  ...partialNodeService({
    askCodingHarness,
    probeExtAgent,
    codingRespondToPermission,
    codingRespondToUserQuestion,
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

function emitCodingPermission(payload: unknown) {
  for (const handler of onHandlers.get("coding:permission") ?? []) {
    handler(payload);
  }
}

function emitCodingUserQuestion(payload: unknown) {
  for (const handler of onHandlers.get("coding:user_question") ?? []) {
    handler(payload);
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

  it("shows the tool prompt for this session and answers it through the coding RPC", async () => {
    probeExtAgent.mockResolvedValue({
      reachable: true,
      installState: "installed",
      installGuide: { installed: true, steps: [] },
    });
    codingRespondToPermission.mockResolvedValue({
      requestId: "req-1",
      delivered: true,
    });

    renderWithI18n(
      <ExtAgentCodingPanel
        harness="cursor"
        cwd="/tmp/proj"
        sessionId="sess-perm"
      />,
    );

    await waitFor(() =>
      expect(
        screen
          .getByTestId("ext-agent-coding-panel")
          .getAttribute("data-streaming"),
      ).toBe("false"),
    );

    emitCodingPermission({
      requestId: "req-1",
      sessionId: "sess-perm",
      toolName: "bash",
      description: "The agent asks to run this tool.",
      args: { command: "rm -rf build" },
      preview: "--- a/build.ts\n@@ edit @@\n- old\n+ new",
      timeoutMs: 240_000,
    });

    expect(await screen.findByText("bash")).toBeTruthy();
    expect(screen.getByText("The agent asks to run this tool.")).toBeTruthy();
    // The preview is the part a user actually judges, so it must be drawn.
    expect(screen.getByText(/rm -rf build|--- a\/build\.ts/)).toBeTruthy();

    fireEvent.click(screen.getByText("Allow"));

    // Answered through the *coding* RPC: the EH one would report `delivered:false` here and
    // leave the agent waiting out its timeout.
    await waitFor(() =>
      expect(codingRespondToPermission).toHaveBeenCalledWith({
        requestId: "req-1",
        allowed: true,
      }),
    );
    // Answering dismisses the card; a prompt that stayed would be a button that does nothing.
    await waitFor(() => expect(screen.queryByText("bash")).toBeNull());
  });

  it("shows an ask_user card and answers through codingRespondToUserQuestion", async () => {
    probeExtAgent.mockResolvedValue({
      reachable: true,
      installState: "installed",
      installGuide: { installed: true, steps: [] },
    });
    codingRespondToUserQuestion.mockResolvedValue({
      requestId: "q-1",
      delivered: true,
    });

    renderWithI18n(
      <ExtAgentCodingPanel
        harness="cursor"
        cwd="/tmp/proj"
        sessionId="sess-ask"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("ext-agent-coding-panel")).toBeTruthy(),
    );

    emitCodingUserQuestion({
      requestId: "q-1",
      sessionId: "sess-ask",
      prompt: "Which files?",
      options: ["a.ts", "b.ts"],
      multiple: true,
      timeoutMs: 120_000,
      kind: "ask",
    });

    expect(await screen.findByText("Which files?")).toBeTruthy();
    fireEvent.click(screen.getByTestId("eh-question-option-0"));
    fireEvent.click(screen.getByTestId("eh-question-option-1"));
    fireEvent.click(screen.getByTestId("eh-question-confirm"));

    await waitFor(() =>
      expect(codingRespondToUserQuestion).toHaveBeenCalledWith({
        requestId: "q-1",
        value: "a.ts, b.ts",
        optionIndexes: [0, 1],
      }),
    );
  });

  it("ignores a tool prompt belonging to another session", async () => {
    probeExtAgent.mockResolvedValue({
      reachable: true,
      installState: "installed",
      installGuide: { installed: true, steps: [] },
    });

    renderWithI18n(
      <ExtAgentCodingPanel
        harness="cursor"
        cwd="/tmp/proj"
        sessionId="sess-mine"
      />,
    );

    await waitFor(() =>
      expect(
        screen
          .getByTestId("ext-agent-coding-panel")
          .getAttribute("data-streaming"),
      ).toBe("false"),
    );

    emitCodingPermission({
      requestId: "req-other",
      sessionId: "sess-someone-else",
      toolName: "bash",
      description: "The agent asks to run this tool.",
      args: {},
      timeoutMs: 240_000,
    });

    // Several Coding tasks can be open at once and the event is broadcast, so a prompt from
    // another session must not put a card in front of this conversation.
    expect(screen.queryByText("bash")).toBeNull();
    expect(codingRespondToPermission).not.toHaveBeenCalled();
  });
});
