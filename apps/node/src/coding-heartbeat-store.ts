/**
 * Phase 68-C6 — Coding heartbeat store.
 *
 * Persists cron heartbeats that wake **existing** Coding workspaces.
 * Separate from EnvoyAI TriggerStore (digest / proactive) and Team jobs.
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  MAX_CODING_HEARTBEATS,
  isCodingHeartbeatTarget,
  isValidCodingHeartbeatCron,
  type CodingHeartbeat,
  type CreateCodingHeartbeatInput,
  type UpdateCodingHeartbeatInput,
} from "@envoymesh/api"
import { isCronMatch } from "./trigger-store.js"

const FILE_NAME = "coding-heartbeats.json"

export type CodingHeartbeatStoreFile = {
  version: 1
  heartbeats: CodingHeartbeat[]
}

function storePath(profileDir: string): string {
  return join(profileDir, FILE_NAME)
}

function utcMinuteKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate
  if (!Number.isFinite(d.getTime())) return ""
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}-${d.getUTCMinutes()}`
}

function normalizeTarget(
  target: CreateCodingHeartbeatInput["target"],
): CodingHeartbeat["target"] {
  if (target.kind === "eh") {
    return { kind: "eh", chatId: target.chatId.trim() }
  }
  if (target.kind === "pi") {
    return { kind: "pi", sessionId: target.sessionId.trim() }
  }
  return {
    kind: "ext",
    sessionId: target.sessionId.trim(),
    agentId: target.agentId.trim(),
  }
}

function isValidHeartbeat(row: unknown): row is CodingHeartbeat {
  if (!row || typeof row !== "object") return false
  const h = row as CodingHeartbeat
  return (
    typeof h.id === "string" &&
    typeof h.name === "string" &&
    typeof h.cron === "string" &&
    typeof h.prompt === "string" &&
    typeof h.enabled === "boolean" &&
    typeof h.runCount === "number" &&
    typeof h.createdAt === "string" &&
    typeof h.updatedAt === "string" &&
    isCodingHeartbeatTarget(h.target)
  )
}

export class CodingHeartbeatStore {
  private heartbeats: CodingHeartbeat[] = []
  private filePath: string | null = null
  private initialized = false

  async init(profileDir: string): Promise<void> {
    if (this.initialized && this.filePath === storePath(profileDir)) return
    this.filePath = storePath(profileDir)
    try {
      const raw = await readFile(this.filePath, "utf8")
      const parsed = JSON.parse(raw) as CodingHeartbeatStoreFile
      const list = Array.isArray(parsed?.heartbeats) ? parsed.heartbeats : []
      this.heartbeats = list.filter(isValidHeartbeat).slice(0, MAX_CODING_HEARTBEATS)
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
        console.warn("[coding.heartbeat] failed to load store:", err)
      }
      this.heartbeats = []
    }
    this.initialized = true
  }

  list(): CodingHeartbeat[] {
    return this.heartbeats
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  get(id: string): CodingHeartbeat | undefined {
    return this.heartbeats.find((h) => h.id === id)
  }

  async create(input: CreateCodingHeartbeatInput): Promise<CodingHeartbeat> {
    this._assertReady()
    if (this.heartbeats.length >= MAX_CODING_HEARTBEATS) {
      throw new Error("coding_heartbeat_cap")
    }
    const name = input.name.trim()
    const cron = input.cron.trim()
    const prompt = input.prompt.trim()
    if (!name) throw new Error("coding_heartbeat_name_required")
    if (!prompt) throw new Error("coding_heartbeat_prompt_required")
    if (!isValidCodingHeartbeatCron(cron)) {
      throw new Error("coding_heartbeat_cron_invalid")
    }
    if (!isCodingHeartbeatTarget(input.target)) {
      throw new Error("coding_heartbeat_target_invalid")
    }
    const now = new Date().toISOString()
    const hb: CodingHeartbeat = {
      id: randomUUID(),
      name,
      cron,
      ...(input.timezone?.trim() ? { timezone: input.timezone.trim() } : {}),
      prompt,
      target: normalizeTarget(input.target),
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
    this.heartbeats = [...this.heartbeats, hb]
    await this._persist()
    return hb
  }

  async update(input: UpdateCodingHeartbeatInput): Promise<CodingHeartbeat> {
    this._assertReady()
    const id = input.id.trim()
    const idx = this.heartbeats.findIndex((h) => h.id === id)
    if (idx < 0) throw new Error("coding_heartbeat_not_found")
    const prev = this.heartbeats[idx]!
    let cron = prev.cron
    if (typeof input.cron === "string") {
      cron = input.cron.trim()
      if (!isValidCodingHeartbeatCron(cron)) {
        throw new Error("coding_heartbeat_cron_invalid")
      }
    }
    let name = prev.name
    if (typeof input.name === "string") {
      name = input.name.trim()
      if (!name) throw new Error("coding_heartbeat_name_required")
    }
    let prompt = prev.prompt
    if (typeof input.prompt === "string") {
      prompt = input.prompt.trim()
      if (!prompt) throw new Error("coding_heartbeat_prompt_required")
    }
    const next: CodingHeartbeat = {
      ...prev,
      name,
      cron,
      prompt,
      ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
      updatedAt: new Date().toISOString(),
    }
    this.heartbeats = [
      ...this.heartbeats.slice(0, idx),
      next,
      ...this.heartbeats.slice(idx + 1),
    ]
    await this._persist()
    return next
  }

  async delete(id: string): Promise<boolean> {
    this._assertReady()
    const before = this.heartbeats.length
    this.heartbeats = this.heartbeats.filter((h) => h.id !== id.trim())
    if (this.heartbeats.length === before) return false
    await this._persist()
    return true
  }

  /**
   * Heartbeats due to fire at `now` (UTC cron). Skips disabled, maxRuns,
   * and same-UTC-minute re-fire after lastFiredAt.
   */
  selectDue(now: Date = new Date()): CodingHeartbeat[] {
    return this.heartbeats.filter((h) => this._isDue(h, now))
  }

  async recordFire(
    id: string,
    opts: { error?: string; firedAt?: string } = {},
  ): Promise<CodingHeartbeat | undefined> {
    this._assertReady()
    const idx = this.heartbeats.findIndex((h) => h.id === id)
    if (idx < 0) return undefined
    const prev = this.heartbeats[idx]!
    const firedAt = opts.firedAt ?? new Date().toISOString()
    const runCount = prev.runCount + 1
    const hitMax =
      typeof prev.maxRuns === "number" && runCount >= prev.maxRuns
    const next: CodingHeartbeat = {
      ...prev,
      runCount,
      lastFiredAt: firedAt,
      ...(opts.error ? { lastError: opts.error } : { lastError: undefined }),
      ...(hitMax ? { enabled: false } : {}),
      updatedAt: firedAt,
    }
    // Clear lastError on success (explicit undefined strip for JSON)
    if (!opts.error) {
      delete next.lastError
    }
    this.heartbeats = [
      ...this.heartbeats.slice(0, idx),
      next,
      ...this.heartbeats.slice(idx + 1),
    ]
    await this._persist()
    return next
  }

  /** Persist a skip/busy error without incrementing runCount. */
  async recordSkipError(
    id: string,
    error: string,
  ): Promise<CodingHeartbeat | undefined> {
    this._assertReady()
    const idx = this.heartbeats.findIndex((h) => h.id === id)
    if (idx < 0) return undefined
    const prev = this.heartbeats[idx]!
    const now = new Date().toISOString()
    const next: CodingHeartbeat = {
      ...prev,
      lastError: error,
      updatedAt: now,
    }
    this.heartbeats = [
      ...this.heartbeats.slice(0, idx),
      next,
      ...this.heartbeats.slice(idx + 1),
    ]
    await this._persist()
    return next
  }

  private _isDue(h: CodingHeartbeat, now: Date): boolean {
    if (!h.enabled) return false
    if (typeof h.maxRuns === "number" && h.runCount >= h.maxRuns) return false
    if (!isCronMatch(h.cron, now)) return false
    if (h.lastFiredAt) {
      const lastKey = utcMinuteKey(h.lastFiredAt)
      const nowKey = utcMinuteKey(now)
      if (lastKey && lastKey === nowKey) return false
    }
    return true
  }

  private _assertReady(): void {
    if (!this.initialized || !this.filePath) {
      throw new Error("coding_heartbeat_store_not_ready")
    }
  }

  private async _persist(): Promise<void> {
    if (!this.filePath) return
    const path = this.filePath
    await mkdir(dirname(path), { recursive: true })
    const payload: CodingHeartbeatStoreFile = {
      version: 1,
      heartbeats: this.heartbeats,
    }
    const tmp = `${path}.tmp`
    await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, {
      mode: 0o600,
    })
    await rename(tmp, path)
  }
}
