/**
 * Coding tab harness ids (Phase 68-C3).
 *
 * Tier A — Envoy Mesh native (EH ACP + Pi).
 * Tier B — Ext Agent CLIs also used by Paseo (IA reference only; no Paseo copy).
 */

export type CodingHarnessId =
  | "envoy-harness"
  | "pi"
  | "claudecode"
  | "codex"
  | "opencode"
  | "cursor"
  | "codewhale";

export const CODING_TIER_A_HARNESSES: readonly CodingHarnessId[] = [
  "envoy-harness",
  "pi",
] as const;

export const CODING_TIER_B_HARNESSES: readonly CodingHarnessId[] = [
  "claudecode",
  "codex",
  "opencode",
  "cursor",
  "codewhale",
] as const;

export const CODING_ALL_HARNESSES: readonly CodingHarnessId[] = [
  ...CODING_TIER_A_HARNESSES,
  ...CODING_TIER_B_HARNESSES,
] as const;

const ALL_SET = new Set<string>(CODING_ALL_HARNESSES);
const TIER_B_SET = new Set<string>(CODING_TIER_B_HARNESSES);

export function isCodingHarnessId(s: string): s is CodingHarnessId {
  return ALL_SET.has(s.trim());
}

export function isCodingTierBHarness(s: string): boolean {
  return TIER_B_SET.has(s.trim());
}

/**
 * Map a Coding harness to the Ext Agent preset id used by probe/ask/install.
 * Tier A harnesses are not Ext Agents → null.
 */
export function codingHarnessToExtAgentId(
  h: CodingHarnessId,
): string | null {
  switch (h) {
    case "claudecode":
    case "codex":
    case "opencode":
    case "cursor":
    case "codewhale":
      return h;
    case "envoy-harness":
    case "pi":
      return null;
  }
}

/** Short end-user labels for Coding chrome / create sheet. */
export function codingHarnessLabel(h: CodingHarnessId): string {
  switch (h) {
    case "envoy-harness":
      return "Envoy";
    case "pi":
      return "Pi";
    case "claudecode":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "opencode":
      return "OpenCode";
    case "cursor":
      return "Cursor";
    case "codewhale":
      return "CodeWhale";
  }
}
