/**
 * @vitest-environment jsdom
 *
 * Settings WAN invite soft-gate: reservation chip + wait hint + force unlocks mint.
 */
import React, { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WanCircuitReservationSoftGate } from "../../src/components/settings/WanCircuitReservationSoftGate.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

function SoftGateHarness({
  initialState,
  live = false,
}: {
  initialState: string;
  live?: boolean;
}) {
  const [force, setForce] = useState(false);
  const ready = initialState === "reserved" || live;
  const canMint = ready || force;
  return (
    <I18nTestProvider locale="en">
      <WanCircuitReservationSoftGate
        chip={{ state: initialState, live, lastError: initialState === "failed" ? "relay down" : undefined }}
        ready={ready}
        forceWithoutReservation={force}
        onForceChange={setForce}
        reservationLabel="Circuit reservation"
        waitHint="Wait until RESERVED"
        forceLabel="Advanced: mint without reservation"
        liveLabel="live slot held"
      />
      <button type="button" data-testid="show-wan-invite-qr" disabled={!canMint}>
        Show WAN invite QR
      </button>
    </I18nTestProvider>
  );
}

afterEach(() => cleanup());

describe("WanCircuitReservationSoftGate (Settings soft-gate)", () => {
  it("shows PENDING chip, wait hint, and disables mint until force", () => {
    render(<SoftGateHarness initialState="pending" />);
    expect(screen.getByTestId("circuit-reservation-chip").textContent).toMatch(/PENDING/i);
    expect(screen.getByTestId("wan-invite-wait-hint")).toBeDefined();
    const mint = screen.getByTestId("show-wan-invite-qr") as HTMLButtonElement;
    expect(mint.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("wan-force-without-reservation"));
    expect(mint.disabled).toBe(false);
  });

  it("enables mint when reserved and hides wait hint", () => {
    render(<SoftGateHarness initialState="reserved" live />);
    expect(screen.getByTestId("circuit-reservation-chip").textContent).toMatch(/RESERVED/i);
    expect(screen.getByTestId("circuit-reservation-chip").textContent).toMatch(/live slot held/i);
    expect(screen.queryByTestId("wan-invite-wait-hint")).toBeNull();
    expect((screen.getByTestId("show-wan-invite-qr") as HTMLButtonElement).disabled).toBe(false);
  });

  it("surfaces failed state and lastError", () => {
    render(<SoftGateHarness initialState="failed" />);
    expect(screen.getByTestId("circuit-reservation-chip").textContent).toMatch(/FAILED/i);
    expect(screen.getByTestId("circuit-reservation-chip").textContent).toMatch(/relay down/i);
  });
});
