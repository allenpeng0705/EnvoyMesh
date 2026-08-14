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
  it("shows fleet readiness checklist with Discover CTA when the pool is empty", async () => {
    const { ChainStartDialog } = await import("../../src/components/ChainStartDialog.js");
    const onOpenDiscover = vi.fn();
    const onClose = vi.fn();
    renderDialog(
      <ChainStartDialog
        goal="Research local LLMs"
        onClose={onClose}
        onOpenDiscover={onOpenDiscover}
        localJoinEnabled={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("fleet-readiness-panel")).toBeTruthy();
      expect(screen.getByTestId("chain-start-no-workers")).toBeTruthy();
    });
    expect(mocks.chainPreviewGoal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("fleet-readiness-cta-bonds"));
    expect(onClose).toHaveBeenCalled();
    expect(onOpenDiscover).toHaveBeenCalled();
    expect(mocks.chainStartFromGoal).not.toHaveBeenCalled();
  });

  it("shows readiness after preview when every subtask has 0 workers", async () => {
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
    renderDialog(
      <ChainStartDialog
        goal="Research local LLMs"
        onClose={() => undefined}
        onOpenDiscover={onOpenDiscover}
        localJoinEnabled={true}
        engineReady={true}
        bondedPeerCount={1}
        workerCandidates={[
          {
            bond: {
              peerOwnerId: "envoy:owner:bob",
              level: "direct",
              createdAt: new Date().toISOString(),
            },
            card: {
              ownerId: "envoy:owner:bob",
              displayName: "Bob",
              sourceAgentPeerId: "envoy_agent_bob",
              membership: ["task.execute", "agent-network-worker"],
              cachedAt: new Date().toISOString(),
            },
            health: {
              status: "ready",
              cardStatus: "ready",
              onlineStatus: "online",
              optIn: true,
              capabilityCount: 2,
              label: "Ready",
            },
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("chain-start-no-workers")).toBeTruthy();
      expect(screen.getByTestId("fleet-readiness-panel")).toBeTruthy();
    });
    expect(mocks.chainPreviewGoal).toHaveBeenCalled();
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
      <ChainStartDialog
        goal="Research local LLMs"
        onClose={onClose}
        onStarted={onStarted}
        localJoinEnabled={true}
        engineReady={true}
        bondedPeerCount={1}
      />,
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
      <ChainStartDialog
        goal="Research local LLMs"
        onClose={() => undefined}
        onStarted={() => undefined}
        localJoinEnabled={true}
        engineReady={true}
        bondedPeerCount={1}
      />,
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

  it("disables Start when local Join is on but the engine is down", async () => {
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
    renderDialog(
      <ChainStartDialog
        goal="Research local LLMs"
        onClose={() => undefined}
        localJoinEnabled={true}
        engineReady={false}
        bondedPeerCount={1}
        workerCandidates={[
          {
            bond: {
              peerOwnerId: "envoy:owner:bob",
              level: "direct",
              createdAt: new Date().toISOString(),
            },
            card: {
              ownerId: "envoy:owner:bob",
              displayName: "Bob",
              sourceAgentPeerId: "envoy_agent_bob",
              membership: ["task.execute", "agent-network-worker"],
              cachedAt: new Date().toISOString(),
            },
            health: {
              status: "ready",
              cardStatus: "ready",
              onlineStatus: "online",
              optIn: true,
              capabilityCount: 2,
              label: "Ready",
            },
          },
        ]}
      />,
    );
    await waitFor(() => {
      const btn = screen.getByTestId("chain-start-confirm") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.title).toMatch(/ready/i);
    });
    expect(mocks.chainStartFromGoal).not.toHaveBeenCalled();
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
        localJoinEnabled={true}
        engineReady={true}
        bondedPeerCount={1}
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
