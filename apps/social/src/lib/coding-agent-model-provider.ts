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
