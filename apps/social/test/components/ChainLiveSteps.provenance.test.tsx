/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChainLiveSteps } from "../../src/components/ChainLiveSteps.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

const chainGetStepProvenance = vi.fn();

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    chainGetStepProvenance,
    on: () => () => {},
  }),
}));

describe("ChainLiveSteps execution details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainGetStepProvenance.mockResolvedValue({
      chainId: "c1",
      subtaskId: "s1",
      selectedAttemptId: "a1",
      summary: {
        attemptCount: 1,
        workerPeerId: "envoy_worker_abcdef123456",
        state: "running",
        lastReason: "heartbeat_ok",
      },
      events: [
        {
          eventId: "e1",
          seq: 1,
          at: "2030-01-01T00:00:00.000Z",
          type: "attempt.awarded",
          attemptId: "a1",
          workerPeerId: "envoy_worker_abcdef123456",
          transportPath: "lan_direct",
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("lazy-loads provenance when Execution details is opened", async () => {
    render(
      <I18nTestProvider locale="en">
        <ChainLiveSteps
          chainId="c1"
          provenanceSummary={[
            {
              subtaskId: "s1",
              selectedAttemptId: "a1",
              workerPeerId: "envoy_worker_abcdef123456",
              attemptCount: 1,
              state: "running",
            },
          ]}
          steps={[
            {
              subtaskId: "s1",
              objective: "Research market risks",
              state: "running",
              workerPeerId: "envoy_worker_abcdef123456",
              attemptCount: 1,
              selectedAttemptId: "a1",
            },
          ]}
        />
      </I18nTestProvider>,
    );

    expect(screen.getByTestId("chain-step-attempt-count-s1").textContent).toContain("1");
    fireEvent.click(screen.getByTestId("chain-step-execution-details-s1"));
    await waitFor(() => {
      expect(chainGetStepProvenance).toHaveBeenCalledWith({
        chainId: "c1",
        subtaskId: "s1",
      });
      expect(screen.getByTestId("chain-step-provenance-s1")).toBeDefined();
    });
    expect(screen.getByTestId("chain-step-provenance-events-s1").textContent).toContain(
      "attempt.awarded",
    );
  });
});
