/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

const mocks = vi.hoisted(() => {
  const chainPreviewGoal = vi.fn();
  const chainStartFromGoal = vi.fn();
  const chainSaveRecipe = vi.fn();
  const chainGetDefaults = vi.fn();
  const showToast = vi.fn();
  return {
    chainPreviewGoal,
    chainStartFromGoal,
    chainSaveRecipe,
    chainGetDefaults,
    showToast,
    nodeService: {
      chainPreviewGoal,
      chainStartFromGoal,
      chainSaveRecipe,
      chainGetDefaults,
    },
  };
});

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mocks.nodeService,
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: mocks.showToast, toasts: [] }),
  useToastOptional: () => ({ showToast: mocks.showToast }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function renderDialog(ui: React.ReactElement) {
  return render(<I18nTestProvider locale="en">{ui}</I18nTestProvider>);
}

beforeEach(() => {
  mocks.chainPreviewGoal.mockReset();
  mocks.chainStartFromGoal.mockReset();
  mocks.chainSaveRecipe.mockReset();
  mocks.showToast.mockReset();
  mocks.chainGetDefaults.mockReset();
  mocks.chainGetDefaults.mockResolvedValue({
    defaults: { awardMode: "direct", showCostUi: false, iterationMaxRounds: 1 },
  });
});

afterEach(() => {
  cleanup();
});

describe("ChainStartDialog", () => {
  it("blocks start and shows Discover CTA when every subtask has 0 workers", async () => {
    const { ChainStartDialog } = await import("../../src/components/ChainStartDialog.js");
    mocks.chainPreviewGoal.mockResolvedValue({
      ok: true,
      subtasks: [
        {
          subtaskId: "st1",
          depth: 0,
          requiredSkill: "task.execute",
          objective: "Do the thing",
          workerCount: 0,
        },
      ],
      diagnostics: ["No workers for `task.execute`"],
    });
    const onOpenDiscover = vi.fn();
    const onClose = vi.fn();
    renderDialog(
      <ChainStartDialog goal="Research local LLMs" onClose={onClose} onOpenDiscover={onOpenDiscover} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("chain-start-no-workers")).toBeTruthy();
    });
    expect(screen.getByText(/No workers found/i)).toBeTruthy();

    const startBtn = screen.getByTestId("chain-start-confirm") as HTMLButtonElement;
    await waitFor(() => {
      expect(startBtn.disabled).toBe(true);
    });

    fireEvent.click(screen.getByTestId("chain-start-open-discover"));
    expect(onClose).toHaveBeenCalled();
    expect(onOpenDiscover).toHaveBeenCalled();
    expect(mocks.chainStartFromGoal).not.toHaveBeenCalled();
  });

  it("allows start when at least one worker is available", async () => {
    const { ChainStartDialog } = await import("../../src/components/ChainStartDialog.js");
    mocks.chainPreviewGoal.mockResolvedValue({
      ok: true,
      subtasks: [
        {
          subtaskId: "st1",
          depth: 0,
          requiredSkill: "task.execute",
          objective: "Do the thing",
          workerCount: 2,
        },
      ],
    });
    mocks.chainStartFromGoal.mockResolvedValue({ ok: true, chainId: "chain_1" });
    const onStarted = vi.fn();
    const onClose = vi.fn();
    renderDialog(
      <ChainStartDialog goal="Research local LLMs" onClose={onClose} onStarted={onStarted} />,
    );

    const startBtn = await waitFor(() => {
      const btn = screen.getByTestId("chain-start-confirm") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      return btn;
    });
    fireEvent.click(startBtn);
    await waitFor(() => {
      expect(mocks.chainStartFromGoal).toHaveBeenCalled();
      expect(onStarted).toHaveBeenCalledWith("chain_1");
    });
    expect(mocks.chainStartFromGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: "Research local LLMs",
        iterationMaxRounds: 1,
        plannedSubtasks: [
          expect.objectContaining({
            subtaskId: "st1",
            requiredSkill: "task.execute",
            objective: "Do the thing",
          }),
        ],
      }),
    );
  });

  it("passes selected iterationMaxRounds on start", async () => {
    const { ChainStartDialog } = await import("../../src/components/ChainStartDialog.js");
    mocks.chainPreviewGoal.mockResolvedValue({
      ok: true,
      subtasks: [
        {
          subtaskId: "st1",
          depth: 1,
          requiredSkill: "task.execute",
          objective: "Do the thing",
          workerCount: 1,
        },
      ],
    });
    mocks.chainStartFromGoal.mockResolvedValue({ ok: true, chainId: "chain_2" });
    renderDialog(
      <ChainStartDialog goal="Research local LLMs" onClose={() => undefined} onStarted={() => undefined} />,
    );
    await waitFor(() => {
      expect((screen.getByTestId("chain-start-confirm") as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByText(/Job settings/i));
    fireEvent.change(screen.getByTestId("chain-start-iteration-rounds"), { target: { value: "2" } });
    await waitFor(() => {
      expect((screen.getByTestId("chain-start-iteration-rounds") as HTMLSelectElement).value).toBe("2");
    });
    fireEvent.click(screen.getByTestId("chain-start-confirm"));
    await waitFor(() => {
      expect(mocks.chainStartFromGoal).toHaveBeenCalledWith(
        expect.objectContaining({ iterationMaxRounds: 2, plannedSubtasks: expect.any(Array) }),
      );
    });
  });

  it("previews with assignmentMode from props and emphasizes no_role_peers", async () => {
    const { ChainStartDialog } = await import("../../src/components/ChainStartDialog.js");
    mocks.chainPreviewGoal.mockResolvedValue({
      ok: true,
      subtasks: [
        {
          subtaskId: "st1",
          depth: 0,
          requiredSkill: "task.execute",
          objective: "Do the thing",
          workerCount: 1,
        },
      ],
      planWarnings: [{ code: "no_role_peers", message: "No peers advertise roles" }],
    });
    renderDialog(
      <ChainStartDialog
        goal="Research local LLMs"
        assignmentMode="role"
        onClose={() => undefined}
      />,
    );
    await waitFor(() => {
      expect(mocks.chainPreviewGoal).toHaveBeenCalledWith(
        expect.objectContaining({ goal: "Research local LLMs", assignmentMode: "role" }),
      );
      expect(screen.getByTestId("chain-start-no-role-peers-lead")).toBeTruthy();
      expect(screen.getByTestId("chain-start-plan-warnings").className).toContain(
        "chain-start-plan-warnings--emphasize",
      );
    });
  });
});
