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
  it("mounts with data-testid and renders gap rows under failing checklist", () => {
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
    expect(screen.getByTestId("fleet-readiness-gaps")).toBeTruthy();
    expect(screen.getByTestId("fleet-readiness-gap").getAttribute("data-reason")).toBe("join_off");

    fireEvent.click(screen.getByTestId("fleet-readiness-cta-peerJoin"));
    expect(onManageWorkers).toHaveBeenCalledTimes(1);
  });

  it("compact variant omits description but keeps panel test id", () => {
    renderWithI18n(
      <FleetReadinessPanel readiness={blockedReadiness} variant="compact" />,
    );
    expect(screen.getByTestId("fleet-readiness-panel").className).toContain(
      "fleet-readiness--compact",
    );
  });
});
