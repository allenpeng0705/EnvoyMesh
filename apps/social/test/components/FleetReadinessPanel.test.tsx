/**
 * @vitest-environment jsdom
 *
 * Phase 66A review — pin FleetReadinessPanel mount + gaps + CTA wiring.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { FleetReadinessPanel } from "../../src/components/FleetReadinessPanel.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import type { FleetReadinessResult } from "../../src/lib/fleet-readiness.js";
import type { FleetWorkerGap } from "../../src/lib/fleet-worker-gaps.js";

afterEach(() => {
  cleanup();
});

const blockedReadiness: FleetReadinessResult = {
  blocked: true,
  skipPreview: true,
  rows: [
    { id: "join", tone: "pass", action: "none" },
    { id: "engine", tone: "pass", action: "none" },
    { id: "bonds", tone: "pass", action: "none" },
    { id: "peerJoin", tone: "fail", action: "manageWorkers" },
    { id: "freshCard", tone: "warn", action: "refreshCards" },
    { id: "online", tone: "pass", action: "none" },
    { id: "otherReady", tone: "pass", action: "none" },
  ],
};

const gaps: FleetWorkerGap[] = [
  {
    peerOwnerId: "envoy:owner:bob",
    displayName: "Bob",
    reasonCode: "join_off",
    action: "manageWorkers",
  },
];

describe("FleetReadinessPanel", () => {
  it("mounts with data-testid and omits join_off gaps (peerJoin row covers that)", () => {
    const onManageWorkers = vi.fn();
    renderWithI18n(
      <FleetReadinessPanel
        readiness={blockedReadiness}
        workerGaps={gaps}
        onManageWorkers={onManageWorkers}
        onRefreshCards={() => undefined}
      />,
    );

    const panel = screen.getByTestId("fleet-readiness-panel");
    expect(panel.getAttribute("data-blocked")).toBe("true");
    expect(screen.getByTestId("fleet-readiness-row-peerJoin").getAttribute("data-tone")).toBe(
      "fail",
    );
    expect(screen.queryByTestId("fleet-readiness-gaps")).toBeNull();

    fireEvent.click(screen.getByTestId("fleet-readiness-cta-peerJoin"));
    expect(onManageWorkers).toHaveBeenCalledTimes(1);
  });

  it("renders actionable gaps (stale card) under failing checklist", () => {
    const onRefreshCards = vi.fn();
    renderWithI18n(
      <FleetReadinessPanel
        readiness={blockedReadiness}
        workerGaps={[
          {
            peerOwnerId: "envoy:owner:xf",
            displayName: "XiaoFeng",
            reasonCode: "stale_card",
            action: "refreshCards",
          },
        ]}
        onRefreshCards={onRefreshCards}
      />,
    );
    expect(screen.getByTestId("fleet-readiness-gaps")).toBeTruthy();
    expect(screen.getByTestId("fleet-readiness-gap").getAttribute("data-reason")).toBe(
      "stale_card",
    );
    fireEvent.click(screen.getByTestId("fleet-readiness-gap-cta-stale_card"));
    expect(onRefreshCards).toHaveBeenCalledTimes(1);
  });

  it("compact variant hides pass rows, otherReady noise, and uses step numbers", () => {
    renderWithI18n(
      <FleetReadinessPanel
        readiness={{
          ...blockedReadiness,
          rows: [
            { id: "join", tone: "pass", action: "none" },
            { id: "engine", tone: "fail", action: "openSettingsAi" },
            { id: "online", tone: "fail", action: "retryProbe" },
            { id: "otherReady", tone: "fail", action: "openDiscover" },
          ],
        }}
        variant="compact"
        onOpenSettingsAi={() => undefined}
        onRetryProbe={() => undefined}
        onOpenDiscover={() => undefined}
      />,
    );
    expect(screen.getByTestId("fleet-readiness-panel").className).toContain(
      "fleet-readiness--compact",
    );
    expect(screen.queryByTestId("fleet-readiness-row-join")).toBeNull();
    expect(screen.queryByTestId("fleet-readiness-row-otherReady")).toBeNull();
    expect(screen.getByTestId("fleet-readiness-row-engine")).toBeTruthy();
    expect(screen.getByTestId("fleet-readiness-row-online")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });
});
