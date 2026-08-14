/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChainInputDeliveries } from "../../src/components/ChainInputDeliveries.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

afterEach(() => cleanup());

describe("ChainInputDeliveries (Phase 59D)", () => {
  it("renders delivery chips and retries failed rows", () => {
    const onRetry = vi.fn();
    render(
      <I18nTestProvider locale="en">
        <ChainInputDeliveries
          attachments={[
            {
              sourceRelativePath: "imports/a/brief.pdf",
              label: "brief",
              fileName: "brief.pdf",
            },
          ]}
          deliveries={[
            {
              chainId: "chain_1",
              workerPeerId: "envoy_agent_worker_long",
              sourceRelativePath: "imports/a/brief.pdf",
              phase: "failed",
              error: "offline",
              updatedAt: "2026-08-14T12:00:00.000Z",
            },
            {
              chainId: "chain_1",
              workerPeerId: "envoy_agent_worker_long",
              sourceRelativePath: "imports/a/sales.csv",
              phase: "verified",
              contentHash: "h",
              updatedAt: "2026-08-14T12:00:00.000Z",
            },
          ]}
          allowRetry
          onRetry={onRetry}
        />
      </I18nTestProvider>,
    );
    expect(screen.getByTestId("chain-input-deliveries")).toBeTruthy();
    expect(screen.getByText(/Failed/)).toBeTruthy();
    expect(screen.getByText(/Delivered/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("chain-input-delivery-retry"));
    expect(onRetry).toHaveBeenCalledWith({
      workerPeerId: "envoy_agent_worker_long",
      sourceRelativePath: "imports/a/brief.pdf",
    });
  });

  it("offers Retry for stale pending deliveries", () => {
    const onRetry = vi.fn();
    render(
      <I18nTestProvider locale="en">
        <ChainInputDeliveries
          deliveries={[
            {
              chainId: "chain_1",
              workerPeerId: "w1",
              sourceRelativePath: "imports/a/brief.pdf",
              phase: "pending",
              updatedAt: "2020-01-01T00:00:00.000Z",
            },
          ]}
          allowRetry
          onRetry={onRetry}
        />
      </I18nTestProvider>,
    );
    fireEvent.click(screen.getByTestId("chain-input-delivery-retry"));
    expect(onRetry).toHaveBeenCalledWith({
      workerPeerId: "w1",
      sourceRelativePath: "imports/a/brief.pdf",
    });
  });

  it("hides Retry for fresh pending deliveries", () => {
    render(
      <I18nTestProvider locale="en">
        <ChainInputDeliveries
          deliveries={[
            {
              chainId: "chain_1",
              workerPeerId: "w1",
              sourceRelativePath: "imports/a/brief.pdf",
              phase: "pending",
              updatedAt: new Date().toISOString(),
            },
          ]}
          allowRetry
          onRetry={vi.fn()}
        />
      </I18nTestProvider>,
    );
    expect(screen.queryByTestId("chain-input-delivery-retry")).toBeNull();
  });
});
