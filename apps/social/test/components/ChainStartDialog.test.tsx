/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { ChainStartDialog } from "../../src/components/ChainStartDialog.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const chainPreviewGoal = vi.fn();
const chainStartFromGoal = vi.fn();
const chainSaveRecipe = vi.fn();
const showToast = vi.fn();

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    chainPreviewGoal,
    chainStartFromGoal,
    chainSaveRecipe,
    chainGetDefaults: vi.fn().mockResolvedValue({
      defaults: { awardMode: "direct", showCostUi: false, iterationMaxRounds: 1 },
    }),
  }),
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast, toasts: [] }),
  useToastOptional: () => ({ showToast }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChainStartDialog", () => {
  it("blocks start and shows Discover CTA when every subtask has 0 workers", async () => {
    chainPreviewGoal.mockResolvedValue({
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
    renderWithI18n(
      <ChainStartDialog goal="Research local LLMs" onClose={onClose} onOpenDiscover={onOpenDiscover} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("chain-start-no-workers")).toBeTruthy();
    });
    expect(screen.getByText(/No workers found/i)).toBeTruthy();

    const startBtn = screen.getByTestId("chain-start-confirm") as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);

    fireEvent.click(screen.getByTestId("chain-start-open-discover"));
    expect(onClose).toHaveBeenCalled();
    expect(onOpenDiscover).toHaveBeenCalled();
    expect(chainStartFromGoal).not.toHaveBeenCalled();
  });

  it("allows start when at least one worker is available", async () => {
    chainPreviewGoal.mockResolvedValue({
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
    chainStartFromGoal.mockResolvedValue({ ok: true, chainId: "chain_1" });
    const onStarted = vi.fn();
    const onClose = vi.fn();
    renderWithI18n(
      <ChainStartDialog goal="Research local LLMs" onClose={onClose} onStarted={onStarted} />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("chain-start-no-workers")).toBeNull();
    });
    const startBtn = screen.getByTestId("chain-start-confirm") as HTMLButtonElement;
    expect(startBtn.disabled).toBe(false);
    fireEvent.click(startBtn);
    await waitFor(() => {
      expect(chainStartFromGoal).toHaveBeenCalled();
      expect(onStarted).toHaveBeenCalledWith("chain_1");
    });
    expect(chainStartFromGoal).toHaveBeenCalledWith(
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
    chainPreviewGoal.mockResolvedValue({
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
    chainStartFromGoal.mockResolvedValue({ ok: true, chainId: "chain_2" });
    renderWithI18n(
      <ChainStartDialog goal="Research local LLMs" onClose={() => undefined} onStarted={() => undefined} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("chain-start-confirm")).toBeTruthy();
      expect((screen.getByTestId("chain-start-confirm") as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.change(screen.getByTestId("chain-start-iteration-rounds"), { target: { value: "2" } });
    await waitFor(() => {
      expect((screen.getByTestId("chain-start-iteration-rounds") as HTMLSelectElement).value).toBe("2");
    });
    fireEvent.click(screen.getByTestId("chain-start-confirm"));
    await waitFor(() => {
      expect(chainStartFromGoal).toHaveBeenCalledWith(
        expect.objectContaining({ iterationMaxRounds: 2, plannedSubtasks: expect.any(Array) }),
      );
    });
  });
});
