/**
 * Phase 68-C7 — Coding schedules (Paseo schedule analogue).
 *
 * A schedule creates a **new** Coding workspace on cron for a fixed project
 * cwd + harness, then runs the prompt once.
 *
 * Distinct from heartbeats (wake existing workspace). Not Team jobs / Chains.
 * Not EnvoyAI TriggerStore digests.
 */

import {
  CODING_HEARTBEAT_CRON_PRESETS,
  isValidCodingHeartbeatCron,
  type CodingHeartbeatCronPreset,
} from "./coding-heartbeat.js"
import { isCodingHarnessId, type CodingHarnessId } from "./coding-harness.js"

export type CodingScheduleHarness = CodingHarnessId

export type CodingSchedule = {
  id: string
  name: string
  /** 5-field cron (minute hour day-of-month month day-of-week). */
  cron: string
  /**
   * Optional IANA timezone. MVP ticker evaluates cron in **UTC**
   * (same as `isCronMatch`); timezone is stored for forward-compat / UI hint.
   */
  timezone?: string
  prompt: string
  /** Project folder (absolute path on the home node). */
  cwd: string
  harness: CodingScheduleHarness
  enabled: boolean
  maxRuns?: number
  runCount: number
  lastFiredAt?: string
  lastError?: string
  /** chatId / sessionId created on last fire. */
  lastWorkspaceId?: string
  createdAt: string
  updatedAt: string
}

export type CreateCodingScheduleInput = {
  name: string
  cron: string
  timezone?: string
  prompt: string
  cwd: string
  harness: CodingScheduleHarness
  enabled?: boolean
  maxRuns?: number
}

export type UpdateCodingScheduleInput = {
  id: string
  enabled?: boolean
  cron?: string
  prompt?: string
  name?: string
  cwd?: string
  harness?: CodingScheduleHarness
}

/** Soft cap — keep the ticker honest and the list UI small. */
export const MAX_CODING_SCHEDULES = 20

/** Shared cron presets (UTC) — same as heartbeats. */
export const CODING_CRON_PRESETS = CODING_HEARTBEAT_CRON_PRESETS

export type CodingCronPreset = CodingHeartbeatCronPreset

export function isCodingScheduleHarness(
  value: unknown,
): value is CodingScheduleHarness {
  return typeof value === "string" && isCodingHarnessId(value)
}

/** Basic 5-field cron shape check (does not expand steps). */
export function isValidCodingScheduleCron(cron: string): boolean {
  return isValidCodingHeartbeatCron(cron)
}
