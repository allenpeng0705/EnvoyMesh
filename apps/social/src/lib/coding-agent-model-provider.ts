/**
 * Shared Coding agent/model/provider form value helpers (no React).
 * Kept out of CodingAgentModelProviderFields.tsx so Vite Fast Refresh works.
 */

import type { CodingHarnessId } from "@envoymesh/api";
import type {
  CodingProviderKind,
  CodingTaskPrefill,
} from "./coding-projects.js";

export type CodingAgentModelProviderValue = {
  harness: CodingHarnessId;
  model: string;
  providerKind: CodingProviderKind | "";
  endpoint: string;
  apiKey: string;
};

/** Form value for one existing task. API keys are never prefilled. */
export function codingTaskAgentValue(input: {
  harness: CodingHarnessId;
  model?: string | null;
  providerKind?: CodingProviderKind | "" | null;
  endpoint?: string | null;
}): CodingAgentModelProviderValue {
  let model = input.model?.trim() ?? "";
  let providerKind: CodingProviderKind | "" =
    input.providerKind === "openai-compatible" ||
    input.providerKind === "anthropic-compatible"
      ? input.providerKind
      : "";
  if (!providerKind && model.startsWith("openai:")) {
    providerKind = "openai-compatible";
    model = model.slice("openai:".length);
  } else if (!providerKind && model.startsWith("anthropic:")) {
    providerKind = "anthropic-compatible";
    model = model.slice("anthropic:".length);
  }
  return {
    harness: input.harness,
    model,
    providerKind,
    endpoint: input.endpoint?.trim() ?? "",
    apiKey: "",
  };
}

export function codingPrefillToValue(
  prefill: CodingTaskPrefill,
): CodingAgentModelProviderValue {
  return {
    harness: prefill.harness,
    model: prefill.model,
    providerKind: prefill.providerKind,
    endpoint: prefill.endpoint,
    apiKey: prefill.apiKey,
  };
}

/**
 * When the ready list settles, move off a not-ready agent onto the first ready one.
 * Leaves the value alone while the ready list is still empty (probe in flight).
 */
export function snapCodingAgentToReady(
  prev: CodingAgentModelProviderValue,
  enabledHarnesses: readonly CodingHarnessId[],
): CodingAgentModelProviderValue {
  if (enabledHarnesses.length === 0) return prev;
  if (enabledHarnesses.includes(prev.harness)) return prev;
  const harness = enabledHarnesses[0]!;
  return {
    ...prev,
    harness,
    ...(prev.harness !== harness
      ? { model: "", providerKind: "", endpoint: "", apiKey: "" }
      : {}),
  };
}
