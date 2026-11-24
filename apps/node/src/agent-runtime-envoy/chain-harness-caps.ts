/**
 * FH-P1-D — Chain worker (Agent Network embed) sub-agent caps.
 *
 * Mirrors EnvoyHome `packages/daemon/src/harness-subagents.ts`
 * (`TASK_MAX_SUBAGENTS=8`, `TASK_MAX_PARALLEL=4`). Coding EH ACP
 * sessions use a different surface (P1-A); this applies only where
 * `createRealEnvoyHarnessRuntime` builds agents for `adapter.execute`.
 */
import type { Agent } from "@envoymesh/envoy-harness";

/** Align with envoy-harness `DEFAULT_MAX_SUBAGENTS` and EnvoyHome. */
export const DEFAULT_CHAIN_MAX_SUBAGENTS = 8;

/** Align with envoy-harness `DEFAULT_MAX_PARALLEL_TOOL_CALLS` and EnvoyHome. */
export const DEFAULT_CHAIN_MAX_PARALLEL = 4;

const MAX_SUBAGENTS_CEILING = 32;
const MAX_PARALLEL_CEILING = 16;

export type ChainHarnessSubagentCaps = {
  maxSubagents: number;
  maxParallelToolCalls: number;
};

function parseBoundedIntEnv(
  name: string,
  fallback: number,
  ceiling: number,
): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, ceiling);
}

export function resolveChainHarnessSubagentCaps(): ChainHarnessSubagentCaps {
  return {
    maxSubagents: parseBoundedIntEnv(
      "ENVOYMESH_CHAIN_MAX_SUBAGENTS",
      DEFAULT_CHAIN_MAX_SUBAGENTS,
      MAX_SUBAGENTS_CEILING,
    ),
    maxParallelToolCalls: parseBoundedIntEnv(
      "ENVOYMESH_CHAIN_MAX_PARALLEL",
      DEFAULT_CHAIN_MAX_PARALLEL,
      MAX_PARALLEL_CEILING,
    ),
  };
}

/** FH-P2-B — EH Coding ACP parent agent (same defaults as chain / Home). */
export function resolveEhCodingSubagentCaps(): ChainHarnessSubagentCaps {
  return {
    maxSubagents: parseBoundedIntEnv(
      "ENVOYMESH_EH_MAX_SUBAGENTS",
      DEFAULT_CHAIN_MAX_SUBAGENTS,
      MAX_SUBAGENTS_CEILING,
    ),
    maxParallelToolCalls: parseBoundedIntEnv(
      "ENVOYMESH_EH_MAX_PARALLEL",
      DEFAULT_CHAIN_MAX_PARALLEL,
      MAX_PARALLEL_CEILING,
    ),
  };
}

export function applyChainHarnessSubagentCaps(
  agent: Agent,
  caps: ChainHarnessSubagentCaps = resolveChainHarnessSubagentCaps(),
): void {
  agent.maxSubagents = caps.maxSubagents;
  agent.maxParallelToolCalls = caps.maxParallelToolCalls;
}