/**
 * FH-P2-C — optional ticket store for mesh-lite Coding work items.
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  MAX_EH_MESH_WORK_ITEMS,
  type EhMeshWorkItem,
  type EhMeshWorkStatus,
  type EnqueueEhMeshWorkInput,
} from "@envoymesh/api/core"

const FILE_NAME = "eh-mesh-work.json"

export type EhMeshWorkStoreFile = {
  version: 1
  items: EhMeshWorkItem[]
}

function storePath(profileDir: string): string {
  return join(profileDir, FILE_NAME)
}

function isValidItem(row: unknown): row is EhMeshWorkItem {
  if (!row || typeof row !== "object") return false
  const i = row as EhMeshWorkItem
  return (
    typeof i.id === "string" &&
    typeof i.prompt === "string" &&
    typeof i.cwd === "string" &&
    typeof i.source === "string" &&
    typeof i.status === "string" &&
    typeof i.createdAt === "string" &&
    typeof i.updatedAt === "string"
  )
}

export class EhMeshWorkStore {
  private items: EhMeshWorkItem[] = []
  private filePath: string | null = null
  private initialized = false

  async init(profileDir: string): Promise<void> {
    if (this.initialized && this.filePath === storePath(profileDir)) return
    this.filePath = storePath(profileDir)
    try {
      const raw = await readFile(this.filePath, "utf8")
      const parsed = JSON.parse(raw) as EhMeshWorkStoreFile
      const list = Array.isArray(parsed?.items) ? parsed.items : []
      this.items = list.filter(isValidItem).slice(0, MAX_EH_MESH_WORK_ITEMS)
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
        console.warn("[eh.mesh-work] failed to load store:", err)
      }
      this.items = []
    }
    this.initialized = true
  }

  list(): EhMeshWorkItem[] {
    return this.items
      .slice()
      .filter((i) => i.status !== "dismissed")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  get(id: string): EhMeshWorkItem | undefined {
    return this.items.find((i) => i.id === id)
  }

  async enqueue(input: EnqueueEhMeshWorkInput): Promise<EhMeshWorkItem> {
    this._assertReady()
    const prompt = input.prompt.trim()
    const cwd = input.cwd.trim()
    if (!prompt) throw new Error("eh_mesh_work_prompt_required")
    if (!cwd) throw new Error("eh_mesh_work_cwd_required")

    const existingId = this.items.find(
      (i) =>
        i.status === "pending" &&
        i.prompt === prompt &&
        i.cwd === cwd &&
        i.fromOwnerId === input.fromOwnerId?.trim(),
    )?.id
    if (existingId) {
      const found = this.get(existingId)
      if (found) return found
    }

    const active = this.items.filter((i) => i.status !== "dismissed")
    if (active.length >= MAX_EH_MESH_WORK_ITEMS) {
      throw new Error("eh_mesh_work_cap")
    }

    const now = new Date().toISOString()
    const item: EhMeshWorkItem = {
      id: randomUUID(),
      prompt,
      cwd,
      source: input.source ?? "owner",
      status: "pending",
      createdAt: now,
      updatedAt: now,
      ...(input.chatId?.trim() ? { chatId: input.chatId.trim() } : {}),
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      ...(input.fromOwnerId?.trim()
        ? { fromOwnerId: input.fromOwnerId.trim() }
        : {}),
    }
    this.items.push(item)
    await this._persist()
    return item
  }

  async upsertFromBondRef(opts: {
    workId: string
    prompt: string
    cwd: string
    fromOwnerId: string
    chatId?: string
    title?: string
  }): Promise<EhMeshWorkItem> {
    this._assertReady()
    const id = opts.workId.trim()
    const existing = this.items.find((i) => i.id === id)
    const now = new Date().toISOString()
    if (existing) {
      if (existing.status !== "pending") return existing
      existing.updatedAt = now
      await this._persist()
      return existing
    }
    const active = this.items.filter((i) => i.status !== "dismissed")
    if (active.length >= MAX_EH_MESH_WORK_ITEMS) {
      throw new Error("eh_mesh_work_cap")
    }
    const item: EhMeshWorkItem = {
      id,
      prompt: opts.prompt.trim(),
      cwd: opts.cwd.trim(),
      source: "bond",
      status: "pending",
      fromOwnerId: opts.fromOwnerId.trim(),
      createdAt: now,
      updatedAt: now,
      ...(opts.chatId?.trim() ? { chatId: opts.chatId.trim() } : {}),
      ...(opts.title?.trim() ? { title: opts.title.trim() } : {}),
    }
    this.items.push(item)
    await this._persist()
    return item
  }

  async setStatus(
    id: string,
    status: EhMeshWorkStatus,
    patch?: { lastError?: string; chatId?: string },
  ): Promise<EhMeshWorkItem | undefined> {
    this._assertReady()
    const item = this.get(id)
    if (!item) return undefined
    item.status = status
    item.updatedAt = new Date().toISOString()
    if (patch?.lastError !== undefined) {
      item.lastError = patch.lastError.trim().slice(0, 200) || undefined
    }
    if (patch?.chatId?.trim()) {
      item.chatId = patch.chatId.trim()
    }
    await this._persist()
    return item
  }

  async dismiss(id: string): Promise<boolean> {
    const next = await this.setStatus(id, "dismissed")
    return next !== undefined
  }

  private _assertReady(): void {
    if (!this.initialized || !this.filePath) {
      throw new Error("eh_mesh_work_store_not_ready")
    }
  }

  private async _persist(): Promise<void> {
    if (!this.filePath) return
    const dir = join(this.filePath, "..")
    await mkdir(dir, { recursive: true })
    const tmp = `${this.filePath}.tmp`
    const payload: EhMeshWorkStoreFile = { version: 1, items: this.items }
    await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    })
    await rename(tmp, this.filePath)
  }
}