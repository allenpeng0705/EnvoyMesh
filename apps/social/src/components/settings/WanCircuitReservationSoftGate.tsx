import type { CircuitReservationChipView } from "../../hooks/useCircuitReservationStatus.js";

/**
 * Settings WAN-invite soft-gate chrome: reservation chip, wait hint, optional force checkbox.
 * Mint button / expiry stay with the parent (QR flow).
 */
export function WanCircuitReservationSoftGate(props: {
  chip: CircuitReservationChipView | null;
  ready: boolean;
  forceWithoutReservation: boolean;
  onForceChange: (checked: boolean) => void;
  showForceCheckbox?: boolean;
  reservationLabel: string;
  waitHint: string;
  forceLabel: string;
  liveLabel: string;
}) {
  const state = (props.chip?.state ?? "…").toUpperCase();
  return (
    <>
      <p data-testid="circuit-reservation-chip" className="settings-hint" style={{ marginTop: 6 }}>
        {props.reservationLabel}:{" "}
        <strong
          style={{
            color:
              props.chip?.state === "reserved"
                ? "var(--ok, #1a7f37)"
                : props.chip?.state === "failed"
                  ? "var(--danger, #cf222e)"
                  : undefined,
          }}
        >
          {state}
        </strong>
        {props.chip?.live
          ? ` — ${props.liveLabel}${props.chip.liveFraction ? ` (${props.chip.liveFraction})` : ""}`
          : ""}
        {props.chip?.lastError ? ` — ${props.chip.lastError}` : ""}
      </p>
      {!props.ready ? (
        <p className="settings-hint" style={{ marginTop: 4 }} data-testid="wan-invite-wait-hint">
          {props.waitHint}
        </p>
      ) : null}
      {props.showForceCheckbox !== false ? (
        <label
          className="settings-hint"
          style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}
        >
          <input
            type="checkbox"
            data-testid="wan-force-without-reservation"
            checked={props.forceWithoutReservation}
            onChange={(e) => props.onForceChange(e.target.checked)}
          />
          {props.forceLabel}
        </label>
      ) : null}
    </>
  );
}
