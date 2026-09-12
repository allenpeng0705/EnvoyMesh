/**
 * Phase 68-C6 — Coding heartbeats (Paseo heartbeat analogue).
 *
 * A heartbeat wakes an **existing** Coding workspace on a cron with a prompt.
 * Full Schedules (new workspace each run) live in `coding-schedule.ts` (68-C7).
 *
 * Not Team jobs / Chains. Not EnvoyAI TriggerStore digests.
 */

export type CodingHeartbeatTarget =
  | { kind: "eh"; chatId: string }
  | { kind: "pi"; sessionId: string }
  | { kind: "ext"; sessionId: string; agentId: string }

export type CodingHeartbeat = {
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
  target: CodingHeartbeatTarget
  enabled: boolean
  maxRuns?: number
  runCount: number
  lastFiredAt?: string
  lastError?: string
  createdAt: string
  updatedAt: string
}

export type CreateCodingHeartbeatInput = {
  name: string
  cron: string
  timezone?: string
  prompt: string
  target: CodingHeartbeatTarget
  enabled?: boolean
  maxRuns?: number
}

export type UpdateCodingHeartbeatInput = {
  id: string
  enabled?: boolean
  cron?: string
  prompt?: string
  name?: string
}

/** Soft cap — keep the ticker honest and the list UI small. */
export const MAX_CODING_HEARTBEATS = 20

/** UI presets → 5-field cron (UTC). Custom cron remains allowed. */
export const CODING_HEARTBEAT_CRON_PRESETS = {
  "5m": "*/5 * * * *",
  "15m": "*/15 * * * *",
  "1h": "0 * * * *",
  daily: "0 9 * * *",
} as const

export type CodingHeartbeatCronPreset =
  keyof typeof CODING_HEARTBEAT_CRON_PRESETS

export function isCodingHeartbeatTarget(
  value: unknown,
): value is CodingHeartbeatTarget {
  if (!value || typeof value !== "object") return false
  const t = value as CodingHeartbeatTarget
  if (t.kind === "eh") {
    return typeof t.chatId === "string" && t.chatId.trim().length > 0
  }
  if (t.kind === "pi") {
    return typeof t.sessionId === "string" && t.sessionId.trim().length > 0
  }
  if (t.kind === "ext") {
    return (
      typeof t.sessionId === "string" &&
      t.sessionId.trim().length > 0 &&
      typeof t.agentId === "string" &&
      t.agentId.trim().length > 0
    )
  }
  return false
}

/** Basic 5-field cron shape check (does not expand steps). */
export function isValidCodingHeartbeatCron(cron: string): boolean {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return false
  return parts.every((p) => {
    if (p === "*") return true
    if (/^\*\/\d+$/.test(p)) {
      const step = Number(p.slice(2))
      return Number.isFinite(step) && step > 0
    }
    const n = Number(p)
    return Number.isInteger(n) && n >= 0
  })
}
