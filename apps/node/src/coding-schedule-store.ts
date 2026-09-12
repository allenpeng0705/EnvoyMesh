/**
 * Phase 68-C7 — Coding schedule store.
 *
 * Persists cron schedules that create a **new** Coding workspace each fire.
 * Separate from CodingHeartbeatStore and EnvoyAI TriggerStore.
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  MAX_CODING_SCHEDULES,
  isCodingScheduleHarness,
  isValidCodingScheduleCron,
  type CodingSchedule,
  type CreateCodingScheduleInput,
  type UpdateCodingScheduleInput,
} from "@envoymesh/api"
import { isCronMatch } from "./trigger-store.js"

const FILE_NAME = "coding-schedules.json"

export type CodingScheduleStoreFile = {
  version: 1
  schedules: CodingSchedule[]
}

function storePath(profileDir: string): string {
  return join(profileDir, FILE_NAME)
}

function utcMinuteKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate
  if (!Number.isFinite(d.getTime())) return ""
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}-${d.getUTCMinutes()}`
}

function isValidSchedule(row: unknown): row is CodingSchedule {
  if (!row || typeof row !== "object") return false
  const s = row as CodingSchedule
  return (
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    typeof s.cron === "string" &&
    typeof s.prompt === "string" &&
    typeof s.cwd === "string" &&
    typeof s.enabled === "boolean" &&
    typeof s.runCount === "number" &&
    typeof s.createdAt === "string" &&
    typeof s.updatedAt === "string" &&
    isCodingScheduleHarness(s.harness)
  )
}

export class CodingScheduleStore {
  private schedules: CodingSchedule[] = []
  private filePath: string | null = null
  private initialized = false

  async init(profileDir: string): Promise<void> {
    if (this.initialized && this.filePath === storePath(profileDir)) return
    this.filePath = storePath(profileDir)
    try {
      const raw = await readFile(this.filePath, "utf8")
      const parsed = JSON.parse(raw) as CodingScheduleStoreFile
      const list = Array.isArray(parsed?.schedules) ? parsed.schedules : []
      this.schedules = list.filter(isValidSchedule).slice(0, MAX_CODING_SCHEDULES)
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
        console.warn("[coding.schedule] failed to load store:", err)
      }
      this.schedules = []
    }
    this.initialized = true
  }

  list(): CodingSchedule[] {
    return this.schedules
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  get(id: string): CodingSchedule | undefined {
    return this.schedules.find((s) => s.id === id)
  }

  async create(input: CreateCodingScheduleInput): Promise<CodingSchedule> {
    this._assertReady()
    if (this.schedules.length >= MAX_CODING_SCHEDULES) {
      throw new Error("coding_schedule_cap")
    }
    const name = input.name.trim()
    const cron = input.cron.trim()
    const prompt = input.prompt.trim()
    const cwd = input.cwd.trim()
    if (!name) throw new Error("coding_schedule_name_required")
    if (!prompt) throw new Error("coding_schedule_prompt_required")
    if (!cwd) throw new Error("coding_schedule_cwd_required")
    if (!isValidCodingScheduleCron(cron)) {
      throw new Error("coding_schedule_cron_invalid")
    }
    if (!isCodingScheduleHarness(input.harness)) {
      throw new Error("coding_schedule_harness_invalid")
    }
    const now = new Date().toISOString()
    const row: CodingSchedule = {
      id: randomUUID(),
      name,
      cron,
      ...(input.timezone?.trim() ? { timezone: input.timezone.trim() } : {}),
      prompt,
      cwd,
      harness: input.harness,
      enabled: input.enabled !== false,
      ...(typeof input.maxRuns === "number" &&
      Number.isFinite(input.maxRuns) &&
      input.maxRuns > 0
        ? { maxRuns: Math.floor(input.maxRuns) }
        : {}),
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    this.schedules = [...this.schedules, row]
    await this._persist()
    return row
  }

  async update(input: UpdateCodingScheduleInput): Promise<CodingSchedule> {
    this._assertReady()
    const id = input.id.trim()
    const idx = this.schedules.findIndex((s) => s.id === id)
    if (idx < 0) throw new Error("coding_schedule_not_found")
    const prev = this.schedules[idx]!
    let cron = prev.cron
    if (typeof input.cron === "string") {
      cron = input.cron.trim()
      if (!isValidCodingScheduleCron(cron)) {
        throw new Error("coding_schedule_cron_invalid")
      }
    }
    let name = prev.name
    if (typeof input.name === "string") {
      name = input.name.trim()
      if (!name) throw new Error("coding_schedule_name_required")
    }
    let prompt = prev.prompt
    if (typeof input.prompt === "string") {
      prompt = input.prompt.trim()
      if (!prompt) throw new Error("coding_schedule_prompt_required")
    }
    let cwd = prev.cwd
    if (typeof input.cwd === "string") {
      cwd = input.cwd.trim()
      if (!cwd) throw new Error("coding_schedule_cwd_required")
    }
    let harness = prev.harness
    if (typeof input.harness === "string") {
      if (!isCodingScheduleHarness(input.harness)) {
        throw new Error("coding_schedule_harness_invalid")
      }
      harness = input.harness
    }
    const next: CodingSchedule = {
      ...prev,
      name,
      cron,
      prompt,
      cwd,
      harness,
      ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
      updatedAt: new Date().toISOString(),
    }
    this.schedules = [
      ...this.schedules.slice(0, idx),
      next,
      ...this.schedules.slice(idx + 1),
    ]
    await this._persist()
    return next
  }

  async delete(id: string): Promise<boolean> {
    this._assertReady()
    const before = this.schedules.length
    this.schedules = this.schedules.filter((s) => s.id !== id.trim())
    if (this.schedules.length === before) return false
    await this._persist()
    return true
  }

  /**
   * Schedules due to fire at `now` (UTC cron). Skips disabled, maxRuns,
   * and same-UTC-minute re-fire after lastFiredAt.
   */
  selectDue(now: Date = new Date()): CodingSchedule[] {
    return this.schedules.filter((s) => this._isDue(s, now))
  }

  async recordFire(
    id: string,
    opts: {
      error?: string
      firedAt?: string
      lastWorkspaceId?: string
    } = {},
  ): Promise<CodingSchedule | undefined> {
    this._assertReady()
    const idx = this.schedules.findIndex((s) => s.id === id)
    if (idx < 0) return undefined
    const prev = this.schedules[idx]!
    const firedAt = opts.firedAt ?? new Date().toISOString()
    const runCount = prev.runCount + 1
    const hitMax =
      typeof prev.maxRuns === "number" && runCount >= prev.maxRuns
    const next: CodingSchedule = {
      ...prev,
      runCount,
      lastFiredAt: firedAt,
      ...(opts.error ? { lastError: opts.error } : { lastError: undefined }),
      ...(opts.lastWorkspaceId
        ? { lastWorkspaceId: opts.lastWorkspaceId }
        : {}),
      ...(hitMax ? { enabled: false } : {}),
      updatedAt: firedAt,
    }
    if (!opts.error) {
      delete next.lastError
    }
    this.schedules = [
      ...this.schedules.slice(0, idx),
      next,
      ...this.schedules.slice(idx + 1),
    ]
    await this._persist()
    return next
  }

  /** Persist a skip/busy error without incrementing runCount. */
  async recordSkipError(
    id: string,
    error: string,
  ): Promise<CodingSchedule | undefined> {
    this._assertReady()
    const idx = this.schedules.findIndex((s) => s.id === id)
    if (idx < 0) return undefined
    const prev = this.schedules[idx]!
    const now = new Date().toISOString()
    const next: CodingSchedule = {
      ...prev,
      lastError: error,
      updatedAt: now,
    }
    this.schedules = [
      ...this.schedules.slice(0, idx),
      next,
      ...this.schedules.slice(idx + 1),
    ]
    await this._persist()
    return next
  }

  private _isDue(s: CodingSchedule, now: Date): boolean {
    if (!s.enabled) return false
    if (typeof s.maxRuns === "number" && s.runCount >= s.maxRuns) return false
    if (!isCronMatch(s.cron, now)) return false
    if (s.lastFiredAt) {
      const lastKey = utcMinuteKey(s.lastFiredAt)
      const nowKey = utcMinuteKey(now)
      if (lastKey && lastKey === nowKey) return false
    }
    return true
  }

  private _assertReady(): void {
    if (!this.initialized || !this.filePath) {
      throw new Error("coding_schedule_store_not_ready")
    }
  }

  private async _persist(): Promise<void> {
    if (!this.filePath) return
    const path = this.filePath
    await mkdir(dirname(path), { recursive: true })
    const payload: CodingScheduleStoreFile = {
      version: 1,
      schedules: this.schedules,
    }
    const tmp = `${path}.tmp`
    await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, {
      mode: 0o600,
    })
    await rename(tmp, path)
  }
}
