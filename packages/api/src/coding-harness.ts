/**
 * Coding tab harness ids.
 *
 * Tier A — Envoy Mesh native (built-in envoy-harness ACP + Pi).
 * Tier B — Paseo-shaped CLI / ACP catalog (dedicated sidecars + generic ACP).
 */

import {
  CODING_PROVIDER_CATALOG,
  getCodingProvider,
} from "./coding-provider-catalog.js";

export type {
  CodingProviderEntry,
  CodingSidecarKind,
} from "./coding-provider-catalog.js";
export {
  CODING_PROVIDER_CATALOG,
  codingProviderInstallDocsUrl,
  codingProviderInstallHint,
  codingProviderIsBundler,
  codingProviderBundlerPackage,
  codingProviderProbeBinary,
  getCodingProvider,
} from "./coding-provider-catalog.js";

export const CODING_TIER_A_HARNESSES = ["envoy-harness", "pi"] as const;

export type CodingTierAHarnessId = (typeof CODING_TIER_A_HARNESSES)[number];

const CATALOG_IDS = CODING_PROVIDER_CATALOG.map((e) => e.id);

export const CODING_TIER_B_HARNESSES = CATALOG_IDS as readonly string[];

export const CODING_ALL_HARNESSES = [
  ...CODING_TIER_A_HARNESSES,
  ...CATALOG_IDS,
] as const;

export type CodingHarnessId = (typeof CODING_ALL_HARNESSES)[number];

/** Shown as radios on new-task; the rest live under “More agents”. */
export const CODING_FEATURED_HARNESSES = [
  "envoy-harness",
  "pi",
  "claudecode",
  "codex",
  "opencode",
  "cursor",
  "codewhale",
  "deepseek-harness",
  "minimax-code",
  "grok",
  "gemini",
  "traecli",
  "qoder",
  "copilot",
] as const satisfies readonly CodingHarnessId[];

const ALL_SET = new Set<string>(CODING_ALL_HARNESSES);
const TIER_A_SET = new Set<string>(CODING_TIER_A_HARNESSES);
const TIER_B_SET = new Set<string>(CODING_TIER_B_HARNESSES);
const FEATURED_SET = new Set<string>(CODING_FEATURED_HARNESSES);

export function isCodingHarnessId(s: string): s is CodingHarnessId {
  return ALL_SET.has(s.trim());
}

export function isCodingTierBHarness(s: string): boolean {
  return TIER_B_SET.has(s.trim());
}

export function isCodingFeaturedHarness(s: string): boolean {
  return FEATURED_SET.has(s.trim());
}

/**
 * Map a Coding harness to the id used by probe/ask/install.
 * Tier A → null. Dedicated sidecars → sidecar kind. Other catalog → own id.
 */
export function codingHarnessToExtAgentId(
  h: CodingHarnessId | string,
): string | null {
  const id = h.trim();
  if (TIER_A_SET.has(id)) return null;
  const entry = getCodingProvider(id);
  if (entry?.sidecarKind) return entry.sidecarKind;
  if (entry) return entry.id;
  return null;
}

export function codingHarnessLabel(h: CodingHarnessId | string): string {
  switch (h) {
    case "envoy-harness":
      return "Envoy";
    case "pi":
      return "Pi";
    default:
      return getCodingProvider(h)?.title ?? h;
  }
}

export function codingHarnessHint(h: CodingHarnessId | string): string {
  if (h === "envoy-harness") return "Built-in coding agent (ACP)";
  if (h === "pi") return "Built-in Pi coding agent";
  const entry = getCodingProvider(h);
  return entry?.description ?? h;
}
