/**
 * FH-P2-B — account-wide in-flight child cap (EnvoyHome TASK_ACCOUNT_CONCURRENCY).
 */

import {
  DEFAULT_CHAIN_MAX_SUBAGENTS,
  resolveEhCodingSubagentCaps,
} from "./chain-harness-caps.js";

/** Align with EnvoyHome `TASK_ACCOUNT_CONCURRENCY`. */
export const EH_TASK_ACCOUNT_CONCURRENCY = 8;

const activeChildrenByAccount = new Map<string, number>();

export function __resetEhSubagentAccountForTests(): void {
  activeChildrenByAccount.clear();
}

export function activeEhSubagentChildren(accountKey: string): number {
  return activeChildrenByAccount.get(accountKey) ?? 0;
}

export function tryAcquireEhSubagentSlots(
  accountKey: string,
  count: number,
  accountCap: number = EH_TASK_ACCOUNT_CONCURRENCY,
): { ok: true } | { ok: false; reason: string } {
  if (count < 1) {
    return { ok: false, reason: "task: no sub-agents requested" };
  }
  const caps = resolveEhCodingSubagentCaps();
  if (count > caps.maxSubagents) {
    return {
      ok: false,
      reason: `maxSubagents reached: ${count} children (cap is ${caps.maxSubagents}). Refused.`,
    };
  }
  const active = activeChildrenByAccount.get(accountKey) ?? 0;
  if (active + count > accountCap) {
    return {
      ok: false,
      reason: `task account concurrency cap (${accountCap} in flight; ${active} active)`,
    };
  }
  activeChildrenByAccount.set(accountKey, active + count);
  return { ok: true };
}

export function releaseEhSubagentSlots(
  accountKey: string,
  count: number,
): void {
  if (count < 1) return;
  const active = activeChildrenByAccount.get(accountKey) ?? 0;
  activeChildrenByAccount.set(accountKey, Math.max(0, active - count));
}

/** Defaults surfaced on status + UI (no env for account cap in v1). */
export function ehSubagentCapSnapshot(): {
  maxSubagents: number;
  maxParallel: number;
  accountConcurrency: number;
} {
  const caps = resolveEhCodingSubagentCaps();
  return {
    maxSubagents: caps.maxSubagents,
    maxParallel: caps.maxParallelToolCalls,
    accountConcurrency: EH_TASK_ACCOUNT_CONCURRENCY,
  };
}

export const EH_SUBAGENT_DEFAULT_MAX = DEFAULT_CHAIN_MAX_SUBAGENTS;