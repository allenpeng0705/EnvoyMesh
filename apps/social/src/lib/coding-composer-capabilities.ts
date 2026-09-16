/**
 * Per-harness Coding composer toolbar capabilities (Paseo-shaped).
 * Hidden controls are omitted from the UI — not shown disabled.
 */

import {
  codingHarnessToExtAgentId,
  isCodingTierBHarness,
  type CodingHarnessId,
} from "@envoymesh/api";

export type CodingWorkingMode = "ask" | "plan" | "code";

export type CodingThinkingEffort = "off" | "low" | "medium" | "high";

export type CodingComposerCapabilities = {
  model: boolean;
  workingMode: boolean;
  /** Plan can use `/plan` slash when sticky Plan is on. */
  planSlash: boolean;
  fast: boolean;
  thinking: boolean;
  importSession: boolean;
  attach: boolean;
};

/** Agents whose catalogs advertise `/plan`. */
const PLAN_SLASH = new Set<string>(["codex", "claudecode"]);

/** Agents whose catalogs advertise `/fast`. */
const FAST = new Set<string>(["codex", "claudecode"]);

/** Agents with effort / think-token style controls. */
const THINKING = new Set<string>(["claudecode", "codex"]);

function tierBAgentKey(harness: CodingHarnessId): string {
  return codingHarnessToExtAgentId(harness) ?? harness;
}

export function codingComposerCapabilities(
  harness: CodingHarnessId | string,
): CodingComposerCapabilities {
  const id = harness.trim() as CodingHarnessId;

  if (id === "envoy-harness") {
    return {
      model: true,
      workingMode: true,
      planSlash: true,
      fast: true,
      thinking: false,
      importSession: true,
      attach: true,
    };
  }

  if (id === "pi") {
    return {
      model: true,
      workingMode: true,
      planSlash: false,
      fast: false,
      thinking: false,
      importSession: true,
      attach: true,
    };
  }

  if (!isCodingTierBHarness(id)) {
    return {
      model: false,
      workingMode: true,
      planSlash: false,
      fast: false,
      thinking: false,
      importSession: true,
      attach: true,
    };
  }

  const agent = tierBAgentKey(id);
  return {
    model: true,
    workingMode: true,
    planSlash: PLAN_SLASH.has(agent) || PLAN_SLASH.has(id),
    fast: FAST.has(agent) || FAST.has(id),
    thinking: THINKING.has(agent) || THINKING.has(id),
    importSession: true,
    attach: true,
  };
}
