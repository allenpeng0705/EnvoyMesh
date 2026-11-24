/**
 * EH Coding — attended continuation phases (Q2 / FH-P0-D).
 * Aligns with EnvoyHome `ENVOYHOME_PARENT_CONTINUATION_PHASES` (default 2).
 */

/** User-visible footer when a turn stops on iteration budget. */
export const EH_TURN_INCOMPLETE_CONTINUE_CUE =
  "\n\nThis step hit its limit. Reply **continue** to keep going.";

/**
 * Parse `ENVOYMESH_EH_CONTINUATION_PHASES` (or any raw string).
 * Valid integers in 0…3 win; empty / invalid → default **2**.
 */
export function parseEnvoyHarnessContinuationPhases(
  raw: string | undefined,
): number {
  const t = (raw ?? process.env.ENVOYMESH_EH_CONTINUATION_PHASES ?? "").trim();
  if (t) {
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0 && n <= 3) return Math.floor(n);
  }
  return 2;
}

/** Attended vs unattended (heartbeats / schedules hard-code 0). */
export function envoyHarnessContinuationPhasesForTurn(unattended: boolean): number {
  return unattended ? 0 : parseEnvoyHarnessContinuationPhases(undefined);
}

export function appendEhIncompleteContinueCue(text: string): string {
  const t = text.trimEnd();
  if (t.toLowerCase().includes("continue")) return text;
  return t.length > 0 ? `${t}${EH_TURN_INCOMPLETE_CONTINUE_CUE}` : text;
}